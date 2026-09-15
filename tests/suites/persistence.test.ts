import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEYS, STORAGE_VERSION } from '../../src/constants/storageVersion';
import { loadLocal, saveLocal } from '../../src/utils/storage';
import { dayPlanApi } from '../../src/api/dayPlanApi';
import { tripApi } from '../../src/api/tripApi';
import { resetWorld, reopenStores, makeTrip, makeDayPlan } from '../support/world';
import type { DayPlan } from '../../src/models/dayPlan';
import type { Trip } from '../../src/models/trip';

const KEY = STORAGE_KEYS.dayPlans;

beforeEach(() => resetWorld());

test('缓存损坏：保存槽位是非法 JSON 时 loadLocal 返回 fallback 且不抛异常', () => {
  localStorage.setItem(KEY, '{这不是合法 JSON,,,');
  const fallback: DayPlan[] = [];
  const result = loadLocal<DayPlan[]>(KEY, fallback);
  assert.equal(result, fallback);
  assert.deepEqual(dayPlanApi.list(), []);
});

test('缓存损坏：null 字面量与纯文本同样可识别为损坏并恢复默认', () => {
  localStorage.setItem(KEY, 'null');
  assert.deepEqual(loadLocal<DayPlan[]>(KEY, []), []);
  localStorage.setItem(KEY, 'undefined');
  assert.deepEqual(loadLocal<DayPlan[]>(KEY, []), []);
});

test('版本不符：信封版本落后时丢弃旧数据，返回 fallback，不复活旧行程', () => {
  const stale = makeDayPlan({ trip_id: 'trip-stale', day_index: 1 });
  localStorage.setItem(
    KEY,
    JSON.stringify({ version: 'tripweaver-v0-old', data: [stale], updatedAt: '2020-01-01' }),
  );
  assert.deepEqual(loadLocal<DayPlan[]>(KEY, []), []);

  // 经由真实 store 初始化回读：过期版本中的行程不会出现在状态里
  const world = reopenStores();
  assert.equal(world.dayPlanStore.dayPlans.length, 0);
});

test('缺少版本字段的裸数据按版本不符处理', () => {
  localStorage.setItem(KEY, JSON.stringify([{ id: 'x', items: [] }]));
  assert.deepEqual(loadLocal<DayPlan[]>(KEY, []), []);
});

test('版本相符：saveLocal 写入带版本信封，经 dayPlanApi 回读得到同一份行程', () => {
  const plan = makeDayPlan({
    trip_id: 'trip-save',
    day_index: 2,
    items: [
      { spot_id: 'spot-museum', start_time: '09:00', end_time: '11:00', note: 'N', transport: 'walk' },
    ],
  });
  saveLocal(KEY, [plan]);

  const raw = JSON.parse(localStorage.getItem(KEY) as string);
  assert.equal(raw.version, STORAGE_VERSION);
  assert.ok(raw.updatedAt, '信封包含 updatedAt');

  const readBack = dayPlanApi.list();
  assert.equal(readBack.length, 1);
  assert.deepEqual(readBack[0], plan);
});

test('真实保存结果：store 落盘后模拟刷新，新 store 读到的顺序、时间与写前一致', () => {
  const trip = makeTrip({ id: 'trip-persist', budget: 1000 });
  const world = resetWorld({ trips: [trip] });
  const ok1 = world.dayPlanStore.addSpot('trip-persist', 'spot-museum', 1);
  const ok2 = world.dayPlanStore.addSpot('trip-persist', 'spot-park', 1);
  assert.equal(ok1, true);
  assert.equal(ok2, true);

  const savedOrder = world.dayPlanStore.findDay('trip-persist', 1)!.items.map((i) => [
    i.spot_id, i.start_time, i.end_time,
  ]);

  // 刷新：只重新初始化 store，数据只能来自 localStorage
  const reopened = reopenStores();
  const day = reopened.dayPlanStore.findDay('trip-persist', 1)!;
  assert.ok(day);
  assert.deepEqual(
    day.items.map((i) => [i.spot_id, i.start_time, i.end_time]),
    savedOrder,
  );
});

test('旅行数据版本不符时 tripApi 同样回退，预算等字段不被旧数据污染', () => {
  const staleTrip: Trip = { ...makeTrip({ budget: 999999 }), id: 'stale-trip' };
  localStorage.setItem(
    STORAGE_KEYS.trips,
    JSON.stringify({ version: 'wrong-version', data: [staleTrip] }),
  );
  assert.deepEqual(tripApi.list(), []);
  const reopened = reopenStores();
  assert.equal(reopened.tripStore.trips.length, 0);
});
