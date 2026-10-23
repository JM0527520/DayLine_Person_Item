import Dexie, { type Table } from 'dexie';
import { categorySchema, colors, demoData, localDate, makeBackup, parseBackup, taskSchema, type Category, type DeletedTask, type Snapshot, type Task } from './domain';

export const isDemo = new URLSearchParams(location.search).get('demo') === '1';
class ScheduleDB extends Dexie {
  tasks!: Table<Task, string>;
  categories!: Table<Category, string>;
  trash!: Table<DeletedTask, string>;
  meta!: Table<{ key: string; value: string }, string>;
  constructor() {
    super(isDemo ? 'dayline-demo-v1' : 'dayline-local-v1');
    this.version(1).stores({ tasks: 'id, plannedDate, dueDate, status, categoryId', categories: 'id, name', meta: 'key' });
    this.version(2).stores({ trash: 'id, deletedAt' });
  }
}
export const db = new ScheduleDB();
export async function initialize() {
  await db.transaction('rw', db.tasks, db.categories, db.meta, async () => {
    if (await db.meta.get('initialized')) return;
    const categories: Category[] = ['项目工作', '日常工作', '个人成长'].map((name, i) => ({ id: crypto.randomUUID(), name, color: colors[i] }));
    await db.categories.bulkAdd(categories);
    if (isDemo) await db.tasks.bulkAdd(demoData(localDate(), categories));
    await db.meta.put({ key: 'initialized', value: '1' });
  });
}
export async function snapshot(): Promise<Snapshot> {
  return db.transaction('r', db.tasks, db.categories, async () => ({ tasks: await db.tasks.toArray(), categories: await db.categories.toArray() }));
}
export async function saveTask(task: Task) {
  const validated = taskSchema.parse(task);
  await db.transaction('rw', db.tasks, db.categories, async () => {
    if (validated.categoryId && !await db.categories.get(validated.categoryId)) throw new Error('该分类已被删除，请重新选择分类。');
    await db.tasks.put(validated);
  });
}
export async function saveCategory(category: Category) {
  const validated = categorySchema.parse(category);
  await db.transaction('rw', db.categories, async () => {
    const existing = await db.categories.where('name').equals(validated.name).first();
    if (existing && existing.id !== validated.id) throw new Error('已存在同名分类。');
    await db.categories.put(validated);
  });
}
export async function deleteCategory(id: string) {
  await db.transaction('rw', db.categories, db.tasks, async () => {
    await db.tasks.where('categoryId').equals(id).modify({ categoryId: '' });
    await db.categories.delete(id);
  });
}
export async function restoreBackup(data: Snapshot) {
  await db.transaction('rw', db.tasks, db.categories, db.meta, async () => {
    const previous = { tasks: await db.tasks.toArray(), categories: await db.categories.toArray() };
    await db.meta.put({ key: 'beforeRestore', value: JSON.stringify(makeBackup(previous)) });
    await db.tasks.clear();
    await db.categories.clear();
    await db.categories.bulkAdd(data.categories);
    await db.tasks.bulkAdd(data.tasks);
  });
}
export async function softDeleteTask(id: string) {
  await db.transaction('rw', db.tasks, db.trash, async () => {
    const task = await db.tasks.get(id);
    if (!task) return;
    await db.trash.put({ id, task, deletedAt: new Date().toISOString() });
    await db.tasks.delete(id);
  });
}
export async function restoreDeletedTask(id: string) {
  await db.transaction('rw', db.tasks, db.trash, db.categories, async () => {
    const deleted = await db.trash.get(id);
    if (!deleted) throw new Error('该记录已被恢复。');
    if (await db.tasks.get(id)) throw new Error('当前已有同编号任务，未覆盖现有数据。');
    const task = { ...deleted.task };
    if (task.categoryId && !await db.categories.get(task.categoryId)) task.categoryId = '';
    await db.tasks.add(task);
    await db.trash.delete(id);
  });
}
export async function undoLastRestore() {
  await db.transaction('rw', db.tasks, db.categories, db.meta, async () => {
    const previous = await db.meta.get('beforeRestore');
    if (!previous) throw new Error('暂无可恢复的历史快照。');
    const data = parseBackup(JSON.parse(previous.value));
    await db.tasks.clear(); await db.categories.clear();
    await db.tasks.bulkAdd(data.tasks); await db.categories.bulkAdd(data.categories);
    await db.meta.delete('beforeRestore');
  });
}
