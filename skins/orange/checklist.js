import { escapeHtml } from './util.js?v=73';
import { makeFab } from './fab.js?v=73';

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

export function mountChecklist(root, { cfg, store }) {
  let items = [];
  let done = {};                       // { 'YYYY-MM-DD': [id, ...] }
  let picked = key(new Date());        // 当前看的是哪天

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
    draw();
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

  function drawDays() {
    /* 前后各七天，今天在中间。滑动切换，不用翻页。 */
    const today = midnight(new Date());
    elDays.innerHTML = '';
    for (let i = -7; i <= 7; i++) {
      const d = addDays(today, i);
      const k = key(d);
      const list = forDay(k);
      const finished = list.length && list.every(it => isDone(k, it.id));

      const b = document.createElement('button');
      b.className = 'ck-day' +
        (k === picked ? ' on' : '') +
        (i === 0 ? ' today' : '') +
        (finished ? ' clear' : '');
      b.innerHTML =
        `<span class="ck-w">${WEEK[d.getDay()][1]}</span>` +
        `<span class="ck-d">${d.getDate()}</span>`;
      b.onclick = () => { picked = k; draw(); };
      elDays.appendChild(b);
    }
    /* 选中的那颗滚到中间 */
    const on = elDays.querySelector('.ck-day.on');
    if (on) on.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
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

  function draw() { drawDays(); drawList(); }

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
