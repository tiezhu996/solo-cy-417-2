import type { DayPlan } from '../models/dayPlan';
import type { Spot } from '../models/spot';
import type { Trip } from '../models/trip';
import { messages } from '../constants/messages';

export function calcTripCost(dayPlans: DayPlan[], spots: Spot[]) {
  const spotMap = new Map(spots.map((spot) => [spot.id, spot]));
  return dayPlans.reduce((sum, day) => {
    return sum + day.items.reduce((inner, item) => inner + (spotMap.get(item.spot_id)?.price || 0), 0);
  }, 0);
}

// 仅当“本次调整新增的花费”使总花费越过预算时才判定失败；
// 拖拽等不改变总花费的调整（即使行程本就处于超预算状态）不会被预算规则拒绝。
export function candidateWithinBudget(
  trip: Trip,
  currentDayPlans: DayPlan[],
  candidateDayPlans: DayPlan[],
  spots: Spot[],
) {
  const candidateCost = calcTripCost(candidateDayPlans, spots);
  const currentCost = calcTripCost(currentDayPlans, spots);
  if (candidateCost <= currentCost) return true;
  return candidateCost <= trip.budget;
}

export function budgetStatus(trip: Trip, dayPlans: DayPlan[], spots: Spot[]) {
  const spent = calcTripCost(dayPlans, spots);
  return { spent, remaining: trip.budget - spent, warning: spent > trip.budget ? messages.budgetExceeded : '' };
}

