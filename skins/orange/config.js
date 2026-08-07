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
    { id: 'calendar', name: '日历',  en: 'CALENDAR' },
    { id: 'dates',    name: '倒计时', en: 'COUNTDOWN' },
    { id: 'ledger',   name: '账本',  en: 'LEDGER' },
    { id: 'notes',    name: '备忘录', en: 'MEMO' }
  ],

  /* 四个站点各用哪张图，对应 assets/ 下的文件名 */
  stopIcons: ['letter.webp', 'stop6.webp', 'stop5.webp', 'stop4.webp'],

  /* 记日子时能选的标签。一条可以挂好几个，顶上的筛选也能同时选好几个。 */
  dateTags: ['生日', '纪念日', '周年庆', '节日', '聚会', '旅行', '游戏', '其他'],

  /* 每个标签的贴纸。贴纸上自带文字，所以界面上不再另写一遍。
     color 是万一图没加载出来时的底色。 */
  tagStyle: {
    '生日':   { img: 'tag_birthday',  color: '#ffe0e8' },
    '纪念日': { img: 'tag_anniv',     color: '#e6f3dc' },
    '周年庆': { img: 'tag_yearly',    color: '#ffefc4' },
    '节日':   { img: 'tag_festival',  color: '#d9ecfb' },
    '聚会':   { img: 'tag_party',     color: '#ffe2ea' },
    '旅行':   { img: 'tag_trip',      color: '#ffe6d2' },
    '游戏':   { img: 'tag_game',      color: '#fff2c9' },
    '其他':   { img: 'tag_other',     color: '#efe6d8' }
  },

  /* 头一次打开时自带的两个日子。删掉就不会再回来 —— 只在第一次种。
     日期取国服公测日 2019.05.01 和它往后六个月。 */
  defaultDates: [
    { name: '明日方舟 周年庆', date: '2019-05-01', calendar: 'solar', tags: ['周年庆', '游戏'], repeat: true },
    { name: '明日方舟 半周年', date: '2019-11-01', calendar: 'solar', tags: ['周年庆', '游戏'], repeat: true }
  ],

  /* 首页拼贴的默认排版。x/y 是中心点占屏幕宽高的比例，w 是宽度像素，
     o 透明度，r 旋转角度。在页面上用铅笔摆好之后点「复制排版」就能拿到这段。
     每台设备摆过之后用自己的那份，这里只是初来乍到时看到的样子。 */
  decoLayout: [
    { a: 'u21', x: 0.031, y: 0.644, w: 197, o: 1,    r: 30 },
    { a: 'u19', x: 0.308, y: 0.294, w: 152, o: 0.8,  r: 60 },
    { a: 'u23', x: 0.796, y: 0.150, w: 62,  o: 0.8,  r: 0  },
    { a: 'u13', x: 0.721, y: 0.472, w: 80,  o: 1,    r: 0  },
    { a: 'u27', x: 0.031, y: 0.344, w: 90,  o: 0.65, r: 0  }
  ],

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
