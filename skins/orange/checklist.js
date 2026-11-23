import { escapeHtml } from './util.js?v=87';
import { makeFab } from './fab.js?v=87';

/* 清单。按天看，打钩划掉。
 *
 * 两种条目：
 *   每天  —— 从记下那天起，之后每天都出现
 *   单次  —— 只在它那一天出现
 *
 * 完成状态按「哪一天 + 哪一条」记，所以今天勾掉的每日事项，
 * 明天会重新出现 —— 那才是每天要做的东西该有的样子。
 */

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const pad = n => String(n).padStart(2, '0');
const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const midnight = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const SPAN = 7;                        // 前后各看几天

/* 这两个是「某天该做什么、做完没有」的唯一说法。日历那边也要问同样的问题，
   所以从这里导出去 —— 两处各写一遍的话，早晚有一处会漏掉「每天」这种情况。 */
export function todoForDay(items, dayKey) {
  return items
    .filter(it => it.daily ? it.date <= dayKey : it.date === dayKey)
    .sort((a, b) => {
      /* 有时间的排前面并按时间走，没时间的按记的先后 */
      if (a.time && b.time) return a.time < b.time ? -1 : 1;
      if (a.time) return -1;
      if (b.time) return 1;
      return a.id - b.id;
    });
}

export const todoIsDone = (done, dayKey, id) => (done[dayKey] || []).includes(id);

/* ------------------------------------------------------- 存到手机日历 */

/* 清单上的时间原本只是个标签 —— 网页关掉就没人值班，到点不会响。
   把带时间的条目导成一个 .ics，手机日历收下后由系统在那个时间提醒。
   每天的写成每日循环；单次的只导还没到的那天。 */
function icsText(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}
/* 时间一律换算成 UTC 写死。裸时间（不带时区）各家日历会自己猜，
   猜错就漂几个小时；钉成 UTC，谁读都不会错。（国内无夏令时，
   每日/每年循环换算完也不会慢慢漂。） */
const icsUtc = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

