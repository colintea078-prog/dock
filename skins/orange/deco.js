/* 拼贴。
 *
 * 每一片是一条数据，不是写死的样式：
 *   { a:'u23', x:0.12, y:0.18, w:64, o:.85, r:-4 }
 *   a 素材名，x/y 是中心点占屏幕宽高的比例，w 宽度像素，o 透明度，r 旋转
 *
 * 编辑模式：拖着挪、加、删、改大小和角度，随手就存。
 * 存在这台设备上，所以每个人的首页可以长得不一样。
 * 「复制排版」会把当前这份 JSON 拷走，想写死进配置就用它。
 *
 * 那支铅笔平时不出现 —— 排版是布置一次的事，按钮却要一直占着首页。
 * 要用的时候长按标题一秒半，跟开着一个按钮的效果一样，只是不摆在明面上。
 * cfg.decoEdit 为真才把铅笔显示出来。
 */

const ALL = [
  'u1','u2','u3','u4','u5','u6','u7','u8','u9','u9b1','u10','u11','u12','u13',
  'u14','u15','u16','u17','u18','u19','u20','u21','u22','u23','u24','u25','u26','u27'
];

/* 没存过东西时的默认排版 */
const DEFAULT_LAYOUT = [
  { a: 'u23', x: 0.14, y: 0.20, w: 64,  o: .85, r: 0 },
  { a: 'u22', x: 0.83, y: 0.17, w: 104, o: .50, r: 0 },
  { a: 'u19', x: 0.50, y: 0.29, w: 152, o: .50, r: 0 },
  { a: 'u16', x: 0.16, y: 0.37, w: 86,  o: .55, r: 0 },
  { a: 'u20', x: 0.84, y: 0.34, w: 92,  o: .45, r: 0 },
  { a: 'u18', x: 0.14, y: 0.57, w: 78,  o: .50, r: 0 },
  { a: 'u21', x: 0.85, y: 0.61, w: 92,  o: .45, r: 0 },
  { a: 'u17', x: 0.50, y: 0.66, w: 124, o: .50, r: 0 }
];

