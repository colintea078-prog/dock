import { escapeHtml } from './util.js?v=55';

/* 备忘录。一列便签纸。
 *
 * 只读。写进去是另一头的活 —— 面对一个空白输入框想"该写点什么"，
 * 是备忘录死掉最常见的方式。
 *
 * 数据两条路，界面一样：
 *   cfg.memoApi 有值 → 走接口，读记忆库里的备忘
 *   没值           → 用配置里的示例便签（公开版）
 */

const PAPER = 5;                     // 便签纸的颜色数，循环用

/* 第一行当标题。开头的【】是记忆库里的习惯写法，显示时去掉。 */
function titleOf(text) {
  const first = (text || '').split('\n').find(l => l.trim()) || '';
  return first.trim().replace(/^【|】$/g, '').replace(/】.*$/, '');
}

function bodyOf(text) {
  const lines = (text || '').split('\n');
  const i = lines.findIndex(l => l.trim());
  return lines.slice(i + 1).join('\n').trim();
}

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
}

class SampleSource {
  constructor(cfg) { this.cfg = cfg; }
  async list() {
    return (this.cfg.sampleNotes || []).map((n, i) => ({ id: i, ...n }));
  }
}

export function mountNotes(root, { cfg, store }) {
  const src = cfg.memoApi ? new ApiSource(cfg) : new SampleSource(cfg);
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

  async function load() {
    try {
      notes = await src.list();
    } catch (e) {
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
      elList.innerHTML = '<p class="dt-empty">这里还没有备忘。</p>';
      return;
    }

    elList.innerHTML = '';
    rows.forEach((n, i) => {
      const card = document.createElement('button');
      card.className = 'nt-card p' + (i % PAPER);
      /* 每张纸歪一点点，角度按序号定死 —— 每次重画都一样，
         不然筛一下标签整墙纸都会重新抖一遍。 */
      card.style.setProperty('--tilt', ((i % 5) - 2) * 0.5 + 'deg');
      card.innerHTML = `
        <span class="nt-title">${escapeHtml(titleOf(n.text))}</span>
        <span class="nt-peek">${escapeHtml(bodyOf(n.text).slice(0, 46))}</span>
        <span class="nt-foot">
          <span class="nt-date">${n.date || ''}</span>
          ${(n.tags || []).slice(0, 2)
            .map(t => `<span class="nt-tag">${escapeHtml(t)}</span>`).join('')}
        </span>`;
      card.onclick = () => open(n);
      elList.appendChild(card);
    });
  }

  function open(n) {
    elSheet.hidden = false;
    elSheet.innerHTML = `
      <div class="sheet-card">
        <div class="sheet-date">${n.date || ''}</div>
        <div class="nt-full">${escapeHtml(n.text)}</div>
        <div class="sheet-row">
          <button class="sheet-btn" id="ntClose">看完了</button>
        </div>
      </div>`;
    elSheet.querySelector('#ntClose').onclick = () => { elSheet.hidden = true; };
    elSheet.onclick = e => { if (e.target === elSheet) elSheet.hidden = true; };
  }

  load();
}
