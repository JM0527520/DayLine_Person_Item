import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { liveQuery } from 'dexie';
import { addMonths, endOfMonth, format, isSameMonth, parseISO, startOfMonth } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { AlignJustify, ArrowDownToLine, ArrowRight, ArrowUpFromLine, CalendarDays, CalendarRange, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, Database, Flag, History, Inbox, List, ListFilter, Loader2, Monitor, Moon, Pencil, Plus, RotateCcw, Search, Settings2, ShieldCheck, Sparkles, Sun, Trash2, X } from 'lucide-react';
import { db, deleteCategory, initialize, isDemo, restoreBackup, restoreDeletedTask, saveCategory, saveTask, snapshot, softDeleteTask, undoLastRestore } from './db';
import { actionableToday, calendarEntries, colors, dayTimeRange, demoData, emptyTask, lastPlannedDate, localDate, makeBackup, monthDays, parseBackup, planEndDate, plannedOnDate, rescheduleTask, scheduleLabel, scheduledMinutes, setStatus, shiftDate, sortTasks, todayGroups, type Category, type DeletedTask, type Snapshot, type Task } from './domain';
import { Empty, Modal, SectionTitle, TaskEditor, TaskRow } from './components';
import { useTheme } from './theme';
import { useScrollVisibility } from './scroll-visibility';
import { useDensity } from './density';
import { readViewState, saveViewState, type View } from './view-state';
import { MonthPicker } from './MonthPicker';

const navigation = [
  { id: 'today' as const, label: '今天', icon: Sun },
  { id: 'month' as const, label: '月度总览', icon: CalendarDays },
  { id: 'future' as const, label: '未来任务', icon: Inbox },
  { id: 'history' as const, label: '工作记录', icon: History },
];
const viewTitles = { today: '今天', month: '月度总览', future: '未来任务', history: '工作记录', settings: '设置' };
const dateLabel = (date: string) => format(parseISO(date), 'M月d日 EEEE', { locale: zhCN });

