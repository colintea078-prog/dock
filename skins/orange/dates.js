import { makeFab } from './fab.js?v=86';
import { pushState, enablePush, disablePush, syncDates } from './push.js?v=86';
/* 日期备忘录。
 *
 * 每条记一件事：名字、发生那天的阳历日期、按阳历还是阴历过、一个标签。
 * 卡片右边是倒数。顶上一排标签可以筛。
 *
 * 农历不自己抄万年历表 —— 浏览器内置了中国农历（Intl 的 chinese 历法），
 * 直接问它"这天农历是几月几"，比手抄两百年的数据可靠。
 * 找下一个农历同日，就是从明天开始一天天往前问，问到对上为止。
 */

/* 提前多少天提醒。一条可以选好几个 —— 提前一周知道，前一天再说一次。
   存的是天数，跟用什么方式提醒无关：以后接推送也好、换别的也好，
   这份数据都不用动。 */
const REMIND = [
  { d: 30, t: '一个月' },
  { d: 7,  t: '一周' },
  { d: 3,  t: '三天' },
  { d: 1,  t: '一天' },
  { d: 0,  t: '当天' }
];

/* 提醒推送到几点。早上九点，不是零点 —— 半夜响的提醒等于没提醒。 */
const REMIND_AT = '09:00';
/* 往后算多久的提醒。一年多一点，够覆盖到下一次同一个日子。 */
const HORIZON = 400;

const pad = n => String(n).padStart(2, '0');
const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const midnight = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/* ------------------------------------------------------------------ 农历 */

let lunarFmt = null;
function lunarOf(date) {
  if (lunarFmt === null) {
    try {
      lunarFmt = new Intl.DateTimeFormat('zh-u-ca-chinese', { month: 'long', day: 'numeric' });
    } catch { lunarFmt = false; }
  }
  if (!lunarFmt) return null;                 // 浏览器不支持农历
  return lunarFmt.format(date);               // 例如 "八月初三"
}

const lunarSupported = () => lunarOf(new Date()) !== null;

/* --------------------------------------------------------------- 倒数 */

/* 返回 { days, when } —— days 是还有几天（负数表示已经过去），
   when 是那天的阳历日期。 */
function nextOccurrence(item, today) {
  const src = new Date(item.date + 'T00:00:00');

  if (!item.repeat) {                          // 一次性的日子，比如一趟旅行
    return { days: Math.round((midnight(src) - today) / 86400000), when: src };
  }

  if (item.calendar === 'lunar') {
    const target = lunarOf(src);
    if (!target) return { days: null, when: null };
    /* 从今天开始往后找，最多找两年（闰月的年份可能隔得远） */
    for (let i = 0; i <= 800; i++) {
      const d = addDays(today, i);
      if (lunarOf(d) === target) return { days: i, when: d };
    }
    return { days: null, when: null };
  }

  /* 阳历：今年的那天过了就算明年 */
  let d = new Date(today.getFullYear(), src.getMonth(), src.getDate());
  if (d < today) d = new Date(today.getFullYear() + 1, src.getMonth(), src.getDate());
  return { days: Math.round((d - today) / 86400000), when: d };
}

function countdownText(days) {
  if (days === null) return '—';
  if (days === 0) return '就是今天';
  if (days > 0) return days + ' 天';
  return '已过 ' + (-days) + ' 天';
}

/* 某一天是不是这条记的日子。
   日历那边要在格子上标事件，判断逻辑只写这一份 ——
   农历、每年重复、只过一次，三种规则各写一遍迟早会对不上。 */
export function occursOn(item, day) {
  const src = new Date(item.date + 'T00:00:00');

  if (!item.repeat) {
    return key(day) === item.date;
  }
  if (item.calendar === 'lunar') {
    const t = lunarOf(src);
    return !!t && lunarOf(day) === t;
  }
  return day.getMonth() === src.getMonth() && day.getDate() === src.getDate();
}

