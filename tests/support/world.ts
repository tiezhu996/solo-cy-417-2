// 测试共享夹具：每个用例开始时把真实 localStorage 清空并播种可控数据，
// 然后新建 Pinia 与各 store——store 初始化即通过真实 api/loadLocal 从存储回读，
// 因此“保存 → 重建 store 回读”验证的是真实落盘结果，而非内存对象。
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import type { Spot } from '../../src/models/spot';
import type { Trip } from '../../src/models/trip';
import type { DayPlan } from '../../src/models/dayPlan';
import { seedSpots, spotApi } from '../../src/api/spotApi';
import { tripApi } from '../../src/api/tripApi';
import { dayPlanApi } from '../../src/api/dayPlanApi';
import { useSpotStore } from '../../src/stores/spotStore';
import { useTripStore } from '../../src/stores/tripStore';
import { useDayPlanStore } from '../../src/stores/dayPlanStore';
import { toastLog } from './elementPlusStub';

export interface TestWorld {
  pinia: Pinia;
  spotStore: ReturnType<typeof useSpotStore>;
  tripStore: ReturnType<typeof useTripStore>;
  dayPlanStore: ReturnType<typeof useDayPlanStore>;
}

let seq = 0;
const nextId = (prefix: string) => `${prefix}-test-${seq++}`;

export function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: nextId('trip'),
    title: '测试旅行',
    destination: '杭州',
    start_date: '2026-09-01',
    end_date: '2026-09-02',
    budget: 1000,
    currency: 'CNY',
    members: ['我'],
    status: 'planning' as Trip['status'],
    created_at: '2026-09-01T08:00:00.000Z',
    ...overrides,
  };
}

export function makeSpot(overrides: Partial<Spot> = {}): Spot {
  return {
    id: nextId('spot'),
    name: '测试景点',
    category: 'entertainment' as Spot['category'],
    address: '测试地址',
    lat: 30.25,
    lng: 120.15,
    rating: 4.5,
    price: 0,
    open_time: '全天',
    tags: [],
    image: '',
    ...overrides,
  };
}

export function makeDayPlan(overrides: Partial<DayPlan> = {}): DayPlan {
  return {
    id: nextId('day'),
    trip_id: 'missing-trip',
    day_index: 1,
    date: '2026-09-01',
    items: [],
    ...overrides,
  };
}

export function seedSpotsWith(extra: Spot[] = []): Spot[] {
  const spots = [...seedSpots, ...extra];
  spotApi.save(spots);
  return spots;
}

export function saveTrips(trips: Trip[]) {
  tripApi.save(trips);
}

export function saveDayPlans(plans: DayPlan[]) {
  dayPlanApi.save(plans);
}

// 重置真实存储 + 重建 store；返回的 store 数据全部来自上一次真实保存。
export function resetWorld(options: { spots?: Spot[]; trips?: Trip[]; dayPlans?: DayPlan[] } = {}): TestWorld {
  localStorage.clear();
  toastLog.length = 0;
  seq = 0;
  seedSpotsWith(options.spots ?? []);
  saveTrips(options.trips ?? []);
  saveDayPlans(options.dayPlans ?? []);
  const pinia = createPinia();
  setActivePinia(pinia);
  return {
    pinia,
    spotStore: useSpotStore(),
    tripStore: useTripStore(),
    dayPlanStore: useDayPlanStore(),
  };
}

// 模拟“刷新页面”：不写任何内存状态，只重新初始化 store，强制经 loadLocal 回读。
export function reopenStores(): TestWorld {
  const pinia = createPinia();
  setActivePinia(pinia);
  return {
    pinia,
    spotStore: useSpotStore(),
    tripStore: useTripStore(),
    dayPlanStore: useDayPlanStore(),
  };
}

export { toastLog };
