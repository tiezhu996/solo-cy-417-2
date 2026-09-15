import { defineStore } from 'pinia';
import type { DayPlan, DayPlanItem } from '../models/dayPlan';
import { dayPlanApi } from '../api/dayPlanApi';
import { messages } from '../constants/messages';
import { toast } from '../utils/message';
import { buildSchedule, type ScheduleEntry } from '../utils/scheduler';
import { candidateWithinBudget } from '../utils/budgetCalculator';
import { useTripStore } from './tripStore';
import { useSpotStore } from './spotStore';

const DEFAULT_NOTE = '现场调整';
const DEFAULT_TRANSPORT: DayPlanItem['transport'] = 'metro';

export const useDayPlanStore = defineStore('dayPlan', {
  state: () => ({ dayPlans: dayPlanApi.list() as DayPlan[] }),
  actions: {
    findDay(tripId: string, dayIndex: number) {
      return this.dayPlans.find((item) => item.trip_id === tripId && item.day_index === dayIndex);
    },
    ensureDay(tripId: string, dayIndex = 1, date = new Date().toISOString().slice(0, 10)) {
      let day = this.findDay(tripId, dayIndex);
      if (!day) {
        day = { id: crypto.randomUUID(), trip_id: tripId, day_index: dayIndex, date, items: [] };
        this.dayPlans.push(day);
      }
      return day;
    },
    // 添加景点与拖拽重排共用：先在候选副本上排程，闭园或预算任一不满足则整体放弃。
    // orderedEntries 按新顺序携带每条记录各自的备注与交通，因此同一景点出现多次时不会互相覆盖。
    commitSchedule(
      tripId: string,
      dayIndex: number,
      orderedEntries: ScheduleEntry[],
    ): boolean {
      const current = this.findDay(tripId, dayIndex);
      const candidateDay: DayPlan = current
        ? { ...current, items: [...current.items] }
        : {
            id: crypto.randomUUID(),
            trip_id: tripId,
            day_index: dayIndex,
            date: new Date().toISOString().slice(0, 10),
            items: [],
          };

      const spotStore = useSpotStore();
      const scheduled = buildSchedule(orderedEntries, spotStore.spots);
      if (!scheduled.ok) {
        toast.fail(messages.scheduleAfterClose);
        return false;
      }

      const candidatePlans: DayPlan[] = this.dayPlans.map((plan) =>
        plan.trip_id === tripId && plan.day_index === dayIndex ? candidateDay : plan,
      );
      if (!candidatePlans.includes(candidateDay)) candidatePlans.push(candidateDay);
      candidateDay.items = scheduled.items as DayPlanItem[];

      const tripStore = useTripStore();
      const trip = tripStore.trips.find((item) => item.id === tripId);
      if (trip && !candidateWithinBudget(trip, this.dayPlans, candidatePlans, spotStore.spots)) {
        toast.fail(messages.scheduleOverBudget);
        return false;
      }

      // 校验全部通过后才提交到 state 并落盘，保证刷新后回读一致
      this.dayPlans = candidatePlans;
      dayPlanApi.save(this.dayPlans);
      return true;
    },
    addSpot(tripId: string, spotId: string, dayIndex = 1) {
      const day = this.findDay(tripId, dayIndex);
      // 既有每条记录的备注与交通原样保留；新景点使用默认值，重复添加是独立的新记录
      const entries: ScheduleEntry[] = [
        ...(day?.items ?? []).map((item) => ({ spot_id: item.spot_id, note: item.note, transport: item.transport })),
        { spot_id: spotId, note: DEFAULT_NOTE, transport: DEFAULT_TRANSPORT },
      ];
      const ok = this.commitSchedule(tripId, dayIndex, entries);
      if (ok) toast.ok(messages.spotAdded);
      return ok;
    },
    reorder(tripId: string, dayIndex: number, from: number, to: number) {
      const day = this.findDay(tripId, dayIndex);
      if (!day) return false;
      // 整条条目（spot_id + 备注 + 交通）一起移动，排程器只重算开始/结束时间
      const entries: ScheduleEntry[] = day.items.map((item) => ({
        spot_id: item.spot_id,
        note: item.note,
        transport: item.transport,
      }));
      const [moved] = entries.splice(from, 1);
      if (moved === undefined) return false;
      entries.splice(to, 0, moved);
      return this.commitSchedule(tripId, dayIndex, entries);
    },
  },
});
