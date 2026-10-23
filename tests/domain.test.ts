import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actionableToday, calendarEntries, dayTimeRange, emptyTask, isDate, makeBackup, monthDays, parseBackup, plannedOnDate, rescheduleTask, scheduleLabel, scheduledMinutes, setStatus, sortTasks, taskSchema, timeConflicts, todayGroups, type Task } from '../src/domain.ts';

const task = (overrides: Partial<Task> = {}): Task => ({ ...emptyTask(), title: '测试任务', ...overrides });
test('真实日期验证与闰年', () => { assert.ok(isDate('2028-02-29')); assert.equal(isDate('2026-02-29'), false); assert.equal(isDate('2026-04-31'), false); });
test('未完成任务跨天保留计划日期；截止未到不属于截止已过', () => { const t = task({ plannedDate: '2026-10-22', dueDate: '2026-10-30' }); const g = todayGroups([t], '2026-10-23'); assert.equal(g.carry.length, 1); assert.equal(g.deadlines.length, 0); assert.equal(t.plannedDate, '2026-10-22'); });
test('完成的过去任务不再滚入待办', () => { const g = todayGroups([setStatus(task({ plannedDate: '2026-10-22' }), 'done')], '2026-10-23'); assert.equal(g.carry.length, 0); });
test('截止无计划日期的任务也进入提醒', () => { const t = task({ dueDate: '2026-10-24' }); assert.equal(todayGroups([t], '2026-10-23').deadlines[0].id, t.id); });
test('计划与截止在不同日期引用同一任务', () => { const t = task({ plannedDate: '2026-10-26', dueDate: '2026-10-30' }); assert.equal(calendarEntries([t], '2026-10-26')[0].kind, 'plan'); assert.equal(calendarEntries([t], '2026-10-30')[0].task.id, t.id); });
test('同日计划和截止都展示但不复制任务', () => { const t = task({ plannedDate: '2026-10-26', dueDate: '2026-10-26' }); assert.deepEqual(calendarEntries([t], '2026-10-26').map(e => e.kind), ['plan', 'due']); });
test('完成与重新打开准确维护完成时间', () => { const done = setStatus(task(), 'done'); assert.ok(done.completedAt); assert.equal(setStatus(done, 'done').completedAt, done.completedAt); assert.equal(setStatus(done, 'todo').completedAt, null); });
test('优先级排序并将已完成任务置后', () => { const low = task({ priority: 'low' }), high = task({ priority: 'high' }), done = setStatus(task({ priority: 'high' }), 'done'); assert.deepEqual(sortTasks([low, done, high]).map(t => t.id), [high.id, low.id, done.id]); });
test('时间范围必须完整并晚于开始时间', () => { assert.equal(taskSchema.safeParse(task({ startTime: '10:00' })).success, false); assert.equal(taskSchema.safeParse(task({ plannedDate: '2026-10-23', startTime: '10:00', endTime: '09:00' })).success, false); assert.equal(taskSchema.safeParse(task({ plannedDate: '2026-10-23', startTime: '10:00', endTime: '11:00' })).success, true); });
test('不同长度月份及跨年的月历覆盖完整自然周', () => { for (const m of ['2026-02-01', '2026-08-01', '2026-12-01']) { const days = monthDays(new Date(m + 'T12:00:00')); assert.equal(days[0].getDay(), 1); assert.equal(days.at(-1)!.getDay(), 0); assert.equal(days.length % 7, 0); assert.ok(days.length >= 28 && days.length <= 42); } });
test('有效备份往返保留全部数据', () => { const snapshot = { tasks: [task()], categories: [] }; assert.deepEqual(parseBackup(makeBackup(snapshot)), snapshot); });
test('损坏、未知版本、重复任务及悬空分类的备份均拒绝', () => { const t = task(); const b = makeBackup({ tasks: [t], categories: [] }); assert.throws(() => parseBackup({})); assert.throws(() => parseBackup({ ...b, version: 3 })); assert.throws(() => parseBackup({ ...b, tasks: [t, t] })); assert.throws(() => parseBackup({ ...b, tasks: [{ ...t, categoryId: 'missing' }] })); });
test('今日统计包含未安排的到期任务且重复任务只计一次', () => { const both = task({ plannedDate: '2026-10-23', dueDate: '2026-10-23' }); const due = task({ dueDate: '2026-10-22', priority: 'high' }); const future = task({ plannedDate: '2026-10-28' }); assert.equal(actionableToday([both, due, future], '2026-10-23').length, 2); });
test('时间重叠检测忽略相邻、其他日期、自己与已完成任务', () => { const t = task({ plannedDate: '2026-10-23', startTime: '10:00', endTime: '11:00' }); const overlap = task({ plannedDate: '2026-10-23', startTime: '10:30', endTime: '11:30' }); const adjacent = task({ plannedDate: '2026-10-23', startTime: '11:00', endTime: '12:00' }); assert.deepEqual(timeConflicts(t, [t, overlap, adjacent, setStatus(overlap, 'done'), { ...overlap, plannedDate: '2026-10-24' }]).map(t => t.id), [overlap.id]); });
test('定时事项总时长准确累计', () => { assert.equal(scheduledMinutes([task({ plannedDate: '2026-10-23', startTime: '09:30', endTime: '10:15' }), task({ plannedDate: '2026-10-23', startTime: '14:00', endTime: '15:00' }), task()]), 105); });

