/* 日历。
 *
 * 数据有两条路，由配置决定，界面完全一样：
 *   cfg.moodApi 有值  → 走接口（自己部署的那份）
 *   没值             → 存在本机（公开版，clone 下来直接能用）
 *
 * 一天一格。格子里放心情图标，经期和排卵期是格子的底色。
 * 经期那一层没有开关：记过经期就有，一次都没记过就整层不存在。
 * 不需要它的人不用先被问一句"你要不要关掉这个"。
 */

import { occursOn } from './dates.js?v=75';

const WEEK_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const MOODS = [
  { id: 'happy',   name: '开心' },
  { id: 'loved',   name: '被爱' },
  { id: 'calm',    name: '满足' },
  { id: 'sad',     name: '难过' },
  { id: 'tired',   name: '疲惫' },
  { id: 'anxious', name: '焦虑' }
];

/* ------------------------------------------------------------ 日期工具 */
/* 一律用本地时间拼字符串。切 UTC 时间戳的前十位会让凌晨记的东西掉到前一天。 */
const pad = n => String(n).padStart(2, '0');
const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const sameDay = (a, b) => key(a) === key(b);

/* ------------------------------------------------------------ 数据来源 */

class ApiSource {
  constructor(cfg) { this.cfg = cfg; }

  async range(start, end) {
    const url = `${this.cfg.moodApi}?start=${key(start)}&end=${key(end)}`;
    const rows = await (await fetch(url)).json();
    const person = this.cfg.moodPerson || 'colin';
    const out = {};
    rows.filter(r => r.person === person).forEach(r => { out[r.date] = r; });
    return out;
  }

  async save(date, patch) {
    const body = { date, person: this.cfg.moodPerson || 'colin', ...patch };
    if (this.cfg.moodToken) body.token = this.cfg.moodToken;
    await fetch(this.cfg.moodApi, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }
}

class LocalSource {
  constructor(store) { this.store = store; }

  async range(start, end) {
    const all = await this.store.get('calendar', 'days', {});
    const out = {};
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
      if (all[key(d)]) out[key(d)] = all[key(d)];
    }
    return out;
  }

  async save(date, patch) {
    const all = await this.store.get('calendar', 'days', {});
    all[date] = { ...(all[date] || {}), date, ...patch };
    await this.store.set('calendar', 'days', all);
  }
}

/* ------------------------------------------------------------ 排卵期推算 */
/* 只有在数据里能看到经期起始日时才画。样本少就说明它是估的，
   不给一个假装精确的日子。 */
function ovulationDays(days, cycle) {
  const starts = Object.keys(days).filter(k => {
    if (!days[k].period) return false;
    const prev = key(addDays(new Date(k + 'T00:00:00'), -1));
    return !days[prev] || !days[prev].period;
  }).sort();
  if (!starts.length) return new Set();

  const last = new Date(starts[starts.length - 1] + 'T00:00:00');
  const out = new Set();
  /* 前后各推两个周期，够翻页看的 */
  for (let c = -2; c <= 2; c++) {
    const nextStart = addDays(last, cycle * (c + 1));
    for (let o = -2; o <= 2; o++) out.add(key(addDays(nextStart, -14 + o)));
  }
  return out;
}

/* 几个形状都画成 SVG：跟着文字颜色走，能无级缩放，也不用多下载图。 */
const SHAPES = {
  cloud: 'M7.5 18a6 6 0 0 1-.6-11.97A7.5 7.5 0 0 1 21.3 6.6 5.7 5.7 0 0 1 22.5 18z',
  star:  'M15 2.5l3.6 7.6 8.4 1.1-6.2 5.7 1.6 8.2L15 21.2 7.6 25.1l1.6-8.2L3 11.2l8.4-1.1z',
  heart: 'M15 26S3.5 18.8 3.5 11.4A6.4 6.4 0 0 1 15 7.8a6.4 6.4 0 0 1 11.5 3.6C26.5 18.8 15 26 15 26z'
};

function shape(name, cls, box) {
  return `<svg class="${cls}" viewBox="0 0 ${box}" fill="currentColor" aria-hidden="true">
    <path d="${SHAPES[name]}"/></svg>`;
}

