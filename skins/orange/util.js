/* 几个到处都要用的小东西。
   之前每个模块各写了一份 escapeHtml，改一处忘一处，收到这里。 */

export function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
