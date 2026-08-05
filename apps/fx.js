/* Reference app — the smallest complete example.
 *
 * Copy this file to make a new one: give it an id, a name, an icon, and a
 * mount() that draws into root. Everything it stores goes through ctx.storage,
 * so it works identically on the local build and against a real API.
 *
 * No network call: the rate is entered by hand and remembered. A currency
 * app that silently uses a stale fetched rate is worse than one that shows
 * you the number you typed and when you typed it.
 */

import { el, card, field, input, button, money, today } from '../core/ui.js';

const APP = 'fx';

export default {
  id: 'fx',
  name: '汇率',
  icon: '💱',
  needsStorage: true,

  async mount(root, ctx) {
    const s = ctx.storage;
    const rate = await s.get(APP, 'rate', 0.0785);
    const since = await s.get(APP, 'rate_set_on', null);
    const from = await s.get(APP, 'from', 'RUB');

    const amount = input({
      type: 'number', inputmode: 'decimal', placeholder: '0', class: 'big'
    });
    const out = el('div', { class: 'result' }, '—');

    const rateInput = input({
      type: 'number', inputmode: 'decimal', step: '0.0001', value: rate
    });

    function recalc() {
      const v = parseFloat(amount.value);
      const r = parseFloat(rateInput.value);
      if (isNaN(v) || isNaN(r)) { out.textContent = '—'; return; }
      out.textContent = from === 'RUB'
        ? `¥ ${money(v * r)}`
        : `₽ ${money(v / r)}`;
    }

    amount.addEventListener('input', recalc);
    rateInput.addEventListener('input', async () => {
      const r = parseFloat(rateInput.value);
      if (!isNaN(r) && r > 0) {
        await s.set(APP, 'rate', r);
        await s.set(APP, 'rate_set_on', today());
        stamp.textContent = `汇率 ${r}，${today()} 手动设定`;
      }
      recalc();
    });

    const swap = button('⇄ 反过来', async () => {
      const next = from === 'RUB' ? 'CNY' : 'RUB';
      await s.set(APP, 'from', next);
      ctx.back();                       // simplest possible re-render
      location.hash = '#/fx';
    });

    const stamp = el('p', { class: 'hint' },
      since ? `汇率 ${rate}，${since} 手动设定` : `汇率 ${rate}，默认值，改一下`);

    root.append(
      card(from === 'RUB' ? '卢布 → 人民币' : '人民币 → 卢布', [
        amount, out, swap
      ]),
      card('汇率', [
        field('1 卢布 = ? 人民币', rateInput),
        stamp,
        el('p', { class: 'hint' },
          '故意不联网自动取数。看到的永远是你自己设的那个值，不会有一个悄悄过期的数字替你做决定。')
      ])
    );

    amount.focus();
  }
};
