// 行程编排的全局时间规则：添加景点与拖拽重排共用同一组常量
export const SCHEDULE = {
  // 每个景点固定停留 2 小时
  SLOT_MINUTES: 120,
  // 一天中最早可以开始安排的时段
  DAY_START: '08:00',
  // “全天开放”类景点的可安排窗口
  ALL_DAY_OPEN: '08:00',
  ALL_DAY_CLOSE: '22:00',
  ALL_DAY_TEXT: '全天',
} as const;
