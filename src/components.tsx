import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowRightToLine, CalendarPlus, Check, CircleCheck, ChevronRight, Circle, Flag, Trash2, X, CalendarDays } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { emptyTask, lastPlannedDate, localDate, planEndDate, priorityLabels, rescheduleTask, scheduleLabel, scheduledMinutes, setStatus, statusLabels, taskSchema, timeConflicts, type Category, type Task } from './domain';

export function Modal({ title, children, onClose, className = '' }: { title: string; children: ReactNode; onClose: () => void; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const label = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    const cancel = (event: Event) => { event.preventDefault(); closeRef.current(); };
    dialog.addEventListener('cancel', cancel);
    return () => { dialog.removeEventListener('cancel', cancel); dialog.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className={`modal ${className}`} aria-labelledby={label}>
    <header className="modal-head"><h2 id={label}>{title}</h2><button type="button" className="icon-button" aria-label="关闭" title="关闭" onClick={onClose}><X size={19} /></button></header>
    {children}
  </dialog>;
}

export function TaskEditor({ task, tasks = [], categories, onClose, onSave, onDelete }: { task: Task; tasks?: Task[]; categories: Category[]; onClose: () => void; onSave: (task: Task) => Promise<void>; onDelete?: () => void }) {
  const [initialDraft] = useState(() => ({ ...task, plannedEndDate: planEndDate(task) }));
  const [draft, setDraft] = useState<Task>(initialDraft);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const scheduleId = useId();
  const deadlineId = useId();
  const change = <K extends keyof Task>(key: K, value: Task[K]) => { setError(''); setDraft(old => ({ ...old, [key]: value })); };
  const conflicts = timeConflicts(draft, tasks);
  const validDraft = taskSchema.safeParse({ ...draft, title: draft.title.trim() || '任务' }).success;
  const close = () => { if (JSON.stringify(initialDraft) !== JSON.stringify(draft) && !window.confirm('放弃尚未保存的修改？')) return; onClose(); };
  function changeStartDate(value: string) {
    setError('');
    if (!value) { setDraft(old => ({ ...old, plannedDate: '', plannedEndDate: '', startTime: '', endTime: '' })); return; }
    try { setDraft(rescheduleTask(draft, value)); }
    catch (e) { setError(e instanceof Error ? e.message : '无法调整日期'); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (draft.plannedDate && !draft.plannedEndDate) { setError('请填写结束日期；当天完成时选择与开始日期相同的日期。'); return; }
    const result = taskSchema.safeParse({ ...draft, title: draft.title.trim(), updatedAt: new Date().toISOString() });
    if (!result.success) { setError(result.error.issues[0].message); return; }
    setSaving(true);
    try { await onSave(result.data); } catch (e) { setError(e instanceof Error ? e.message : '保存失败，请重试'); } finally { setSaving(false); }
  }
  return <Modal title={onDelete ? '任务详情' : '新建任务'} onClose={saving ? () => {} : close} className="editor">
    <form onSubmit={submit}>
      <div className="editor-body">
        <label className="field title-field">任务名称<input aria-label="任务名称" autoFocus value={draft.title} placeholder="准备做些什么？" maxLength={200} onChange={e => change('title', e.target.value)} /></label>
        <div className="form-grid">
          <label className="field">状态<select aria-label="状态" value={draft.status} onChange={e => setDraft(setStatus(draft, e.target.value as Task['status']))}>{Object.entries(statusLabels).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label>
          <label className="field">优先级<select aria-label="优先级" value={draft.priority} onChange={e => change('priority', e.target.value as Task['priority'])}>{Object.entries(priorityLabels).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label>
        </div>
        <fieldset className="schedule-fields" aria-describedby={scheduleId}>
          <legend>工作安排</legend>
          <p id={scheduleId} className="schedule-note">开始、结束各对应本行日期；不填时间则按全天安排。</p>
          <div className="schedule-date-row">
            <label className="field">开始日期<input aria-label="开始日期" type="date" value={draft.plannedDate} onChange={e => changeStartDate(e.target.value)} /></label>
            <label className="field">开始时间<input aria-label="开始时间" aria-description={draft.plannedDate ? `对应 ${draft.plannedDate} 的开始时间` : '请先选择开始日期'} type="time" value={draft.startTime} onChange={e => change('startTime', e.target.value)} /></label>
          </div>
          <div className="schedule-date-row">
            <label className="field">结束日期<input aria-label="结束日期" type="date" value={draft.plannedEndDate} onChange={e => change('plannedEndDate', e.target.value)} /></label>
            <label className="field">结束时间<input aria-label="结束时间" aria-description={draft.plannedEndDate ? `对应 ${draft.plannedEndDate} 的结束时间` : '请先选择结束日期'} type="time" value={draft.endTime} onChange={e => change('endTime', e.target.value)} /></label>
          </div>
          {validDraft && draft.plannedDate && draft.plannedEndDate && <p className="schedule-summary">{scheduleLabel(draft)}{draft.startTime && draft.endTime && <span>共 {scheduledMinutes([draft])} 分钟</span>}</p>}
        </fieldset>
        <div className="deadline-field">
          <label className="field">交付截止日期<input aria-label="交付截止日期" aria-describedby={deadlineId} type="date" value={draft.dueDate} onChange={e => change('dueDate', e.target.value)} /></label>
          <p id={deadlineId} className="schedule-note">任务最晚完成的日期，包含当天；独立于工作安排，可不填。</p>
        </div>
        {validDraft && draft.plannedDate && draft.dueDate && lastPlannedDate(draft) > draft.dueDate && <p className="hint warning">工作安排超出交付截止日期，请留意安排。仍可保存。</p>}
        {conflicts.length > 0 && <p className="conflict-warning" role="status">时间重叠：{conflicts.map(t => `${t.title}（${scheduleLabel(t)}）`).join('、')}。仍可保存。</p>}
        <label className="field">工作分类<select aria-label="工作分类" value={draft.categoryId} onChange={e => change('categoryId', e.target.value)}><option value="">未分类</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="field">备注<textarea aria-label="备注" rows={3} value={draft.notes} maxLength={10000} placeholder="补充细节、想法或工作进展…" onChange={e => change('notes', e.target.value)} /></label>
        {draft.completedAt && <p className="hint success"><Check size={14} /> 完成于 {format(parseISO(draft.completedAt), 'yyyy/MM/dd HH:mm')}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <footer className="modal-footer">{onDelete && <button className="icon-button danger" type="button" aria-label="删除任务" title="删除任务" disabled={saving} onClick={onDelete}><Trash2 size={18} /></button>}<span className="spacer" /><button type="button" className="button secondary" disabled={saving} onClick={close}>取消</button><button className="button primary" type="submit" disabled={saving}>{saving ? '保存中…' : '保存任务'}</button></footer>
    </form>
  </Modal>;
}

export function Empty({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="empty"><div className="empty-icon"><CalendarDays size={29} strokeWidth={1.4} /></div><h3>{title}</h3>{description && <p>{description}</p>}{action}</div>;
}

export function TaskRow({ task, category, onOpen, onToggle, onSchedule, disabled = false }: { task: Task; category?: Category; onOpen: () => void; onToggle: () => void; onSchedule?: (tomorrow: boolean) => void; disabled?: boolean }) {
  const date = localDate();
  const overdue = task.status !== 'done' && !!task.dueDate && task.dueDate < date;
  return <div className={`task-row ${task.status === 'done' ? 'completed' : ''}`} data-testid="task-row">
    <input className="task-check" type="checkbox" aria-label={`${task.status === 'done' ? '重新打开' : '完成'}：${task.title}`} checked={task.status === 'done'} onChange={onToggle} disabled={disabled} />
    <button className="task-open" onClick={onOpen}>
      <span className="task-title">{task.title}{task.status === 'doing' && <span className="status-dot" title="进行中">进行中</span>}</span>
      <span className="task-meta">{category && <span><i className="category-dot" style={{ background: category.color }} />{category.name}</span>}{task.plannedDate && <span><CalendarDays size={12} />{scheduleLabel(task)}</span>}{task.dueDate && <span className={overdue ? 'text-red' : ''}>{overdue ? '已过截止 · ' : '交付截止 '}{format(parseISO(task.dueDate), 'yyyy年M月d日')}</span>}{task.status === 'done' && <span className="text-green">已完成</span>}</span>
    </button>
    {onSchedule && <span className="row-actions"><button className="icon-button" title="安排到今天" aria-label={`安排到今天：${task.title}`} disabled={disabled} onClick={() => onSchedule(false)}><ArrowRightToLine size={15} /></button><button className="icon-button" title="改到明天" aria-label={`改到明天：${task.title}`} disabled={disabled} onClick={() => onSchedule(true)}><CalendarPlus size={15} /></button></span>}
    {task.status === 'done'
      ? <span className="completion-indicator" title="已完成" aria-label="已完成"><CircleCheck size={18} aria-hidden="true" /></span>
      : <span className={`priority-indicator ${task.priority}`} title={`${statusLabels[task.status]} · ${priorityLabels[task.priority]}`} aria-label={priorityLabels[task.priority]}><Flag size={14} aria-hidden="true" fill={task.priority === 'high' ? 'currentColor' : 'none'} /></span>}
    <ChevronRight size={15} className="row-chevron" />
  </div>;
}

export function SectionTitle({ title, count, children }: { title: string; count?: number; children?: ReactNode }) {
  return <div className="section-title"><h2>{title}{count !== undefined && <span>{count}</span>}</h2>{children}</div>;
}

export { emptyTask, Circle };
