import type { DayPlanItem } from '../models/dayPlan';
import type { Spot } from '../models/spot';
import { SCHEDULE } from '../constants/schedule';

// 排程只关心顺序与时间，note / transport 等既有信息由调用方透传保留
export interface ScheduleEntry {
  spot_id: string;
  note: string;
  transport: DayPlanItem['transport'];
}

export interface ScheduledItem extends ScheduleEntry {
  start_time: string;
  end_time: string;
}

export type ScheduleErrorCode = 'closed';

export interface ScheduleResult {
  ok: boolean;
  items: ScheduledItem[];
  reason?: ScheduleErrorCode;
  // 导致超出闭园时间、无法安排的景点
  overflowSpotId?: string;
}

export function toMinutes(hhmm: string): number {
  const [hour, minute] = hhmm.split(':').map(Number);
  return hour * 60 + (minute || 0);
}

export function toHHMM(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// 解析景点 open_time，支持“HH:MM-HH:MM”以及“全天”等非区间写法
export function spotOpenWindow(spot: Spot | undefined): { open: number; close: number } {
  const raw = (spot?.open_time ?? SCHEDULE.ALL_DAY_TEXT).trim();
  const match = /^(\d{1,2}:\d{2})\s*[-~–—]\s*(\d{1,2}:\d{2})/.exec(raw);
  if (!match) {
    return { open: toMinutes(SCHEDULE.ALL_DAY_OPEN), close: toMinutes(SCHEDULE.ALL_DAY_CLOSE) };
  }
  return { open: toMinutes(match[1]), close: toMinutes(match[2]) };
}

/**
 * 按传入顺序依次排程：
 * 每个景点固定两小时，从当天最早可容纳时段（DAY_START 与景点开园时间取较晚者）放入；
 * 前一个项目结束后下一个项目顺延，若新项目会越过该景点闭园时间则整体失败。
 * 该函数是纯函数：不修改入参，失败时调用方据此整体回滚。
 */
export function buildSchedule(entries: ScheduleEntry[], spots: Spot[]): ScheduleResult {
  const spotMap = new Map(spots.map((spot) => [spot.id, spot]));
  const items: ScheduledItem[] = [];
  let cursor = toMinutes(SCHEDULE.DAY_START);

  for (const entry of entries) {
    const { open, close } = spotOpenWindow(spotMap.get(entry.spot_id));
    const start = Math.max(cursor, open);
    const end = start + SCHEDULE.SLOT_MINUTES;
    if (end > close) {
      return { ok: false, items: [], reason: 'closed', overflowSpotId: entry.spot_id };
    }
    items.push({ ...entry, start_time: toHHMM(start), end_time: toHHMM(end) });
    cursor = end;
  }

  return { ok: true, items };
}