export default function App() {
  useScrollVisibility();
  const { preference, changeTheme } = useTheme();
  const { density, changeDensity } = useDensity();
  const [initialView] = useState(() => readViewState(isDemo));
  const [view, setView] = useState<View>(initialView.view);
  const [data, setData] = useState<Snapshot>({ tasks: [], categories: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [clock, setClock] = useState(new Date());
  const today = localDate(clock);
  const [month, setMonth] = useState(() => parseISO(initialView.month));
  const [selectedDay, setSelectedDay] = useState(initialView.selectedDay);
  const [monthPickerAnchor, setMonthPickerAnchor] = useState<HTMLElement | null>(null);
  const [categoryFilter, setCategoryFilter] = useState(initialView.categoryFilter);
  const [statusFilter, setStatusFilter] = useState<string>(initialView.statusFilter);
  const [query, setQuery] = useState(initialView.query);
  const [quickTitle, setQuickTitle] = useState('');
  const [recordFrom, setRecordFrom] = useState(initialView.recordFrom);
  const [recordTo, setRecordTo] = useState(initialView.recordTo);
  const [trash, setTrash] = useState<DeletedTask[]>([]);
  const [lastBackup, setLastBackup] = useState('');
  const [hasRecovery, setHasRecovery] = useState(false);
  const [editor, setEditor] = useState<{ task: Task; existing: boolean } | null>(null);
  const [categoryEditor, setCategoryEditor] = useState<Category | null>(null);
  const [confirmation, setConfirmation] = useState<{ title: string; body: ReactNode; action: () => Promise<void>; label: string; danger?: boolean } | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const notify = useCallback((text: string, error = false) => setToast({ text, error }), []);

  useEffect(() => {
    let disposed = false;
    let subscription: { unsubscribe: () => void } | undefined;
    initialize().then(() => {
      if (disposed) return;
      subscription = liveQuery(async () => ({ data: await snapshot(), trash: await db.trash.toArray(), backup: await db.meta.get('lastBackup'), recovery: await db.meta.get('beforeRestore') })).subscribe({ next: value => { setData(value.data); setTrash(value.trash); setLastBackup(value.backup?.value || ''); setHasRecovery(!!value.recovery); setLoading(false); }, error: e => { setLoadError(String(e)); setLoading(false); } });
    }).catch(e => { if (!disposed) { setLoadError(String(e)); setLoading(false); } });
    return () => { disposed = true; subscription?.unsubscribe(); };
  }, []);
  useEffect(() => { const timer = setInterval(() => setClock(new Date()), 30000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), toast.error ? 10000 : 4000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { if (!loading && categoryFilter !== 'all' && categoryFilter !== 'none' && !data.categories.some(c => c.id === categoryFilter)) setCategoryFilter('all'); }, [data.categories, categoryFilter, loading]);
  useEffect(() => {
    if (!loading && !loadError) saveViewState(isDemo, { view, month: format(month, 'yyyy-MM-01'), selectedDay, categoryFilter, statusFilter: statusFilter as typeof initialView.statusFilter, query, recordFrom, recordTo });
  }, [view, month, selectedDay, categoryFilter, statusFilter, query, recordFrom, recordTo, loading, loadError]);

  async function run(action: () => Promise<void>, message?: string) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { await action(); if (message) notify(message); }
    catch (e) { notify(e instanceof Error ? e.message : '操作失败，请重试', true); }
    finally { busyRef.current = false; setBusy(false); }
  }
  function navigate(target: View) { setView(target); setQuery(''); setStatusFilter('all'); }
  function create(date = '') { setEditor({ task: { ...emptyTask(date), categoryId: categoryFilter !== 'all' && categoryFilter !== 'none' ? categoryFilter : '' }, existing: false }); }
  const filtered = data.tasks.filter(t => categoryFilter === 'all' || (categoryFilter === 'none' ? !t.categoryId : t.categoryId === categoryFilter));
  const groups = todayGroups(filtered, today);
  const openToday = actionableToday(filtered, today);
  const doneToday = filtered.filter(t => t.status === 'done' && t.completedAt && localDate(parseISO(t.completedAt)) === today);
  const categories = new Map(data.categories.map(c => [c.id, c]));
  function toggleTask(task: Task) {
    if (busyRef.current) return;
    const updated = setStatus(task, task.status === 'done' ? 'todo' : 'done');
    setData(previous => ({ ...previous, tasks: previous.tasks.map(t => t.id === task.id ? updated : t) }));
    void run(async () => {
      try { await saveTask(updated); }
      catch (error) { setData(await snapshot()); throw error; }
    }, task.status === 'done' ? '任务已重新打开' : '任务已完成');
  }
  const reschedule = (task: Task, tomorrow: boolean) => run(() => saveTask(rescheduleTask(task, shiftDate(today, tomorrow ? 1 : 0))), tomorrow ? '已安排到明天，保留安排跨度，交付截止不变' : '已安排到今天，保留安排跨度，交付截止不变');
  const row = (task: Task) => <TaskRow key={task.id} task={task} category={categories.get(task.categoryId)} onOpen={() => setEditor({ task, existing: true })} disabled={busy} onToggle={() => toggleTask(task)} onSchedule={task.status !== 'done' && !plannedOnDate(task, today) ? tomorrow => { void reschedule(task, tomorrow); } : undefined} />;
  function selectMonth(next: Date) { setMonth(next); setSelectedDay(isSameMonth(next, clock) ? today : localDate(next)); }
  function changeMonth(offset: number) { const next = addMonths(month, offset); if (next.getFullYear() >= 1 && next.getFullYear() <= 9999) selectMonth(next); }
  async function exportBackup() {
    const backup = makeBackup(await snapshot());
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `日序备份-${format(new Date(), 'yyyyMMdd-HHmmss')}.json`; link.click();
    await db.meta.put({ key: 'lastBackup', value: new Date().toISOString() });
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  async function readImport(file?: File) {
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('备份文件超过 10 MB，请选择较小的备份。');
      let raw: unknown;
      try { raw = JSON.parse(await file.text()); } catch { throw new Error('无法读取该文件，请选择有效的 JSON 备份。'); }
      const imported = parseBackup(raw);
      setConfirmation({ title: '从备份恢复？', body: <><p>备份包含 {imported.tasks.length} 项任务和 {imported.categories.length} 个分类。</p><p>恢复会替换当前空间的全部任务和分类，并保留一份恢复前快照。回收站不变，建议先导出当前数据。</p><button className="button secondary" onClick={() => void run(exportBackup, '当前数据已导出')}><ArrowDownToLine size={15} />先导出当前数据</button></>, label: '确认恢复', action: async () => { await restoreBackup(imported); setConfirmation(null); setCategoryFilter('all'); notify('备份恢复成功'); } });
    } catch (e) { notify(e instanceof Error ? e.message : '导入失败', true); }
  }

  function todayPage() {
    const scheduled = groups.today.filter(t => dayTimeRange(t, today)).sort((a, b) => dayTimeRange(a, today)!.startTime.localeCompare(dayTimeRange(b, today)!.startTime));
    const deadlineTasks = [...groups.deadlines].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const urgent = deadlineTasks.filter(t => t.dueDate <= today);
    const urgentInLists = urgent.filter(t => t.plannedDate && t.plannedDate <= today);
    const urgentStandalone = urgent.filter(t => !t.plannedDate || t.plannedDate > today);
    const upcomingDeadlines = deadlineTasks.filter(t => t.dueDate > today);
    const urgentList = (tasks: Task[]) => <div className="urgent-list">{tasks.map(t => <button key={t.id} onClick={() => setEditor({ task: t, existing: true })}><span className="urgent-tag">{t.dueDate < today ? '已过截止' : '今天截止'}</span><strong>{t.title}</strong><ChevronRight size={14} /></button>)}</div>;
    const quickAdd = <form className="quick-add" onSubmit={event => { event.preventDefault(); const title = quickTitle.trim(); if (!title) return; void run(async () => { await saveTask({ ...emptyTask(today), title, categoryId: categoryFilter !== 'all' && categoryFilter !== 'none' ? categoryFilter : '' }); setQuickTitle(''); }, '任务已创建'); }}><Plus size={18} /><input aria-label="快速添加任务" placeholder="添加一项任务…" maxLength={200} value={quickTitle} onChange={e => setQuickTitle(e.target.value)} /><button className="icon-button" aria-label="提交快速任务" title="添加任务" disabled={busy || !quickTitle.trim()}><ArrowRight size={17} /></button></form>;
    return <>
      <div className="day-summary">
        <div><span className="metric-label"><Inbox size={15} />待办事项</span><strong>{openToday.length}<small>项</small></strong><span className="metric-caption">今日计划、遗留与到期待办，按任务去重</span></div>
        <div><span className="metric-label"><CheckCheck size={15} />今日已完成</span><strong className="text-green">{doneToday.length}<small>项</small></strong><span className="metric-caption">按今天的实际完成时间统计</span></div>
        <div><span className="metric-label"><Flag size={15} />高优先级待办</span><strong className="text-red">{openToday.filter(t => t.priority === 'high').length}<small>项</small></strong><span className="metric-caption">当前待办中需要优先处理的事项</span></div>
      </div>
      <div className="today-columns">
        <section className="task-column">
          {urgent.length > 0 && <section className="urgent-section"><SectionTitle title="到期需处理" count={urgent.length}><Flag size={15} /></SectionTitle>{urgentStandalone.length > 0 && urgentList(urgentStandalone)}{urgentInLists.length > 0 && <details className="urgent-overview"><summary><span>{urgentInLists.length} 项到期待办已列在下方清单</span><ChevronDown size={15} /></summary>{urgentList(urgentInLists)}</details>}</section>}
          <SectionTitle title="今日任务" count={groups.today.length}><button className="text-button" onClick={() => create(today)}><Plus size={15} />添加</button></SectionTitle>
          {quickAdd}
          {groups.today.length ? <div className="task-list">{groups.today.map(row)}</div> : <Empty title="今天，由你安排" description="记下一件想完成的事。" action={<button className="button secondary" onClick={() => create(today)}><Plus size={15} />添加今日任务</button>} />}
          <div className="carry-section"><SectionTitle title="之前未完成" count={groups.carry.length}>{groups.carry.length > 0 && <button className="text-button" onClick={() => setConfirmation({ title: '安排到今天？', body: <p>将当前分类下的 {groups.carry.length} 项遗留待办安排到今天，保留起止日期的跨度，交付截止日期保持不变。</p>, label: '全部安排到今天', action: async () => { await db.transaction('rw', db.tasks, async () => { for (const task of groups.carry) { const current = await db.tasks.get(task.id); if (current && current.status !== 'done' && current.plannedDate && lastPlannedDate(current) < today) await db.tasks.put(rescheduleTask(current, today)); } }); setConfirmation(null); notify('遗留待办已安排到今天'); } })}>全部安排到今天</button>}</SectionTitle>{groups.carry.length ? <div className="task-list">{groups.carry.map(row)}</div> : <div className="quiet-success"><CheckCheck size={17} />没有遗留待办</div>}</div>
        </section>
        <aside className="agenda-column">
          <SectionTitle title="时间安排" count={scheduled.length}><Clock3 size={16} className="muted" /></SectionTitle>
          <div className="agenda-date">{dateLabel(today)}<span>当天 {scheduledMinutes(scheduled, today)} 分钟</span></div>
          {scheduled.length ? <div className="agenda">{scheduled.map(task => <button className={`agenda-item ${task.status === 'done' ? 'completed' : ''}`} title={scheduleLabel(task)} key={task.id} onClick={() => setEditor({ task, existing: true })}>
            <span className="agenda-time">{dayTimeRange(task, today)!.startTime}<small>{dayTimeRange(task, today)!.endTime}</small></span><span className="agenda-event" style={{ borderLeftColor: categories.get(task.categoryId)?.color || '#007aff' }}><strong>{task.title}</strong><small>{task.status === 'done' ? '已完成' : categories.get(task.categoryId)?.name || '未分类'}{planEndDate(task) !== task.plannedDate ? ' · 跨日安排' : ''}</small></span>
          </button>)}</div> : <div className="quiet-block">今天没有定时事项</div>}
          <div className="deadline-section"><SectionTitle title="截止提醒" count={upcomingDeadlines.length} />{upcomingDeadlines.length ? upcomingDeadlines.map(task => <button className="deadline-item" key={task.id} onClick={() => setEditor({ task, existing: true })}><span className="deadline-icon"><Flag size={15} /></span><span><strong>{task.title}</strong><small>截止 {format(parseISO(task.dueDate), 'M月d日')}</small></span></button>) : <div className="quiet-block">未来三天没有待办截止</div>}</div>
        </aside>
      </div>
    </>;
  }

  function monthPage() {
    const entries = calendarEntries(filtered, selectedDay);
    const monthKey = format(month, 'yyyy-MM');
    const firstDay = localDate(startOfMonth(month));
    const lastDay = localDate(endOfMonth(month));
    const planned = filtered.filter(t => t.plannedDate && t.plannedDate <= lastDay && lastPlannedDate(t) >= firstDay);
    const selectedTasks = filtered.filter(t => plannedOnDate(t, selectedDay));
    return <div className="month-layout"><div className="month-main">
      <div className="calendar-toolbar"><div><h2><button className="month-trigger" aria-label="选择月历年月" title="选择年份和月份" aria-haspopup="dialog" aria-expanded={monthPickerAnchor?.getAttribute('aria-label') === '选择月历年月'} aria-controls="month-picker" onClick={event => setMonthPickerAnchor(event.currentTarget)}>{format(month, 'yyyy年 M月')}<ChevronDown size={15} /></button></h2><span>{planned.length} 项计划 · {filtered.filter(t => t.dueDate.startsWith(monthKey)).length} 项截止</span></div><div className="calendar-controls"><button className="button secondary small" onClick={() => { setMonth(startOfMonth(clock)); setSelectedDay(today); }}>本月</button><button className="icon-button" aria-label="上个月" title="上个月" onClick={() => changeMonth(-1)}><ChevronLeft size={18} /></button><button className="icon-button" aria-label="下个月" title="下个月" onClick={() => changeMonth(1)}><ChevronRight size={18} /></button></div></div>
      <div className="calendar-legend"><span><i className="legend-dot blue" />计划安排</span><span><i className="legend-dot red" />截止提示</span><span><Check size={12} />已完成</span></div>
      <div className="month-calendar">
        <div className="weekdays">{['一', '二', '三', '四', '五', '六', '日'].map((d, i) => <span key={d} className={i > 4 ? 'weekend' : ''}>周{d}</span>)}</div>
        <div className="calendar-grid">{monthDays(month).map(day => {
          const date = localDate(day); const dayEntries = calendarEntries(filtered, date); const selected = selectedDay === date;
          return <div key={date} data-date={date} className={`calendar-cell ${!isSameMonth(day, month) ? 'outside' : ''} ${selected ? 'selected' : ''}`} onClick={() => setSelectedDay(date)}>
            <button className={`day-number ${date === today ? 'is-today' : ''}`} aria-label={`查看${date}`} aria-pressed={selected} onClick={() => setSelectedDay(date)}>{format(day, 'd')}</button>
            <div className="calendar-events">{dayEntries.slice(0, 3).map(({ task, kind }) => <button key={`${task.id}-${kind}`} className={`calendar-event ${kind} ${task.status === 'done' ? 'completed' : ''}`} title={`${kind === 'due' ? '交付截止：' : ''}${task.title} · ${scheduleLabel(task)}`} onClick={e => { e.stopPropagation(); setSelectedDay(date); setEditor({ task, existing: true }); }}>
              {task.status === 'done' ? <Check size={10} /> : kind === 'due' ? <Flag size={10} /> : <i style={{ background: categories.get(task.categoryId)?.color || '#007aff' }} />}
              <span>{kind === 'due' ? '截止 · ' : task.plannedDate !== date ? (task.endTime && planEndDate(task) === date ? `至 ${task.endTime} · ` : '延续 · ') : task.startTime ? `${task.startTime} ` : ''}{task.title}</span>
            </button>)}{dayEntries.length > 3 && <button className="more-events" onClick={() => setSelectedDay(date)}>还有 {dayEntries.length - 3} 项</button>}</div>
          </div>;
        })}</div>
      </div>
      </div><section className="selected-day"><div className="day-inspector-heading"><span>{format(parseISO(selectedDay), 'EEEE', { locale: zhCN })}</span><strong>{format(parseISO(selectedDay), 'd')}</strong><small>{format(parseISO(selectedDay), 'yyyy年 M月')}</small></div><div className="day-workload"><span>{selectedTasks.length} 项计划</span><span><Clock3 size={13} />当天 {scheduledMinutes(selectedTasks, selectedDay)} 分钟</span></div><SectionTitle title={dateLabel(selectedDay)} count={entries.length}><button className="text-button" onClick={() => create(selectedDay)}><Plus size={15} />添加任务</button></SectionTitle>
        {entries.length ? <div className="selected-day-list">{entries.map(({ task, kind }) => { const range = dayTimeRange(task, selectedDay); return <button key={`${task.id}-${kind}`} className="day-detail-row" title={kind === 'plan' ? scheduleLabel(task) : `交付截止：${task.dueDate}`} onClick={() => setEditor({ task, existing: true })}><span className={`entry-kind ${kind}`}>{kind === 'due' ? '截止' : '计划'}</span><strong className={task.status === 'done' ? 'strike' : ''}>{task.title}</strong><span className="muted">{task.status === 'done' ? '已完成' : kind === 'plan' ? `${range ? `${range.startTime}–${range.endTime}` : '全天'}${planEndDate(task) !== task.plannedDate ? ' · 跨日' : ''}` : ''}</span><ChevronRight size={14} /></button>; })}</div> : <p className="quiet-block">这一天还没有安排。</p>}
      </section>
    </div>;
  }

  function futurePage() {
    const future = filtered.filter(t => t.status !== 'done' && t.plannedDate > today);
    const unscheduled = sortTasks(filtered.filter(t => t.status !== 'done' && !t.plannedDate));
    const dates = [...new Set(future.map(t => t.plannedDate))].sort();
    return <div className="future-columns"><section><SectionTitle title="接下来的安排" count={future.length} />{dates.length ? dates.map(date => <div className="future-group" key={date}><h3>{dateLabel(date)}<span>{format(parseISO(date), 'yyyy')}</span></h3><div className="task-list">{sortTasks(future.filter(t => t.plannedDate === date)).map(row)}</div></div>) : <Empty title="留一点空间给未来" description="提前记下下一步要做的工作。" action={<button className="button secondary" onClick={() => create(localDate(new Date(clock.getTime() + 86400000)))}><Plus size={15} />安排未来任务</button>} />}</section><section className="unscheduled-column"><SectionTitle title="尚未安排" count={unscheduled.length}><button className="text-button" onClick={() => create()}><Plus size={15} />记录</button></SectionTitle>{unscheduled.length ? unscheduled.map(row) : <div className="quiet-block">暂时没有未安排的任务</div>}</section></div>;
  }

  function historyPage() {
    const recordDate = (t: Task) => t.completedAt ? localDate(parseISO(t.completedAt)) : t.plannedDate || localDate(parseISO(t.createdAt));
    const tasks = sortTasks(filtered.filter(t => (statusFilter === 'all' || t.status === statusFilter) && (!recordFrom || recordDate(t) >= recordFrom) && (!recordTo || recordDate(t) <= recordTo) && `${t.title} ${t.notes} ${categories.get(t.categoryId)?.name || ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
    const dates = [...new Set(tasks.map(recordDate))].sort().reverse();
    return <><div className="records-toolbar"><div className="segmented" role="group" aria-label="任务状态筛选">{[['all', '全部'], ['todo', '待办'], ['doing', '进行中'], ['done', '已完成']].map(([id, label]) => <button key={id} aria-pressed={statusFilter === id} className={statusFilter === id ? 'active' : ''} onClick={() => setStatusFilter(id)}>{label}</button>)}</div><span className="muted">共 {tasks.length} 项任务</span></div><div className="record-dates"><label>开始日期<input type="date" aria-label="记录开始日期" value={recordFrom} onChange={e => setRecordFrom(e.target.value)} /></label><span>—</span><label>结束日期<input type="date" aria-label="记录结束日期" min={recordFrom || undefined} value={recordTo} onChange={e => setRecordTo(e.target.value)} /></label><button className="text-button" onClick={() => { setRecordFrom(shiftDate(today, -6)); setRecordTo(today); }}>最近 7 天</button>{(recordFrom || recordTo) && <button className="icon-button" title="清除日期筛选" aria-label="清除日期筛选" onClick={() => { setRecordFrom(''); setRecordTo(''); }}><X size={15} /></button>}</div><p className="record-note">按完成日期归档；未完成任务按计划日期，无计划日期时按创建日期。</p>{tasks.length ? <div className="record-list">{dates.map(date => <section className="record-date-group" key={date}><h3>{dateLabel(date)}<small>{format(parseISO(date), 'yyyy')}</small></h3>{tasks.filter(t => recordDate(t) === date).map(t => <div key={t.id}>{row(t)}{t.completedAt && <div className="completion-time">完成于 {format(parseISO(t.completedAt), 'yyyy年M月d日 HH:mm')}</div>}</div>)}</section>)}</div> : <Empty title={query ? '没有找到匹配的任务' : recordFrom || recordTo ? '这个日期范围没有记录' : '这里会留下你的工作足迹'} description={query ? '换一个关键词，或调整筛选条件。' : '记录、推进、完成，每一步都值得留存。'} />}</>;
  }

  function settingsPage() {
    return <div className="settings-content">
      <section className="settings-section"><SectionTitle title="外观" /><div className="setting-row theme-setting"><div><h3>页面主题</h3><p>跟随系统外观，或固定使用浅色、深色。</p></div><fieldset className="theme-picker"><legend className="visually-hidden">页面主题</legend>{([{ value: 'system', label: '跟随系统', icon: Monitor }, { value: 'light', label: '浅色', icon: Sun }, { value: 'dark', label: '深色', icon: Moon }] as const).map(({ value, label, icon: Icon }) => <label key={value}><input className="theme-option-input" type="radio" name="theme" value={value} checked={preference === value} onChange={() => { if (!changeTheme(value)) notify('当前主题已切换，但浏览器未能保存此选择。', true); }} /><Icon size={19} aria-hidden="true" /><span>{label}</span></label>)}</fieldset></div>
      <div className="setting-row theme-setting"><h3>显示密度</h3><fieldset className="theme-picker density-picker"><legend className="visually-hidden">显示密度</legend>{([{ value: 'standard', label: '标准', icon: List }, { value: 'comfortable', label: '舒适', icon: AlignJustify }] as const).map(({ value, label, icon: Icon }) => <label key={value}><input className="theme-option-input" type="radio" name="density" value={value} checked={density === value} onChange={() => { if (!changeDensity(value)) notify('显示密度已调整，但浏览器未能保存此选择。', true); }} /><Icon size={18} aria-hidden="true" /><span>{label}</span></label>)}</fieldset></div></section>
      <section className="settings-section"><SectionTitle title="工作分类"><button className="text-button" onClick={() => setCategoryEditor({ id: crypto.randomUUID(), name: '', color: colors[0] })}><Plus size={15} />新增分类</button></SectionTitle><div className="category-list">{data.categories.length ? data.categories.map(category => <div className="category-row" key={category.id}><i className="category-dot" style={{ background: category.color }} /><strong>{category.name}</strong><span>{data.tasks.filter(t => t.categoryId === category.id).length} 项任务</span><button className="icon-button" aria-label={`编辑分类：${category.name}`} title="编辑分类" onClick={() => setCategoryEditor(category)}><Pencil size={15} /></button><button className="icon-button danger" aria-label={`删除分类：${category.name}`} title="删除分类" onClick={() => setConfirmation({ title: '删除这个分类？', body: <p>“{category.name}”下的任务会保留，并变为未分类。</p>, label: '删除分类', danger: true, action: async () => { await deleteCategory(category.id); setConfirmation(null); notify('分类已删除，任务已保留'); } })}><Trash2 size={15} /></button></div>) : <p className="quiet-block">还没有分类。</p>}</div></section>
      <section className="settings-section"><SectionTitle title="数据与备份" /><div className="setting-row"><div><h3>导出数据</h3><p>导出任务、分类和完成记录，不含回收站及恢复前快照。</p></div><button className="button secondary" disabled={busy} onClick={() => void run(exportBackup, '备份已导出')}><ArrowDownToLine size={16} />导出备份</button></div><div className="setting-row"><div><h3>从备份恢复</h3><p>选择日序导出的 JSON 备份文件。</p></div><button className="button secondary" onClick={() => fileRef.current?.click()}><ArrowUpFromLine size={16} />恢复备份</button><input ref={fileRef} type="file" accept=".json,application/json" aria-label="选择备份文件" className="visually-hidden" onChange={e => { void readImport(e.target.files?.[0]); e.target.value = ''; }} /></div><div className="storage-note"><ShieldCheck size={20} /><div><strong>{isDemo ? '示例数据独立保存' : '数据保存在此浏览器'}</strong><p>当前共 {data.tasks.length} 项任务、{data.categories.length} 个分类。清除浏览器站点数据会删除本地记录，请定期导出备份。</p></div></div></section>
      <section className="settings-section"><SectionTitle title="恢复保障" /><div className="setting-row"><div><h3>上次导出</h3><p>{lastBackup ? format(parseISO(lastBackup), 'yyyy年M月d日 HH:mm') : '尚未导出备份，建议定期保存到本机文件夹。'}</p></div><ShieldCheck size={20} className="muted" /></div>{hasRecovery && <div className="setting-row"><div><h3>撤销上一次恢复</h3><p>返回最近一次导入或重置示例之前的数据。</p></div><button className="button secondary" disabled={busy} onClick={() => setConfirmation({ title: '返回恢复前的数据？', body: <p>当前任务和分类将被最近一次恢复前的快照替换。请先备份当前数据。</p>, label: '返回恢复前', action: async () => { await undoLastRestore(); setConfirmation(null); notify('已返回恢复前的数据'); } })}><RotateCcw size={15} />返回恢复前</button></div>}</section>
      <section className="settings-section"><SectionTitle title="回收站" count={trash.length} />{trash.length ? [...trash].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt)).map(deleted => <div className="trash-row" key={deleted.id}><div><strong>{deleted.task.title}</strong><small>删除于 {format(parseISO(deleted.deletedAt), 'yyyy/MM/dd HH:mm')}</small></div><button className="button secondary small" disabled={busy} onClick={() => void run(() => restoreDeletedTask(deleted.id), '任务已恢复')}><RotateCcw size={14} />恢复任务</button></div>) : <p className="quiet-block">没有已删除的任务。</p>}</section>
      <section className="settings-section"><SectionTitle title="示例空间" /><div className="setting-row"><div><h3>{isDemo ? '重新载入示例' : '体验完整案例'}</h3><p>{isDemo ? '恢复示例任务，正式空间不受影响。' : '在独立空间查看今天、月历与历史记录。'}</p></div>{isDemo ? <button className="button secondary" onClick={() => setConfirmation({ title: '重置示例空间？', body: <p>将替换当前示例空间的数据，正式空间不受影响。</p>, label: '重置示例', action: async () => { const cats = ['项目工作', '日常工作', '个人成长'].map((name, i) => ({ id: crypto.randomUUID(), name, color: colors[i] })); await restoreBackup({ tasks: demoData(today, cats), categories: cats }); setConfirmation(null); notify('示例已重置'); } })}><Sparkles size={16} />重置示例</button> : <a className="button secondary" href="/?demo=1"><Sparkles size={16} />打开示例</a>}</div></section>
      <p className="version">日序 Dayline <span>版本 0.2.0</span></p>
    </div>;
  }

  return <div className="app-shell">
    <aside className="sidebar"><div className="sidebar-top"><a className="brand" href={isDemo ? '/?demo=1' : '/'} aria-label="日序首页" onClick={event => { if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); navigate('today'); window.scrollTo(0, 0); } }}><img src="/calendar.svg" alt="" /><span>日序<small>DAYLINE</small></span></a><div className="workspace-name"><span className="personal-dot" />个人工作空间</div>
      <button className="new-task-button" onClick={() => create(view === 'today' ? today : view === 'month' ? selectedDay : '')}><Plus size={18} />新建任务</button>
      <div className="nav-caption">工作空间</div><nav aria-label="主导航">{navigation.map(({ id, label, icon: Icon }) => <button key={id} aria-label={label} title={label} aria-current={view === id ? 'page' : undefined} className={`nav-item ${view === id ? 'active' : ''}`} onClick={() => navigate(id)}><Icon size={18} strokeWidth={1.8} /><span>{label}</span>{id === 'today' && openToday.length > 0 && <small>{openToday.length}</small>}</button>)}</nav></div>
      <div className="sidebar-scroll" tabIndex={0} role="region" aria-label="分类与日历">
      <div className="sidebar-categories"><div className="nav-caption">工作分类<button className="icon-button" title="管理分类" aria-label="管理分类" onClick={() => navigate('settings')}><Plus size={14} /></button></div>{data.categories.map(c => <button key={c.id} className={`category-nav ${categoryFilter === c.id ? 'selected' : ''}`} onClick={() => { setCategoryFilter(categoryFilter === c.id ? 'all' : c.id); if (view === 'settings') navigate('history'); }}><i className="category-dot" style={{ background: c.color }} /><span>{c.name}</span><small>{data.tasks.filter(t => t.categoryId === c.id && t.status !== 'done').length}</small></button>)}</div>
      <div className="sidebar-mini-calendar"><div className="mini-month"><button className="month-trigger" aria-label="选择侧栏年月" title="选择年份和月份" aria-haspopup="dialog" aria-expanded={monthPickerAnchor?.getAttribute('aria-label') === '选择侧栏年月'} aria-controls="month-picker" onClick={event => setMonthPickerAnchor(event.currentTarget)}>{format(month, 'yyyy年 M月')}<ChevronDown size={12} /></button><button className="icon-button" aria-label="侧栏上个月" title="上个月" onClick={() => changeMonth(-1)}><ChevronLeft size={14} /></button><button className="icon-button" aria-label="侧栏下个月" title="下个月" onClick={() => changeMonth(1)}><ChevronRight size={14} /></button></div><div className="mini-grid">{['一', '二', '三', '四', '五', '六', '日'].map(d => <span key={d}>{d}</span>)}{monthDays(month).map(day => <button key={localDate(day)} className={`${!isSameMonth(day, month) ? 'outside' : ''} ${localDate(day) === today ? 'today' : ''} ${localDate(day) === selectedDay ? 'chosen' : ''}`} title={localDate(day)} aria-label={`侧栏查看${localDate(day)}`} onClick={() => { setSelectedDay(localDate(day)); setMonth(startOfMonth(day)); navigate('month'); }}>{format(day, 'd')}</button>)}</div></div>
      </div>
      <div className="sidebar-bottom">{isDemo && <div className="demo-note"><Sparkles size={15} /><span>示例空间</span><a href="/">进入我的日程 <ChevronRight size={12} /></a></div>}<button aria-label="设置" title="设置" className={`nav-item ${view === 'settings' ? 'active' : ''}`} aria-current={view === 'settings' ? 'page' : undefined} onClick={() => navigate('settings')}><Settings2 size={18} /><span>设置</span></button><div className="local-status"><i /><span>本地保存 · 离线可用</span><Database size={12} /></div></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb">我的工作空间<ChevronRight size={13} /><span>{viewTitles[view]}</span></div><label className="global-search"><Search size={16} /><input aria-label="搜索任务" placeholder="搜索任务" value={query} onChange={e => { setQuery(e.target.value); if (view !== 'history') { setView('history'); setStatusFilter('all'); } }} />{query && <button className="icon-button" title="清除搜索" aria-label="清除搜索" onClick={() => setQuery('')}><X size={14} /></button>}</label><div className="avatar" aria-label="个人工作空间">我</div></header>
      <main className={`workspace view-${view}`}><div className="page-header"><div><div className="eyebrow">{view === 'today' ? format(clock, 'yyyy年 M月 d日 EEEE', { locale: zhCN }) : view === 'month' ? 'CALENDAR' : view === 'future' ? 'UPCOMING' : view === 'history' ? 'LOGBOOK' : 'PREFERENCES'}</div><h1><span className={`page-symbol symbol-${view}`}>{view === 'today' ? <Sun size={25} /> : view === 'month' ? <CalendarDays size={25} /> : view === 'future' ? <Inbox size={25} /> : view === 'history' ? <History size={25} /> : <Settings2 size={25} />}</span>{viewTitles[view]}</h1></div><div className="page-actions">{view !== 'settings' && <label className="filter-select"><ListFilter size={15} /><select aria-label="工作分类筛选" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}><option value="all">全部分类</option><option value="none">未分类</option>{data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}{view === 'today' && !isDemo && data.tasks.length === 0 && <a className="button secondary demo-link" href="/?demo=1"><Sparkles size={15} />查看示例</a>}</div></div>
        {categoryFilter !== 'all' && view !== 'settings' && <div className="active-filter"><ListFilter size={14} /><span>正在筛选：{categoryFilter === 'none' ? '未分类' : categories.get(categoryFilter)?.name}</span><button onClick={() => setCategoryFilter('all')}><X size={13} />清除筛选</button></div>}
        {loading ? <div className="loading"><Loader2 className="spin" size={23} />正在打开工作空间…</div> : loadError ? <div className="load-error" role="alert"><h2>无法读取本地数据</h2><p>请允许浏览器保存站点数据，并重新打开页面。</p><small>{loadError}</small><button className="button secondary" onClick={() => location.reload()}>重试</button></div> : view === 'today' ? todayPage() : view === 'month' ? monthPage() : view === 'future' ? futurePage() : view === 'history' ? historyPage() : settingsPage()}
      </main><footer className="workspace-footer"><span>日序 · 让每一天有条不紊</span><span><ShieldCheck size={12} />{isDemo ? '独立示例空间' : '仅保存在本机'}</span></footer>
    </div>
    {monthPickerAnchor && <MonthPicker key={monthPickerAnchor.getAttribute('aria-label')} month={month} anchor={monthPickerAnchor} onClose={() => setMonthPickerAnchor(null)} onSelect={value => { selectMonth(parseISO(value)); setMonthPickerAnchor(null); navigate('month'); }} />}
    {editor && <TaskEditor key={editor.task.id} task={editor.task} tasks={data.tasks} categories={data.categories} onClose={() => setEditor(null)} onSave={async task => { await saveTask(task); setEditor(null); notify(editor.existing ? '任务已更新' : '任务已创建'); }} onDelete={editor.existing ? () => setConfirmation({ title: '删除这项任务？', body: <p>“{editor.task.title}”将移入回收站，可在设置中恢复。</p>, label: '删除任务', danger: true, action: async () => { await softDeleteTask(editor.task.id); setConfirmation(null); setEditor(null); notify('任务已移入回收站'); } }) : undefined} />}
    {categoryEditor && <CategoryEditor key={categoryEditor.id} category={categoryEditor} onClose={() => setCategoryEditor(null)} onSave={async category => { await saveCategory(category); setCategoryEditor(null); notify('分类已保存'); }} />}
    {confirmation && <Modal title={confirmation.title} onClose={() => { if (!busy) setConfirmation(null); }} className="confirm-modal"><div className="confirm-body">{confirmation.body}</div><footer className="modal-footer"><button className="button secondary" disabled={busy} onClick={() => setConfirmation(null)}>取消</button><button className={`button ${confirmation.danger ? 'destructive' : 'primary'}`} disabled={busy} onClick={() => void run(confirmation.action)}>{busy ? '处理中…' : confirmation.label}</button></footer></Modal>}
    {toast && <div className={`toast ${toast.error ? 'error' : ''}`} role={toast.error ? 'alert' : 'status'}>{toast.error ? <CircleHelp size={17} /> : <Check size={17} />}<span>{toast.text}</span><button aria-label="关闭提示" onClick={() => setToast(null)}><X size={14} /></button></div>}
  </div>;
}

function CategoryEditor({ category, onClose, onSave }: { category: Category; onClose: () => void; onSave: (c: Category) => Promise<void> }) {
  const [draft, setDraft] = useState(category); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  return <Modal title={category.name ? '编辑分类' : '新增分类'} onClose={busy ? () => {} : onClose} className="category-editor"><form onSubmit={async e => { e.preventDefault(); if (!draft.name.trim()) { setError('请填写分类名称'); return; } setBusy(true); try { await onSave({ ...draft, name: draft.name.trim() }); } catch (err) { setError(err instanceof Error ? err.message : '保存失败'); } finally { setBusy(false); } }}><div className="editor-body"><label className="field">分类名称<input autoFocus value={draft.name} maxLength={40} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label><fieldset className="color-picker"><legend>分类颜色</legend>{colors.map((color, i) => <button key={color} type="button" title={['蓝色', '绿色', '紫色', '橙色', '红色', '灰色'][i]} aria-label={['蓝色', '绿色', '紫色', '橙色', '红色', '灰色'][i]} aria-pressed={draft.color === color} style={{ background: color }} onClick={() => setDraft({ ...draft, color })}>{draft.color === color && <Check size={16} />}</button>)}</fieldset>{error && <p className="form-error" role="alert">{error}</p>}</div><footer className="modal-footer"><button className="button secondary" type="button" disabled={busy} onClick={onClose}>取消</button><button className="button primary" disabled={busy} type="submit">{busy ? '保存中…' : '保存分类'}</button></footer></form></Modal>;
}