/* ------------------------------------------------------------------ 视图 */

export function mountDates(root, { cfg, store }) {
  const TAGS = cfg.dateTags || ['生日', '纪念日', '旅行', '其他'];
  const STYLE = cfg.tagStyle || {};
  const img = t => (STYLE[t] && STYLE[t].img) || '';
  const col = t => (STYLE[t] && STYLE[t].color) || 'rgba(255,255,255,.6)';
  /* 有贴纸就贴贴纸 —— 贴纸上写着字，不用再写一遍。没有就退回带底色的文字。 */
  const sticker = (t, cls) => img(t)
    ? `<img class="${cls} pic" src="./assets/pack/${img(t)}.webp?v=86" alt="${escapeHtml(t)}">`
    : `<span class="${cls}" style="--c:${col(t)}">${escapeHtml(t)}</span>`;
  let filter = new Set();
  let items = [];

  /* 推送还没接上时说实话：选了先存着，别让人以为已经会响了。 */
  const remindHint = (cfg.pushApi || cfg.queueApi)
    ? '那天早上九点提醒你。'
    : '先存着 —— 推送还没接上，接上之后就按这里选的发。';

  root.innerHTML = `
    <div class="dt-push" hidden></div>
    <div class="dt-tags"></div>
    <div class="dt-frame"><div class="dt-list"></div></div>
  `;
  const elTags = root.querySelector('.dt-tags');
  const elList = root.querySelector('.dt-list');
  const elPush = root.querySelector('.dt-push');

  /* 表单和那个加号都挂到最外层。放在板块里会被公路和洁哥压住 ——
     板块自带 z-index，等于给自己画了个圈，里面再高也跳不出去。 */
  const elSheet = document.createElement('div');
  elSheet.className = 'sheet';
  elSheet.hidden = true;
  document.body.appendChild(elSheet);

  makeFab({
    label: '添加',
    onTap: () => openForm(null),
    store,
    panel: root.closest('.panel')
  });

  async function load() {
    items = await store.get('dates', 'items', []);

    /* 老数据：单个 tag 升级成 tags 数组 */
    let migrated = false;
    items.forEach(it => {
      if (!Array.isArray(it.tags)) {
        it.tags = it.tag ? [it.tag] : [];
        delete it.tag;
        migrated = true;
      }
    });

    /* 头一次打开时种下配置里那几个日子。
       只有真种下去了才记这一笔 —— 之前那版不管种没种都记，
       结果配置还没加载好的那次把记号占了，后面再也种不上。 */
    const seed = cfg.defaultDates || [];
    const seeded = await store.get('dates', 'seedMark', false);
    if (!seeded && seed.length) {
      items = items.concat(seed.map((x, n) => ({
        id: Date.now() + n, repeat: true, tags: [], ...x
      })));
      await store.set('dates', 'seedMark', true);
      migrated = true;
    }
    if (migrated) await store.set('dates', 'items', items);
    draw();
    drawPush();
    /* 每次打开都重排一次。日子会一年年往后走，只在改动时写的话，
       今年的提醒发完，明年那批就没人写了。 */
    syncQueue().catch(e => console.warn('提醒队列同步失败：', e));
  }

  async function persist() {
    await store.set('dates', 'items', items);
    draw();
    /* 日历那边也在用这份数据，存完喊一声，省得要刷新页面才看得到 */
    dispatchEvent(new CustomEvent('dock:dates'));
    /* 开了提醒的话，让服务器那份也跟上。推送失败不该拦住存东西，所以只记一句。 */
    syncDates(cfg, items).catch(e => console.warn('提醒同步失败：', e));
    syncQueue().catch(e => console.warn('提醒队列同步失败：', e));
  }

  /* ------------------------------------------------------------- 提醒队列 */

  /* 把未来一年里该响的时刻算好，整批交给服务器 —— 它只当一个闹钟队列，
     到点了自己推。
     为什么由这边算：农历。浏览器内置了中国农历，服务器那边要算得额外装库，
     还得自己处理闰月。判断某天是不是这条日子，用的是 occursOn，
     跟日历上标记事件、跟卡片上倒数，是同一份规则。 */
  async function syncQueue() {
    if (!cfg.queueApi) return;
    const today = midnight(new Date());
    const rows = [];

    for (const it of items) {
      const ds = Array.isArray(it.remind) ? it.remind : [];
      if (!ds.length || !it.name) continue;

      for (let i = 0; i <= HORIZON; i++) {
        const day = addDays(today, i);
        if (!occursOn(it, day)) continue;
        const on = `${day.getMonth() + 1}月${day.getDate()}日`;
        for (const d of ds) {
          const when = addDays(day, -d);
          if (when < today) continue;              // 已经过去的时刻服务器会丢掉，这里先不发
          rows.push({
            content: d === 0 ? `就是今天 · ${it.name}` : `还有 ${d} 天 · ${it.name}（${on}）`,
            remind_at: `${key(when)} ${REMIND_AT}`
          });
        }
        if (!it.repeat) break;                     // 只过一次的，找到那天就不用再往后翻了
      }
    }

    rows.sort((a, b) => a.remind_at < b.remind_at ? -1 : 1);
    await fetch(cfg.queueApi, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: cfg.queueToken || '', rows: rows.slice(0, 200) })
    });
  }

  /* --------------------------------------------------------------- 提醒开关 */

  /* 没配服务器就整行不存在 —— 公开版不该一进来就问"允许通知吗"。 */
  async function drawPush() {
    const st = await pushState(cfg);
    if (st === 'unsupported') { elPush.hidden = true; return; }
    elPush.hidden = false;

    if (st === 'need-install') {
      elPush.innerHTML = '<span class="dt-push-say">想要到期提醒的话，' +
        '先把这个页面添加到主屏幕，再从主屏打开 —— iOS 只给装到主屏的那份发通知。</span>';
      return;
    }
    if (st === 'denied') {
      elPush.innerHTML = '<span class="dt-push-say">通知被挡住了。' +
        '去系统设置里把这个应用的通知打开，再回来。</span>';
      return;
    }

    const on = st === 'on';
    elPush.innerHTML = `
      <span class="dt-push-say">${on ? '到期提醒开着' : '到期提醒还没开'}</span>
      <button class="dt-push-btn ${on ? 'off' : ''}">${on ? '关掉' : '打开'}</button>`;

    /* 权限必须在一次真实点击里要 —— 页面自己弹的会被直接拒掉，而且不再问第二次。 */
    elPush.querySelector('.dt-push-btn').onclick = async e => {
      const b = e.currentTarget;
      b.disabled = true;
      try {
        if (on) await disablePush(cfg);
        else { await enablePush(cfg); await syncDates(cfg, items); }
      } catch (err) {
        elPush.innerHTML = `<span class="dt-push-say">没能打开：${escapeHtml(err.message)}</span>`;
        return;
      }
      drawPush();
    };
  }

  function draw() {
    /* 标签行：只列真正用到的。可以同时选中好几个，选中的是"或"的关系。 */
    const used = [...new Set(items.flatMap(i => i.tags || []))];
    elTags.innerHTML = '';
    if (used.length > 1) {
      const all = document.createElement('button');
      /* 全部还是文字按钮 —— 那张红贴纸跟旁边一排水彩色差太大，太抢眼 */
      all.className = 'dt-tag' + (filter.size === 0 ? ' on' : '');
      all.textContent = '全部';
      all.onclick = () => { filter.clear(); draw(); };
      elTags.appendChild(all);
      used.forEach(t => {
        const b = document.createElement('button');
        b.className = 'dt-tag' + (filter.has(t) ? ' on' : '');
        if (img(t)) {
          b.classList.add('pic');
          b.innerHTML = `<img src="./assets/pack/${img(t)}.webp?v=86" alt="${escapeHtml(t)}">`;
        } else {
          b.style.setProperty('--c', col(t));
          b.textContent = t;
        }
        b.onclick = () => {
          filter.has(t) ? filter.delete(t) : filter.add(t);
          draw();
        };
        elTags.appendChild(b);
      });
    }

    const today = midnight(new Date());
    const rows = items
      .map(it => ({ it, ...nextOccurrence(it, today) }))
      .filter(r => filter.size === 0 ||
                   (r.it.tags || []).some(t => filter.has(t)))
      .sort((a, b) => {
        const av = a.days === null ? 1e9 : (a.days < 0 ? 1e8 - a.days : a.days);
        const bv = b.days === null ? 1e9 : (b.days < 0 ? 1e8 - b.days : b.days);
        return av - bv;
      });

    elList.innerHTML = '';
    if (!rows.length) {
      elList.innerHTML = '<p class="dt-empty">还没有记下的日子。<br>点右下角加一个。</p>';
      return;
    }

    rows.forEach(({ it, days, when }) => {
      const card = document.createElement('button');
      card.className = 'dt-card' + (days === 0 ? ' now' : '');
      /* 副标题只说一件事。
         每年过的阳历日子 → 就是那一天，不用重复写哪年开始的；
         农历 → 说农历几月几，再补一句今年落在阳历哪天；
         只过一次的 → 说那天的完整日期。 */
      const on = when ? `${when.getMonth() + 1}月${when.getDate()}日` : '';
      let sub;
      if (!it.repeat) {
        sub = it.date;
      } else if (it.calendar === 'lunar') {
        const l = lunarOf(new Date(it.date + 'T00:00:00'));
        sub = `农历${l || ''}${on ? ' · 今年 ' + on : ''}`;
      } else {
        sub = `每年 ${on}`;
      }
      card.innerHTML = `
        <span class="dt-main">
          <span class="dt-name">${escapeHtml(it.name)}</span>
          <span class="dt-sub">${escapeHtml(sub)}</span>
        </span>
        <span class="dt-right">
          <!-- 卡片上只贴第一张。每张贴纸六十来像素宽，挂两张就是一百二，
               名字那边一行只剩十个字 —— 上下叠也救不了，宽度是由最宽的那张定的。
               其余的标签点开这条就能看到，筛选也照样用得上。 -->
          <span class="dt-chips">${(it.tags || []).slice(0, 1).map(t => sticker(t, 'dt-chip')).join('')}</span>
          <span class="dt-days">${countdownText(days)}</span>
        </span>`;
      card.onclick = () => openForm(it);
      elList.appendChild(card);
    });
  }

  /* ----------------------------------------------------------- 添加 / 改 */

  function openForm(existing) {
    const it = existing || {
      id: Date.now(), name: '', date: key(new Date()),
      calendar: 'solar', tags: [], repeat: true
    };
    const lunarOk = lunarSupported();

    elSheet.hidden = false;
    elSheet.innerHTML = `
      <div class="sheet-card">
        <div class="sheet-date">${existing ? '改一改' : '记一个日子'}</div>

        <label class="sheet-field">
          <span>叫什么</span>
          <input id="dtName" type="text" value="${escapeHtml(it.name)}" placeholder="比如 妈妈生日">
        </label>

        <label class="sheet-field">
          <span>哪一天</span>
          <input id="dtDate" type="date" value="${it.date}">
        </label>

        <div class="sheet-field">
          <span>按哪个历过</span>
          <div class="dt-seg">
            <button class="dt-opt ${it.calendar === 'solar' ? 'on' : ''}" data-cal="solar">阳历</button>
            <button class="dt-opt ${it.calendar === 'lunar' ? 'on' : ''}" data-cal="lunar"
              ${lunarOk ? '' : 'disabled title="这个浏览器不支持农历"'}>阴历</button>
          </div>
          <p class="dt-hint" id="dtLunarHint"></p>
        </div>

        <div class="sheet-field">
          <span>标签（可以选好几个）</span>
          <div class="dt-seg wrap">
            ${TAGS.map(t => {
              const on = (it.tags || []).includes(t) ? 'on' : '';
              return img(t)
                ? `<button class="dt-opt pic ${on}" data-tag="${t}">
                     <img src="./assets/pack/${img(t)}.webp?v=86" alt="${escapeHtml(t)}"></button>`
                : `<button class="dt-opt ${on}" data-tag="${t}" style="--c:${col(t)}">${escapeHtml(t)}</button>`;
            }).join('')}
          </div>
        </div>

        <label class="dt-check">
          <input id="dtRepeat" type="checkbox" ${it.repeat ? 'checked' : ''}>
          <span>每年都过（关掉就是只有那一天，比如一趟旅行）</span>
        </label>

        <div class="sheet-field">
          <span>提前几天提醒</span>
          <div class="dt-seg wrap">
            ${REMIND.map(r => `
              <button class="dt-opt ${(it.remind || []).includes(r.d) ? 'on' : ''}"
                      data-remind="${r.d}">${r.t}</button>`).join('')}
          </div>
          <p class="dt-hint">${remindHint}</p>
        </div>

        <div class="sheet-row">
          ${existing ? '<button class="sheet-btn ghost" id="dtDel">删掉</button>' : ''}
          <button class="sheet-btn ghost" id="dtCancel">关掉</button>
          <button class="sheet-btn" id="dtSave">存下来</button>
        </div>
      </div>`;

    let cal = it.calendar;
    const tags = new Set(it.tags || []);
    const remind = new Set(it.remind || []);
    const hint = elSheet.querySelector('#dtLunarHint');

    function refreshHint() {
      const v = elSheet.querySelector('#dtDate').value;
      if (cal === 'lunar' && v) {
        const l = lunarOf(new Date(v + 'T00:00:00'));
        hint.textContent = l ? `那天是农历 ${l}，以后每年按农历这天算` : '';
      } else hint.textContent = '';
    }

    elSheet.querySelectorAll('[data-cal]').forEach(b => {
      b.onclick = () => {
        cal = b.dataset.cal;
        elSheet.querySelectorAll('[data-cal]').forEach(x => x.classList.toggle('on', x.dataset.cal === cal));
        refreshHint();
      };
    });
    elSheet.querySelectorAll('[data-tag]').forEach(b => {
      b.onclick = () => {
        const t = b.dataset.tag;
        tags.has(t) ? tags.delete(t) : tags.add(t);
        b.classList.toggle('on', tags.has(t));
      };
    });
    elSheet.querySelectorAll('[data-remind]').forEach(b => {
      b.onclick = () => {
        const d = Number(b.dataset.remind);
        remind.has(d) ? remind.delete(d) : remind.add(d);
        b.classList.toggle('on', remind.has(d));
      };
    });
    elSheet.querySelector('#dtDate').oninput = refreshHint;
    refreshHint();

    elSheet.querySelector('#dtCancel').onclick = () => { elSheet.hidden = true; };
    elSheet.onclick = e => { if (e.target === elSheet) elSheet.hidden = true; };

    const del = elSheet.querySelector('#dtDel');
    if (del) del.onclick = async () => {
      items = items.filter(x => x.id !== it.id);
      elSheet.hidden = true;
      await persist();
    };

    elSheet.querySelector('#dtSave').onclick = async () => {
      const name = elSheet.querySelector('#dtName').value.trim();
      if (!name) return;
      const rec = {
        id: it.id,
        name,
        date: elSheet.querySelector('#dtDate').value,
        calendar: cal,
        tags: [...tags],
        repeat: elSheet.querySelector('#dtRepeat').checked,
        remind: [...remind].sort((a, b) => b - a)
      };
      const i = items.findIndex(x => x.id === rec.id);
      if (i >= 0) items[i] = rec; else items.push(rec);
      elSheet.hidden = true;
      await persist();
    };
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  load();
}
