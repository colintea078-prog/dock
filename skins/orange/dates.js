/* 日期备忘录。
 *
 * 每条记一件事：名字、发生那天的阳历日期、按阳历还是阴历过、一个标签。
 * 卡片右边是倒数。顶上一排标签可以筛。
 *
 * 农历不自己抄万年历表 —— 浏览器内置了中国农历（Intl 的 chinese 历法），
 * 直接问它"这天农历是几月几"，比手抄两百年的数据可靠。
 * 找下一个农历同日，就是从明天开始一天天往前问，问到对上为止。
 */

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

/* ------------------------------------------------------------------ 视图 */

export function mountDates(root, { cfg, store }) {
  const TAGS = cfg.dateTags || ['生日', '纪念日', '旅行', '其他'];
  let filter = null;
  let items = [];

  root.innerHTML = `
    <div class="dt-tags"></div>
    <div class="dt-list"></div>
  `;
  const elTags = root.querySelector('.dt-tags');
  const elList = root.querySelector('.dt-list');

  /* 表单和那个加号都挂到最外层。放在板块里会被公路和洁哥压住 ——
     板块自带 z-index，等于给自己画了个圈，里面再高也跳不出去。 */
  const elSheet = document.createElement('div');
  elSheet.className = 'sheet';
  elSheet.hidden = true;
  document.body.appendChild(elSheet);

  const elAdd = document.createElement('button');
  elAdd.className = 'dt-add';
  elAdd.setAttribute('aria-label', '添加');
  elAdd.textContent = '＋';
  elAdd.hidden = true;
  elAdd.onclick = () => openForm(null);
  document.body.appendChild(elAdd);

  /* 加号只在这个板块打开时出现 */
  const panel = root.closest('.panel');
  if (panel) {
    const sync = () => { elAdd.hidden = !panel.classList.contains('on'); };
    new MutationObserver(sync).observe(panel, { attributes: true, attributeFilter: ['class'] });
    sync();
  }

  async function load() {
    items = await store.get('dates', 'items', []);
    draw();
  }

  async function persist() {
    await store.set('dates', 'items', items);
    draw();
  }

  function draw() {
    /* 标签行：只列真正用到的，加一个"全部" */
    const used = [...new Set(items.map(i => i.tag).filter(Boolean))];
    elTags.innerHTML = '';
    if (used.length > 1) {
      const all = document.createElement('button');
      all.className = 'dt-tag' + (filter === null ? ' on' : '');
      all.textContent = '全部';
      all.onclick = () => { filter = null; draw(); };
      elTags.appendChild(all);
      used.forEach(t => {
        const b = document.createElement('button');
        b.className = 'dt-tag' + (filter === t ? ' on' : '');
        b.textContent = t;
        b.onclick = () => { filter = filter === t ? null : t; draw(); };
        elTags.appendChild(b);
      });
    }

    const today = midnight(new Date());
    const rows = items
      .map(it => ({ it, ...nextOccurrence(it, today) }))
      .filter(r => filter === null || r.it.tag === filter)
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
      const sub = it.calendar === 'lunar'
        ? `农历 ${lunarOf(new Date(it.date + 'T00:00:00')) || ''}`
        : it.date;
      const on = when ? `${when.getMonth() + 1}月${when.getDate()}日` : '';
      card.innerHTML = `
        <span class="dt-main">
          <span class="dt-name">${escapeHtml(it.name)}</span>
          <span class="dt-sub">${escapeHtml(sub)}${on ? ' · ' + on : ''}</span>
        </span>
        ${it.tag ? `<span class="dt-chip">${escapeHtml(it.tag)}</span>` : ''}
        <span class="dt-days">${countdownText(days)}</span>`;
      card.onclick = () => openForm(it);
      elList.appendChild(card);
    });
  }

  /* ----------------------------------------------------------- 添加 / 改 */

  function openForm(existing) {
    const it = existing || {
      id: Date.now(), name: '', date: key(new Date()),
      calendar: 'solar', tag: TAGS[0], repeat: true
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
          <span>标签</span>
          <div class="dt-seg wrap">
            ${TAGS.map(t => `<button class="dt-opt ${it.tag === t ? 'on' : ''}" data-tag="${t}">${t}</button>`).join('')}
          </div>
        </div>

        <label class="dt-check">
          <input id="dtRepeat" type="checkbox" ${it.repeat ? 'checked' : ''}>
          <span>每年都过（关掉就是只有那一天，比如一趟旅行）</span>
        </label>

        <div class="sheet-row">
          ${existing ? '<button class="sheet-btn ghost" id="dtDel">删掉</button>' : ''}
          <button class="sheet-btn ghost" id="dtCancel">关掉</button>
          <button class="sheet-btn" id="dtSave">存下来</button>
        </div>
      </div>`;

    let cal = it.calendar, tag = it.tag;
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
        tag = b.dataset.tag;
        elSheet.querySelectorAll('[data-tag]').forEach(x => x.classList.toggle('on', x.dataset.tag === tag));
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
        tag,
        repeat: elSheet.querySelector('#dtRepeat').checked
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