const cloud = kind => shape('cloud', 'cal-cloud ' + kind, '30 20');

/* ------------------------------------------------------------------ 视图 */

export function mountCalendar(root, { cfg, store }) {
  /* 倒计时那边记的日子，在日历上也标出来。
     两块用的是同一份数据，判断哪天命中的逻辑也是从那边借的。 */
  const TAGSTYLE = cfg.tagStyle || {};
  let events = [];
  const src = cfg.moodApi ? new ApiSource(cfg) : new LocalSource(store);

  /* 抽屉挂在 body 上。放在板块里会被公路和洁哥那两层盖住 ——
     板块本身带 z-index，里面再高的层级也跳不出这个圈。 */
  const elSheet = document.createElement('div');
  elSheet.className = 'sheet';
  elSheet.hidden = true;
  document.body.appendChild(elSheet);
  const cycle = cfg.cycleLength || 28;
  /* 配置里关掉的话，这一层连算都不算 */
  const cycleOn = cfg.cycle === true;
  let cursor = new Date();
  let showCycle = false;      // 有经期数据才亮，没有就整层不存在

  root.innerHTML = `
    <div class="cal-card">
      <div class="cal-top">
        <div class="cal-men"></div>
        <div class="cal-mon"></div>
        <div class="cal-myear"></div>
        <button class="cal-nav" data-go="-1">‹</button>
        <button class="cal-nav" data-go="1">›</button>
        <button class="cal-today" hidden>今天</button>
      </div>
      <div class="cal-body">
        <div class="cal-week"></div>
        <div class="cal-grid"></div>
      </div>
    </div>
  `;

  const elMon    = root.querySelector('.cal-mon');
  const elMen    = root.querySelector('.cal-men');
  const elYear   = root.querySelector('.cal-myear');
  const elWeek   = root.querySelector('.cal-week');
  const elGrid   = root.querySelector('.cal-grid');

  elWeek.innerHTML = WEEK_EN.map(w => `<span>${w}</span>`).join('');

  /* 倒计时那边改了就重画。另外切回这一页时也重读一次，
     数据万一是别处改的（比如换了台设备同步过来）也能跟上。 */
  addEventListener('dock:dates', () => draw());
  const panel = root.closest('.panel');
  if (panel) {
    new MutationObserver(() => {
      if (panel.classList.contains('on')) draw();
    }).observe(panel, { attributes: true, attributeFilter: ['class'] });
  }

  const elToday = root.querySelector('.cal-today');
  elToday.onclick = () => { cursor = new Date(); draw(); };

  root.querySelectorAll('.cal-nav').forEach(b => {
    b.onclick = () => {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + Number(b.dataset.go), 1);
      draw();
    };
  });

  async function draw() {
    const y = cursor.getFullYear(), m = cursor.getMonth();
    /* 翻走了才给「今天」这个按钮 —— 已经在当月时它只是噪音 */
    const now = new Date();
    elToday.hidden = (y === now.getFullYear() && m === now.getMonth());
    elMon.textContent = m + 1;
    elMen.textContent = MONTH_EN[m];
    elYear.textContent = y;

    const first = new Date(y, m, 1);
    const start = addDays(first, -first.getDay());          // 补齐到周日
    const end = addDays(start, 41);                          // 六行
    const days = await src.range(start, end);
    events = await store.get('dates', 'items', []);

    /* 记过经期就一直显示这一层；一次都没记过的人（比如男生）看不到它。
       翻到没有数据的月份也不会闪一下就消失。 */
    const seen = cycleOn && Object.values(days).some(r => r.period);
    if (seen) await store.set('calendar', 'hasCycle', true);
    showCycle = cycleOn && (seen || await store.get('calendar', 'hasCycle', false));

    const ovu = showCycle ? ovulationDays(days, cycle) : new Set();

    const today = new Date();
    elGrid.innerHTML = '';
    for (let i = 0; i < 42; i++) {
      const d = addDays(start, i);
      const k = key(d);
      const rec = days[k] || {};
      const cell = document.createElement('button');
      cell.className = 'cal-cell';
      if (d.getMonth() !== m) cell.classList.add('out');
      if (sameDay(d, today)) cell.classList.add('today');
      if (showCycle && rec.period) cell.classList.add('period');
      else if (ovu.has(k)) cell.classList.add('ovu');

      /* 数字底下垫的形状：纪念日一颗星，写了东西一朵云。今天不用垫 —— 整格已经是浅蓝的。
         普通日子什么都不垫 —— 一屏四十二格，每格都有东西就闹了。 */
      let back = '';
      if (rec.anniversary)        back = shape('star',  'cal-back starry', '30 28');
      else if (rec.note)          back = shape('cloud', 'cal-back cloudy', '30 22');

      /* 这天有没有倒计时里记的事。有就在右上角贴一枚小标签。 */
      const hits = events.filter(ev => occursOn(ev, d));
      let flag = '';
      if (hits.length) {
        const tag = (hits[0].tags || [])[0];
        const st = TAGSTYLE[tag];
        flag = st && st.img
          ? `<img class="cal-ev" src="./assets/pack/${st.img}.webp?v=75" alt="">`
          : '<i class="cal-ev dot"></i>';
      }

      /* 心情缩到左上角，数字下面那一条留给标签 —— 标签是横的，
         占满格宽才认得出写的什么。 */
      const moodPip = rec.mood
        ? `<img class="cal-mood" src="./assets/mood/${rec.mood}.webp?v=75" alt="">`
        : '';
      cell.innerHTML = `
        ${moodPip}
        ${back}
        <span class="cal-num">${d.getDate()}</span>
        <span class="cal-slot">${flag}</span>`;
      cell.onclick = () => openSheet(k, rec);
      elGrid.appendChild(cell);
    }

  }

  /* --------------------------------------------------------- 当天的抽屉 */

  /* 弹窗顶上那行：这天在倒计时里记着什么。
     纪念日这一栏原来在这儿收，现在归倒计时管了 ——
     同一件事有两个地方能记，早晚对不上。 */
  function evLine(k) {
    const day = new Date(k + 'T00:00:00');
    const hits = events.filter(ev => occursOn(ev, day));
    if (!hits.length) return '';
    return `<div class="cal-evline">${hits.map(h => {
      const st = TAGSTYLE[(h.tags || [])[0]];
      const pic = st && st.img
        ? `<img src="./assets/pack/${st.img}.webp?v=75" alt="">` : '';
      return `<span>${pic}${h.name}</span>`;
    }).join('')}</div>`;
  }

  function openSheet(k, rec) {
    const picked = rec.mood || '';
    elSheet.hidden = false;
    elSheet.innerHTML = `
      <div class="sheet-card">
        <div class="sheet-date">${k}</div>
        ${evLine(k)}
        <div class="sheet-moods">
          ${MOODS.map(mo => `
            <button class="mood-pick ${picked === mo.id ? 'on' : ''}" data-mood="${mo.id}">
              <img src="./assets/mood/${mo.id}.webp?v=75" alt="">
              <span>${mo.name}</span>
            </button>`).join('')}
        </div>
        <label class="sheet-field">
          <span>这天</span>
          <textarea id="sheetNote" rows="4" placeholder="想写就写，不写也行">${rec.note || ''}</textarea>
        </label>
        <div class="sheet-row">
          <button class="sheet-btn ghost" id="sheetCancel">关掉</button>
          <button class="sheet-btn" id="sheetSave">存下来</button>
        </div>
      </div>`;

    let mood = picked;
    elSheet.querySelectorAll('.mood-pick').forEach(b => {
      b.onclick = () => {
        mood = mood === b.dataset.mood ? '' : b.dataset.mood;   // 再点一次取消
        elSheet.querySelectorAll('.mood-pick').forEach(x =>
          x.classList.toggle('on', x.dataset.mood === mood));
      };
    });

    elSheet.querySelector('#sheetCancel').onclick = () => { elSheet.hidden = true; };
    elSheet.onclick = e => { if (e.target === elSheet) elSheet.hidden = true; };

    elSheet.querySelector('#sheetSave').onclick = async () => {
      await src.save(k, {
        mood: mood || null,
        note: elSheet.querySelector('#sheetNote').value.trim() || null
      });
      elSheet.hidden = true;
      draw();
    };
  }

  draw();
}
