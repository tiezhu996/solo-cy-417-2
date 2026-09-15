import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/constants/storageVersion';
import { messages } from '../../src/constants/messages';
import { resetWorld, reopenStores, makeTrip, makeDayPlan, toastLog } from '../support/world';

const DP_KEY = STORAGE_KEYS.dayPlans;

beforeEach(() => {
  resetWorld();
});

test('添加成功：返回 true、给出成功提示，并真实落盘，刷新后顺序与时间一致', () => {
  const trip = makeTrip({ id: 't-ok', budget: 1000 });
  const world = resetWorld({ trips: [trip] });

  const ok = world.dayPlanStore.addSpot('t-ok', 'spot-museum', 1);
  assert.equal(ok, true);
  assert.ok(toastLog.some((t) => t.level === 'success' && t.message === messages.spotAdded));

  const day = world.dayPlanStore.findDay('t-ok', 1)!;
  assert.deepEqual(
    day.items.map((i) => [i.spot_id, i.start_time, i.end_time]),
    [['spot-museum', '09:00', '11:00']],
  );

  // 真实保存结果回读，而非引用内存 store
  const reopened = reopenStores();
  const reday = reopened.dayPlanStore.findDay('t-ok', 1)!;
  assert.deepEqual(
    reday.items.map((i) => [i.spot_id, i.start_time, i.end_time]),
    [['spot-museum', '09:00', '11:00']],
  );
});

test('闭园失败：顺延超出闭园时返回 false、失败原因为 closed 提示，且 state 不变', () => {
  const trip = makeTrip({ id: 't-closed', budget: 1000 });
  // 博物馆 09:00-17:00，最多 4 个两小时槽；预置 4 个后第 5 个必然越过 17:00
  const plan = makeDayPlan({
    trip_id: 't-closed',
    day_index: 1,
    items: [0, 1, 2, 3].map((n) => ({
      spot_id: 'spot-museum',
      start_time: `${9 + n * 2}:00`.padStart(5, '0'),
      end_time: `${11 + n * 2}:00`.padStart(5, '0'),
      note: 'old',
      transport: 'metro' as const,
    })),
  });
  const world = resetWorld({ trips: [trip], dayPlans: [plan] });
  const before = JSON.stringify(world.dayPlanStore.findDay('t-closed', 1)!.items);

  const ok = world.dayPlanStore.addSpot('t-closed', 'spot-museum', 1);
  assert.equal(ok, false);
  assert.ok(toastLog.some((t) => t.level === 'error' && t.message === messages.scheduleAfterClose));
  assert.ok(!toastLog.some((t) => t.message === messages.scheduleOverBudget));

  // state 顺序与时间保持旧行程
  assert.equal(JSON.stringify(world.dayPlanStore.findDay('t-closed', 1)!.items), before);
});

test('闭园失败：localStorage 信封原样保留，刷新后回读不到任何部分写入', () => {
  const trip = makeTrip({ id: 't-rollback', budget: 1000 });
  const plan = makeDayPlan({
    trip_id: 't-rollback',
    day_index: 1,
    items: [
      { spot_id: 'spot-museum', start_time: '09:00', end_time: '11:00', note: 'keep', transport: 'metro' },
      { spot_id: 'spot-museum', start_time: '11:00', end_time: '13:00', note: 'keep', transport: 'metro' },
      { spot_id: 'spot-museum', start_time: '13:00', end_time: '15:00', note: 'keep', transport: 'metro' },
      { spot_id: 'spot-museum', start_time: '15:00', end_time: '17:00', note: 'keep', transport: 'metro' },
    ],
  });
  const world = resetWorld({ trips: [trip], dayPlans: [plan] });
  const rawEnvelopeBefore = localStorage.getItem(DP_KEY);

  assert.equal(world.dayPlanStore.addSpot('t-rollback', 'spot-museum', 1), false);
  assert.equal(localStorage.getItem(DP_KEY), rawEnvelopeBefore, '失败不得触发任何真实保存');

  const reopened = reopenStores();
  const items = reopened.dayPlanStore.findDay('t-rollback', 1)!.items;
  assert.equal(items.length, 4);
  assert.ok(items.every((i) => i.note === 'keep'));
});

