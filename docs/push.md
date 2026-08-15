# 到期提醒：服务器这半边要做什么

> **先看这一段。** 如果你手上已经有一个「到点会响」的东西 —— Bark、
> 企业微信机器人、一张自己在扫的提醒表 —— 那下面整篇都不用看。
> 在 `config.local.js` 里填 `queueApi`，前端会把未来一年该响的时刻
> 整批算好交过去，那头只当一个闹钟队列：
>
> ```
> POST {queueApi}
> { "token": "…", "rows": [ { "content": "还有 3 天 · 妈妈生日（8月30日）",
>                             "remind_at": "2026-08-27 09:00" } ] }
> ```
>
> **整批替换**，不要增量合并 —— 删掉的日子只体现为不再出现在 `rows` 里。
> 只收未来的时刻，过去的直接丢掉（写进去的话，下一轮扫描就会立刻推出来）。
> 农历留在前端算，服务器什么都不用懂。
>
> 下面这套 Web Push 是给「什么都没有，要从零搭」的部署用的。

网页自己数不了日子。页面一关，JS 就不跑了，没人替你数还剩几天。
所以到期提醒只能是这个形状：**设备把订阅交给服务器，服务器到那天推一条过来。**

前端已经写好了（`skins/orange/push.js` 和 `sw.js`），它需要服务器提供三个接口
和一个每天跑一次的任务。没有 `config.local.js` 里的 `pushApi` 时，前端整块是
安静的 —— 不请求通知权限，界面上也没有开关。

## 配置

```js
// config.local.js
pushApi:   'https://你的域名/api/push',   // 下面三个路径的前缀
pushKey:   'BJ…',                        // VAPID 公钥，base64url
pushToken: '…'                           // 可选。有的话每个请求体里带上 token
```

VAPID 密钥对生成一次就够，私钥只留在服务器：

```bash
npx web-push generate-vapid-keys
```

## 三个接口

都是 `POST`，`Content-Type: application/json`。配了 `pushToken` 的话，
请求体里会多一个 `token` 字段，服务器自己校验。

### `POST {pushApi}/subscribe`

```json
{
  "sub": {
    "endpoint": "https://web.push.apple.com/…",
    "keys": { "p256dh": "…", "auth": "…" }
  },
  "tz": "Asia/Shanghai"
}
```

按 `sub.endpoint` 存一行（同一个 endpoint 再来就覆盖，不要重复插）。
`tz` 是这台设备的时区，决定"那天早上"是几点。

### `POST {pushApi}/unsubscribe`

```json
{ "endpoint": "https://web.push.apple.com/…" }
```

删掉那一行，连同它名下的日子。

### `POST {pushApi}/dates`

前端每次改动倒计时都会发一次全量（只发选了提醒的那些）：

```json
{
  "endpoint": "https://web.push.apple.com/…",
  "rows": [
    { "id": 1712…, "name": "妈妈生日", "date": "1970-08-30",
      "calendar": "solar", "repeat": true, "remind": [7, 1, 0] }
  ]
}
```

**按 endpoint 整体替换**，不要做增量合并 —— 删掉的日子只会体现为不再出现在
`rows` 里，增量合并会让它永远留着。

字段：

| 字段 | 说明 |
|---|---|
| `date` | 那件事发生当天的**阳历**日期，农历的日子也存阳历 |
| `calendar` | `solar` 每年阳历同一天；`lunar` 每年农历同一天 |
| `repeat` | 假 = 只过一次，过完就不用再推了 |
| `remind` | 提前几天，可以有好几个。`0` 是当天 |

## 每天跑一次

建议本地时间 **09:00**（按每条订阅自己的 `tz` 算，不是服务器时区）。

对每条订阅的每一行：算出这件事**下一次**发生在哪天，`剩余天数` 若命中
`remind` 里的任何一个数，就推一条。

- `calendar: 'solar'`：今年的那个月日，过了就算明年
- `calendar: 'lunar'`：**农历同月同日**。别自己抄万年历 —— Node 里
  `new Intl.DateTimeFormat('zh-u-ca-chinese', {month:'long', day:'numeric'})`
  能直接把公历日期换成农历，从今天起一天天往后问，问到对上为止（前端
  `dates.js` 里的 `nextOccurrence` 就是这么做的，逻辑照搬即可）
- `repeat: false`：只看那一天，过去了就跳过

推送体（`sw.js` 里认这几个字段）：

```json
{
  "title": "还有 3 天：妈妈生日",
  "body": "8月30日",
  "tag": "date-1712…",
  "url": "./"
}
```

`tag` 用 `date-{id}` —— 同一条日子重复推的时候，通知会就地替换，
不会在通知中心堆成一叠。

发送用 `web-push` 库，带上 VAPID 公私钥和联系邮箱。

## 两件必须知道的事

**一、退订是常态，不是异常。** 用户关掉通知、系统清理、换设备，都会让
endpoint 失效。发送时收到 **404 或 410 就把那条订阅删掉**，否则死订阅会
越积越多，每天照发一遍。

**二、iOS 只给装到主屏的那份发通知。** Safari 标签页里打开的网页拿不到
推送权限，前端会先提示用户去添加到主屏幕。这一条服务器不用管，但排查
"为什么收不到"的时候，先问这个。
