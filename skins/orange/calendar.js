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

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
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

/* ------------------------------------------------------------------ 视图 */

export function mountCalendar(root, { cfg, store }) {
  const src = cfg.moodApi ? new ApiSource(cfg) : new LocalSource(store);

  /* 抽屉挂在 body 上。放在板块里会被公路和洁哥那两层盖住 ——
     板块本身带 z-index，里面再高的层级也跳不出这个圈。 */
  const elSheet = document.createElement('div');
  elSheet.className = 'sheet';
  elSheet.hidden = true;
  document.body.appendChild(elSheet);
  const cycle = cfg.cycleLength || 28;
  let cursor = new Date();
  let showCycle = false;      // 有经期数据才亮，没有就整层不存在

  root.innerHTML = `
    <div class="cal-head">
      <button class="cal-nav" data-go="-1">‹</button>
      <div class="cal-title"></div>
      <button class="cal-nav" data-go="1">›</button>
    </div>
    <div class="cal-week"></div>
    <div class="cal-grid"></div>
    <div class="cal-legend"></div>
  `;

  const elTitle  = root.querySelector('.cal-title');
  const elWeek   = root.querySelector('.cal-week');
  const elGrid   = root.querySelector('.cal-grid');
  const elLegend = root.querySelector('.cal-legend');

  elWeek.innerHTML = WEEK.map(w => `<span>${w}</span>`).join('');

  root.querySelectorAll('.cal-nav').forEach(b => {
    b.onclick = () => {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + Number(b.dataset.go), 1);
      draw();
    };
  });

  async function draw() {
    const y = cursor.getFullYear(), m = cursor.getMonth();
    elTitle.textContent = `${y} 年 ${m + 1} 月`;

    const first = new Date(y, m, 1);
    const start = addDays(first, -first.getDay());          // 补齐到周日
    const end = addDays(start, 41);                          // 六行
    const days = await src.range(start, end);

    /* 记过经期就一直显示这一层；一次都没记过的人（比如男生）看不到它。
       翻到没有数据的月份也不会闪一下就消失。 */
    const seen = Object.values(days).some(r => r.period);
    if (seen) await store.set('calendar', 'hasCycle', true);
    showCycle = seen || await store.get('calendar', 'hasCycle', false);

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

      cell.innerHTML = `
        <span class="cal-num">${d.getDate()}</span>
        ${rec.mood ? `<img class="cal-mood" src="./assets/mood/${rec.mood}.webp?v=1" alt="">` : ''}
        <span class="cal-marks">
          ${rec.anniversary ? '<i class="mk-anni"></i>' : ''}
          ${rec.note ? '<i class="mk-note"></i>' : ''}
        </span>`;
      cell.onclick = () => openSheet(k, rec);
      elGrid.appendChild(cell);
    }

    elLegend.innerHTML = showCycle
      ? '<span><i class="lg period"></i>经期</span><span><i class="lg ovu"></i>排卵期（推算）</span>'
      : '';
  }

  /* --------------------------------------------------------- 当天的抽屉 */

  function openSheet(k, rec) {
    const picked = rec.mood || '';
    elSheet.hidden = false;
    elSheet.innerHTML = `
      <div class="sheet-card">
        <div class="sheet-date">${k}</div>
        <div class="sheet-moods">
          ${MOODS.map(mo => `
            <button class="mood-pick ${picked === mo.id ? 'on' : ''}" data-mood="${mo.id}">
              <img src="./assets/mood/${mo.id}.webp?v=1" alt="">
              <span>${mo.name}</span>
            </button>`).join('')}
        </div>
        <label class="sheet-field">
          <span>这天</span>
          <textarea id="sheetNote" rows="4" placeholder="想写就写，不写也行">${rec.note || ''}</textarea>
        </label>
        <label class="sheet-field">
          <span>纪念日</span>
          <input id="sheetAnni" type="text" value="${rec.anniversary || ''}" placeholder="留空就是没有">
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
        note: elSheet.querySelector('#sheetNote').value.trim() || null,
        anniversary: elSheet.querySelector('#sheetAnni').value.trim() || null
      });
      elSheet.hidden = true;
      draw();
    };
  }

  draw();
}