test('预算失败：新增花费超过预算返回 false 且提示超预算，state 与信封均不变', () => {
  // 已计划 180，再加 180 将超过预算 300
  const trip = makeTrip({ id: 't-budget', budget: 300 });
  const plan = makeDayPlan({
    trip_id: 't-budget',
    day_index: 1,
    items: [
      { spot_id: 'spot-park', start_time: '10:00', end_time: '12:00', note: 'paid', transport: 'metro' },
    ],
  });
  const world = resetWorld({ trips: [trip], dayPlans: [plan] });
  const before = JSON.stringify(world.dayPlanStore.findDay('t-budget', 1)!.items);
  const rawBefore = localStorage.getItem(DP_KEY);

  const ok = world.dayPlanStore.addSpot('t-budget', 'spot-park', 1); // 180 + 180 > 300
  assert.equal(ok, false);
  assert.ok(toastLog.some((t) => t.level === 'error' && t.message === messages.scheduleOverBudget));
  assert.ok(!toastLog.some((t) => t.message === messages.scheduleAfterClose));
  assert.equal(JSON.stringify(world.dayPlanStore.findDay('t-budget', 1)!.items), before);
  assert.equal(localStorage.getItem(DP_KEY), rawBefore);

  const reopened = reopenStores();
  assert.equal(reopened.dayPlanStore.findDay('t-budget', 1)!.items.length, 1);
});

test('预算边界：新增花费恰好等于预算时成功落盘（<= 而非 <）', () => {
  const trip = makeTrip({ id: 't-exact', budget: 180 });
  const world = resetWorld({ trips: [trip] });
  const ok = world.dayPlanStore.addSpot('t-exact', 'spot-park', 1);
  assert.equal(ok, true);

  const reopened = reopenStores();
  const items = reopened.dayPlanStore.findDay('t-exact', 1)!.items;
  assert.equal(items.length, 1);
  assert.equal(items[0].spot_id, 'spot-park');
});

test('拖拽成功：reorder 返回 true 并重排全部时间，刷新后新顺序与时间可回读', () => {
  const trip = makeTrip({ id: 't-drag', budget: 1000 });
  const plan = makeDayPlan({
    trip_id: 't-drag',
    day_index: 1,
    items: [
      { spot_id: 'spot-westlake', start_time: '08:00', end_time: '10:00', note: 'a', transport: 'walk' },
      { spot_id: 'spot-museum', start_time: '10:00', end_time: '12:00', note: 'b', transport: 'walk' },
    ],
  });
  const world = resetWorld({ trips: [trip], dayPlans: [plan] });

  // 把博物馆(1) 拖到西湖(0) 前面
  const ok = world.dayPlanStore.reorder('t-drag', 1, 1, 0);
  assert.equal(ok, true);
  assert.deepEqual(
    world.dayPlanStore.findDay('t-drag', 1)!.items.map((i) => [i.spot_id, i.start_time, i.end_time]),
    [
      ['spot-museum', '09:00', '11:00'],
      ['spot-westlake', '11:00', '13:00'],
    ],
  );

  const reopened = reopenStores();
  assert.deepEqual(
    reopened.dayPlanStore.findDay('t-drag', 1)!.items.map((i) => [i.spot_id, i.start_time, i.end_time]),
    [
      ['spot-museum', '09:00', '11:00'],
      ['spot-westlake', '11:00', '13:00'],
    ],
  );
});

