import { addDays, differenceInCalendarDays, format, isValid, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { z } from 'zod';

export const priorityLabels = { high: '高优先级', normal: '中优先级', low: '低优先级' };
export const statusLabels = { todo: '待办', doing: '进行中', done: '已完成' };
export const colors = ['#007aff', '#30a46c', '#bf5af2', '#ff9f0a', '#ec5b69', '#64748b'];
export const localDate = (date = new Date()) => format(date, 'yyyy-MM-dd');
export const shiftDate = (date: string, days: number) => localDate(addDays(parseISO(date), days));
export const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && isValid(parseISO(value)) && localDate(parseISO(value)) === value;
const optionalDate = z.string().refine(v => v === '' || isDate(v), '日期无效');
const optionalTime = z.string().refine(v => v === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), '时间无效');
export const categorySchema = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(40), color: z.string().regex(/^#[\da-fA-F]{6}$/) });
export const taskSchema = z.object({
  id: z.string().uuid(), title: z.string().trim().min(1, '请填写任务名称').max(200, '任务名称最多 200 字'),
  notes: z.string().max(10000), categoryId: z.string(), priority: z.enum(['high', 'normal', 'low']),
  status: z.enum(['todo', 'doing', 'done']), plannedDate: optionalDate, dueDate: optionalDate,
  plannedEndDate: optionalDate.optional(), startTime: optionalTime, endTime: optionalTime,
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(), completedAt: z.string().datetime().nullable(),
}).superRefine((task, ctx) => {
  if ((task.startTime || task.endTime || task.plannedEndDate) && !task.plannedDate) ctx.addIssue({ code: 'custom', message: '请先选择工作安排的开始日期', path: ['plannedDate'] });
  if (!!task.startTime !== !!task.endTime) ctx.addIssue({ code: 'custom', message: '请同时填写开始和结束时间', path: ['endTime'] });
  const endDate = task.plannedEndDate || task.plannedDate;
  if (task.plannedDate && endDate < task.plannedDate) ctx.addIssue({ code: 'custom', message: '结束日期不能早于开始日期', path: ['plannedEndDate'] });
  if (task.plannedDate && endDate === task.plannedDate && task.startTime && task.endTime && task.startTime >= task.endTime) ctx.addIssue({ code: 'custom', message: '同一天内，结束时间必须晚于开始时间；跨日安排请选择实际的结束日期。', path: ['endTime'] });
  if ((task.status === 'done') !== !!task.completedAt) ctx.addIssue({ code: 'custom', message: '完成状态与完成时间不一致', path: ['completedAt'] });
});
export type Task = z.infer<typeof taskSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Snapshot = { tasks: Task[]; categories: Category[] };
export type DeletedTask = { id: string; task: Task; deletedAt: string };
export type CalendarEntry = { task: Task; kind: 'plan' | 'due' };
export const emptyTask = (date = ''): Task => ({ id: crypto.randomUUID(), title: '', notes: '', categoryId: '', priority: 'normal', status: 'todo', plannedDate: date, plannedEndDate: '', dueDate: '', startTime: '', endTime: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completedAt: null });
// Older tasks have no end date; their original same-day meaning is retained.
export const planEndDate = (task: Task) => task.plannedEndDate || task.plannedDate;
export function lastPlannedDate(task: Task) {
  const end = planEndDate(task);
  return end > task.plannedDate && task.startTime && task.endTime === '00:00' ? shiftDate(end, -1) : end;
}
export const plannedOnDate = (task: Task, date: string) => !!task.plannedDate && task.plannedDate <= date && date <= lastPlannedDate(task);
export function scheduleLabel(task: Task) {
  if (!task.plannedDate) return '尚未安排';
  const start = format(parseISO(task.plannedDate), 'yyyy年M月d日');
  const end = planEndDate(task);
  if (end !== task.plannedDate) return `${start}${task.startTime ? ` ${task.startTime}` : ''} – ${format(parseISO(end), 'yyyy年M月d日')}${task.endTime ? ` ${task.endTime}` : ''}`;
  return `${start}${task.startTime && task.endTime ? ` ${task.startTime}–${task.endTime}` : ' · 全天'}`;
}
export function rescheduleTask(task: Task, date: string): Task {
  const end = task.plannedDate && task.plannedEndDate ? shiftDate(task.plannedEndDate, differenceInCalendarDays(parseISO(date), parseISO(task.plannedDate))) : date;
  if (!isDate(date) || !isDate(end)) throw new Error('改期后的日期超出支持范围，请选择 1–9999 年内的日期。');
  return { ...task, plannedDate: date, plannedEndDate: end, updatedAt: new Date().toISOString() };
}
function timedInterval(task: Task) {
  if (!task.plannedDate || !task.startTime || !task.endTime) return null;
  const start = parseISO(`${task.plannedDate}T${task.startTime}`).getTime();
  const end = parseISO(`${planEndDate(task)}T${task.endTime}`).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
}
export function dayTimeRange(task: Task, date: string) {
  if (!timedInterval(task) || !plannedOnDate(task, date)) return null;
  return { startTime: task.plannedDate === date ? task.startTime : '00:00', endTime: planEndDate(task) === date ? task.endTime : '24:00' };
}
export function setStatus(task: Task, status: Task['status']): Task {
  return { ...task, status, completedAt: status === 'done' ? task.completedAt || new Date().toISOString() : null, updatedAt: new Date().toISOString() };
}
const rank = { high: 0, normal: 1, low: 2 };
export const sortTasks = (tasks: Task[]) => [...tasks].sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || rank[a.priority] - rank[b.priority] || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
export function todayGroups(tasks: Task[], date: string) {
  return {
    today: sortTasks(tasks.filter(t => plannedOnDate(t, date))),
    carry: sortTasks(tasks.filter(t => t.status !== 'done' && !!t.plannedDate && lastPlannedDate(t) < date)),
    deadlines: sortTasks(tasks.filter(t => t.status !== 'done' && !!t.dueDate && t.dueDate <= shiftDate(date, 3))),
  };
}
export function actionableToday(tasks: Task[], date: string) {
  return sortTasks(tasks.filter(t => t.status !== 'done' && ((!!t.plannedDate && t.plannedDate <= date) || (!!t.dueDate && t.dueDate <= date))));
}
export function timeConflicts(task: Task, tasks: Task[]) {
  const interval = timedInterval(task);
  if (!interval || task.status === 'done') return [];
  return tasks.filter(t => {
    const other = timedInterval(t);
    return t.id !== task.id && t.status !== 'done' && other && other.start < interval.end && interval.start < other.end;
  });
}
export function scheduledMinutes(tasks: Task[], date?: string) {
  const dayStart = date ? parseISO(date).getTime() : -Infinity;
  const dayEnd = date ? parseISO(shiftDate(date, 1)).getTime() : Infinity;
  return tasks.reduce((sum, task) => {
    const interval = timedInterval(task);
    return sum + (interval ? Math.max(0, Math.min(interval.end, dayEnd) - Math.max(interval.start, dayStart)) / 60000 : 0);
  }, 0);
}
export function calendarEntries(tasks: Task[], date: string): CalendarEntry[] {
  return sortTasks(tasks).flatMap(task => [
    ...(plannedOnDate(task, date) ? [{ task, kind: 'plan' as const }] : []),
    ...(task.dueDate === date ? [{ task, kind: 'due' as const }] : []),
  ]);
}
export function monthDays(month: Date) {
  return eachDayOfInterval({ start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) });
}
const backupSchema = z.object({ app: z.literal('dayline'), version: z.union([z.literal(1), z.literal(2)]), exportedAt: z.string().datetime(), tasks: z.array(taskSchema).max(100000), categories: z.array(categorySchema).max(1000) });
export function parseBackup(value: unknown): Snapshot {
  const parsed = backupSchema.safeParse(value);
  if (!parsed.success) throw new Error('备份格式无效，或包含不合法的任务数据。请选择日序导出的备份。');
  const { tasks, categories } = parsed.data;
  if (new Set(tasks.map(t => t.id)).size !== tasks.length || new Set(categories.map(c => c.id)).size !== categories.length) throw new Error('备份中存在重复的记录编号，未导入任何数据。');
  const ids = new Set(categories.map(c => c.id));
  if (tasks.some(t => t.categoryId && !ids.has(t.categoryId))) throw new Error('备份中的任务引用了不存在的分类，未导入任何数据。');
  return { tasks, categories };
}
export function makeBackup(snapshot: Snapshot) { return { app: 'dayline', version: 2, exportedAt: new Date().toISOString(), ...snapshot }; }
export function demoData(date: string, categories: Category[]): Task[] {
  const create = (title: string, options: Partial<Task>) => ({ ...emptyTask(date), title, ...options });
  const cat = categories.map(c => c.id);
  return [
    create('完成项目方案初稿', { priority: 'high', categoryId: cat[0], dueDate: shiftDate(date, 2), status: 'doing', notes: '梳理目标、实施步骤和交付计划，整理为可评审的第一版。' }),
    create('产品进度同步', { categoryId: cat[0], startTime: '09:30', endTime: '10:15', notes: '确认本周进展，整理需要协调的事项。' }),
    create('整理客户反馈与待办', { categoryId: cat[1], dueDate: date }),
    create('设计评审', { categoryId: cat[0], startTime: '14:00', endTime: '15:00', priority: 'high' }),
    setStatus(create('查阅并回复工作邮件', { categoryId: cat[1], priority: 'low' }), 'done'),
    create('补充上次会议纪要', { plannedDate: shiftDate(date, -1), categoryId: cat[1], priority: 'normal', dueDate: shiftDate(date, 1) }),
    create('确认供应商报价', { plannedDate: shiftDate(date, -2), dueDate: shiftDate(date, -1), categoryId: cat[0], priority: 'high' }),
    create('准备下周工作计划', { plannedDate: shiftDate(date, 3), dueDate: shiftDate(date, 5), categoryId: cat[1] }),
    create('阶段成果汇报', { plannedDate: shiftDate(date, 5), dueDate: shiftDate(date, 7), categoryId: cat[0], priority: 'high', startTime: '10:00', endTime: '11:00' }),
    create('阅读行业研究报告', { plannedDate: '', categoryId: cat[2], priority: 'low' }),
    create('梳理下一阶段需求', { plannedDate: '', dueDate: shiftDate(date, 9), categoryId: cat[0] }),
    setStatus(create('完成周度工作复盘', { plannedDate: shiftDate(date, -3), categoryId: cat[1] }), 'done'),
  ];
}
