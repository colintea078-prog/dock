import { escapeHtml } from './util.js?v=75';
import { makeFab } from './fab.js?v=75';

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

export function mountChecklist(root, { cfg, store }) {
  let items = [];
  let done = {};                       // { 'YYYY-MM-DD': [id, ...] }
  let picked = key(new Date());        // 当前看的是哪天
  let balls = [];                      // 日期球，建一次就不再重建

  root.innerHTML = `
    <div class="ck-head">
      <div class="ck-title">清单</div>
      <div class="ck-sub"></div>
    </div>
    <div class="ck-days"></div>
    <div class="ck-list"></div>
  `;
  const elSub  = root.querySelector('.ck-sub');
  const elDays = root.querySelector('.ck-days');
  const elList = root.querySelector('.ck-list');

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
    /* 一进来，今天停在正中间 */
    requestAnimationFrame(() => {
      const b = balls.find(x => x.key === picked);
      if (b) center(b.el, false);
      focus();
    });
  }

  const saveItems = () => store.set('todo', 'items', items);
  const saveDone  = () => store.set('todo', 'done', done);

  /* 这一天该出现哪些条目 */
  function forDay(dayKey) {
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

  const isDone = (dayKey, id) => (done[dayKey] || []).includes(id);

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
  }

  function center(el, smooth) {
    const box = elDays.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    elDays.scrollBy({
      left: (r.left + r.width / 2) - (box.left + box.width / 2),
      behavior: smooth ? 'smooth' : 'auto'
    });
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

    if (near && near.key !== picked) { picked = near.key; drawList(); }
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

  function draw() { markClear(); drawList(); }

  /* 滑动时每帧最多对焦一次 */
  let tick = 0;
  elDays.addEventListener('scroll', () => {
    if (tick) return;
    tick = requestAnimationFrame(() => { tick = 0; focus(); });
  }, { passive: true });

  addEventListener('resize', () => focus());

  /* 挂载时板块多半还没打开，量不到宽度。切回这一页时重新对一次焦，
     顺便把中间那颗推回当前选中的日子。 */
  const panel = root.closest('.panel');
  if (panel) {
    new MutationObserver(() => {
      if (!panel.classList.contains('on')) return;
      const b = balls.find(x => x.key === picked);
      if (b) center(b.el, false);
      focus();
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
