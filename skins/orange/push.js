/* 提醒。
 *
 * 网页自己数不了日子 —— 你关掉它，就没人替你数了。所以到期提醒这件事
 * 只能是：设备把"订阅"交给服务器，服务器到那天推一条过来。
 *
 * 配置里没有 pushApi 就当没有这回事：不请求权限，界面上也不出现开关。
 * 公开版 clone 下来是安静的，不会一进来就弹一个"允许通知吗"。
 *
 * iOS 两条硬规矩，不满足就别请求，请求了会直接被拒且不再问第二次：
 *   1. 必须是从主屏打开的那份，Safari 标签页里不行
 *   2. 必须发生在一次真实点击里，不能页面一加载就要
 */

export const canPush = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/* iOS 上，只有加到主屏之后 standalone 才为真。安卓和桌面没有这个限制。 */
const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent);
export const iosNeedsInstall = () => isIOS() && !window.navigator.standalone;

/* VAPID 公钥是 base64url 的，subscribe 要的是字节数组 */
function keyBytes(b64) {
  const s = (b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(s);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export async function currentSub() {
  if (!canPush()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/* 当前状态，给界面用：
   off 没开 / on 开着 / denied 被拒过 / need-install 得先加到主屏 / unsupported 不支持 */
export async function pushState(cfg) {
  if (!cfg.pushApi) return 'unsupported';
  if (!canPush()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (iosNeedsInstall()) return 'need-install';
  return (await currentSub()) ? 'on' : 'off';
}

const post = (cfg, path, body) => fetch(cfg.pushApi + path, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(cfg.pushToken ? { token: cfg.pushToken, ...body } : body)
});

/* 必须在点击里调用。 */
export async function enablePush(cfg) {
  if (!cfg.pushApi || !cfg.pushKey) throw new Error('没配推送地址或公钥');
  if (iosNeedsInstall()) throw new Error('先把这个页面添加到主屏幕，再从主屏打开');

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('没给通知权限');

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription()
    || await reg.pushManager.subscribe({
      userVisibleOnly: true,                 // iOS 只认这一种：每次推送都得给人看见
      applicationServerKey: keyBytes(cfg.pushKey)
    });

  await post(cfg, '/subscribe', { sub, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
  return sub;
}

export async function disablePush(cfg) {
  const sub = await currentSub();
  if (!sub) return;
  /* 先告诉服务器再退订 —— 反过来的话 endpoint 就没了，服务器那边会一直留着一条死订阅 */
  try { await post(cfg, '/unsubscribe', { endpoint: sub.endpoint }); } catch { /* 网络不好也得让本地退掉 */ }
  await sub.unsubscribe();
}

/* 服务器要按日子推，就得知道有哪些日子。
   只送提醒用得上的四样：名字、日期、按哪个历、提前几天。
   标签、备注这些留在设备上，服务器不需要就不给。 */
export async function syncDates(cfg, items) {
  if (!cfg.pushApi) return;
  if (!(await currentSub())) return;             // 没开提醒就不往外送
  const rows = (items || [])
    .filter(it => Array.isArray(it.remind) && it.remind.length)
    .map(it => ({
      id: it.id, name: it.name, date: it.date,
      calendar: it.calendar || 'solar',
      repeat: !!it.repeat, remind: it.remind
    }));
  const sub = await currentSub();
  await post(cfg, '/dates', { endpoint: sub.endpoint, rows });
}
