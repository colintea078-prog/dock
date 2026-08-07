import { makeFab } from './fab.js?v=60';
/* 账本。只记支出。
 *
 * 记账最大的敌人是麻烦：多一步选择就会有一天懒得记，断一次就断了。
 * 所以表单只有三格，日期默认今天，说明可以空着，打开就能输金额。
 *
 * 周从周一算起 —— 跟日历那边从周日开始不一样，那是日历的习惯，
 * 记账按自然周更顺。
 */

const pad = n => String(n).padStart(2, '0');
const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const midnight = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const parse = s => new Date(s + 'T00:00:00');

/* 周一是一周的第一天 */
function weekStart(d) {
  const x = midnight(d);
  const shift = (x.getDay() + 6) % 7;
  return addDays(x, -shift);
}

const money = n => (Math.round(n * 100) / 100).toLocaleString(undefined, {
  minimumFractionDigits: 2, maximumFractionDigits: 2
});

function sum(rows) {
  return rows.reduce((t, r) => t + (Number(r.amount) || 0), 0);
}

/* 跟上一段比。返回 { text, dir } —— dir 只用来上色，不代表好坏。 */
function compare(now, prev) {
  if (!prev) return { text: '没有上一期可比', dir: 'flat' };
  const diff = now - prev;
  if (Math.abs(diff) < 0.005) return { text: '跟上期一样', dir: 'flat' };
  const pct = Math.round(Math.abs(diff) / prev * 100);
  return {
    text: `${diff > 0 ? '多' : '少'} ¥${money(Math.abs(diff))}（${pct}%）`,
    dir: diff > 0 ? 'up' : 'down'
  };
}

