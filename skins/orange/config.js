/* 公开版配置。
 *
 * 想改成自己的，不要动这个文件 —— 在同一个目录放一个 config.local.js，
 * 导出同样结构的对象，它会覆盖这里的一切。那个文件在 .gitignore 里，
 * 不会被提交，所以你的数据和习惯不会跟着代码走出去。
 *
 * 只想改其中一部分也可以，没写到的字段自动用这里的值。
 */

export default {
  /* 四个站点，顺序就是公路上从左到右的顺序 */
  panels: [
    { id: 'habit',  name: '打 卡' },
    { id: 'calendar', name: '日 历' },
    { id: 'ledger', name: '账 本' },
    { id: 'notes',  name: '便 签' }
  ],

  /* 打卡项。target 是一天几次；labels 有值时点位显示成文字（比如早中晚）。 */
  habits: [
    { id: 'water', icon: '💧', name: '喝水', target: 8, labels: null },
    { id: 'pill',  icon: '💊', name: '吃药', target: 1, labels: null },
    { id: 'move',  icon: '🏃', name: '活动', target: 1, labels: null }
  ],

  /* 打卡面板底下那句话。写成配置是因为它是这个产品的态度，
     每个人想对自己说的话不一样。 */
  habitNote: '空着就空着，不会红，也不会催你。'
};
