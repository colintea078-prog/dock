# dock

**A small pluggable home screen for your own tools.** Installable as a PWA, works offline,
no build step, no dependencies, no backend required.

Most personal dashboards are one program that does five things. `dock` is a shell that holds
however many small things you want. Adding one is a file and a line — deleting one is deleting
that line. That is the whole product.

---

## Try it

```bash
git clone https://github.com/colintea078-prog/dock.git
cd dock
python -m http.server 8777
```

Open `http://localhost:8777`. ES modules need a server — `file://` will not work.

On a phone: open the URL in Safari or Chrome, then "Add to Home Screen". It installs as a
standalone app with its own icon.

---

## Writing an app

An app is one file exporting one object:

```js
import { card, button } from '../core/ui.js';

export default {
  id: 'hello',            // unique; becomes the URL #/hello
  name: '打招呼',          // label under the icon
  icon: '👋',
  needsStorage: false,

  async mount(root, ctx) {
    root.append(card('hi', button('press me', () => alert('hi'))));
  }
};
```

Register it in `config.js`:

```js
import hello from './apps/hello.js';
export default { apps: [hello, /* ... */] };
```

That is the entire extension mechanism. No registry, no build, no framework.

`ctx` gives an app exactly three things: `storage`, `config`, and `back()`. Apps do not reach
for globals and do not know about each other.

See `apps/fx.js` for a complete worked example.

---

## Storage

Apps never touch `localStorage` or `fetch` directly. They call an adapter, and the adapter is
chosen by one line of config:

```js
storage: 'local'   // everything in the browser, no backend at all
storage: 'api'     // point at your own service
```

Both adapters implement the same six methods — `list`, `add`, `remove`, `get`, `set`, and a
dump/restore pair for export. **The same app code runs against both.** The public build ships
with `local`, which is why cloning this repository gives you a working app and not a
configuration exercise.

`local` keeps data in the browser, per device. That is genuinely fine for a phone you carry,
and genuinely not fine as the only copy of anything you care about — the export button exists
for that reason, and swapping to `api` is a one-line change once you have somewhere to put it.

---

## Design decisions

**Icons, not cards.** A dashboard of cards stops working the moment there are nine of them; a
grid of icons does not. The home screen is a launcher, and each tool gets a full screen to
itself rather than a cramped tile.

**No network calls behind your back.** The currency app makes you type the rate and shows you
the date you typed it. A number that silently went stale three weeks ago is worse than no
number, because you will act on it without checking.

**Local dates, always.** `today()` in `core/ui.js` builds the date from local time. Slicing the
first ten characters off a UTC timestamp puts anything written after midnight on the previous
day — a real bug, in the deployment this pattern came from, that took a while to see.

**Offline first, honestly.** The service worker precaches the shell so the app opens with no
network, but anything under `/api/` is never cached. A dashboard showing yesterday's numbers
with no indication they are stale is worse than one that visibly fails.

---

## PWA notes

Things that cost time, written down so they cost you less:

- **`.webmanifest` may be served as `application/octet-stream`.** Nginx does not know the
  extension by default. Using `manifest.json` avoids touching server config entirely.
- **iOS only installs from Safari**, and only reads the `apple-mobile-web-app-*` meta tags.
  Chrome on iOS cannot install a PWA at all.
- **Maskable icons need ~20% padding.** Android crops to a circle; without the margin it cuts
  into the artwork.
- **Bump the service worker `VERSION` on every change**, or browsers keep serving the old
  cache bucket and your fix never ships.
- **`updateViaCache: 'none'` when registering**, so `sw.js` itself is always revalidated.

---

## Layout

```
index.html      shell markup + all styling
config.js       which apps are installed, which storage to use
core/
  app.js        registry, icon grid, hash router
  storage.js    LocalStore and ApiStore
  ui.js         DOM helpers shared by every app
apps/
  fx.js         reference app
```

## License

MIT