export function mountLedger(root, { cfg, store }) {
  const CATS = cfg.ledgerCats || [{ id: 'other', name: '其他', en: 'Others', icon: 'other' }];
  const catOf = id => CATS.find(c => c.id === id) || CATS[CATS.length - 1];
  const catIcon = c => `<img class="led-ico" src="./assets/cat/${c.icon}.webp?v=60" alt="">`;

  let items = [];
  let cursor = new Date();          // 当前看的是哪个月

  root.innerHTML = `
    <div class="led-sum"></div>
    <div class="led-list"></div>
  `;
  const elSum = root.querySelector('.led-sum');
  const elList = root.querySelector('.led-list');

  /* 表单和加号挂在最外层，否则会被公路和洁哥那两层盖住 */
  const elSheet = document.createElement('div');
  elSheet.className = 'sheet';
  elSheet.hidden = true;
  document.body.appendChild(elSheet);

  makeFab({
    label: '记一笔',
    onTap: () => openForm(null),
    store,
    panel: root.closest('.panel')
  });

  const inMonth = (r, d) => {
    const x = parse(r.date);
    return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth();
  };
  const between = (r, a, b) => {
    const x = parse(r.date);
    return x >= a && x <= b;
  };

  async function load() {
    items = await store.get('ledger', 'items', []);
    draw();
  }

  async function persist() {
    await store.set('ledger', 'items', items);
    draw();
  }

  /* ------------------------------------------------------------- 总结 */

  function drawSummary() {
    const y = cursor.getFullYear(), m = cursor.getMonth();
    const mine = items.filter(r => inMonth(r, cursor));
    const total = sum(mine);

    const prevMonth = new Date(y, m - 1, 1);
    const prevTotal = sum(items.filter(r => inMonth(r, prevMonth)));
    const mc = compare(total, prevTotal);

    /* 这个月过了几天：当月就算到今天，过去的月份算整月 */
    const today = midnight(new Date());
    const isNow = today.getFullYear() === y && today.getMonth() === m;
    const days = isNow ? today.getDate() : new Date(y, m + 1, 0).getDate();
    const perDay = days ? total / days : 0;

    /* 分类小结：只列这个月真花过钱的类，金额从多到少。
       全部列出来会有一堆零，看着像没记账。 */
    const byCat = CATS
      .map(c => ({ c, n: sum(mine.filter(r => (r.cat || 'other') === c.id)) }))
      .filter(x => x.n > 0)
      .sort((a, b) => b.n - a.n);
    const catBlock = byCat.length ? `
      <div class="led-cats">
        ${byCat.map(({ c, n }) => `
          <div class="led-cat">
            ${catIcon(c)}
            <span class="led-cat-name">${c.en} / ${c.name}</span>
            <span class="led-cat-num">¥ ${money(n)}</span>
          </div>`).join('')}
      </div>` : '';

    /* 本周只在看当月时才有意义 */
    let weekBlock = '';
    if (isNow) {
      const ws = weekStart(today);
      const we = addDays(ws, 6);
      const wNow = sum(items.filter(r => between(r, ws, we)));
      const ps = addDays(ws, -7);
      const wPrev = sum(items.filter(r => between(r, ps, addDays(ps, 6))));
      const wc = compare(wNow, wPrev);
      weekBlock = `
        <div class="led-week">
          <div class="led-wk-top">
            <span class="led-wk-label">本周</span>
            <span class="led-wk-num">¥ ${money(wNow)}</span>
          </div>
          <div class="led-cmp ${wc.dir}">${wc.text}</div>
          <div class="led-wk-range">${ws.getMonth() + 1}.${ws.getDate()} – ${we.getMonth() + 1}.${we.getDate()}</div>
        </div>`;
    }

    elSum.innerHTML = `
      <div class="led-card">
        <div class="led-head">
          <button class="led-nav" data-go="-1">‹</button>
          <div class="led-title">${y} 年 ${m + 1} 月</div>
          <button class="led-nav" data-go="1">›</button>
        </div>

        <div class="led-total">
          <span class="led-cur">¥</span><span class="led-num">${money(total)}</span>
        </div>
        <div class="led-cmp ${mc.dir}">比上月${mc.text}</div>

        <div class="led-facts">
          <span>${mine.length} 笔</span>
          <span>日均 ¥${money(perDay)}</span>
        </div>

        ${catBlock}
        ${weekBlock}
      </div>`;

    elSum.querySelectorAll('.led-nav').forEach(b => {
      b.onclick = () => {
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + Number(b.dataset.go), 1);
        draw();
      };
    });
  }

  /* ------------------------------------------------------------- 流水 */

  function drawList() {
    const mine = items.filter(r => inMonth(r, cursor));
    if (!mine.length) {
      elList.innerHTML = '<p class="dt-empty">这个月还没记账。<br>点右下角记一笔。</p>';
      return;
    }

    /* 按天分组，新的在上面 */
    const byDay = {};
    mine.forEach(r => (byDay[r.date] = byDay[r.date] || []).push(r));
    const days = Object.keys(byDay).sort().reverse();

    elList.innerHTML = days.map(day => {
      const rows = byDay[day];
      const d = parse(day);
      return `
        <div class="led-day">
          <div class="led-day-head">
            <span>${d.getMonth() + 1}月${d.getDate()}日</span>
            <span class="led-day-sum">¥ ${money(sum(rows))}</span>
          </div>
          ${rows.map(r => `
            <button class="led-row" data-id="${r.id}">
              ${catIcon(catOf(r.cat))}
              <span class="led-note">${escapeHtml(r.note || catOf(r.cat).name)}</span>
              <span class="led-amt">¥ ${money(r.amount)}</span>
            </button>`).join('')}
        </div>`;
    }).join('');

    elList.querySelectorAll('.led-row').forEach(b => {
      b.onclick = () => openForm(items.find(r => String(r.id) === b.dataset.id));
    });
  }

  function draw() { drawSummary(); drawList(); }

  /* --------------------------------------------------------- 记一笔 */

  function openForm(existing) {
    const r = existing || { id: Date.now(), date: key(new Date()), amount: '', note: '', cat: '' };

    elSheet.hidden = false;
    elSheet.innerHTML = `
      <div class="sheet-card">
        <div class="sheet-date">${existing ? '改一改' : '记一笔'}</div>

        <label class="sheet-field">
          <span>多少钱</span>
          <input id="ledAmt" type="number" inputmode="decimal" step="0.01"
                 class="led-input" value="${r.amount}" placeholder="0.00">
        </label>

        <label class="sheet-field">
          <span>买了什么</span>
          <input id="ledNote" type="text" value="${escapeHtml(r.note || '')}"
                 placeholder="可以不写">
        </label>

        <div class="sheet-field">
          <span>算哪一类（不选就是其他）</span>
          <div class="led-pick">
            ${CATS.map(c => `
              <button class="led-cat-btn ${r.cat === c.id ? 'on' : ''}" data-cat="${c.id}">
                ${catIcon(c)}<span>${c.name}</span>
              </button>`).join('')}
          </div>
        </div>

        <label class="sheet-field">
          <span>哪一天</span>
          <input id="ledDate" type="date" value="${r.date}">
        </label>

        <div class="sheet-row">
          ${existing ? '<button class="sheet-btn ghost" id="ledDel">删掉</button>' : ''}
          <button class="sheet-btn ghost" id="ledCancel">关掉</button>
          <button class="sheet-btn" id="ledSave">存下来</button>
        </div>
      </div>`;

    let cat = r.cat || '';
    elSheet.querySelectorAll('[data-cat]').forEach(b => {
      b.onclick = () => {
        cat = cat === b.dataset.cat ? '' : b.dataset.cat;    // 再点一次取消
        elSheet.querySelectorAll('[data-cat]').forEach(x =>
          x.classList.toggle('on', x.dataset.cat === cat));
      };
    });

    const amt = elSheet.querySelector('#ledAmt');
    setTimeout(() => amt.focus(), 60);

    elSheet.querySelector('#ledCancel').onclick = () => { elSheet.hidden = true; };
    elSheet.onclick = e => { if (e.target === elSheet) elSheet.hidden = true; };

    const del = elSheet.querySelector('#ledDel');
    if (del) del.onclick = async () => {
      items = items.filter(x => x.id !== r.id);
      elSheet.hidden = true;
      await persist();
    };

    elSheet.querySelector('#ledSave').onclick = async () => {
      const value = parseFloat(amt.value);
      if (!(value > 0)) { amt.focus(); return; }
      const rec = {
        id: r.id,
        date: elSheet.querySelector('#ledDate').value,
        amount: Math.round(value * 100) / 100,
        note: elSheet.querySelector('#ledNote').value.trim(),
        cat: cat || 'other'
      };
      const i = items.findIndex(x => x.id === rec.id);
      if (i >= 0) items[i] = rec; else items.push(rec);
      elSheet.hidden = true;
      /* 记完跳到那笔所在的月份，不然存完看不见 */
      cursor = parse(rec.date);
      await persist();
    };
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  load();
}
