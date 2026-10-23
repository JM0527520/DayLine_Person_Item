import { useId, useLayoutEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { CalendarDays, Check, X } from 'lucide-react';

export function MonthPicker({ month, anchor, onClose, onSelect }: { month: Date; anchor: HTMLElement; onClose: () => void; onSelect: (value: string) => void }) {
  const [year, setYear] = useState(String(month.getFullYear()));
  const [number, setNumber] = useState(format(month, 'MM'));
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useLayoutEffect(() => {
    const popup = ref.current!;
    const position = () => {
      const trigger = anchor.getBoundingClientRect();
      const clip = anchor.closest('.sidebar-scroll')?.getBoundingClientRect();
      if (!anchor.isConnected || !anchor.getClientRects().length || trigger.bottom < (clip?.top ?? 0) || trigger.top > (clip?.bottom ?? innerHeight)) {
        closeRef.current();
        return;
      }
      const gap = 8;
      const { width, height } = popup.getBoundingClientRect();
      const left = trigger.left;
      let top = trigger.bottom + gap;
      const above = top + height > innerHeight - gap;
      if (above) top = trigger.top - height - gap;
      popup.dataset.placement = above ? 'above' : 'below';
      popup.style.left = `${Math.max(gap, Math.min(left, innerWidth - width - gap))}px`;
      popup.style.top = `${Math.max(gap, Math.min(top, innerHeight - height - gap))}px`;
    };
    const onToggle = (event: Event) => { if ((event as ToggleEvent).newState === 'closed') closeRef.current(); };
    popup.addEventListener('toggle', onToggle);
    popup.showPopover();
    position();
    popup.querySelector('input')?.focus({ preventScroll: true });
    window.addEventListener('resize', position);
    document.addEventListener('scroll', position, true);
    return () => {
      const restoreFocus = popup.contains(document.activeElement);
      window.removeEventListener('resize', position);
      document.removeEventListener('scroll', position, true);
      popup.removeEventListener('toggle', onToggle);
      if (popup.matches(':popover-open')) popup.hidePopover();
      if (restoreFocus && anchor.isConnected) anchor.focus({ preventScroll: true });
    };
  }, [anchor]);

  return <div ref={ref} id="month-picker" popover="auto" role="dialog" aria-modal="false" aria-labelledby={titleId} className="month-picker" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } }}>
    <div className="month-picker-heading"><span id={titleId}><CalendarDays size={16} aria-hidden="true" />选择年月</span><button type="button" className="icon-button" aria-label="关闭年月选择" title="关闭" onClick={onClose}><X size={15} /></button></div>
    <form onSubmit={event => { event.preventDefault(); onSelect(`${String(Number(year)).padStart(4, '0')}-${number}-01`); }}>
      <label>年份<input aria-label="年份" type="number" required min={1} max={9999} step={1} value={year} onChange={event => setYear(event.target.value)} /></label>
      <label>月份<select aria-label="月份" value={number} onChange={event => setNumber(event.target.value)}>{Array.from({ length: 12 }, (_, index) => <option key={index} value={String(index + 1).padStart(2, '0')}>{index + 1} 月</option>)}</select></label>
      <button type="submit" className="month-picker-confirm" aria-label="跳转" title="确认跳转"><Check size={18} /></button>
    </form>
  </div>;
}