test('拖拽闭园失败：向上与向下拖动返回一致的 false，顺序时间与信封都不变', () => {
  const trip = makeTrip({ id: 't-drag-fail', budget: 1000 });
  // 夜市 17:00 开园在前会把 cursor 推到 19:00；博物馆闭园 17:00，博物馆排其后必然越闭园。
  // 构造一个“旧顺序可容纳、夜市上移到博物馆之前则失败”的组合。
  const plan = makeDayPlan({
    trip_id: 't-drag-fail',
    day_index: 1,
    items: [
      { spot_id: 'spot-museum', start_time: '09:00', end_time: '11:00', note: 'm', transport: 'metro' },
      { spot_id: 'spot-market', start_time: '17:00', end_time: '19:00', note: 'n', transport: 'metro' },
    ],
  });

  // 向上拖动：夜市(index 1) 移到博物馆(index 0) 之前
  const worldUp = resetWorld({ trips: [trip], dayPlans: [JSON.parse(JSON.stringify(plan))] });
  const upBefore = JSON.stringify(worldUp.dayPlanStore.findDay('t-drag-fail', 1)!.items);
  const envelopeUpBefore = localStorage.getItem(DP_KEY);
  assert.equal(worldUp.dayPlanStore.reorder('t-drag-fail', 1, 1, 0), false);
  assert.equal(JSON.stringify(worldUp.dayPlanStore.findDay('t-drag-fail', 1)!.items), upBefore);
  assert.equal(localStorage.getItem(DP_KEY), envelopeUpBefore);

  // 向下拖动情形：博物馆(0) 移到夜市(1) 之后，同样得到夜市在前、博物馆越闭园
  const worldDown = resetWorld({ trips: [trip], dayPlans: [JSON.parse(JSON.stringify(plan))] });
  const downBefore = JSON.stringify(worldDown.dayPlanStore.findDay('t-drag-fail', 1)!.items);
  const envelopeDownBefore = localStorage.getItem(DP_KEY);
  assert.equal(worldDown.dayPlanStore.reorder('t-drag-fail', 1, 0, 1), false);
  assert.equal(JSON.stringify(worldDown.dayPlanStore.findDay('t-drag-fail', 1)!.items), downBefore);
  assert.equal(localStorage.getItem(DP_KEY), envelopeDownBefore);

  // 刷新回读仍是旧顺序
  const reopened = reopenStores();
  assert.deepEqual(
    reopened.dayPlanStore.findDay('t-drag-fail', 1)!.items.map((i) => i.spot_id),
    ['spot-museum', 'spot-market'],
  );
});

test('拖拽不改花费：超预算的既有行程，调整顺序（总花费不变）不因预算被拒', () => {
  const trip = makeTrip({ id: 't-drag-budget', budget: 100 }); // 两个 180 景点本就超预算
  const plan = makeDayPlan({
    trip_id: 't-drag-budget',
    day_index: 1,
    items: [
      { spot_id: 'spot-park', start_time: '10:00', end_time: '12:00', note: 'p1', transport: 'taxi' },
      { spot_id: 'spot-westlake', start_time: '12:00', end_time: '14:00', note: 'p2', transport: 'taxi' },
    ],
  });
  const world = resetWorld({ trips: [trip], dayPlans: [plan] });
  const ok = world.dayPlanStore.reorder('t-drag-budget', 1, 1, 0);
  assert.equal(ok, true);
  assert.ok(!toastLog.some((t) => t.message === messages.scheduleOverBudget));
});

test('重复项：同一景点可重复添加为多个独立时段并真实保存', () => {
  const trip = makeTrip({ id: 't-dup', budget: 1000 });
  const world = resetWorld({ trips: [trip] });
  assert.equal(world.dayPlanStore.addSpot('t-dup', 'spot-museum', 1), true);
  assert.equal(world.dayPlanStore.addSpot('t-dup', 'spot-museum', 1), true);

  const reopened = reopenStores();
  const items = reopened.dayPlanStore.findDay('t-dup', 1)!.items;
  assert.equal(items.length, 2);
  assert.deepEqual(items.map((i) => [i.start_time, i.end_time]), [['09:00', '11:00'], ['11:00', '13:00']]);
});

test('失效景点引用：已保存行程引用不存在的 spot 时仍可稳定回读与继续排程', () => {
  const trip = makeTrip({ id: 't-ghost', budget: 1000 });
  const plan = makeDayPlan({
    trip_id: 't-ghost',
    day_index: 1,
    items: [
      { spot_id: 'ghost-spot', start_time: '08:00', end_time: '10:00', note: 'g', transport: 'walk' },
    ],
  });
  const world = resetWorld({ trips: [trip], dayPlans: [plan] });

  const reopened = reopenStores();
  assert.equal(reopened.dayPlanStore.findDay('t-ghost', 1)!.items[0].spot_id, 'ghost-spot');

  // 在失效引用之后继续添加真实景点，按全天窗口稳定顺延
  const ok = world.dayPlanStore.addSpot('t-ghost', 'spot-museum', 1);
  assert.equal(ok, true);
  assert.deepEqual(
    world.dayPlanStore.findDay('t-ghost', 1)!.items.map((i) => [i.spot_id, i.start_time, i.end_time]),
    [['ghost-spot', '08:00', '10:00'], ['spot-museum', '10:00', '12:00']],
  );
});
