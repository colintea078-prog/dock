/* 悬浮的加号。
 *
 * 全局只有一个。以前每个板块各造一个，位置虽然存在同一个地方，
 * 但各自只在挂载时读一次 —— 在账本里拖完，倒计时那个还停在老位置。
 * 现在是同一枚按钮，谁在前台就归谁管。
 *
 * 拖和点要分开：按下到抬起位移不超过几像素才算点击，
 * 否则拖完手一松就会顺手打开表单。
 */

const TAP = 6;

let el = null;
let store = null;
let pos = null;                 // 左上角像素。null 表示还没拖过，用样式里的默认位置
const owners = [];              // { panel, onTap, label }
let active = null;

function place() {
  if (!el || !pos) return;
  const w = el.offsetWidth || 52, h = el.offsetHeight || 52;
  el.style.left = Math.min(Math.max(8, pos.x), innerWidth - w - 8) + 'px';
  el.style.top = Math.min(Math.max(8, pos.y), innerHeight - h - 8) + 'px';
  el.style.right = 'auto';
  el.style.bottom = 'auto';
}

/* 谁的板块开着，按钮就听谁的 */
function sync() {
  const owner = owners.find(o => o.panel && o.panel.classList.contains('on'));
  active = owner || null;
  el.hidden = !owner;
  if (owner) el.setAttribute('aria-label', owner.label);
}

function ensure() {
  if (el) return;

  el = document.createElement('button');
  el.className = 'dt-add';
  el.textContent = '＋';
  el.hidden = true;
  document.body.appendChild(el);

  let drag = null;
  el.addEventListener('pointerdown', e => {
    const r = el.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top,
             x0: e.clientX, y0: e.clientY, moved: false };
    el.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
  });

  el.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!drag.moved &&
        Math.abs(e.clientX - drag.x0) < TAP && Math.abs(e.clientY - drag.y0) < TAP) return;
    drag.moved = true;
    pos = { x: e.clientX - drag.dx, y: e.clientY - drag.dy };
    place();
  });

  el.addEventListener('pointerup', async () => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    el.classList.remove('dragging');
    if (moved) await store.set('ui', 'fabPos', pos);
    else if (active) active.onTap();
  });

  el.addEventListener('pointercancel', () => {
    drag = null;
    el.classList.remove('dragging');
  });

  addEventListener('resize', place);

  (async () => {
    pos = await store.get('ui', 'fabPos', null);
    place();
  })();
}

export function makeFab({ label, onTap, store: s, panel }) {
  store = store || s;
  ensure();
  owners.push({ panel, onTap, label });
  if (panel) {
    new MutationObserver(sync).observe(panel, { attributes: true, attributeFilter: ['class'] });
  }
  sync();
  return el;
}
