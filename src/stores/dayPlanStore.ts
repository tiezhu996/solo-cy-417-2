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
    // 添加景点与拖拽重排共用：先在候选副本上排程，闭园或预算任一不满足则整体放弃
    commitSchedule(
      tripId: string,
      dayIndex: number,
      orderedSpotIds: string[],
      metadata: Map<string, Pick<DayPlanItem, 'note' | 'transport'>>,
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

      const entries: ScheduleEntry[] = orderedSpotIds.map((spotId) => ({
        spot_id: spotId,
        note: metadata.get(spotId)?.note ?? DEFAULT_NOTE,
        transport: metadata.get(spotId)?.transport ?? DEFAULT_TRANSPORT,
      }));

      const spotStore = useSpotStore();
      const scheduled = buildSchedule(entries, spotStore.spots);
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
      const ordered = [...(day?.items ?? []).map((item) => item.spot_id), spotId];
      const metadata = new Map<string, Pick<DayPlanItem, 'note' | 'transport'>>(
        (day?.items ?? []).map((item) => [item.spot_id, { note: item.note, transport: item.transport }]),
      );
      const ok = this.commitSchedule(tripId, dayIndex, ordered, metadata);
      if (ok) toast.ok(messages.spotAdded);
      return ok;
    },
    reorder(tripId: string, dayIndex: number, from: number, to: number) {
      const day = this.findDay(tripId, dayIndex);
      if (!day) return false;
      const ordered = day.items.map((item) => item.spot_id);
      const [moved] = ordered.splice(from, 1);
      if (moved === undefined) return false;
      ordered.splice(to, 0, moved);
      const metadata = new Map<string, Pick<DayPlanItem, 'note' | 'transport'>>(
        day.items.map((item) => [item.spot_id, { note: item.note, transport: item.transport }]),
      );
      return this.commitSchedule(tripId, dayIndex, ordered, metadata);
    },
  },
});
