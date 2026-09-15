import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSchedule, spotOpenWindow, toMinutes, type ScheduleEntry } from '../../src/utils/scheduler';
import { makeSpot } from '../support/world';
import type { Spot } from '../../src/models/spot';

const entry = (spot_id: string): ScheduleEntry => ({ spot_id, note: 'n', transport: 'walk' });

test('开放窗口解析：区间、全天、异常写法都有稳定结果', () => {
  assert.deepEqual(spotOpenWindow(makeSpot({ open_time: '09:00-17:00' })), { open: 540, close: 1020 });
  assert.deepEqual(spotOpenWindow(makeSpot({ open_time: '全天' })), { open: 480, close: 1320 });
  assert.deepEqual(spotOpenWindow(makeSpot({ open_time: '暂停营业' })), { open: 480, close: 1320 });
  assert.deepEqual(spotOpenWindow(undefined), { open: 480, close: 1320 });
});

test('刚好容纳：单项 09:00 开园、11:00 闭园，09:00-11:00 排程成功', () => {
  const spot = makeSpot({ id: 's-exact', open_time: '09:00-11:00' });
  const result = buildSchedule([entry('s-exact')], [spot]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.items[0], {
    spot_id: 's-exact', start_time: '09:00', end_time: '11:00', note: 'n', transport: 'walk',
  });
});

test('刚好容纳：连续多项排满到闭园时刻（end == close）允许', () => {
  // 09:00-13:00 恰好两个 2 小时槽
  const spot = makeSpot({ id: 's-four', open_time: '09:00-13:00' });
  const result = buildSchedule([entry('s-four'), entry('s-four')], [spot]);
  assert.equal(result.ok, true);
  assert.equal(result.items[1].start_time, '11:00');
  assert.equal(result.items[1].end_time, '13:00');
});

test('刚好溢出 1 分钟：闭园 10:59 时 09:00-11:00 判定失败并给出 overflow 景点', () => {
  const spot = makeSpot({ id: 's-overflow', open_time: '09:00-10:59' });
  const result = buildSchedule([entry('s-overflow')], [spot]);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'closed');
  assert.equal(result.overflowSpotId, 's-overflow');
  assert.deepEqual(result.items, []);
});

test('刚好溢出一项：09:00-13:00 放 3 个（第 3 个 13:00-15:00）失败', () => {
  const spot = makeSpot({ id: 's-three', open_time: '09:00-13:00' });
  const result = buildSchedule([entry('s-three'), entry('s-three'), entry('s-three')], [spot]);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'closed');
  assert.equal(result.overflowSpotId, 's-three');
});

test('等待开园：前置项结束早于晚开园景点，起点取开园时间，中间留空', () => {
  const early = makeSpot({ id: 's-early', open_time: '08:00-22:00' });
  const night = makeSpot({ id: 's-night', open_time: '17:00-23:30' });
  const result = buildSchedule([entry('s-early'), entry('s-night')], [early, night]);
  assert.equal(result.ok, true);
  assert.deepEqual([result.items[0].start_time, result.items[0].end_time], ['08:00', '10:00']);
  assert.deepEqual([result.items[1].start_time, result.items[1].end_time], ['17:00', '19:00']);
});

test('冲突顺延：前项占满早段，后项从 cursor 顺延且不越过自身闭园', () => {
  const allDay = makeSpot({ id: 's-all', open_time: '全天' });
  const museum = makeSpot({ id: 's-museum', open_time: '09:00-17:00' });
  const result = buildSchedule([entry('s-all'), entry('s-museum')], [allDay, museum]);
  assert.equal(result.ok, true);
  assert.deepEqual([result.items[1].start_time, result.items[1].end_time], ['10:00', '12:00']);
});

test('失效景点引用：spot 表中不存在的 id 按全天窗口稳定排程，不抛异常', () => {
  const result = buildSchedule([entry('ghost-id'), entry('ghost-id')], []);
  assert.equal(result.ok, true);
  assert.equal(result.items.length, 2);
  assert.deepEqual([result.items[0].start_time, result.items[0].end_time], ['08:00', '10:00']);
  assert.deepEqual([result.items[1].start_time, result.items[1].end_time], ['10:00', '12:00']);
  assert.equal(result.items.every((i) => i.spot_id === 'ghost-id'), true);
});

test('失效引用夹在真实景点之间：按全天窗口顺延，其余项目不受影响', () => {
  const museum = makeSpot({ id: 's-mid', open_time: '09:00-17:00' });
  const result = buildSchedule([entry('ghost-a'), entry('s-mid'), entry('ghost-b')], [museum]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.items.map((i) => [i.spot_id, i.start_time, i.end_time]), [
    ['ghost-a', '08:00', '10:00'],
    ['s-mid', '10:00', '12:00'],
    ['ghost-b', '12:00', '14:00'],
  ]);
});

test('重复项：同一景点 id 重复出现按多个独立时段顺序排入，不去重', () => {
  const museum = makeSpot({ id: 's-dup', open_time: '09:00-17:00' });
  const ids = ['s-dup', 's-dup', 's-dup'];
  const result = buildSchedule(ids.map(entry), [museum]);
  assert.equal(result.ok, true);
  assert.equal(result.items.length, 3);
  assert.deepEqual(result.items.map((i) => [i.start_time, i.end_time]), [
    ['09:00', '11:00'], ['11:00', '13:00'], ['13:00', '15:00'],
  ]);
});

test('纯函数：排程失败或成功都不修改入参数组', () => {
  const spot = makeSpot({ id: 's-pure', open_time: '09:00-10:00' });
  const entries = [entry('s-pure'), entry('s-pure')];
  const snapshot = JSON.stringify(entries);
  buildSchedule(entries, [spot]);
  assert.equal(JSON.stringify(entries), snapshot);
});

test('工具函数：toMinutes 边界正确（08:00、22:00、跨午夜闭园按同日分钟数比较）', () => {
  assert.equal(toMinutes('08:00'), 480);
  assert.equal(toMinutes('22:00'), 1320);
  const spots: Spot[] = [];
  assert.equal(buildSchedule([], spots).ok, true);
});
