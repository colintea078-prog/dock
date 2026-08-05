/* Tiny DOM helpers, shared by every app so they look like one product. */

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style') node.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'html') node.innerHTML = v;
    else node.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c === null || c === undefined || c === false) return;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  });
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/* A card: the standard block every app builds its screen out of. */
export function card(title, children) {
  return el('section', { class: 'card' }, [
    title ? el('h2', {}, title) : null,
    ...(Array.isArray(children) ? children : [children])
  ]);
}

export function button(label, onClick, kind = '') {
  return el('button', { class: kind, onClick }, label);
}

export function field(label, input) {
  return el('label', { class: 'field' }, [el('span', {}, label), input]);
}

export function input(attrs = {}) {
  return el('input', { type: 'text', ...attrs });
}

export function empty(text) {
  return el('p', { class: 'empty' }, text);
}

/* Local YYYY-MM-DD. Never slice a UTC timestamp for display — that bug
 * cost a day of confusion in the deployment this came from. */
export function today() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function money(n, digits = 2) {
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: digits, maximumFractionDigits: digits
  });
}
