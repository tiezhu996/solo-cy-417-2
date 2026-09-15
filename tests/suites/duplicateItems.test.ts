import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/constants/storageVersion';
import { resetWorld, reopenStores, makeTrip, makeDayPlan } from '../support/world';
import type { DayPlanItem } from '../../src/models/dayPlan';

const DP_KEY = STORAGE_KEYS.dayPlans;

// 构造同一景点的多条独立记录（备注、交通各不相同）
const museumRecords = (): DayPlanItem[] => [
  { spot_id: 'spot-museum', start_time: '09:00', end_time: '11:00', note: '第一次参观', transport: 'walk' },
  { spot_id: 'spot-museum', start_time: '11:00', end_time: '13:00', note: '二刷特展', transport: 'taxi' },
  { spot_id: 'spot-museum', start_time: '13:00', end_time: '15:00', note: '傍晚补票', transport: 'metro' },
];

const snapshot = (items: DayPlanItem[]) => items.map((i) => [i.spot_id, i.start_time, i.end_time, i.note, i.transport]);

beforeEach(() => resetWorld());

test('向下拖动重复景点：每条记录保留各自备注与交通，仅顺序和时间变化', () => {
  const trip = makeTrip({ id: 't-dup-down', budget: 1000 });
  const plan = makeDayPlan({ trip_id: 't-dup-down', day_index: 1, items: museumRecords() });
  const world = resetWorld({ trips: [trip], dayPlans: [plan] });

  // 第一条(0) 移到最后
  assert.equal(world.dayPlanStore.reorder('t-dup-down', 1, 0, 2), true);
  assert.deepEqual(snapshot(world.dayPlanStore.findDay('t-dup-down', 1)!.items), [
    ['spot-museum', '09:00', '11:00', '二刷特展', 'taxi'],
    ['spot-museum', '11:00', '13:00', '傍晚补票', 'metro'],
    ['spot-museum', '13:00', '15:00', '第一次参观', 'walk'],
  ]);
});

test('向上拖动重复景点：被上移记录的备注与交通跟随该记录，不覆盖其他重复项', () => {
  const trip = makeTrip({ id: 't-dup-up', budget: 1000 });
  const plan = makeDayPlan({ trip_id: 't-dup-up', day_index: 1, items: museumRecords() });
  const world = resetWorld({ trips: [trip], dayPlans: [plan] });

  // 最后一条(2) 移到最前
  assert.equal(world.dayPlanStore.reorder('t-dup-up', 1, 2, 0), true);
  assert.deepEqual(snapshot(world.dayPlanStore.findDay('t-dup-up', 1)!.items), [
    ['spot-museum', '09:00', '11:00', '傍晚补票', 'metro'],
    ['spot-museum', '11:00', '13:00', '第一次参观', 'walk'],
    ['spot-museum', '13:00', '15:00', '二刷特展', 'taxi'],
  ]);

  // 刷新后各条备注与交通依旧归属正确，没有被合并
  const reopened = reopenStores();
  assert.deepEqual(snapshot(reopened.dayPlanStore.findDay('t-dup-up', 1)!.items), [
    ['spot-museum', '09:00', '11:00', '傍晚补票', 'metro'],
    ['spot-museum', '11:00', '13:00', '第一次参观', 'walk'],
    ['spot-museum', '13:00', '15:00', '二刷特展', 'taxi'],
  ]);
});

test('重复景点继续添加：既有各条备注与交通不变，新记录得到默认值与新时段', () => {
  const trip = makeTrip({ id: 't-dup-add', budget: 1000 });
  const plan = makeDayPlan({ trip_id: 't-dup-add', day_index: 1, items: museumRecords().slice(0, 2) });
  const world = resetWorld({ trips: [trip], dayPlans: [plan] });

  assert.equal(world.dayPlanStore.addSpot('t-dup-add', 'spot-museum', 1), true);
  assert.deepEqual(snapshot(world.dayPlanStore.findDay('t-dup-add', 1)!.items), [
    ['spot-museum', '09:00', '11:00', '第一次参观', 'walk'],
    ['spot-museum', '11:00', '13:00', '二刷特展', 'taxi'],
    ['spot-museum', '13:00', '15:00', '现场调整', 'metro'],
  ]);
});

test('失败回退：含重复景点的拖拽触发闭园失败时，各条备注交通与信封完全回到操作前', () => {
  const trip = makeTrip({ id: 't-dup-fail', budget: 1000 });
  const plan = makeDayPlan({
    trip_id: 't-dup-fail',
    day_index: 1,
    items: [
      ...museumRecords(),
      { spot_id: 'spot-market', start_time: '17:00', end_time: '19:00', note: '夜市收尾', transport: 'train' },
    ],
  });
  const world = resetWorld({ trips: [trip], dayPlans: [plan] });
  const before = snapshot(world.dayPlanStore.findDay('t-dup-fail', 1)!.items);
  const envelopeBefore = localStorage.getItem(DP_KEY);

  // 夜市(3) 拖到最前：17:00-19:00 后博物馆 19:00-21:00 越过 17:00 闭园 → 拒绝
  assert.equal(world.dayPlanStore.reorder('t-dup-fail', 1, 3, 0), false);
  assert.deepEqual(snapshot(world.dayPlanStore.findDay('t-dup-fail', 1)!.items), before);
  assert.equal(localStorage.getItem(DP_KEY), envelopeBefore);

  const reopened = reopenStores();
  assert.deepEqual(snapshot(reopened.dayPlanStore.findDay('t-dup-fail', 1)!.items), before);
});

test('普通单次景点：备注与交通在拖拽后原样跟随，排程时间与既有行为一致', () => {
  const trip = makeTrip({ id: 't-single', budget: 1000 });
  const plan = makeDayPlan({
    trip_id: 't-single',
    day_index: 1,
    items: [
      { spot_id: 'spot-westlake', start_time: '08:00', end_time: '10:00', note: '晨跑', transport: 'walk' },
      { spot_id: 'spot-museum', start_time: '10:00', end_time: '12:00', note: '约了讲解', transport: 'metro' },
    ],
  });
  const world = resetWorld({ trips: [trip], dayPlans: [plan] });

  assert.equal(world.dayPlanStore.reorder('t-single', 1, 1, 0), true);
  assert.deepEqual(snapshot(world.dayPlanStore.findDay('t-single', 1)!.items), [
    ['spot-museum', '09:00', '11:00', '约了讲解', 'metro'],
    ['spot-westlake', '11:00', '13:00', '晨跑', 'walk'],
  ]);

  const reopened = reopenStores();
  assert.deepEqual(snapshot(reopened.dayPlanStore.findDay('t-single', 1)!.items), [
    ['spot-museum', '09:00', '11:00', '约了讲解', 'metro'],
    ['spot-westlake', '11:00', '13:00', '晨跑', 'walk'],
  ]);
});
