import { useEffect } from 'react';

export function useScrollVisibility() {
  useEffect(() => {
    const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
    const reveal = (element: HTMLElement) => {
      if (element.scrollHeight <= element.clientHeight) return;
      clearTimeout(timers.get(element));
      element.classList.add('scroll-active');
      timers.set(element, setTimeout(() => {
        element.classList.remove('scroll-active');
        timers.delete(element);
      }, 1000));
    };
    const onScroll = (event: Event) => {
      const element = event.target === document ? document.documentElement : event.target;
      if (element instanceof HTMLElement) reveal(element);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const element = event.target instanceof Element
        ? event.target.closest<HTMLElement>('.sidebar-scroll, .modal, textarea') ?? document.documentElement
        : document.documentElement;
      const rect = element.getBoundingClientRect();
      const edge = element === document.documentElement ? window.innerWidth : rect.right;
      if (event.clientX >= edge - 14 && event.clientX <= edge) reveal(element);
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    document.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => {
      document.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('pointermove', onPointerMove);
      for (const [element, timer] of timers) {
        clearTimeout(timer);
        element.classList.remove('scroll-active');
      }
    };
  }, []);
}
