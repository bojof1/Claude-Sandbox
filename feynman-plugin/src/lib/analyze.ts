/**
 * The checker. Pure functions with no RemNote calls, so they can be tested on their own.
 *
 * It compares a typed explanation with the notes on a page:
 *  - coverage: which main points (and details) the explanation touched, by matching key words
 *  - reasons: how many "because" type links the explanation gives
 *  - big words: note terms and long words used without a plain meaning next to them
 *  - reading level: a grade level for the explanation (simpler is better)
 *  - order: for a process, steps told in a different order than the notes
 *  - hand-waving: words like "somehow" that hide a gap
 */

export type Shape = 'Thing' | 'Process' | 'Calculation';

/** One idea from the notes. */
export interface Point {
  id: string;
  /** The note text, as written. */
  text: string;
  /** The main point it belongs to (its own text for a main point). */
  area: string;
  /** Up to 6 key words that show the idea was explained (cut to their stems, for matching). */
  terms: string[];
  /** The same key words as they are spelled in the notes, for showing. */
  show: string[];
  /** Position in the notes, top to bottom. */
  order: number;
  /** True for a main point (a direct child of the page, or the level used as main points). */
  main: boolean;
}

/** A Rem as the checker sees it. */
export interface NoteNode {
  id: string;
  text: string;
  children: NoteNode[];
}

export type Hit = 'hit' | 'part' | 'miss';

export interface PointResult {
  id: string;
  status: Hit;
  /** Which key words were found. */
  found: string[];
  /** Index in the explanation where the idea first came up (-1 if not). */
  at: number;
}

export interface Check {
  words: number;
  sentences: number;
  grade: number;
  points: PointResult[];
  coverage: number | null;
  strongReasons: number;
  chainLinks: number;
  bigWords: string[];
  vague: string[];
  analogy: boolean;
  orderSwaps: [string, string][];
  hasNumbers: boolean;
}

// ---------- Words ----------

const STOP = new Set(
  (
    'a an the and or but if then than so as at by for from in into of on onto to with without within ' +
    'is are was were be been being am do does did done doing have has had having will would can could ' +
    'should shall may might must it its it\'s this that these those there here their them they he she ' +
    'his her him we us our you your i me my mine what which who whom whose when where why how all any ' +
    'both each few more most other some such no nor not only own same too very just also about above ' +
    'after again against below between down during further once out over under until up while because ' +
    'before through off per via vs etc ie eg get gets got make makes made use uses used using like ' +
    'one two three first second third next last new many much well way ways thing things stuff lot lots ' +
    'part parts kind type types called call calls see seen say says said go goes went come comes take ' +
    'takes took give gives gave keep keeps put puts let lets help helps show shows want need needs ' +
    'often usually always never sometimes really basically actually even still yet ever every something ' +
    'anything everything nothing someone somebody example examples e.g. i.e. note notes slide slides ' +
    'lecture page question questions answer answers important main key idea ideas point points also ' +
    'turn turns turned happen happens happened lead leads led cause causes caused result results ' +
    'step steps start starts started end ends work works worked done able less little big small high low ' +
    'increase increases increased decrease decreases decreased change changes changed effect effects ' +
    'role roles function functions involved include includes including different same similar ' +
    'whether either neither however therefore thus hence since though although while yes okay ok ' +
    'structure structures mechanism mechanisms overview summary definition definitions intro introduction ' +
    'background review topic topics concept concepts basics process processes turning'
  ).split(/\s+/),
);

