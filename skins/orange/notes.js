import { escapeHtml } from './util.js?v=61';
import { makeFab } from './fab.js?v=61';

/* 备忘录。一列便签纸。
 *
 * 数据两条路，界面一样：
 *   cfg.memoApi 有值 → 读写记忆库的备忘层
 *   没值            → 存在本机，第一次打开时把配置里的示例便签种进去
 *
 * 种子只种一次，而且只有真种下去了才记那一笔 ——
 * 不然配置还没加载好的那一次会把记号占掉，之后再也种不上。
 */

const PAPER = 5;

/* 第一行当标题。开头的【】是记忆库里的写法，显示时去掉。 */
function titleOf(text) {
  const first = (text || '').split('\n').find(l => l.trim()) || '';
  return first.trim().replace(/^【/, '').replace(/】.*$/, '');
}

function bodyOf(text) {
  const lines = (text || '').split('\n');
  const i = lines.findIndex(l => l.trim());
  return lines.slice(i + 1).join('\n').trim();
}

const today = () => {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/* ------------------------------------------------------------ 数据来源 */

class ApiSource {
  constructor(cfg) { this.cfg = cfg; }

  async list() {
    const rows = await (await fetch(this.cfg.memoApi)).json();
    return rows.map(r => ({
      id: r.id,
      text: r.content,
      tags: (r.tags || '').split(',').map(t => t.trim()).filter(Boolean),
      date: (r.created_at || '').slice(0, 10)
    }));
  }

  _post(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, token: this.cfg.memoToken })
    });
  }

  async add(note) {
    await this._post(this.cfg.memoApi,
      { content: note.text, layer: 'memo', tags: (note.tags || []).join(',') });
  }

  async update(note) {
    await this._post(this.cfg.memoUpdateApi || '/api/update',
      { id: note.id, content: note.text, tags: (note.tags || []).join(',') });
  }

  async remove(note) {
    await this._post(this.cfg.memoDeleteApi || '/api/delete', { id: note.id });
  }
}

class LocalSource {
  constructor(cfg, store) { this.cfg = cfg; this.store = store; }

  async _all() { return await this.store.get('notes', 'items', []); }
  async _save(rows) { await this.store.set('notes', 'items', rows); }

  async list() {
    let rows = await this._all();
    const seed = this.cfg.sampleNotes || [];
    const seeded = await this.store.get('notes', 'seedMark', false);
    if (!seeded && seed.length) {
      rows = rows.concat(seed.map((n, i) => ({ id: Date.now() + i, ...n })));
      await this.store.set('notes', 'seedMark', true);
      await this._save(rows);
    }
    return rows.slice().reverse();          // 新的在上面
  }

  async add(note) {
    const rows = await this._all();
    rows.push({ ...note, id: Date.now() });
    await this._save(rows);
  }

  async update(note) {
    const rows = await this._all();
    const i = rows.findIndex(r => r.id === note.id);
    if (i >= 0) rows[i] = note;
    await this._save(rows);
  }

  async remove(note) {
    await this._save((await this._all()).filter(r => r.id !== note.id));
  }
}

/* ------------------------------------------------------------------ 视图 */