function buildTodoIcs(items) {
  const today = key(new Date());
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//dock orange//todo//ZH'];
  for (const it of items) {
    if (!it.time) continue;
    const startDay = it.daily && it.date < today ? today : it.date;
    if (!it.daily && it.date < today) continue;      // 单次的已经过了，导了也不会响
    const [h, m] = it.time.split(':').map(Number);
    const start = new Date(startDay + 'T00:00:00'); start.setHours(h, m, 0, 0);
    const end = new Date(start.getTime() + 15 * 60000);
    lines.push('BEGIN:VEVENT',
      `UID:todo-${it.id}@dock-orange`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsUtc(start)}`,
      `DTEND:${icsUtc(end)}`,
      `SUMMARY:${icsText(it.text)}`);
    if (it.daily) lines.push('RRULE:FREQ=DAILY');
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(it.text)}`, 'TRIGGER:PT0M', 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function downloadTodoIcs(items) {
  const blob = new Blob([buildTodoIcs(items)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  /* iOS 不认脚本替它点的下载：直接把文件交给系统，它会弹「加到日历」。 */
  if (/iP(hone|ad|od)/.test(navigator.userAgent)) {
    location.href = url;
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.download = '清单提醒.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* 清单被谁改了都喊一声，另一块跟着重读。detail.src 是为了不把自己喊醒。 */
export const announceTodo = src =>
  dispatchEvent(new CustomEvent('dock:todo', { detail: { src } }));

export function mountChecklist(root, { cfg, store }) {
  let items = [];
  let done = {};                       // { 'YYYY-MM-DD': [id, ...] }
  let picked = key(new Date());        // 当前看的是哪天
  let balls = [];                      // 日期球，建一次就不再重建
  /* 摆正之前不认「谁在中间」。一进来那排球还停在 0 的位置，
     这时候来的滚动事件会把选中的日子改成最边上那天，然后一直留在那儿。 */
  let ready = false;

  root.innerHTML = `
    <div class="ck-head">
      <div class="ck-title">清单</div>
      <div class="ck-sub"></div>
      <button class="ck-back" hidden>回到今天</button>
      <button class="ck-cal" hidden>存到手机日历 · 到点提醒</button>
    </div>
    <div class="ck-days"></div>
    <div class="ck-list"></div>
  `;
  const elSub  = root.querySelector('.ck-sub');
  const elDays = root.querySelector('.ck-days');
  const elList = root.querySelector('.ck-list');
  const elBack = root.querySelector('.ck-back');
  const elCal = root.querySelector('.ck-cal');
  elCal.onclick = () => downloadTodoIcs(items);

  /* 首尾两块留白，宽度按像素给（见 settle） */
  const padL = document.createElement('i');
  const padR = document.createElement('i');
  padL.className = padR.className = 'ck-pad';

  elBack.onclick = () => {
    const b = balls.find(x => x.key === key(new Date()));
    if (b) center(b.el, true);
  };

  const elSheet = document.createElement('div');
  elSheet.className = 'sheet';
  elSheet.hidden = true;
  document.body.appendChild(elSheet);

  makeFab({
    label: '新增一项',
    onTap: () => openForm(),
    store,
    panel: root.closest('.panel')
  });

  /* ------------------------------------------------------------ 数据 */

  async function load() {
    items = await store.get('todo', 'items', []);
    done  = await store.get('todo', 'done', {});
    if (!items.length) {
      const seed = cfg.sampleTodos || [];
      if (seed.length) {
        items = seed.map((t, i) => ({ id: Date.now() + i, date: picked, ...t }));
        await store.set('todo', 'items', items);
      }
    }
    buildDays();
    draw();
    /* 一进来，今天停在正中间。这一步得等到量得到宽度 ——
       挂载时板块多半还没打开，量出来是 0，摆不了。 */
    let tries = 0;
    (function place() {
      if (settle() || ++tries > 30) return;
      requestAnimationFrame(place);
    })();
  }

  const saveItems = async () => { await store.set('todo', 'items', items); announceTodo('checklist'); };
  const saveDone  = async () => { await store.set('todo', 'done', done);   announceTodo('checklist'); };

  const forDay = dayKey => todoForDay(items, dayKey);
  const isDone = (dayKey, id) => todoIsDone(done, dayKey, id);

  /* 日历那边也能勾、也能加。改完了这里重读一遍，两块不会各说各的。 */
  addEventListener('dock:todo', async e => {
    if (e.detail && e.detail.src === 'checklist') return;
    items = await store.get('todo', 'items', []);
    done  = await store.get('todo', 'done', {});
    draw();
  });

  async function toggle(dayKey, id) {
    const list = done[dayKey] || (done[dayKey] = []);
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1); else list.push(id);
    if (!list.length) delete done[dayKey];
    await saveDone();
    draw();
  }

  async function remove(id) {
    items = items.filter(it => it.id !== id);
    Object.keys(done).forEach(k => {
      done[k] = done[k].filter(x => x !== id);
      if (!done[k].length) delete done[k];
    });
    await saveItems();
    await saveDone();
    draw();
  }

  /* ------------------------------------------------------------ 画 */

  /* 球只建一次。每次重建的话，正在滑的那一排会在手底下跳回去。 */
  function buildDays() {
    const today = midnight(new Date());
    elDays.innerHTML = '';
    balls = [];
    elDays.appendChild(padL);
    for (let i = -SPAN; i <= SPAN; i++) {
      const d = addDays(today, i);
      const b = document.createElement('button');
      b.className = 'ck-day' + (i === 0 ? ' today' : '');
      b.innerHTML =
        `<span class="ck-w">${WEEK[d.getDay()][1]}</span>` +
        `<span class="ck-d">${d.getDate()}</span>`;
      /* 点一下不是直接选中，而是把它推到中间 —— 选中永远由「谁在中间」决定，
         这样点和滑走的是同一条路，不会出现选中的和放大的不是同一颗。 */
      b.onclick = () => center(b, true);
      elDays.appendChild(b);
      balls.push({ el: b, key: key(d) });
    }
    elDays.appendChild(padR);
  }

  /* 用 offsetLeft 直接算出该滚到哪儿，不靠 scrollBy 推。
     推是相对的：位置本来就没摆对的时候，推完还是不对。 */
  function center(el, smooth) {
    elDays.scrollTo({
      left: el.offsetLeft + el.offsetWidth / 2 - elDays.clientWidth / 2,
      behavior: smooth ? 'smooth' : 'auto'
    });
  }

  /* 把当前选中的那天摆回正中间。板块还没打开时量不到宽度，摆不了，
     返回 false 让调用方过一帧再试。 */
  function settle() {
    const w = elDays.clientWidth;
    if (!w) return false;
    const pad = Math.max(0, (w - 46) / 2);      // 46 是一颗球的宽
    padL.style.width = padR.style.width = pad + 'px';
    const b = balls.find(x => x.key === picked);
    if (!b) return false;
    center(b.el, false);
    focus();
    ready = true;
    return true;
  }

  /* 对焦：离屏幕中线越近的球越大越清楚，越远越小越虚。
     顺便决定今天看的是哪一天 —— 谁在中间就是谁。 */
  function focus() {
    const box = elDays.getBoundingClientRect();
    if (!box.width) return;            // 板块还没打开，量出来是 0
    const mid = box.left + box.width / 2;
    const step = (balls[0] ? balls[0].el.offsetWidth : 46) + 8;

    let near = null, min = Infinity;
    balls.forEach(b => {
      const r = b.el.getBoundingClientRect();
      b.d = Math.abs(r.left + r.width / 2 - mid);
      if (b.d < min) { min = b.d; near = b; }
    });

    balls.forEach(b => {
      const t = Math.min(b.d / (step * 2.4), 1);     // 0 = 正中间，1 = 已经很远
      b.el.style.transform = `scale(${(1.24 - 0.4 * t).toFixed(3)})`;
      b.el.style.opacity = (1 - 0.45 * t).toFixed(3);
      b.el.style.filter = t > 0.08 ? `blur(${(t * 1.2).toFixed(2)}px)` : '';
      b.el.classList.toggle('on', b === near);
    });

    if (ready && near && near.key !== picked) { picked = near.key; drawList(); }
  }

  /* 哪天的事做完了，球底下点个点 */
  function markClear() {
    balls.forEach(b => {
      const list = forDay(b.key);
      b.el.classList.toggle('clear', !!list.length && list.every(it => isDone(b.key, it.id)));
    });
  }

  function drawList() {
    const list = forDay(picked);
    const d = new Date(picked + 'T00:00:00');
    const ok = list.filter(it => isDone(picked, it.id)).length;

    elSub.textContent = list.length
      ? `${d.getMonth() + 1}/${d.getDate()} ${WEEK[d.getDay()]} · 完成 ${ok}/${list.length}`
      : `${d.getMonth() + 1}/${d.getDate()} ${WEEK[d.getDay()]}`;
    elBack.hidden = picked === key(new Date());

    if (!list.length) {
      elList.innerHTML = '<p class="dt-empty">这天没有事。<br>点右下角加一项。</p>';
      return;
    }

    elList.innerHTML = '';
    list.forEach(it => {
      const finished = isDone(picked, it.id);
      const row = document.createElement('div');
      row.className = 'ck-row' + (finished ? ' done' : '');
      row.innerHTML = `
        <button class="ck-box" aria-label="完成"></button>
        <span class="ck-main">
          <span class="ck-text">${escapeHtml(it.text)}</span>
          <span class="ck-meta">${it.daily ? '每天' : `${d.getMonth() + 1}/${d.getDate()} 记的`}</span>
        </span>
        ${it.time ? `<span class="ck-time">${it.time}</span>` : ''}
        <button class="ck-del" aria-label="删掉">🗑</button>`;
      row.querySelector('.ck-box').onclick = () => toggle(picked, it.id);
      row.querySelector('.ck-text').onclick = () => toggle(picked, it.id);
      row.querySelector('.ck-del').onclick = () => remove(it.id);
      elList.appendChild(row);
    });
  }

  function draw() { markClear(); drawList(); elCal.hidden = !items.some(it => it.time); }

  /* 滑动时每帧最多对焦一次 */
  let tick = 0;
  elDays.addEventListener('scroll', () => {
    if (tick) return;
    tick = requestAnimationFrame(() => { tick = 0; focus(); });
  }, { passive: true });

  /* 屏幕宽度变了，两头的留白也得跟着变，不然中线就偏了 */
  addEventListener('resize', () => settle());

  /* 切回这一页时重新摆一次 —— 挂载那会儿多半还没量到宽度 */
  const panel = root.closest('.panel');
  if (panel) {
    new MutationObserver(() => {
      if (panel.classList.contains('on')) settle();
    }).observe(panel, { attributes: true, attributeFilter: ['class'] });
  }

  /* ------------------------------------------------------------ 新增 */

  function openForm() {
    elSheet.hidden = false;
    elSheet.innerHTML = `
      <div class="sheet-card">
        <div class="sheet-date">新增一项</div>

        <label class="sheet-field">
          <span>要做什么</span>
          <input id="ckText" type="text" placeholder="比如 吃褪黑素">
        </label>

        <label class="sheet-field">
          <span>几点（可以不填）</span>
          <input id="ckTime" type="time">
        </label>

        <label class="dt-check">
          <input id="ckDaily" type="checkbox">
          <span>每天都要做（关掉就只有 ${picked} 这天）</span>
        </label>

        <div class="sheet-row">
          <button class="sheet-btn ghost" id="ckCancel">关掉</button>
          <button class="sheet-btn" id="ckSave">加上</button>
        </div>
      </div>`;

    const text = elSheet.querySelector('#ckText');
    setTimeout(() => text.focus(), 60);

    elSheet.querySelector('#ckCancel').onclick = () => { elSheet.hidden = true; };
    elSheet.onclick = e => { if (e.target === elSheet) elSheet.hidden = true; };

    elSheet.querySelector('#ckSave').onclick = async () => {
      const t = text.value.trim();
      if (!t) { text.focus(); return; }
      items.push({
        id: Date.now(),
        text: t,
        time: elSheet.querySelector('#ckTime').value || '',
        daily: elSheet.querySelector('#ckDaily').checked,
        date: picked
      });
      elSheet.hidden = true;
      await saveItems();
      draw();
    };
  }

  load();
}