const overnight = (overrides: Partial<Task> = {}) => task({ plannedDate: '2026-10-23', plannedEndDate: '2026-10-24', startTime: '17:05', endTime: '07:56', dueDate: '2026-10-30', ...overrides });
test('客户案例跨日 17:05 至次日 07:56 有效，交付日期独立', () => {
  assert.ok(taskSchema.safeParse(overnight()).success);
  assert.ok(taskSchema.safeParse(overnight({ dueDate: '' })).success);
  assert.ok(taskSchema.safeParse(overnight({ dueDate: '2026-10-22' })).success);
  assert.equal(scheduledMinutes([overnight()]), 891);
  assert.equal(scheduleLabel(overnight()), '2026年10月23日 17:05 – 2026年10月24日 07:56');
});
test('跨日按完整日期校验，拒绝结束日期倒置、同日倒置、零时长与单边时间', () => {
  for (const options of [{ plannedEndDate: '2026-10-22' }, { plannedEndDate: '2026-10-23' }, { plannedEndDate: '2026-10-23', endTime: '17:05' }, { endTime: '' }, { startTime: '' }, { plannedDate: '' }]) assert.equal(taskSchema.safeParse(overnight(options)).success, false);
  assert.ok(taskSchema.safeParse(overnight({ endTime: '17:05' })).success);
});
test('跨日任务每天出现、当日统计去重，结束后才转为遗留', () => {
  const t = overnight({ dueDate: '2026-10-24' });
  for (const date of ['2026-10-23', '2026-10-24']) {
    assert.deepEqual(todayGroups([t], date).today.map(t => t.id), [t.id]);
    assert.equal(todayGroups([t], date).carry.length, 0);
    assert.equal(actionableToday([t], date).length, 1);
  }
  assert.equal(todayGroups([t], '2026-10-25').carry.length, 1);
  assert.deepEqual(calendarEntries([t], '2026-10-24').map(e => e.kind), ['plan', 'due']);
});
test('当日时段和时长按天截取，不把跨日总时长重复计入每日', () => {
  const t = overnight();
  assert.equal(scheduledMinutes([t], '2026-10-23'), 415);
  assert.equal(scheduledMinutes([t], '2026-10-24'), 476);
  assert.equal(scheduledMinutes([t], '2026-10-25'), 0);
  assert.deepEqual(dayTimeRange(t, '2026-10-23'), { startTime: '17:05', endTime: '24:00' });
  assert.deepEqual(dayTimeRange(t, '2026-10-24'), { startTime: '00:00', endTime: '07:56' });
  assert.equal(dayTimeRange(t, '2026-10-25'), null);
});
test('午夜结束不占用次日；多日安排覆盖中间整天', () => {
  const t = overnight({ endTime: '00:00' });
  assert.equal(calendarEntries([t], '2026-10-24').length, 0);
  assert.equal(scheduledMinutes([t], '2026-10-24'), 0);
  assert.equal(todayGroups([t], '2026-10-24').carry.length, 1);
  const multi = overnight({ plannedEndDate: '2026-10-25' });
  assert.equal(scheduledMinutes([multi], '2026-10-24'), 1440);
  assert.deepEqual(dayTimeRange(multi, '2026-10-24'), { startTime: '00:00', endTime: '24:00' });
});
test('跨月跨年、闰日和无时间的全天范围正确', () => {
  const t = overnight({ plannedDate: '2026-12-31', plannedEndDate: '2027-01-02', startTime: '', endTime: '' });
  assert.ok(taskSchema.safeParse(t).success);
  assert.ok(plannedOnDate(t, '2027-01-01'));
  assert.ok(plannedOnDate(t, '2027-01-02'));
  assert.equal(scheduledMinutes([t]), 0);
  assert.ok(taskSchema.safeParse(overnight({ plannedDate: '2028-02-28', plannedEndDate: '2028-03-01' })).success);
});
test('跨日冲突包含次日、包围区间，忽略相邻、全天、自己和已完成', () => {
  const t = overnight();
  const next = task({ plannedDate: '2026-10-24', startTime: '07:00', endTime: '08:00' });
  const enclosing = overnight({ plannedDate: '2026-10-22', plannedEndDate: '2026-10-25' });
  const adjacent = task({ plannedDate: '2026-10-24', startTime: '07:56', endTime: '08:00' });
  assert.deepEqual(timeConflicts(t, [t, next, enclosing, adjacent, task({ plannedDate: '2026-10-24' }), setStatus(next, 'done')]).map(t => t.id), [next.id, enclosing.id]);
  assert.equal(timeConflicts(overnight({ plannedEndDate: '2026-10-22' }), [next]).length, 0);
});
test('跨日改期保留跨度、时间和交付日期，支持跨年', () => {
  const moved = rescheduleTask(overnight(), '2026-12-31');
  assert.equal(moved.plannedEndDate, '2027-01-01');
  assert.equal(moved.startTime, '17:05'); assert.equal(moved.endTime, '07:56');
  assert.equal(moved.dueDate, '2026-10-30');
  assert.equal(scheduledMinutes([moved]), 891);
  assert.throws(() => rescheduleTask(overnight(), '9999-12-31'));
});
test('旧任务、旧备份按原同日时段读取，新版备份保留跨日日期', () => {
  const legacy = task({ plannedDate: '2026-10-23', startTime: '10:00', endTime: '11:00' });
  delete legacy.plannedEndDate;
  const old = { app: 'dayline', version: 1, exportedAt: new Date().toISOString(), tasks: [legacy], categories: [] };
  assert.deepEqual(parseBackup(old).tasks[0], legacy);
  assert.equal(scheduledMinutes([legacy]), 60);
  assert.equal(calendarEntries([legacy], '2026-10-24').length, 0);
  const snapshot = { tasks: [overnight()], categories: [] };
  assert.equal(makeBackup(snapshot).version, 2);
  assert.deepEqual(parseBackup(makeBackup(snapshot)), snapshot);
});
