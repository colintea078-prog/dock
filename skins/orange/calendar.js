/* 日历。
 *
 * 数据有两条路，由配置决定，界面完全一样：
 *   cfg.moodApi 有值  → 走接口（自己部署的那份）
 *   没值             → 存在本机（公开版，clone 下来直接能用）
 *
 * 一天一格。左上角是清单完成度，经期和排卵期是格子的底色。
 * 点开一天能看到那天的全部：事件、清单、花销、随笔。
 * 经期那一层没有开关：记过经期就有，一次都没记过就整层不存在。
 * 不需要它的人不用先被问一句"你要不要关掉这个"。
 */

import { occursOn } from './dates.js?v=81';
import { todoForDay, todoIsDone, announceTodo } from './checklist.js?v=81';

const WEEK_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
/* 心情那六个图标撤了。一个格子里已经有备注的云朵、纪念日的星星、
   节日的贴纸，再加一枚图标就没人看得清哪个是哪个了。
   数据库里记过的心情不动，只是界面上不再显示、也不再记新的。 */

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

/* 清单完成度：走过的弧就是做完的比例，全做完填实加一个勾。
   半径 5、描边 2，画在 14 见方里，缩到 13px 挂在格子左上角。 */
function ring(done, total) {
  if (!total) return '';
  if (done >= total) {
    return `<svg class="cal-ring" viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="7" cy="7" r="6" fill="#237FC5"/>
      <path d="M4.2 7.2l1.9 1.9 3.7-4" fill="none" stroke="#fff"
        stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  const c = 2 * Math.PI * 5;
  return `<svg class="cal-ring" viewBox="0 0 14 14" aria-hidden="true">
    <circle cx="7" cy="7" r="5" fill="none" stroke="rgba(35,127,197,.22)" stroke-width="2"/>
    <circle cx="7" cy="7" r="5" fill="none" stroke="#237FC5" stroke-width="2"
      stroke-linecap="round" transform="rotate(-90 7 7)"
      stroke-dasharray="${(c * done / total).toFixed(2)} ${c.toFixed(2)}"/></svg>`;
}

const money = n => (Math.round(n * 100) / 100).toLocaleString(undefined, {
  minimumFractionDigits: 2, maximumFractionDigits: 2
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* ------------------------------------------------------------------ 视图 */

export function mountCalendar(root, { cfg, store }) {
  /* 倒计时那边记的日子，在日历上也标出来。
     两块用的是同一份数据，判断哪天命中的逻辑也是从那边借的。 */
  const TAGSTYLE = cfg.tagStyle || {};
  const CATS = cfg.ledgerCats || [];
  const catOf = id => CATS.find(c => c.id === id) || CATS[CATS.length - 1];
  let events = [];
  /* 清单和账本也是按天存的。日历是这个工作台上唯一按时间铺开的地方，
     所以点开一天就该看到那天的全部，而不是只有心情。 */
  let todos = [];
  let todoDone = {};
  let spends = [];
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
      <div class="cal-recap"></div>
    </div>
  `;

  const elMon    = root.querySelector('.cal-mon');
  const elMen    = root.querySelector('.cal-men');
  const elYear   = root.querySelector('.cal-myear');
  const elWeek   = root.querySelector('.cal-week');
  const elGrid   = root.querySelector('.cal-grid');
  const elRecap  = root.querySelector('.cal-recap');

  elWeek.innerHTML = WEEK_EN.map(w => `<span>${w}</span>`).join('');

  /* 倒计时那边改了就重画。另外切回这一页时也重读一次，
     数据万一是别处改的（比如换了台设备同步过来）也能跟上。 */
  addEventListener('dock:dates', () => draw());
  addEventListener('dock:todo', e => {
    if (e.detail && e.detail.src === 'calendar') return;
    draw();
  });
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
    events   = await store.get('dates', 'items', []);
    todos    = await store.get('todo', 'items', []);
    todoDone = await store.get('todo', 'done', {});
    spends   = await store.get('ledger', 'items', []);

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
          ? `<img class="cal-ev" src="./assets/pack/${st.img}.webp?v=81" alt="">`
          : '<i class="cal-ev dot"></i>';
      }

      /* 左上角那枚是清单完成度，数字下面那一条留给标签 —— 标签是横的，
         占满格宽才认得出写的什么。 */
      /* 只画到今天为止。「每天」的事项从记下那天起每天都成立，
         往后的日子会一路排到月底 —— 一屏二十几个空圈，
         看着像欠了一堆，其实那些日子还没到。 */
      let rung = '';
      if (d <= today) {
        const list = todoForDay(todos, k);
        const fin = list.filter(it => todoIsDone(todoDone, k, it.id)).length;
        rung = ring(fin, list.length);
      }

      cell.innerHTML = `
        ${rung}
        ${back}
        <span class="cal-num">${d.getDate()}</span>
        <span class="cal-slot">${flag}</span>`;
      cell.onclick = () => openSheet(k, rec);
      elGrid.appendChild(cell);
    }

    drawRecap(y, m, days);
  }

  /* ------------------------------------------------------- 这个月怎么样 */

  /* 只统计这个月自己的日子，当月算到今天为止 ——
     把还没到的日子算进完成率，看起来永远像是落下了一堆。 */
  function drawRecap(y, m, days) {
    const today = new Date();
    const isNow = y === today.getFullYear() && m === today.getMonth();
    const last = isNow ? today.getDate() : new Date(y, m + 1, 0).getDate();

    let noteDays = 0, planned = 0, finished = 0;
    for (let i = 1; i <= last; i++) {
      const k = key(new Date(y, m, i));
      const rec = days[k];
      if (rec && rec.note) noteDays++;
      const list = todoForDay(todos, k);
      planned += list.length;
      finished += list.filter(it => todoIsDone(todoDone, k, it.id)).length;
    }

    const spent = spends
      .filter(r => {
        const d = new Date(r.date + 'T00:00:00');
        return d.getFullYear() === y && d.getMonth() === m;
      })
      .reduce((t, r) => t + (Number(r.amount) || 0), 0);

    const bits = [];
    if (noteDays) bits.push(`写了 <b>${noteDays}</b> 天`);
    if (planned)  bits.push(`清单 <b>${finished}/${planned}</b>`);
    if (spent)    bits.push(`花了 <b>¥${money(spent)}</b>`);

    elRecap.innerHTML = bits.length
      ? bits.map(b => `<span>${b}</span>`).join('')
      : '<span class="cal-recap-none">这个月还没记什么</span>';
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
        ? `<img src="./assets/pack/${st.img}.webp?v=81" alt="">` : '';
      return `<span>${pic}${h.name}</span>`;
    }).join('')}</div>`;
  }

  /* 这天的清单。勾和加都在这儿就地生效 —— 只能看的话，
     还是得退出去开另一块，那日历就仍旧只是一张画。 */
  function todoBlock(k) {
    const list = todoForDay(todos, k);
    const ok = list.filter(it => todoIsDone(todoDone, k, it.id)).length;
    return `
      <div class="sh-sec">
        <div class="sh-sec-h">清单${list.length ? `<b>${ok}/${list.length}</b>` : ''}</div>
        ${list.map(it => {
          const fin = todoIsDone(todoDone, k, it.id);
          return `
            <div class="sh-todo ${fin ? 'done' : ''}" data-todo="${it.id}">
              <span class="sh-box"></span>
              <span class="sh-t">${escapeHtml(it.text)}</span>
              ${it.time ? `<span class="sh-time">${it.time}</span>` : ''}
            </div>`;
        }).join('') || '<p class="sh-none">这天没有事</p>'}
        <div class="sh-add">
          <input id="shAdd" type="text" placeholder="给这天加一项">
          <button class="sh-add-btn" id="shAddBtn">加</button>
        </div>
      </div>`;
  }

  /* 这天花了什么。只显示，不在这儿改 —— 改一笔要挑分类、改日期，
     那是账本表单的事，塞进来会把这个抽屉撑成第二个账本。 */
  function spendBlock(k) {
    const rows = spends.filter(r => r.date === k);
    if (!rows.length) return '';
    const total = rows.reduce((t, r) => t + (Number(r.amount) || 0), 0);
    return `
      <div class="sh-sec">
        <div class="sh-sec-h">花销<b>¥${money(total)}</b></div>
        ${rows.map(r => {
          const c = catOf(r.cat);
          const icon = c ? `<img src="./assets/cat/${c.icon}.webp?v=81" alt="">` : '';
          return `
            <div class="sh-led">
              ${icon}
              <span class="sh-t">${escapeHtml(r.note || (c ? c.name : ''))}</span>
              <span class="sh-amt">¥ ${money(r.amount)}</span>
            </div>`;
        }).join('')}
      </div>`;
  }

  function openSheet(k, rec) {
    let note = rec.note || '';

    elSheet.hidden = false;

    function render() {
      elSheet.innerHTML = `
        <div class="sheet-card">
          <div class="sheet-date">${k}</div>
          ${evLine(k)}
          ${todoBlock(k)}
          ${spendBlock(k)}
          <label class="sheet-field">
            <span>这天</span>
            <textarea id="sheetNote" rows="4" placeholder="想写就写，不写也行">${escapeHtml(note)}</textarea>
          </label>
          <div class="sheet-row">
            <button class="sheet-btn ghost" id="sheetCancel">关掉</button>
            <button class="sheet-btn" id="sheetSave">存下来</button>
          </div>
        </div>`;

      /* 写到一半勾了个清单，重画之后那段字得还在 */
      const area = elSheet.querySelector('#sheetNote');
      area.oninput = () => { note = area.value; };

      elSheet.querySelectorAll('[data-todo]').forEach(row => {
        row.onclick = () => toggleTodo(k, Number(row.dataset.todo)).then(render);
      });

      const input = elSheet.querySelector('#shAdd');
      const add = async () => {
        const t = input.value.trim();
        if (!t) return;
        todos.push({ id: Date.now(), text: t, time: '', daily: false, date: k });
        await store.set('todo', 'items', todos);
        announceTodo('calendar');
        render();
      };
      elSheet.querySelector('#shAddBtn').onclick = add;
      input.onkeydown = e => { if (e.key === 'Enter') add(); };

      elSheet.querySelector('#sheetCancel').onclick = () => { elSheet.hidden = true; draw(); };

      elSheet.querySelector('#sheetSave').onclick = async () => {
        /* 只写随笔这一个字段。心情不再往里塞 ——
           不发这个字段，库里原来记过的心情就原样留着。 */
        await src.save(k, { note: note.trim() || null });
        elSheet.hidden = true;
        draw();
      };
    }

    elSheet.onclick = e => { if (e.target === elSheet) { elSheet.hidden = true; draw(); } };
    render();
  }

  async function toggleTodo(k, id) {
    const list = todoDone[k] || (todoDone[k] = []);
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1); else list.push(id);
    if (!list.length) delete todoDone[k];
    await store.set('todo', 'done', todoDone);
    announceTodo('calendar');
  }

  draw();
}
