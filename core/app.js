/* The shell: a home screen, a slide-out drawer, and a hash router.
 *
 * An app is a plain object:
 *
 *   export default {
 *     id: 'fx',                  // unique, used in the URL: #/fx
 *     name: '汇率',               // shown in the drawer
 *     icon: '💱',
 *     async mount(root, ctx) {}  // draw yourself into root
 *   }
 *
 * ctx gives an app { storage, config, back }. Nothing else is global.
 *
 * The home screen is itself just an app with id 'home' — if config supplies
 * one it is used, otherwise the built-in clock stands in.
 */

import { el, clear } from './ui.js';

export class Shell {
  constructor({ config, storage, apps, root }) {
    this.config = config;
    this.storage = storage;
    this.apps = apps;
    this.root = root;

    this.title = document.getElementById('title');
    this.menuBtn = document.getElementById('menu');
    this.drawer = document.getElementById('drawer');
    this.scrim = document.getElementById('scrim');

    this.menuBtn.addEventListener('click', () => this.toggleDrawer());
    this.scrim.addEventListener('click', () => this.closeDrawer());
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') this.closeDrawer();
    });
    window.addEventListener('hashchange', () => { this.closeDrawer(); this.route(); });

    this._timer = null;
  }

  start() {
    this.buildDrawer();
    this.route();
  }

  /* ------------------------------------------------------------- drawer */

  buildDrawer() {
    const items = [
      { id: '', name: this.config.homeName || '首页', icon: '🏠' },
      ...this.apps
    ];
    clear(this.drawer).append(
      el('nav', {},
        items.map(a => el('button', {
          class: 'drawer-item',
          'data-id': a.id,
          onClick: () => this.go(a.id)
        }, [
          el('span', { class: 'drawer-icon' }, a.icon || '▫️'),
          el('span', {}, a.name)
        ]))
      ),
      el('p', { class: 'drawer-foot' },
        this.storage.kind === 'local' ? '数据存在这台设备上' : '数据存在服务器上')
    );
  }

  toggleDrawer() {
    document.body.classList.toggle('drawer-open');
  }

  closeDrawer() {
    document.body.classList.remove('drawer-open');
  }

  markActive(id) {
    this.drawer.querySelectorAll('.drawer-item').forEach(b => {
      b.classList.toggle('active', b.dataset.id === (id || ''));
    });
  }

  /* -------------------------------------------------------------- router */

  go(id) { location.hash = id ? `#/${id}` : '#/'; }

  route() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }

    const id = (location.hash.match(/^#\/([\w-]+)/) || [])[1] || '';
    const app = id ? this.apps.find(a => a.id === id) : null;
    clear(this.root);
    this.markActive(id);

    const ctx = {
      storage: this.storage,
      config: this.config,
      back: () => this.go('')
    };

    if (!app) {
      this.title.textContent = this.config.title || 'dock';
      this.renderHome(ctx);
      return;
    }

    this.title.textContent = app.name;
    Promise.resolve(app.mount(this.root, ctx)).catch(err => {
      this.root.append(el('p', { class: 'empty' }, `这个应用出错了：${err.message}`));
      console.error(err);
    });
  }

  /* ---------------------------------------------------------------- home */

  renderHome(ctx) {
    this.root.append(this.clock());

    const home = this.config.home;
    if (home && typeof home.mount === 'function') {
      const slot = el('div', {});
      this.root.append(slot);
      Promise.resolve(home.mount(slot, ctx)).catch(err => {
        slot.append(el('p', { class: 'empty' }, `首页出错了：${err.message}`));
        console.error(err);
      });
    } else {
      this.root.append(el('p', { class: 'empty' },
        '首页还是空的。在 config.js 里给 home 指定一个应用。'));
    }
  }

  clock() {
    const time = el('div', { class: 'clock-time' }, '');
    const date = el('div', { class: 'clock-date' }, '');
    const since = el('div', { class: 'clock-since' }, '');

    const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const pad = n => String(n).padStart(2, '0');

    const tick = () => {
      const d = new Date();
      time.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      time.append(el('span', { class: 'clock-sec' }, pad(d.getSeconds())));
      date.textContent =
        `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${WEEK[d.getDay()]}`;

      /* Optional day counter, e.g. "Day 73". Only shown when config.since
       * is set — the public build has no such date. */
      if (this.config.since) {
        const start = new Date(this.config.since + 'T00:00:00');
        const days = Math.floor((d - start) / 86400000) + 1;
        since.textContent = `${this.config.sinceLabel || 'Day'} ${days}`;
      }
    };

    tick();
    this._timer = setInterval(tick, 1000);

    return el('section', { class: 'clock' }, [time, date, since]);
  }
}