export function mountDeco(box, { cfg, store }) {
  let layout = [];
  let editing = false;
  let picked = -1;

  /* ---------------------------------------------------------------- 绘制 */

  function render() {
    box.innerHTML = '';
    layout.forEach((p, i) => {
      const img = document.createElement('img');
      img.src = `./assets/ui/${p.a}.webp`;
      img.className = 'dc' + (editing && i === picked ? ' picked' : '');
      img.style.cssText =
        `left:${p.x * 100}%;top:${p.y * 100}%;width:${p.w}px;opacity:${p.o};` +
        `transform:translate(-50%,-50%) rotate(${p.r || 0}deg)`;
      img.dataset.i = i;
      box.appendChild(img);
    });
  }

  const save = () => store.set('deco', 'layout', layout);

  /* ---------------------------------------------------------------- 拖动 */

  let drag = null;
  box.addEventListener('pointerdown', e => {
    if (!editing) return;
    const img = e.target.closest('.dc');
    if (!img) return;
    picked = Number(img.dataset.i);
    drag = { i: picked };
    img.setPointerCapture(e.pointerId);
    render();
    e.preventDefault();
  });

  box.addEventListener('pointermove', e => {
    if (!drag) return;
    const p = layout[drag.i];
    p.x = Math.min(1, Math.max(0, e.clientX / innerWidth));
    p.y = Math.min(1, Math.max(0, e.clientY / innerHeight));
    const img = box.querySelector(`.dc[data-i="${drag.i}"]`);
    if (img) { img.style.left = p.x * 100 + '%'; img.style.top = p.y * 100 + '%'; }
  });

  box.addEventListener('pointerup', () => {
    if (!drag) return;
    drag = null;
    save();
  });

  /* -------------------------------------------------------------- 工具条 */

  const bar = document.createElement('div');
  bar.className = 'dc-bar';
  bar.hidden = true;
  bar.innerHTML = `
    <button data-do="add">加一个</button>
    <button data-do="small">小</button>
    <button data-do="big">大</button>
    <button data-do="rot">转</button>
    <button data-do="fade">淡</button>
    <button data-do="del">删掉</button>
    <button data-do="copy">复制排版</button>
    <button data-do="done" class="prim">完成</button>`;
  document.body.appendChild(bar);

  let pen = null;
  if (cfg && cfg.decoEdit === true) {
    pen = document.createElement('button');
    pen.className = 'dc-pen';
    pen.textContent = '✎';
    pen.setAttribute('aria-label', '排版');
    pen.onclick = () => setEditing(true);
    document.body.appendChild(pen);
  }

  /* 没有铅笔的时候的入口：长按标题。手机上也够得着，首页上又看不见。 */
  const title = document.getElementById('title');
  if (title) {
    let timer = null;
    const stop = () => { clearTimeout(timer); timer = null; };
    title.addEventListener('pointerdown', () => {
      timer = setTimeout(() => { stop(); setEditing(true); }, 1500);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(t =>
      title.addEventListener(t, stop));
  }

  const picker = document.createElement('div');
  picker.className = 'sheet';
  picker.hidden = true;
  document.body.appendChild(picker);

  function setEditing(on) {
    editing = on;
    picked = -1;
    document.body.classList.toggle('editing', on);
    bar.hidden = !on;
    if (pen) pen.hidden = on;
    render();
  }

  function current() { return picked >= 0 ? layout[picked] : null; }

  bar.onclick = async e => {
    const act = e.target.dataset.do;
    if (!act) return;
    const p = current();

    if (act === 'done')  { setEditing(false); return; }
    if (act === 'add')   { openPicker(); return; }
    if (act === 'copy') {
      const text = JSON.stringify(layout);
      try { await navigator.clipboard.writeText(text); bar.querySelector('[data-do=copy]').textContent = '已复制'; }
      catch { prompt('复制这段：', text); }
      setTimeout(() => { bar.querySelector('[data-do=copy]').textContent = '复制排版'; }, 1600);
      return;
    }

    if (!p) return;                       // 下面几个都得先选中一片
    if (act === 'small') p.w = Math.max(24, Math.round(p.w * 0.88));
    if (act === 'big')   p.w = Math.min(320, Math.round(p.w * 1.14));
    if (act === 'rot')   p.r = ((p.r || 0) + 15) % 360;
    if (act === 'fade')  p.o = p.o <= 0.25 ? 1 : Math.round((p.o - 0.15) * 100) / 100;
    if (act === 'del')   { layout.splice(picked, 1); picked = -1; }
    render();
    save();
  };

  function openPicker() {
    picker.hidden = false;
    picker.innerHTML = `
      <div class="sheet-card">
        <div class="sheet-date">挑一个放上去</div>
        <div class="dc-grid">
          ${ALL.map(a => `<button class="dc-cell" data-a="${a}"><img src="./assets/ui/${a}.webp" alt=""></button>`).join('')}
        </div>
        <div class="sheet-row"><button class="sheet-btn ghost" id="dcClose">关掉</button></div>
      </div>`;
    picker.querySelector('#dcClose').onclick = () => { picker.hidden = true; };
    picker.onclick = e => { if (e.target === picker) picker.hidden = true; };
    picker.querySelectorAll('.dc-cell').forEach(b => {
      b.onclick = () => {
        layout.push({ a: b.dataset.a, x: .5, y: .45, w: 90, o: .8, r: 0 });
        picked = layout.length - 1;
        picker.hidden = true;
        render();
        save();
      };
    });
  }

  /* ---------------------------------------------------------------- 启动 */

  (async () => {
    layout = await store.get('deco', 'layout', null);
    if (!Array.isArray(layout) || !layout.length) {
      const base = (cfg && Array.isArray(cfg.decoLayout) && cfg.decoLayout.length)
        ? cfg.decoLayout : DEFAULT_LAYOUT;
      layout = base.map(p => ({ ...p }));
    }
    render();
  })();

  /* 进板块时铅笔跟着拼贴一起藏起来 */
  return {
    setVisible(v) {
      if (pen) pen.hidden = !v || editing;
      if (!v && editing) setEditing(false);
    }
  };
}
