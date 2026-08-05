/* Your deployment lives here. This is the only file that differs between
 * the public build and a private one.
 *
 *   storage: 'local'  → everything in the browser, no backend at all
 *   storage: 'api'    → point at your own service
 */

import fx from './apps/fx.js';

export default {
  title: 'dock',

  storage: 'local',

  api: {
    base: '/api',
    token: ''          // never commit a real token; load it at runtime
  },

  /* Order here is the order on the home screen. */
  apps: [
    fx
  ]
};