export function mountNotes(root, { cfg, store }) {
  const src = cfg.memoApi ? new ApiSource(cfg) : new LocalSource(cfg, store);
  const canWrite = !cfg.memoApi || !!cfg.memoToken;   // 接口版没给 token 就只读
  let notes = [];
  let filter = new Set();

  root.innerHTML = `
    <div class="dt-tags"></div>
    <div class="nt-list"></div>
  `;
  const elTags = root.querySelector('.dt-tags');
  const elList = root.querySelector('.nt-list');

  const elSheet = document.createElement('div');
  elSheet.className = 'sheet';
  elSheet.hidden = true;
  document.body.appendChild(elSheet);

  if (canWrite) {
    makeFab({
      label: '写一张',
      onTap: () => openForm(null),
      store,
      panel: root.closest('.panel')
    });
  }

  async function load() {
    try {
      notes = await src.list();
    } catch {
      elList.innerHTML = '<p class="dt-empty">读不到备忘。<br>可能是没登录。</p>';
      return;
    }
    draw();
  }

  function draw() {
    const used = [...new Set(notes.flatMap(n => n.tags || []))];
    elTags.innerHTML = '';
    if (used.length > 1) {
      const all = document.createElement('button');
      all.className = 'dt-tag' + (filter.size === 0 ? ' on' : '');
      all.textContent = '全部';
      all.onclick = () => { filter.clear(); draw(); };
      elTags.appendChild(all);
      used.forEach(t => {
        const b = document.createElement('button');
        b.className = 'dt-tag' + (filter.has(t) ? ' on' : '');
        b.textContent = t;
        b.onclick = () => { filter.has(t) ? filter.delete(t) : filter.add(t); draw(); };
        elTags.appendChild(b);
      });
    }

    const rows = notes.filter(n =>
      filter.size === 0 || (n.tags || []).some(t => filter.has(t)));

    if (!rows.length) {
      elList.innerHTML = `<p class="dt-empty">这里还没有便签。${
        canWrite ? '<br>点右下角写一张。' : ''}</p>`;
      return;
    }

    elList.innerHTML = '';
    rows.forEach((n, i) => {
      const card = document.createElement('button');
      card.className = 'nt-card p' + (i % PAPER);
      /* 歪的角度按序号定死。随机的话，筛一下标签整墙纸都会重新抖一遍。 */
      card.style.setProperty('--tilt', ((i % 5) - 2) * 0.5 + 'deg');
      card.innerHTML = `
        <span class="nt-title">${escapeHtml(titleOf(n.text))}</span>
        <span class="nt-peek">${escapeHtml(bodyOf(n.text).slice(0, 46))}</span>
        <span class="nt-foot">
          <span class="nt-date">${n.date || ''}</span>
          ${(n.tags || []).slice(0, 2)
            .map(t => `<span class="nt-tag">${escapeHtml(t)}</span>`).join('')}
        </span>`;
      card.onclick = () => openView(n);
      elList.appendChild(card);
    });
  }

  /* 看 */
  function openView(n) {
    elSheet.hidden = false;
    elSheet.innerHTML = `
      <div class="sheet-card">
        <div class="sheet-date">${n.date || ''}</div>
        <div class="nt-full">${escapeHtml(n.text)}</div>
        <div class="sheet-row">
          ${canWrite ? '<button class="sheet-btn ghost" id="ntEdit">改一改</button>' : ''}
          <button class="sheet-btn" id="ntClose">看完了</button>
        </div>
      </div>`;
    elSheet.querySelector('#ntClose').onclick = () => { elSheet.hidden = true; };
    const edit = elSheet.querySelector('#ntEdit');
    if (edit) edit.onclick = () => openForm(n);
    elSheet.onclick = e => { if (e.target === elSheet) elSheet.hidden = true; };
  }

  /* 写 */
  function openForm(existing) {
    const n = existing || { id: null, text: '', tags: [], date: today() };
    elSheet.hidden = false;
    elSheet.innerHTML = `
      <div class="sheet-card">
        <div class="sheet-date">${existing ? '改一改' : '写一张'}</div>

        <label class="sheet-field">
          <span>写点什么（第一行会当成标题）</span>
          <textarea id="ntText" rows="8"
            placeholder="【出门前】&#10;钥匙、伞、充电宝。">${escapeHtml(n.text)}</textarea>
        </label>

        <label class="sheet-field">
          <span>标签（逗号分开，可以不写）</span>
          <input id="ntTags" type="text" value="${escapeHtml((n.tags || []).join(','))}"
                 placeholder="比如 出门,身体">
        </label>

        <div class="sheet-row">
          ${existing ? '<button class="sheet-btn ghost" id="ntDel">撕掉</button>' : ''}
          <button class="sheet-btn ghost" id="ntCancel">关掉</button>
          <button class="sheet-btn" id="ntSave">贴上去</button>
        </div>
      </div>`;

    const ta = elSheet.querySelector('#ntText');
    setTimeout(() => ta.focus(), 60);

    elSheet.querySelector('#ntCancel').onclick = () => { elSheet.hidden = true; };
    elSheet.onclick = e => { if (e.target === elSheet) elSheet.hidden = true; };

    const del = elSheet.querySelector('#ntDel');
    if (del) del.onclick = async () => {
      await src.remove(n);
      elSheet.hidden = true;
      await load();
    };

    elSheet.querySelector('#ntSave').onclick = async () => {
      const text = ta.value.trim();
      if (!text) { ta.focus(); return; }
      const rec = {
        ...n,
        text,
        tags: elSheet.querySelector('#ntTags').value
          .split(/[,，]/).map(t => t.trim()).filter(Boolean),
        date: n.date || today()
      };
      if (existing) await src.update(rec); else await src.add(rec);
      elSheet.hidden = true;
      await load();
    };
  }

  load();
}
