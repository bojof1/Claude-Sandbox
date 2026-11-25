/**
 * Why Loop data: what is saved in RemNote synced storage, how to read it safely,
 * and how to merge two edits so one device does not erase another's changes.
 */

export const DAY = 24 * 60 * 60 * 1000;
/** Synced storage key. Do not change it, or existing data stops loading. */
export const KEY = 'wl-data';

export interface Lecture {
  id: string;
  course: string;
  name: string;
  /** When the lecture was started. */
  t: number;
  /** The RemNote page the lecture is linked to. */
  remId?: string;
  done: boolean[];
  /** When the map was last redrawn from memory. */
  redrawn?: number;
  /** Which step the guide is on. */
  step?: number;
  /** Quick test score: [right, total]. */
  quick?: [number, number];
  /** Teach it: the explanation written from memory. */
  teach?: string;
  /** Teach it: the three self-checks. */
  teachOk?: boolean[];
}

export interface Miss {
  id: string;
  t: number;
  where: string;
  question: string;
  said: string;
  right: string;
  /** When the re-test is due. */
  due: number;
  /** When it was fixed on a re-test. */
  closed?: number;
  lectureId?: string;
}

export interface Week {
  t: number;
  course: string;
  right: number;
  total: number;
}

export interface Data {
  lectures: Lecture[];
  misses: Miss[];
  weeks: Week[];
  /** Exam date per course, as yyyy-mm-dd. */
  exams: Record<string, string>;
  /** Manual "full" or "cards" choice per course. */
  override: Record<string, string>;
  /** Day of the week for the weekly review, 0 = Sunday. */
  weeklyDay?: number;
}

export const EMPTY: Data = { lectures: [], misses: [], weeks: [], exams: {}, override: {} };

/** Turn whatever is in storage into valid Data, dropping anything malformed. */
export function normalize(raw: any): Data {
  const list = (v: any): any[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
  const obj = (v: any) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  return {
    lectures: list(raw?.lectures)
      .filter((l) => typeof l.id === 'string')
      .map((l) => ({
        ...l,
        course: String(l.course ?? ''),
        name: String(l.name ?? ''),
        t: Number.isFinite(l.t) ? l.t : Date.now(),
        done: Array.isArray(l.done) ? l.done : [],
      })),
    misses: list(raw?.misses)
      .filter((m) => typeof m.id === 'string')
      .map((m) => ({
        ...m,
        t: Number.isFinite(m.t) ? m.t : Date.now(),
        due: Number.isFinite(m.due) ? m.due : Date.now(),
      })),
    weeks: list(raw?.weeks).filter((w) => typeof w.t === 'number'),
    exams: obj(raw?.exams),
    override: obj(raw?.override),
    weeklyDay: typeof raw?.weeklyDay === 'number' ? raw.weeklyDay : undefined,
  };
}

/**
 * Three-way merge. `base` is what this device last loaded, `mine` is this device's
 * edit, `theirs` is what is in storage now. Only the items this device changed
 * overwrite storage, so edits made elsewhere in the meantime survive.
 */
export function merge(base: Data, mine: Data, theirs: Data): Data {
  const mergeList = <T>(b: T[], m: T[], t: T[], key: (x: T) => string): T[] => {
    const before = new Map(b.map((x) => [key(x), JSON.stringify(x)]));
    const mineMap = new Map(m.map((x) => [key(x), x]));
    const out = new Map(t.map((x) => [key(x), x]));
    for (const k of before.keys()) if (!mineMap.has(k)) out.delete(k);
    for (const [k, x] of mineMap) if (before.get(k) !== JSON.stringify(x)) out.set(k, x);
    return [...out.values()];
  };
  const mergeObj = (b: Record<string, any>, m: Record<string, any>, t: Record<string, any>) => {
    const out = { ...t };
    for (const k of Object.keys(b)) if (!(k in m)) delete out[k];
    for (const k of Object.keys(m)) if (JSON.stringify(b[k]) !== JSON.stringify(m[k])) out[k] = m[k];
    return out;
  };
  return {
    lectures: mergeList(base.lectures, mine.lectures, theirs.lectures, (l) => l.id),
    misses: mergeList(base.misses, mine.misses, theirs.misses, (m) => m.id),
    weeks: mergeList(base.weeks, mine.weeks, theirs.weeks, (w) => `${w.t}|${w.course}`),
    exams: mergeObj(base.exams, mine.exams, theirs.exams),
    override: mergeObj(base.override, mine.override, theirs.override),
    weeklyDay: mine.weeklyDay !== base.weeklyDay ? mine.weeklyDay : theirs.weeklyDay,
  };
}

export const uid = () => Math.random().toString(36).slice(2, 10);
export const day = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
export const pct = (right: number, total: number) => (total ? Math.round((100 * right) / total) : 0);
export const lectureLabel = (l: Lecture) => `${l.course ? `${l.course}: ` : ''}${l.name}`;
