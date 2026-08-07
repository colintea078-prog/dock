/* 悬浮的加号。
 *
 * 它总会挡住点什么，所以做成能拖的，位置记下来。
 * 两个板块各有一个按钮，但共用同一个位置 —— 挪一次就够了。
 *
 * 拖和点要分开：按下去到抬起来位移不超过几像素才算点击，
 * 否则拖完手一松就会顺手打开表单。
 */

const TAP = 6;          // 位移小于这个就算点一下，不算拖

export function makeFab({ label, onTap, store, panel }) {
  const el = document.createElement('button');
  el.className = 'dt-add';
  el.setAttribute('aria-label', label);
  el.textContent = '＋';
  el.hidden = true;
  document.body.appendChild(el);

  let pos = null;         // { x, y } 左上角，像素。null 表示还没拖过，用样式里的默认位置

  function place() {
    if (!pos) return;
    const w = el.offsetWidth || 50, h = el.offsetHeight || 50;
    el.style.left = Math.min(Math.max(8, pos.x), innerWidth - w - 8) + 'px';
    el.style.top = Math.min(Math.max(8, pos.y), innerHeight - h - 8) + 'px';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  }

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
    else onTap();
  });

  el.addEventListener('pointercancel', () => { drag = null; el.classList.remove('dragging'); });

  /* 只在自己那一页出现 */
  if (panel) {
    const sync = () => { el.hidden = !panel.classList.contains('on'); };
    new MutationObserver(sync).observe(panel, { attributes: true, attributeFilter: ['class'] });
    sync();
  }

  addEventListener('resize', place);

  (async () => {
    pos = await store.get('ui', 'fabPos', null);
    place();
  })();

  return el;
}