/** Words of the text, with their original spelling and where they start. */
export function words(text: string): { w: string; raw: string; at: number }[] {
  const out: { w: string; raw: string; at: number }[] = [];
  const re = /[\p{L}\p{N}](?:[\p{L}\p{N}'’-]*[\p{L}\p{N}])?/gu;
  let m: RegExpExecArray | null;
  const s = text || '';
  while ((m = re.exec(s))) out.push({ w: m[0].toLowerCase().replace(/[’']s$/, ''), raw: m[0], at: m.index });
  return out;
}

/** Cut word endings so "activates", "activated" and "activation" meet. */
export function stem(word: string): string {
  let w = word.toLowerCase().replace(/[’']s$/, '');
  if (w.length <= 4 || /\d/.test(w)) return w;
  const ends = ['izations', 'ization', 'ations', 'ation', 'ments', 'ment', 'ingly', 'edly', 'ings', 'ing', 'ness', 'ions', 'ion', 'ers', 'er', 'ies', 'ied', 'ed', 'es', 'ly', 's'];
  for (const e of ends) {
    if (w.endsWith(e) && w.length - e.length >= 4) {
      w = w.slice(0, -e.length);
      if (e === 'ies' || e === 'ied') w += 'y';
      break;
    }
  }
  return w;
}

/** Same word, allowing small ending differences ("activ" vs "activate"). */
export function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  return s.length >= 5 && l.startsWith(s) && l.length - s.length <= 3;
}

/** A word worth checking for: not a common word, and long enough or technical. */
function isKey(raw: string): boolean {
  const w = raw.toLowerCase();
  if (STOP.has(w) || STOP.has(stem(w))) return false;
  if (/^\d+$/.test(w)) return false; // plain numbers say little
  if (/\d/.test(w) && /\p{L}/u.test(w)) return true; // IP3, mTORC1
  if (/^\p{Lu}[\p{L}]*\p{Lu}/u.test(raw) && raw.length >= 2) return true; // GTP, cAMP-like caps
  return w.length >= 4;
}

// ---------- Notes into points ----------

/** Text that is only a prompt ("What turns it on?") is a heading, not content. */
const isQuestion = (t: string) => /\?\s*$/.test(t.trim());

/**
 * Turn a page's outline into points. Main points are the page's children, unless there are fewer
 * than 3, then the next level down is used. Details are everything below, up to `maxDetails`.
 */
export function buildPoints(root: NoteNode, conceptName: string, maxDetails = 40): Point[] {
  const nameStems = words(conceptName).map((x) => stem(x.w));
  let mains = root.children.filter((c) => c.text.trim());
  // a page with one or two headings: look one level down for the real points
  if (mains.length < 3) {
    const lower = mains.flatMap((m) => (m.children.length ? m.children.filter((c) => c.text.trim()) : [m]));
    if (lower.length > mains.length) mains = lower;
  }
  const raw: { id: string; text: string; area: string; main: boolean; bag: string[] }[] = [];
  const own = (n: NoteNode) => (isQuestion(n.text) && n.children.length ? '' : n.text);
  const subtreeText = (n: NoteNode, depth = 0): string =>
    [own(n), ...(depth < 6 ? n.children.map((c) => subtreeText(c, depth + 1)) : [])].join(' ');
  for (const m of mains) {
    const area = m.text.trim();
    raw.push({ id: m.id, text: area, area, main: true, bag: [subtreeText(m)] });
  }
  // details, breadth first under each main point, so the biggest ideas come first
  const details: typeof raw = [];
  for (const m of mains) {
    const queue = [...m.children];
    while (queue.length && details.length < maxDetails) {
      const n = queue.shift()!;
      if (n.text.trim() && own(n)) details.push({ id: n.id, text: n.text.trim(), area: m.text.trim(), main: false, bag: [subtreeText(n)] });
      queue.push(...n.children);
    }
  }
  const all = [...raw, ...details];
  // how many points use each word: rare words say the most about one point
  const df = new Map<string, number>();
  const keyStems = all.map((p) => {
    const set = new Map<string, string>();
    for (const x of words(p.bag.join(' '))) {
      if (!isKey(x.raw)) continue;
      const s = stem(x.w);
      if (nameStems.some((n) => sameWord(n, s))) continue; // saying the topic's own name proves nothing
      if (!set.has(s)) set.set(s, x.raw);
    }
    for (const s of set.keys()) df.set(s, (df.get(s) || 0) + 1);
    return set;
  });
  // words from the point's own line count more than words from below it
  return all.map((p, i) => {
    const ownStems = new Set(words(p.text).map((x) => stem(x.w)));
    const ranked = [...keyStems[i].entries()].sort(
      (a, b) =>
        (ownStems.has(b[0]) ? 1 : 0) - (ownStems.has(a[0]) ? 1 : 0) ||
        (df.get(a[0]) || 0) - (df.get(b[0]) || 0) ||
        b[0].length - a[0].length,
    );
    const terms: string[] = [];
    const show: string[] = [];
    // a line of only numbers and units (a worked example): its numbers are what show it was said
    if (!ranked.length)
      for (const x of words(p.bag.join(' '))) if (/\d/.test(x.w) && !terms.includes(x.w) && terms.length < 4) {
          terms.push(x.w);
          show.push(x.raw);
        }
    for (const [s, w] of ranked) {
      if (terms.some((t) => sameWord(t, s))) continue;
      terms.push(s);
      show.push(w);
      if (terms.length >= 6) break;
    }
    return { id: p.id, text: p.text, area: p.area, terms, show, order: i, main: p.main };
  }).filter((p) => p.terms.length > 0);
}

/** All the text in an outline, one line per Rem. */
export function allText(n: NoteNode, depth = 0): string {
  return [n.text, ...(depth < 8 ? n.children.map((c) => allText(c, depth + 1)) : [])].join('\n');
}

/** Pick a shape from what the notes look like (pass the page's text, or its points). */
export function guessShape(from: Point[] | string): Shape {
  const text = typeof from === 'string' ? from : from.map((p) => p.text).join('\n');
  const mathy = (text.match(/[=×÷^]|\d+\s*(mg|ml|mm|µ|um|nm|mol|m\/s|kg|%)/gi) || []).length;
  if (mathy >= 3) return 'Calculation';
  const steppy = (text.match(/→|->|=>|\bstep\b|\bthen\b|\bnext\b|\bfinally\b|^\s*\d+[.)]/gim) || []).length;
  if (steppy >= 3) return 'Process';
  return 'Thing';
}

// ---------- Checking an explanation ----------

const STRONG = /\b(because|since|so that|in order to|that'?s why|this is why|which is why|therefore|as a result|due to|the reason)\b/gi;
const CHAIN = /\b(leads? to|causes?|caus(ed|ing)|results? in|which (makes|means|lets|turns|triggers|activates|blocks|stops)|so|then|triggers?|that makes)\b/gi;
const EXPLAIN_CUE =
  /\b(means?|meaning|is (a|an|the|like|when|how|basically)|are (a|the|like|when|basically)|which (is|are|means)|called|basically|in other words|think of|like a|like an|kind of like|that is|aka|i\.e)\b|[(:—]| - /i;
/** "cAMP, a small messenger" or "cyclase, which makes" */
const APPOSITIVE = /^(\s+\S+){0,2}\s*,\s*(a|an|the|which|that|or|aka)\b/i;
/** "the beta-gamma part": naming what kind of thing it is */
const CATEGORY = /^(\s+\S+){0,2}\s+(part|piece|protein|enzyme|molecule|cell|cells|chemical|signal|messenger|receptor|switch|gene|hormone|drug|organ|nerve|region|area)s?\b/i;

function partTechnical(raw: string, w: string, s: string, noteSet: Set<string>): boolean {
  return (
    (/\d/.test(raw) && /\p{L}/u.test(raw)) ||
    /\p{Ll}\p{Lu}/u.test(raw) ||
    (/^\p{Lu}{2,}/u.test(raw) && raw.length >= 2) ||
    (w.length >= 9 && [...noteSet].some((n) => sameWord(n, s))) ||
    w.length >= 13
  );
}
/** A word a 12-year-old would not know. Hyphen words count only if one of their parts does. */
function isTechnical(raw: string, w: string, s: string, noteSet: Set<string>): boolean {
  if (/[-‐]/.test(raw)) return raw.split(/[-‐]/).some((part) => part.length > 1 && partTechnical(part, part.toLowerCase(), stem(part), noteSet));
  return partTechnical(raw, w, s, noteSet);
}

const VAGUE = /\b(somehow|some ?how|magically|stuff|whatever|etc|something happens|does (its|it'?s) thing|and so on)\b/gi;
const ANALOGY = /\b(like \w+ing|like a|like an|like the|imagine|think of|similar to|just like|as if|picture (a|this|it))\b/i;

/** Rough syllable count for the reading level. */
function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 1;
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

export function readingGrade(text: string): { words: number; sentences: number; grade: number } {
  const ws = words(text).filter((x) => /\p{L}/u.test(x.raw));
  const n = ws.length;
  if (!n) return { words: 0, sentences: 0, grade: 0 };
  const sentences = Math.max(1, (text.match(/[.!?]+(\s|$)|\n+/g) || []).length);
  const syl = ws.reduce((s, x) => s + syllables(x.raw), 0);
  const grade = 0.39 * (n / sentences) + 11.8 * (syl / n) - 15.59;
  return { words: n, sentences, grade: Math.max(0, Math.round(grade * 10) / 10) };
}

/**
 * Check an explanation against points.
 * `noteWords` is every key word in the notes, used to spot jargon.
 */
export function check(text: string, points: Point[], shape: Shape, noteWords: string[] = []): Check {
  const t = (text || '').slice(0, 50000); // a guard against pasting a whole book
  const ws = words(t);
  const stems = ws.map((x) => ({ s: stem(x.w), at: x.at }));
  const firstAt = (term: string) => {
    for (const x of stems) if (sameWord(x.s, term)) return x.at;
    return -1;
  };
  const results: PointResult[] = points.map((p) => {
    const found: string[] = [];
    let at = -1;
    for (const term of p.terms) {
      const i = firstAt(term);
      if (i >= 0) {
        found.push(term);
        if (at < 0 || i < at) at = i;
      }
    }
    const need = Math.min(2, p.terms.length);
    const status: Hit = found.length >= need || found.length / p.terms.length >= 0.5 ? 'hit' : found.length ? 'part' : 'miss';
    return { id: p.id, status, found, at };
  });
  const coverage = results.length
    ? results.reduce((s, r) => s + (r.status === 'hit' ? 1 : r.status === 'part' ? 0.4 : 0), 0) / results.length
    : null;

  const strongReasons = (t.match(STRONG) || []).length;
  const chainLinks = (t.match(CHAIN) || []).length + (t.match(/→|->/g) || []).length;

  // big words: note terms or very long words, used with no plain meaning nearby
  const noteSet = new Set(noteWords);
  const sentences = t.split(/(?<=[.!?])\s+|\n+/).filter((s) => s.trim());
  const seen = new Set<string>();
  const bigWords: string[] = [];
  sentences.forEach((sent, si) => {
    for (const x of words(sent)) {
      const s = stem(x.w);
      if (seen.has(s)) continue;
      if (!isTechnical(x.raw, x.w, s, noteSet) || STOP.has(x.w)) continue;
      seen.add(s);
      const after = sent.slice(x.at + x.raw.length, x.at + x.raw.length + 70);
      const next = sentences[si + 1] || '';
      const explained =
        EXPLAIN_CUE.test(after) ||
        APPOSITIVE.test(after) ||
        CATEGORY.test(after) ||
        // "...kinase. It is an enzyme that..." explains the last word of the sentence before
        (words(after).length <= 2 &&
          /^\s*(it|this|that|they|these)( \w+)?\s+(is|are|means|works|acts)\s+(a|an|the|like|when|how|what|basically|kind|sort|just)\b/i.test(next));
      if (!explained) bigWords.push(x.raw);
    }
  });

  const vague = [...new Set((t.match(VAGUE) || []).map((v) => v.toLowerCase()))];

  // for a process: covered steps told in a different order than the notes
  const orderSwaps: [string, string][] = [];
  if (shape === 'Process') {
    const told = points
      .map((p, i) => ({ p, r: results[i] }))
      .filter((x) => x.p.main && x.r.status !== 'miss' && x.r.at >= 0);
    for (let i = 0; i + 1 < told.length && orderSwaps.length < 3; i++)
      if (told[i].r.at > told[i + 1].r.at) orderSwaps.push([told[i + 1].p.text, told[i].p.text]);
  }

  const g = readingGrade(t);
  return {
    words: g.words,
    sentences: g.sentences,
    grade: g.grade,
    points: results,
    coverage,
    strongReasons,
    chainLinks,
    bigWords: bigWords.slice(0, 8),
    vague,
    analogy: ANALOGY.test(t),
    orderSwaps,
    hasNumbers: /\d/.test(t),
  };
}

// ---------- The ladder ----------

export interface Level {
  n: number;
  name: string;
  /** What you are asked to do. */
  ask: string;
  /** Score needed to move up. */
  pass: number;
  /** Which points count: only main points, or main points and details. */
  depth: 'main' | 'all' | 'focus';
}

export const LEVELS: Level[] = [
  { n: 1, name: 'Simple', ask: 'Explain it to a 12-year-old. Short sentences, no notes.', pass: 70, depth: 'main' },
  { n: 2, name: 'Why', ask: 'Explain it again and give the reason behind every step. Use "because".', pass: 75, depth: 'all' },
  { n: 3, name: 'What if', ask: 'Something breaks. Explain what happens next, step by step, and why.', pass: 70, depth: 'focus' },
  { n: 4, name: 'Connect', ask: 'Explain how this links to a related idea. Say what one does to the other.', pass: 70, depth: 'main' },
  { n: 5, name: 'Teach cold', ask: 'Teach the whole thing from a blank page, every detail you know. No hints.', pass: 85, depth: 'all' },
];

/** Points that count at a level. `focus` is the point ids to use for a what-if question. */
export function pointsFor(level: Level, points: Point[], focus: string[] = []): Point[] {
  if (level.depth === 'main') return points.filter((p) => p.main);
  if (level.depth === 'focus') {
    const f = points.filter((p) => focus.includes(p.id));
    return f.length ? f : points.filter((p) => p.main);
  }
  return points;
}

export interface Score {
  total: number;
  parts: { name: string; got: number; of: number; tip?: string }[];
}

/** Turn a check into a 0 to 100 score. `ticks` is how many self-checks were ticked (0 to 3). */
export function score(c: Check, level: Level, ticks: number, shape: Shape): Score {
  const coverage = c.coverage ?? 1;
  const hitCount = c.points.filter((p) => p.status === 'hit').length;
  const needReasons = Math.max(1, Math.min(4, Math.ceil(Math.max(hitCount, 1) / 3)));
  const reasons = Math.min(1, (c.strongReasons + 0.5 * c.chainLinks) / needReasons);
  let clarity = 1 - Math.min(0.6, c.bigWords.length * 0.15) - Math.min(0.2, c.vague.length * 0.1);
  if (c.grade > 10) clarity -= Math.min(0.3, (c.grade - 10) * 0.05);
  if (shape === 'Process') clarity -= Math.min(0.3, c.orderSwaps.length * 0.1);
  if (shape === 'Calculation' && !c.hasNumbers) clarity -= 0.2;
  clarity = Math.max(0, clarity);

  const w =
    level.n === 3
      ? { cov: 0.3, why: 0.4, clear: 0.2, self: 0.1 }
      : level.n === 2
        ? { cov: 0.45, why: 0.3, clear: 0.15, self: 0.1 }
        : { cov: 0.55, why: 0.15, clear: 0.2, self: 0.1 };
  let total = 100 * (w.cov * coverage + w.why * reasons + w.clear * clarity + w.self * (Math.min(3, ticks) / 3));
  // a few words cannot show mastery, however well they match
  const minWords = level.n === 5 ? 60 : 25;
  if (c.words < minWords) total = Math.min(total, 40 * (c.words / minWords));
  total = Math.round(Math.max(0, Math.min(100, total)));
  const r = (x: number, of: number) => Math.round(x * of);
  return {
    total,
    parts: [
      { name: 'Covered your notes', got: r(coverage, w.cov * 100), of: w.cov * 100, tip: coverage < 0.8 ? 'Some points from your notes never came up.' : undefined },
      { name: 'Gave reasons', got: r(reasons, w.why * 100), of: w.why * 100, tip: reasons < 1 ? `Aim for at least ${needReasons} "because" links.` : undefined },
      { name: 'Plain words', got: r(clarity, w.clear * 100), of: w.clear * 100, tip: clarity < 0.8 ? 'Explain the big words, or swap them for simple ones.' : undefined },
      { name: 'Your own checks', got: r(Math.min(3, ticks) / 3, w.self * 100), of: w.self * 100 },
    ],
  };
}

// ---------- Mastery over time ----------

export interface Attempt {
  t: number;
  level: number;
  score: number;
  /** Point ids missed or only partly said. */
  missed: string[];
  /** How sure you were before checking, 1 to 5. */
  sure?: number;
  words: number;
}

export interface ConceptState {
  level: number;
  attempts: Attempt[];
  /** Times each point was missed and hit. */
  pointStats: Record<string, { hit: number; miss: number }>;
  /** Days when level 5 was passed. Mastered after two passes at least 3 days apart. */
  coldPasses: number[];
}

export const DAY = 24 * 60 * 60 * 1000;

export function emptyState(): ConceptState {
  return { level: 1, attempts: [], pointStats: {}, coldPasses: [] };
}

export function isMastered(s: ConceptState): boolean {
  const p = [...s.coldPasses].sort((a, b) => a - b);
  return p.length >= 2 && p[p.length - 1] - p[0] >= 3 * DAY;
}

/** 0 to 100. Mostly where you are on the ladder, plus how the last try went. */
export function masteryPct(s: ConceptState): number {
  if (isMastered(s)) return 100;
  const last = s.attempts[s.attempts.length - 1];
  const base = ((s.level - 1) / LEVELS.length) * 100;
  const step = 100 / LEVELS.length;
  const lastAtLevel = last && last.level === s.level ? last.score / 100 : 0;
  const cold = s.coldPasses.length ? 0.5 : 0;
  return Math.min(99, Math.round(base + step * Math.max(lastAtLevel * 0.9, cold)));
}

/**
 * Save a try and move on the ladder: pass moves up, under 50 moves down one.
 * Level 5 stays at 5 but counts a cold pass, and needs a 3-day gap to count again.
 */
export function record(s: ConceptState, a: Attempt, hits: string[], misses: string[]): ConceptState {
  const level = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, a.level - 1))];
  const pointStats = { ...s.pointStats };
  for (const id of hits) pointStats[id] = { hit: (pointStats[id]?.hit || 0) + 1, miss: pointStats[id]?.miss || 0 };
  for (const id of misses) pointStats[id] = { hit: pointStats[id]?.hit || 0, miss: (pointStats[id]?.miss || 0) + 1 };
  const attempts = [...s.attempts, a].slice(-30);
  let next = s.level;
  let coldPasses = s.coldPasses;
  // only a try at your current level moves you; practice at other levels just counts
  if (a.level === s.level) {
    if (a.score >= level.pass) {
      if (level.n === LEVELS.length) {
        const lastPass = Math.max(0, ...coldPasses);
        if (!coldPasses.length || a.t - lastPass >= 3 * DAY) coldPasses = [...coldPasses, a.t].slice(-5);
      } else next = s.level + 1;
    } else if (a.score < 50 && s.level > 1) next = s.level - 1;
  }
  return { level: next, attempts, pointStats, coldPasses };
}

/** Points you miss most, worst first. */
export function weakest(s: ConceptState, points: Point[], n = 3): Point[] {
  return points
    .map((p) => ({ p, st: s.pointStats[p.id] }))
    .filter((x) => x.st && x.st.miss > 0)
    .sort((a, b) => b.st.miss - b.st.hit - (a.st.miss - a.st.hit) || b.st.miss - a.st.miss)
    .slice(0, n)
    .map((x) => x.p);
}

/** Pick the idea for a what-if question: a weak point if there is one, else a different main point each time. */
export function whatIfTarget(s: ConceptState, points: Point[]): Point | undefined {
  const weak = weakest(s, points, 1)[0];
  if (weak) return weak;
  const mains = points.filter((p) => p.main);
  if (!mains.length) return points[0];
  return mains[s.attempts.filter((a) => a.level === 3).length % mains.length];
}

/** The word to break in a what-if question: the point's first key word, as it is spelled in the notes. */
export function breakWord(p: Point): string {
  const ws = words(p.text).filter((x) => isKey(x.raw));
  const first = ws.find((x) => p.terms.some((t) => sameWord(t, stem(x.w))));
  return (first || ws[0])?.raw || p.text.split(/\s+/).slice(0, 3).join(' ');
}

/** When to come back: sooner for low scores. Shown as a hint only; RemNote's own queue does the spacing. */
export function suggestBack(s: ConceptState, now = Date.now()): number {
  const last = s.attempts[s.attempts.length - 1];
  if (!last) return now;
  if (s.level === LEVELS.length && s.coldPasses.length && !isMastered(s)) return Math.max(...s.coldPasses) + 3 * DAY;
  const days = last.score >= 85 ? 4 : last.score >= 70 ? 2 : last.score >= 50 ? 1 : 0;
  return last.t + days * DAY;
}
