/* The shell: registry, icon grid, and a hash router.
 *
 * An app is a plain object:
 *
 *   export default {
 *     id: 'fx',                  // unique, used in the URL: #/fx
 *     name: '汇率',               // shown under the icon
 *     icon: '💱',
 *     needsStorage: true,        // optional
 *     async mount(root, ctx) {}  // draw yourself into root
 *   }
 *
 * ctx gives an app { storage, config, back }. Nothing else is global.
 */

import { el, clear } from './ui.js';

export class Shell {
  constructor({ config, storage, apps, root }) {
    this.config = config;
    this.storage = storage;
    this.apps = apps;
    this.root = root;
    this.title = document.getElementById('title');
    this.backBtn = document.getElementById('back');

    this.backBtn.addEventListener('click', () => this.go(''));
    window.addEventListener('hashchange', () => this.route());
  }

  start() { this.route(); }

  go(id) { location.hash = id ? `#/${id}` : '#/'; }

  route() {
    const id = (location.hash.match(/^#\/([\w-]+)/) || [])[1];
    const app = this.apps.find(a => a.id === id);
    clear(this.root);

    if (!app) {
      this.title.textContent = this.config.title || 'dock';
      this.backBtn.hidden = true;
      this.renderGrid();
      return;
    }

    this.title.textContent = app.name;
    this.backBtn.hidden = false;
    const ctx = {
      storage: this.storage,
      config: this.config,
      back: () => this.go('')
    };
    Promise.resolve(app.mount(this.root, ctx)).catch(err => {
      this.root.append(el('p', { class: 'empty' }, `这个应用出错了：${err.message}`));
      console.error(err);
    });
  }

  renderGrid() {
    const grid = el('div', { class: 'grid' },
      this.apps.map(a => el('button', {
        class: 'tile',
        onClick: () => this.go(a.id)
      }, [
        el('span', { class: 'tile-icon' }, a.icon || '▫️'),
        el('span', { class: 'tile-name' }, a.name)
      ]))
    );
    this.root.append(grid);

    if (!this.apps.length) {
      this.root.append(el('p', { class: 'empty' },
        '还没有装任何应用。在 config.js 的 apps 里加一行。'));
    }

    this.root.append(el('p', { class: 'foot' },
      this.storage.kind === 'local'
        ? '数据存在这台设备上。换设备前记得导出。'
        : '数据存在服务器上。'));
  }
}
