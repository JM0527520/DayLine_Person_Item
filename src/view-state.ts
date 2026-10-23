import { z } from 'zod';
import { isDate, localDate } from './domain';

export type View = 'today' | 'month' | 'future' | 'history' | 'settings';
const optionalDate = z.string().refine(value => !value || isDate(value));
const schema = z.object({
  view: z.enum(['today', 'month', 'future', 'history', 'settings']),
  month: z.string().refine(value => /^\d{4}-\d{2}-01$/.test(value) && isDate(value)),
  selectedDay: z.string().refine(isDate),
  categoryFilter: z.union([z.literal('all'), z.literal('none'), z.string().uuid()]),
  statusFilter: z.enum(['all', 'todo', 'doing', 'done']),
  query: z.string().max(10000),
  recordFrom: optionalDate,
  recordTo: optionalDate,
});
export type ViewState = z.infer<typeof schema>;
const key = (demo: boolean) => `dayline-navigation-${demo ? 'demo' : 'main'}`;

export function readViewState(demo: boolean): ViewState {
  const today = localDate();
  const fallback: ViewState = { view: 'today', month: `${today.slice(0, 7)}-01`, selectedDay: today, categoryFilter: 'all', statusFilter: 'all', query: '', recordFrom: '', recordTo: '' };
  try {
    const parsed = schema.safeParse(JSON.parse(localStorage.getItem(key(demo)) || 'null'));
    return parsed.success ? parsed.data : fallback;
  } catch { return fallback; }
}

export function saveViewState(demo: boolean, state: ViewState) {
  try { localStorage.setItem(key(demo), JSON.stringify(state)); }
  catch { /* Navigation remains usable when browser preferences cannot be saved. */ }
}
