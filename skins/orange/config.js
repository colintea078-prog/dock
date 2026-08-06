/* 公开版配置。
 *
 * 想改成自己的，不要动这个文件 —— 在同一个目录放一个 config.local.js，
 * 导出同样结构的对象，它会覆盖这里的一切。那个文件在 .gitignore 里，
 * 不会被提交，所以你的数据、接口地址和习惯不会跟着代码走出去。
 *
 * 只想改其中一部分也可以，没写到的字段自动用这里的值。
 */

export default {
  /* 四个站点，顺序就是公路上从左到右的顺序 */
  panels: [
    { id: 'calendar', name: '日 历' },
    { id: 'ledger',   name: '账 本' },
    { id: 'notes',    name: '便 签' },
    { id: 'spare',    name: '待 定' }
  ],

  /* 四个站点各用哪张图，对应 assets/ 下的文件名 */
  stopIcons: ['letter.webp', 'stop6.webp', 'stop5.webp', 'stop4.webp'],

  /* 日历的数据来源。
     留空 = 存在这台设备上，clone 下来不用配任何东西就能用。
     填上地址 = 走你自己的接口，字段跟着 moodPerson / moodToken。 */
  moodApi: null,
  moodPerson: null,
  moodToken: null,

  /* 排卵期是从上一次经期开始日往后推算的，周期长度写在这里。
     数据够多之后可以改成自动算平均。 */
  cycleLength: 28
};
