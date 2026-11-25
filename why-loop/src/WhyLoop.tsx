import { useEffect, useRef, useState } from 'react';
import { usePlugin } from '@remnote/plugin-sdk';
import {
  DAY,
  EMPTY,
  KEY,
  type Data,
  type Lecture,
  type Miss,
  day,
  lectureLabel,
  merge,
  normalize,
  pct,
  uid,
} from './lib/data';
import { addCard, addChild, copyText, richTextToLabel } from './lib/rem';
import {
  CARDS_STEP,
  MAP_STEP,
  MISS_LOG_STEP,
  PRETEST_STEP,
  QUESTIONS_STEP,
  QUESTION_SETS,
  QUICK_TEST_STEP,
  STEPS,
  STEPS_FULL,
  TEACH_CHECKS,
  WEEKDAYS,
} from './lib/steps';

/**
 * Why Loop: a step by step guide for each lecture, a miss log with one-week re-tests,
 * and the weekly number. Everything is saved in RemNote synced storage, so it follows
 * you between devices.
 */

type Tab = 'today' | 'lecture' | 'misses' | 'week';
interface TodoItem {
  key: string;
  text: string;
  sub?: string;
  button: string;
  go: () => void;
  extra?: { button: string; go: () => void };
}

// ---------- styles ----------
const pill = (active: boolean): React.CSSProperties => ({
  padding: '5px 10px',
  borderRadius: 999,
  border: '1px solid rgba(138,147,163,0.5)',
  background: active ? '#4C9AFF' : 'transparent',
  color: active ? 'white' : 'inherit',
  fontSize: 12,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
});
const field: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid rgba(138,147,163,0.5)',
  background: 'transparent',
  color: 'inherit',
  fontSize: 12,
  marginTop: 4,
};
const box: React.CSSProperties = {
  border: '1px solid rgba(138,147,163,0.3)',
  borderRadius: 10,
  padding: 10,
  marginTop: 8,
};
const dim: React.CSSProperties = { opacity: 0.65 };
const textarea = (minHeight: number): React.CSSProperties => ({ ...field, minHeight, resize: 'vertical', fontFamily: 'inherit' });
const WARN = '#F2994A';
/** A typed score as a whole number, or null if it is blank or not a whole number. */
const whole = (s: string) => (/^\s*\d+\s*$/.test(s) ? Number(s) : null);
const GOOD = '#36B37E';
const BLUE = '#4C9AFF';

export function WhyLoop({ pageId }: { pageId: string | undefined }) {
  const plugin = usePlugin();

  // ---------- loading and saving ----------
  const [tab, setTab] = useState<Tab>('today');
  const [data, setData] = useState<Data>(EMPTY);
  const [ready, setReady] = useState(false);
  const [pageName, setPageName] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAllMisses, setShowAllMisses] = useState(false);
  /** What was last loaded from or saved to storage: the base for merging. */
  const base = useRef<Data>(EMPTY);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveError, setSaveError] = useState('');
  /** Loads and saves run one at a time, in order. */
  const queue = useRef<Promise<void>>(Promise.resolve());

  const load = async () => {
    try {
      const d = normalize(await plugin.storage.getSynced(KEY));
      base.current = d;
      setData(d);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
    setReady(true);
  };

  useEffect(() => {
    load();
    // pick up changes made on other devices
    const onVisible = () => {
      if (document.visibilityState === 'visible') queue.current = queue.current.then(load);
    };
    document.addEventListener('visibilitychange', onVisible);
    const every5min = setInterval(() => (queue.current = queue.current.then(load)), 5 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(every5min);
    };
  }, [plugin]);

  useEffect(() => {
    let cancelled = false;
    if (!pageId) return setPageName('');
    plugin.rem
      .findOne(pageId)
      .then((r) => !cancelled && setPageName(r ? richTextToLabel(r.text) : ''))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pageId, plugin]);

  /** The newest data on screen, for saves that run after a delay. */
  const latest = useRef(data);
  latest.current = data;

  const save = (next: Data) => {
    if (loadFailed) return setSaveError('Your Why Loop data did not load, so nothing was saved. Press Try again.');
    const mine = next;
    const before = data;
    setData(next);
    queue.current = queue.current.then(async () => {
      try {
        const theirs = normalize(await plugin.storage.getSynced(KEY));
        const merged = merge(base.current === EMPTY ? before : base.current, mine, theirs);
        await plugin.storage.setSynced(KEY, merged);
        base.current = merged;
        setData((cur) => (cur === mine ? merged : cur));
        setSaveError('');
      } catch {
        setSaveError('Could not save just now. Your change is on screen; it will save with your next change.');
      }
    });
  };

  // ---------- what is due ----------
  const now = Date.now();
  const courses = [
    ...new Set([...data.lectures.map((l) => l.course), ...data.weeks.map((w) => w.course), ...Object.keys(data.exams)]),
  ].filter(Boolean);
  const dueMisses = data.misses.filter((m) => !m.closed && m.due <= now);
  const lastRedraw = (l: Lecture) => l.redrawn || 0;
  const redrawDue = data.lectures.filter((l) => now - l.t >= 6 * DAY && now - lastRedraw(l) >= 7 * DAY);

  /** End of the exam day, or 0 if there is no upcoming exam for the course. */
  const examTime = (course: string) => {
    const date = data.exams[course];
    if (!date) return 0;
    const t = new Date(`${date}T23:59:00`).getTime();
    return t >= now ? t : 0;
  };
  const examCourses = courses.filter((c) => examTime(c)).sort((a, b) => examTime(a) - examTime(b));
  /** Latest weekly percent, once a course has at least two weeks. */
  const latestWeek = (course: string) => {
    const rows = data.weeks.filter((w) => w.course === course);
    return rows.length >= 2 ? pct(rows[rows.length - 1].right, rows[rows.length - 1].total) : null;
  };
  // Full loop goes to the nearest exam, plus the weakest other course (or the next exam).
  const focus = new Set<string>();
  if (examCourses.length) {
    focus.add(examCourses[0]);
    const weakest =
      courses
        .filter((c) => c !== examCourses[0] && latestWeek(c) !== null)
        .sort((a, b) => latestWeek(a)! - latestWeek(b)!)[0] || examCourses[1];
    if (weakest) focus.add(weakest);
  }
  const mode = (course: string) =>
    !course || !examCourses.length
      ? ''
      : data.override[course] && examTime(course)
        ? data.override[course]
        : focus.has(course)
          ? 'full'
          : 'cards';
  const toggleMode = (course: string) =>
    save({ ...data, override: { ...data.override, [course]: mode(course) === 'full' ? 'cards' : 'full' } });
  const daysToExam = (course: string) => Math.max(0, Math.ceil((examTime(course) - now) / DAY));

  const unfinished = data.lectures.filter((l) => l.done.some((d) => !d));
  const recent = unfinished
    .filter((l) => now - l.t <= 2 * DAY)
    .sort((a, b) => (mode(a.course) === 'cards' ? 1 : 0) - (mode(b.course) === 'cards' ? 1 : 0) || b.t - a.t);
  const late = unfinished.filter((l) => now - l.t > 2 * DAY);
  const lastWeekSaved = Math.max(0, ...data.weeks.map((w) => w.t));
  const weeklyDueToday = data.weeklyDay === new Date().getDay() && now - lastWeekSaved > 5 * DAY;

  const currentStep = (l: Lecture) => Math.min(l.step ?? Math.max(0, l.done.indexOf(false)), STEPS.length - 1);
  const goTo = (l: Lecture, step?: number) => {
    if (step !== undefined) patch(l, { step });
    setOpenId(l.id);
    setTab('lecture');
  };

  // ---------- lecture actions ----------
  const [course, setCourse] = useState('');
  const [name, setName] = useState('');
  const addLecture = () => {
    const n = (name || pageName).trim();
    if (!n) return;
    const l: Lecture = { id: uid(), course: course.trim(), name: n, t: Date.now(), remId: pageId, done: STEPS.map(() => false) };
    save({ ...data, lectures: [l, ...data.lectures] });
    setOpenId(l.id);
    setName('');
  };
  const toggleStep = (l: Lecture, i: number) =>
    save({
      ...data,
      lectures: data.lectures.map((x) => (x.id === l.id ? { ...x, done: x.done.map((d, j) => (j === i ? !d : d)) } : x)),
    });
  const openPage = async (remId?: string) => {
    if (!remId) return;
    const rem = await plugin.rem.findOne(remId);
    if (rem) await plugin.window.openRem(rem);
  };
  const patch = (l: Lecture, change: Partial<Lecture>) =>
    save({ ...data, lectures: data.lectures.map((x) => (x.id === l.id ? { ...x, ...change } : x)) });
  /** Finish the step the guide is on and move to the next one. */
  const nextStep = (l: Lecture, i: number) =>
    patch(l, { done: l.done.map((d, j) => (j === i ? true : d)), step: Math.min(i + 1, STEPS.length) });

  const [showAll, setShowAll] = useState(false);
  /** Lecture waiting for a second tap on Remove. */
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  /** Teach it text being typed. Saved when typing stops, not on every key. */
  const [teachDraft, setTeachDraftState] = useState<{ id: string; text: string } | null>(null);
  const draftRef = useRef<{ id: string; text: string } | null>(null);
  const setTeachDraft = (d: { id: string; text: string } | null) => {
    draftRef.current = d;
    setTeachDraftState(d);
  };
  const teachTimer = useRef<ReturnType<typeof setTimeout>>();
  const saveTeach = (id: string, text: string) => {
    clearTimeout(teachTimer.current);
    const d = latest.current;
    const l = d.lectures.find((x) => x.id === id);
    if (l && (l.teach || '') !== text) save({ ...d, lectures: d.lectures.map((x) => (x.id === id ? { ...x, teach: text } : x)) });
    setTeachDraft(null);
  };
  const typeTeach = (id: string, text: string) => {
    setTeachDraft({ id, text });
    clearTimeout(teachTimer.current);
    teachTimer.current = setTimeout(() => saveTeach(id, text), 800);
  };
  const [qText, setQText] = useState('');
  const [qShape, setQShape] = useState('Thing');
  const [note, setNote] = useState('');
  const [score, setScore] = useState({ right: '', total: '' });
  const [scoreNote, setScoreNote] = useState('');

  /** Put the typed questions into the lecture's page, each with its fixed questions under it. */
  const addQuestions = async (l: Lecture) => {
    const lines = qText
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
    if (!lines.length) return;
    if (!l.remId) return setNote('This lecture is not linked to a page. Open the page, then start the lecture again.');
    try {
      for (const q of lines) {
        const id = await addChild(plugin, l.remId, q);
        for (const sub of QUESTION_SETS[qShape] || []) await addChild(plugin, id, sub);
      }
      setQText('');
      setNote(`Added ${lines.length} question${lines.length === 1 ? '' : 's'} to your page.`);
    } catch (e: any) {
      setNote(`Could not add them: ${String(e?.message || e)}`);
    }
  };

  // ---------- 20-minute map timer ----------
  const [left, setLeft] = useState<number | null>(null);
  /** The lecture the timer was started for. */
  const [timerFor, setTimerFor] = useState<string | null>(null);
  const tick = useRef<ReturnType<typeof setInterval>>();
  useEffect(() => () => clearInterval(tick.current), []);
  const startTimer = (lectureId: string) => {
    setTimerFor(lectureId);
    const end = Date.now() + 20 * 60 * 1000;
    setLeft(20 * 60);
    clearInterval(tick.current);
    tick.current = setInterval(() => {
      const s = Math.max(0, Math.round((end - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) clearInterval(tick.current);
    }, 1000);
  };
  const stopTimer = () => {
    clearInterval(tick.current);
    setLeft(null);
  };

  // ---------- Teach it ----------
  const [teachNote, setTeachNote] = useState('');

  // Typed text and messages belong to one lecture: clear them when a different lecture opens,
  // and save any Teach it text that was still waiting.
  useEffect(() => {
    setQText('');
    setNote('');
    setScore({ right: '', total: '' });
    setScoreNote('');
    setTeachNote('');
    setConfirmRemove(null);
    return () => {
      const d = draftRef.current;
      if (d) saveTeach(d.id, d.text);
    };
  }, [openId]);
  const checkPrompt = (l: Lecture) =>
    [
      'Please check my explanation. I wrote it from memory for a first-year student.',
      'Check three things: is the reason right, do the arrows go the right way, and is every big word explained?',
      'Do not teach me new material. Tell me which sentence to fix first.',
      '',
      `TOPIC: ${lectureLabel(l)}`,
      `MY EXPLANATION: ${teachDraft?.id === l.id ? teachDraft.text : l.teach || ''}`,
      `MY OWN CHECK, NOT SURE ABOUT: ${TEACH_CHECKS.filter((_, i) => !l.teachOk?.[i]).join('; ') || 'nothing'}`,
    ].join('\n');
  const addTeachNote = async (l: Lecture) => {
    if (!l.remId) return setTeachNote('This lecture is not linked to a page.');
    const unsure = TEACH_CHECKS.filter((_, i) => !l.teachOk?.[i]);
    try {
      await addChild(plugin, l.remId, `?? Explain again from memory (${unsure.join('; ').toLowerCase()})`);
      setTeachNote('Added a ?? note to the lecture page.');
    } catch (e: any) {
      setTeachNote(`Could not add it: ${String(e?.message || e)}`);
    }
  };

  // ---------- Quick miss (Today tab) ----------
  const [quick, setQuick] = useState({ open: false, paste: false, question: '', said: '', right: '', lectureId: '', bulk: '' });
  const [whatIf, setWhatIf] = useState<{ lectureId: string; right: string } | null>(null);
  const [quickNote, setQuickNote] = useState('');
  const recentLectures = data.lectures.slice(0, 10);
  /** Pasted lines: question | what I said | right reason (the middle part is optional). */
  const bulkRows = quick.bulk
    .split('\n')
    .map((line) => line.split('|').map((x) => x.trim()))
    .filter((r) => r[0] && r.length >= 2 && r[r.length - 1]);
  const logQuickMiss = () => {
    const l = data.lectures.find((x) => x.id === (quick.lectureId || recentLectures[0]?.id));
    const entries = quick.paste
      ? bulkRows.map((r) => ({ question: r[0], said: r.length >= 3 ? r[1] : '', right: r[r.length - 1] }))
      : quick.question.trim() && quick.right.trim()
        ? [{ question: quick.question.trim(), said: quick.said.trim(), right: quick.right.trim() }]
        : [];
    if (!entries.length)
      return setQuickNote(
        quick.paste ? 'Each line needs: question | what I said | right reason' : 'It needs the question and the right reason.'
      );
    const added: Miss[] = entries.map((e) => ({
      id: uid(),
      t: Date.now(),
      due: Date.now() + 7 * DAY,
      where: l ? lectureLabel(l) : '',
      lectureId: l?.id,
      ...e,
    }));
    save({ ...data, misses: [...added, ...data.misses] });
    setQuick({ ...quick, question: '', said: '', right: '', bulk: '' });
    setQuickNote(`Logged ${added.length}. Re-test on ${day(added[0].due)}.`);
    setWhatIf(l?.remId && added.length === 1 ? { lectureId: l.id, right: added[0].right } : null);
  };
  const addWhatIfCard = async () => {
    const l = data.lectures.find((x) => x.id === whatIf?.lectureId);
    if (!l?.remId || !whatIf) return;
    try {
      await addCard(
        plugin,
        l.remId,
        'What if (rewrite me): the step I got wrong were changed or blocked. What happens, and why?',
        whatIf.right
      );
      setQuickNote('Card added to the lecture page. Reword the front so it names the step.');
    } catch (e: any) {
      setQuickNote(`Could not add the card: ${String(e?.message || e)}`);
    }
    setWhatIf(null);
  };

  // ---------- Miss log tab ----------
  const [miss, setMiss] = useState({ where: '', question: '', said: '', right: '' });
  const addMiss = () => {
    if (!miss.question.trim() || !miss.right.trim()) return;
    const m: Miss = { id: uid(), t: Date.now(), due: Date.now() + 7 * DAY, ...miss };
    save({ ...data, misses: [m, ...data.misses] });
    setMiss({ where: miss.where, question: '', said: '', right: '' });
  };
  const retest = (m: Miss, right: boolean) =>
    save({
      ...data,
      misses: data.misses.map((x) =>
        x.id === m.id ? (right ? { ...x, closed: Date.now() } : { ...x, due: Date.now() + 7 * DAY }) : x
      ),
    });

  // ---------- Weekly tab ----------
  const [wk, setWk] = useState({ course: '', right: '', total: '' });
  const [newCourse, setNewCourse] = useState('');
  const [weekNote, setWeekNote] = useState('');
  const addWeek = () => {
    const right = whole(wk.right);
    const total = whole(wk.total);
    if (!wk.course.trim() || right === null || !total || right > total) return setWeekNote('Type both numbers, for example 7 out of 10.');
    setWeekNote('');
    save({ ...data, weeks: [...data.weeks, { t: Date.now(), course: wk.course.trim(), right, total }] });
    setWk({ course: wk.course, right: '', total: '' });
  };

  // ---------- Today list ----------
  const todo: TodoItem[] = [];
  if (dueMisses.length)
    todo.push({
      key: 'miss',
      text: `Re-test ${dueMisses.length} ${dueMisses.length === 1 ? 'miss' : 'misses'} from last week`,
      sub: 'Use a fresh question on the same idea.',
      button: 'Do re-tests',
      go: () => setTab('misses'),
    });
  for (const l of recent) {
    const cardsOnly = mode(l.course) === 'cards';
    const s = cardsOnly ? Math.max(currentStep(l), CARDS_STEP) : currentStep(l);
    todo.push({
      key: l.id,
      text: lectureLabel(l),
      sub: `Step ${s + 1}: ${STEPS_FULL[s].title} (${STEPS_FULL[s].time})${cardsOnly ? '. Cards only for this course right now.' : ''}`,
      button: s === MAP_STEP ? 'Start 20 min map' : `Go to step ${s + 1}`,
      go: () => {
        goTo(l, s);
        if (s === MAP_STEP) startTimer(l.id);
      },
    });
  }
  for (const l of late)
    todo.push({
      key: l.id,
      text: lectureLabel(l),
      sub: `Late (started ${day(l.t)}). Do the cards and the quick test only.`,
      button: 'Go to cards',
      go: () => goTo(l, Math.max(currentStep(l), CARDS_STEP)),
      extra: { button: 'Mark done', go: () => patch(l, { done: l.done.map(() => true), step: STEPS.length }) },
    });
  for (const l of redrawDue)
    todo.push({
      key: `r${l.id}`,
      text: `Redraw ${lectureLabel(l)} from memory`,
      sub: 'Blank page or the Bubble Map redraw. No sources.',
      button: 'Open redraws',
      go: () => setTab('week'),
    });
  if (weeklyDueToday)
    todo.push({
      key: 'wk',
      text: 'Weekly review',
      sub: 'Mixed question set and your weekly number.',
      button: 'Open Weekly',
      go: () => setTab('week'),
    });

  // ---------- render ----------
  if (!ready) return <div style={{ padding: 10, fontSize: 12 }}>Loading…</div>;
  if (loadFailed && !data.lectures.length && !data.misses.length)
    return (
      <div style={{ padding: 10, fontSize: 12 }}>
        Your Why Loop data did not load (RemNote may be offline). Nothing was changed.{' '}
        <button style={pill(false)} onClick={() => (queue.current = queue.current.then(load))}>
          Try again
        </button>
      </div>
    );

  const openMisses = data.misses.filter((m) => !m.closed);

  return (
    <div style={{ padding: 8, fontSize: 12, lineHeight: 1.45, overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      {saveError && <div style={{ color: WARN, marginBottom: 6 }}>{saveError}</div>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button style={pill(tab === 'today')} onClick={() => setTab('today')}>
          Today
        </button>
        <button style={pill(tab === 'lecture')} onClick={() => setTab('lecture')}>
          Lectures
        </button>
        <button style={pill(tab === 'misses')} onClick={() => setTab('misses')}>
          Miss log{dueMisses.length ? ` (${dueMisses.length} due)` : ''}
        </button>
        <button style={pill(tab === 'week')} onClick={() => setTab('week')}>
          Weekly{redrawDue.length ? ` (${redrawDue.length} to redraw)` : ''}
        </button>
      </div>
      <datalist id="wl-courses">
        {courses.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {/* ---------------- Today ---------------- */}
      {tab === 'today' && (
        <>
          {todo.length > 0 ? (
            <div style={{ ...box, borderColor: BLUE }}>
              <div style={dim}>Now</div>
              <b style={{ fontSize: 14 }}>{todo[0].text}</b>
              {todo[0].sub && <div>{todo[0].sub}</div>}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button style={{ ...pill(true), padding: '8px 16px', fontSize: 13 }} onClick={todo[0].go}>
                  {todo[0].button}
                </button>
                {todo[0].extra && (
                  <button style={pill(false)} onClick={todo[0].extra.go}>
                    {todo[0].extra.button}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={box}>
              <b style={{ color: GOOD }}>{data.lectures.length ? 'Done for today.' : 'Welcome.'}</b>
              <div>
                {data.lectures.length
                  ? 'Nothing is due. Had a new lecture? Start it below.'
                  : 'Which lecture did you have today? Start it below and this screen will tell you what to do next.'}
              </div>
            </div>
          )}
          {todo.length > 1 && (
            <div style={box}>
              <div style={dim}>Also today</div>
              {todo.slice(1, 4).map((item) => (
                <div key={item.key} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
                  <span style={{ flex: 1 }}>
                    {item.text}
                    {item.sub && <div style={dim}>{item.sub}</div>}
                  </span>
                  <button style={pill(false)} onClick={item.go}>
                    {item.button}
                  </button>
                </div>
              ))}
              {todo.length > 4 && <div style={{ ...dim, marginTop: 6 }}>and {todo.length - 4} more after these</div>}
            </div>
          )}
          {examCourses.length > 0 && (
            <div style={box}>
              <div style={dim}>This week's focus. Tap a tag to change it.</div>
              {courses.map((c) => (
                <div key={c} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                  <span style={{ flex: 1 }}>
                    {c}
                    {examTime(c) ? (
                      <span style={dim}>
                        {' '}
                        · exam in {daysToExam(c)} {daysToExam(c) === 1 ? 'day' : 'days'}
                      </span>
                    ) : null}
                  </span>
                  <button style={{ ...pill(mode(c) === 'full'), padding: '2px 8px' }} onClick={() => toggleMode(c)}>
                    {mode(c) === 'full' ? 'Full loop' : 'Cards only'}
                  </button>
                </div>
              ))}
            </div>
          )}
          {examCourses.length === 0 && data.lectures.length > 0 && (
            <div style={{ ...dim, marginTop: 8 }}>
              Add your exam dates in Weekly, and this screen will say which course gets the full loop.
            </div>
          )}
          <div style={box}>
            <b>Start a lecture</b>
            <div style={dim}>Do this within a day of class. Open the lecture's page first so it gets linked.</div>
            <input style={field} list="wl-courses" placeholder="Course (for example BN 779)" value={course} onChange={(e) => setCourse(e.target.value)} />
            <input
              style={field}
              placeholder={pageName ? `Lecture name (blank uses "${pageName}")` : 'Lecture name'}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button style={{ ...pill(true), marginTop: 6 }} onClick={addLecture}>
              Start
            </button>
          </div>
          <div style={box}>
            <div
              style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}
              onClick={() => setQuick({ ...quick, open: !quick.open })}
            >
              <b style={{ flex: 1 }}>Quick miss</b>
              <span style={dim}>{quick.open ? 'Hide' : 'Got a practice question wrong? Log it'}</span>
            </div>
            {quick.open && (
              <>
                <div style={dim}>Only wrong reasoning, not careless slips. It comes back for a re-test in one week.</div>
                {quick.paste ? (
                  <>
                    <textarea
                      style={textarea(80)}
                      placeholder={'One miss per line:\nquestion | what I said | right reason'}
                      value={quick.bulk}
                      onChange={(e) => setQuick({ ...quick, bulk: e.target.value })}
                    />
                    <div style={dim}>
                      {bulkRows.length} {bulkRows.length === 1 ? 'miss' : 'misses'} read so far.
                    </div>
                  </>
                ) : (
                  <>
                    <input
                      style={field}
                      placeholder="The question (a few words is fine)"
                      value={quick.question}
                      onChange={(e) => setQuick({ ...quick, question: e.target.value })}
                    />
                    <input style={field} placeholder="What I said" value={quick.said} onChange={(e) => setQuick({ ...quick, said: e.target.value })} />
                    <input
                      style={field}
                      placeholder="The right reason"
                      value={quick.right}
                      onChange={(e) => setQuick({ ...quick, right: e.target.value })}
                    />
                  </>
                )}
                {recentLectures.length > 0 && (
                  <select
                    style={field}
                    value={quick.lectureId || recentLectures[0].id}
                    onChange={(e) => setQuick({ ...quick, lectureId: e.target.value })}
                  >
                    {recentLectures.map((l) => (
                      <option key={l.id} value={l.id}>
                        {lectureLabel(l)}
                      </option>
                    ))}
                  </select>
                )}
                <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                  <button style={pill(true)} onClick={logQuickMiss}>
                    {quick.paste ? 'Log them all' : 'Log it'}
                  </button>
                  <button style={pill(false)} onClick={() => setQuick({ ...quick, paste: !quick.paste })}>
                    {quick.paste ? 'One at a time' : 'Paste several'}
                  </button>
                </div>
                {quickNote && <div style={{ marginTop: 4, color: GOOD }}>{quickNote}</div>}
                {whatIf && (
                  <div style={{ marginTop: 6 }}>
                    Add a what-if card to that lecture's page?{' '}
                    <button style={pill(true)} onClick={addWhatIfCard}>
                      Yes
                    </button>{' '}
                    <button style={pill(false)} onClick={() => setWhatIf(null)}>
                      No
                    </button>
                    <div style={dim}>It makes a starter card with the right reason as the answer. You reword the front.</div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* ---------------- Lectures ---------------- */}
      {tab === 'lecture' && (
        <>
          {data.lectures.length === 0 && <div style={{ ...dim, marginTop: 8 }}>Start a lecture from the Today tab.</div>}
          {data.lectures.map((l) => {
            const n = l.done.filter(Boolean).length;
            const open = openId === l.id;
            return (
              <div key={l.id} style={box}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }} onClick={() => setOpenId(open ? null : l.id)}>
                  <b style={{ flex: 1 }}>
                    {l.course ? `${l.course}: ` : ''}
                    {l.name}
                  </b>
                  <span style={{ color: n === STEPS.length ? GOOD : undefined, ...(n === STEPS.length ? {} : dim) }}>
                    {n}/{STEPS.length} · {day(l.t)}
                  </span>
                </div>
                {open &&
                  (() => {
                    const i = Math.min(l.step ?? Math.max(0, l.done.indexOf(false)), STEPS.length);
                    const st = STEPS_FULL[i];
                    return (
                      <>
                        <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                          {STEPS_FULL.map((x, j) => (
                            <button
                              key={x.title}
                              title={x.title}
                              onClick={() => patch(l, { step: j })}
                              style={{ ...pill(j === i), padding: '2px 8px', borderColor: l.done[j] ? GOOD : 'rgba(138,147,163,0.5)' }}
                            >
                              {l.done[j] ? '✓' : j + 1}
                            </button>
                          ))}
                          <button style={{ ...pill(showAll), padding: '2px 8px' }} onClick={() => setShowAll((v) => !v)}>
                            All steps
                          </button>
                        </div>
                        {showAll &&
                          STEPS.map(([title, how], j) => (
                            <label key={title} style={{ display: 'flex', gap: 8, marginTop: 6, cursor: 'pointer' }}>
                              <input type="checkbox" checked={!!l.done[j]} onChange={() => toggleStep(l, j)} />
                              <span>
                                <b>{title}.</b> <span style={dim}>{how}</span>
                              </span>
                            </label>
                          ))}
                        {!showAll && !st && (
                          <div style={{ marginTop: 8 }}>
                            <b style={{ color: GOOD }}>Loop done for this lecture.</b>
                            <div>Next: redraw the map from memory around {day(l.t + 7 * DAY)}. It will show up in the Weekly tab.</div>
                          </div>
                        )}
                        {!showAll && st && (
                          <div style={{ marginTop: 8 }}>
                            <b style={{ fontSize: 13 }}>
                              Step {i + 1} of {STEPS.length}: {st.title}
                            </b>{' '}
                            <span style={dim}>({st.time})</span>
                            <ol style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                              {st.todo.map((t) => (
                                <li key={t} style={{ marginTop: 2 }}>
                                  {t}
                                </li>
                              ))}
                            </ol>
                            <div style={{ ...dim, marginTop: 6 }}>
                              <b>Example:</b> {st.example}
                            </div>

                            {i === QUESTIONS_STEP && (
                              <div style={{ marginTop: 8 }}>
                                <textarea
                                  style={textarea(70)}
                                  placeholder="Your how and why questions, one per line"
                                  value={qText}
                                  onChange={(e) => setQText(e.target.value)}
                                />
                                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                  <span style={dim}>Shape:</span>
                                  {Object.keys(QUESTION_SETS).map((k) => (
                                    <button
                                      key={k}
                                      style={{ ...pill(qShape === k), padding: '2px 8px' }}
                                      onClick={() => setQShape(k)}
                                      title={QUESTION_SETS[k].join('  ')}
                                    >
                                      {k}
                                    </button>
                                  ))}
                                  <button style={pill(true)} onClick={() => addQuestions(l)}>
                                    Add to my page
                                  </button>
                                </div>
                                <div style={{ ...dim, marginTop: 4 }}>Under each one it adds: {QUESTION_SETS[qShape].join(' ')}</div>
                                {note && <div style={{ marginTop: 4, color: GOOD }}>{note}</div>}
                              </div>
                            )}

                            {i === MAP_STEP && (
                              <div style={{ marginTop: 8 }}>
                                {left === null || timerFor !== l.id ? (
                                  <button style={pill(false)} onClick={(e) => (e.preventDefault(), startTimer(l.id))}>
                                    Start 20 minute timer
                                  </button>
                                ) : (
                                  <>
                                    <b style={{ color: left === 0 ? WARN : undefined }}>
                                      {left === 0
                                        ? 'Time. Stop and write ?? on what is unfinished.'
                                        : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} left`}
                                    </b>{' '}
                                    <button style={pill(false)} onClick={(e) => (e.preventDefault(), stopTimer())}>
                                      Clear
                                    </button>
                                  </>
                                )}
                              </div>
                            )}

                            {i === QUICK_TEST_STEP && (
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
                                <input
                                  style={{ ...field, marginTop: 0 }}
                                  inputMode="numeric"
                                  placeholder="Right"
                                  value={score.right}
                                  onChange={(e) => setScore({ ...score, right: e.target.value })}
                                />
                                <input
                                  style={{ ...field, marginTop: 0 }}
                                  inputMode="numeric"
                                  placeholder="Out of"
                                  value={score.total}
                                  onChange={(e) => setScore({ ...score, total: e.target.value })}
                                />
                                <button
                                  style={pill(false)}
                                  onClick={() => {
                                    const r = whole(score.right);
                                    const t = whole(score.total);
                                    if (r === null || !t || r > t) return setScoreNote('Type both numbers, for example 6 out of 7.');
                                    setScoreNote('');
                                    patch(l, { quick: [r, t] });
                                  }}
                                >
                                  Save
                                </button>
                              </div>
                            )}
                            {i === QUICK_TEST_STEP && scoreNote && <div style={{ marginTop: 4, color: WARN }}>{scoreNote}</div>}
                            {i === QUICK_TEST_STEP && l.quick && (
                              <div style={{ marginTop: 4 }}>
                                Saved: {l.quick[0]} of {l.quick[1]}.
                              </div>
                            )}
                            {i === QUICK_TEST_STEP && (
                              <div style={{ ...box, marginTop: 10 }}>
                                <b>Teach it</b> <span style={dim}>(about 3 min)</span>
                                <div>
                                  Pick the idea you felt least sure about. Explain it to a first-year student in about 5 sentences. No notes,
                                  and no big words without saying what they mean.
                                </div>
                                <textarea
                                  style={textarea(80)}
                                  placeholder="Your explanation, from memory"
                                  value={teachDraft?.id === l.id ? teachDraft.text : l.teach || ''}
                                  onChange={(e) => typeTeach(l.id, e.target.value)}
                                  onBlur={(e) => saveTeach(l.id, e.target.value)}
                                />
                                <div style={{ ...dim, marginTop: 6 }}>Now open your notes and check yourself:</div>
                                {TEACH_CHECKS.map((c, j) => (
                                  <label key={c} style={{ display: 'flex', gap: 8, marginTop: 3, cursor: 'pointer' }}>
                                    <input
                                      type="checkbox"
                                      checked={!!l.teachOk?.[j]}
                                      onChange={(e) => {
                                        const ok = [...(l.teachOk || [false, false, false])];
                                        ok[j] = e.target.checked;
                                        patch(l, { teachOk: ok });
                                      }}
                                    />
                                    {c}
                                  </label>
                                ))}
                                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                                  {l.remId && (
                                    <button style={pill(false)} onClick={() => openPage(l.remId)}>
                                      Show my notes
                                    </button>
                                  )}
                                  {(teachDraft?.id === l.id ? teachDraft.text : l.teach || '').trim() && (l.teachOk || []).filter(Boolean).length < 3 && l.remId && (
                                    <button style={pill(false)} onClick={() => addTeachNote(l)}>
                                      Add a ?? to my page
                                    </button>
                                  )}
                                  {(teachDraft?.id === l.id ? teachDraft.text : l.teach || '').trim() && (
                                    <button
                                      style={pill(false)}
                                      onClick={async () =>
                                        setTeachNote(
                                          (await copyText(checkPrompt(l)))
                                            ? 'Copied. Paste it to an AI such as Claude if you want a second check.'
                                            : 'Could not copy from here.'
                                        )
                                      }
                                    >
                                      Copy for checking
                                    </button>
                                  )}
                                </div>
                                {teachNote && <div style={{ marginTop: 4, color: GOOD }}>{teachNote}</div>}
                              </div>
                            )}

                            {i === MISS_LOG_STEP && (
                              <button style={{ ...pill(false), marginTop: 8 }} onClick={() => setTab('misses')}>
                                Open the miss log
                              </button>
                            )}

                            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                              {i > 0 && (
                                <button style={pill(false)} onClick={() => patch(l, { step: i - 1 })}>
                                  Back
                                </button>
                              )}
                              <button style={pill(true)} onClick={() => nextStep(l, i)}>
                                {i === STEPS.length - 1 ? 'Finish' : 'Done, next step'}
                              </button>
                              {i === PRETEST_STEP && (
                                <button style={pill(false)} onClick={() => patch(l, { step: i + 1 })}>
                                  Skip
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                          {l.remId && (
                            <button style={pill(false)} onClick={() => openPage(l.remId)}>
                              Open its page
                            </button>
                          )}
                          {confirmRemove === l.id ? (
                            <>
                              <span style={{ color: WARN, alignSelf: 'center' }}>Remove this lecture and its steps? This cannot be undone.</span>
                              <button
                                style={{ ...pill(true), background: WARN }}
                                onClick={() => {
                                  save({ ...data, lectures: data.lectures.filter((x) => x.id !== l.id) });
                                  setConfirmRemove(null);
                                }}
                              >
                                Yes, remove
                              </button>
                              <button style={pill(false)} onClick={() => setConfirmRemove(null)}>
                                Keep it
                              </button>
                            </>
                          ) : (
                            <button style={pill(false)} onClick={() => setConfirmRemove(l.id)}>
                              Remove
                            </button>
                          )}
                        </div>
                      </>
                    );
                  })()}
              </div>
            );
          })}
        </>
      )}

      {/* ---------------- Miss log ---------------- */}
      {tab === 'misses' && (
        <>
          <div style={box}>
            <b>Log a miss</b>
            <div style={dim}>Only wrong reasoning. Skip careless slips. The re-test is set for one week out.</div>
            <input style={field} placeholder="Course and lecture" value={miss.where} onChange={(e) => setMiss({ ...miss, where: e.target.value })} />
            <input style={field} placeholder="The question" value={miss.question} onChange={(e) => setMiss({ ...miss, question: e.target.value })} />
            <input style={field} placeholder="What I said" value={miss.said} onChange={(e) => setMiss({ ...miss, said: e.target.value })} />
            <input style={field} placeholder="The right reason" value={miss.right} onChange={(e) => setMiss({ ...miss, right: e.target.value })} />
            <button style={{ ...pill(true), marginTop: 6 }} onClick={addMiss}>
              Log it
            </button>
          </div>
          {openMisses.length === 0 && <div style={{ ...dim, marginTop: 8 }}>Nothing open in the log.</div>}
          {openMisses
            .sort((a, b) => a.due - b.due)
            .slice(0, showAllMisses ? undefined : 60)
            .map((m) => {
              const due = m.due <= now;
              return (
                <div key={m.id} style={{ ...box, borderColor: due ? WARN : 'rgba(138,147,163,0.3)' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <b style={{ flex: 1 }}>{m.question}</b>
                    <span style={{ color: due ? WARN : undefined, ...(due ? {} : dim) }}>{due ? 'Re-test now' : `Re-test ${day(m.due)}`}</span>
                  </div>
                  <div style={dim}>
                    {day(m.t)}
                    {m.where ? ` · ${m.where}` : ''}
                  </div>
                  {m.said && (
                    <div>
                      <span style={dim}>I said: </span>
                      {m.said}
                    </div>
                  )}
                  <div>
                    <span style={dim}>Right reason: </span>
                    {m.right}
                  </div>
                  {due && (
                    <>
                      <div style={{ ...dim, marginTop: 4 }}>Use a fresh question on the same idea, not this one.</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <button style={{ ...pill(true), background: GOOD }} onClick={() => retest(m, true)}>
                          Got it
                        </button>
                        <button style={{ ...pill(true), background: WARN }} onClick={() => retest(m, false)}>
                          Still wrong (+1 week)
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          {!showAllMisses && openMisses.length > 60 && (
            <button style={{ ...pill(false), marginTop: 8 }} onClick={() => setShowAllMisses(true)}>
              Show all {openMisses.length}
            </button>
          )}
          {data.misses.some((m) => m.closed) && (
            <div style={{ ...dim, marginTop: 8 }}>{data.misses.filter((m) => m.closed).length} fixed on re-test so far.</div>
          )}
        </>
      )}

      {/* ---------------- Weekly ---------------- */}
      {tab === 'week' && (
        <>
          <div style={box}>
            <b>Exam dates</b>
            <div style={dim}>The nearest exam gets the full loop. Type each date once.</div>
            {courses.map((c) => (
              <div key={c} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                <span style={{ flex: 1 }}>{c}</span>
                <input
                  type="date"
                  style={{ ...field, width: 150, marginTop: 0 }}
                  value={data.exams[c] || ''}
                  onChange={(e) => save({ ...data, exams: { ...data.exams, [c]: e.target.value } })}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input style={{ ...field, marginTop: 0 }} placeholder="Add a course" value={newCourse} onChange={(e) => setNewCourse(e.target.value)} />
              <button
                style={pill(false)}
                onClick={() => {
                  const c = newCourse.trim();
                  if (c && !(c in data.exams)) save({ ...data, exams: { ...data.exams, [c]: '' } });
                  setNewCourse('');
                }}
              >
                Add
              </button>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
              <span style={{ flex: 1 }}>My weekly review day</span>
              <select
                style={{ ...field, width: 150, marginTop: 0 }}
                value={data.weeklyDay ?? ''}
                onChange={(e) => save({ ...data, weeklyDay: e.target.value === '' ? undefined : Number(e.target.value) })}
              >
                <option value="">Not set</option>
                {WEEKDAYS.map((d, j) => (
                  <option key={d} value={j}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={box}>
            <b>1. Redraw this week's maps</b>
            <div style={dim}>
              Blank page, no sources. Draw the whole map from memory, then compare and fix it in another color. This is the most important step.
            </div>
            {redrawDue.length === 0 ? (
              <div style={{ marginTop: 4 }}>Nothing is due for a redraw.</div>
            ) : (
              redrawDue.map((l) => (
                <div key={l.id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
                  <span style={{ flex: 1 }}>
                    {l.course ? `${l.course}: ` : ''}
                    {l.name}
                  </span>
                  {l.remId && (
                    <button style={pill(false)} onClick={() => openPage(l.remId)}>
                      Open
                    </button>
                  )}
                  <button
                    style={pill(false)}
                    onClick={() => save({ ...data, lectures: data.lectures.map((x) => (x.id === l.id ? { ...x, redrawn: Date.now() } : x)) })}
                  >
                    Done
                  </button>
                </div>
              ))
            )}
          </div>
          <div style={box}>
            <b>2. Re-test last week's misses</b>
            <div style={{ marginTop: 4 }}>
              {dueMisses.length ? (
                <>
                  {dueMisses.length} due.{' '}
                  <button style={pill(false)} onClick={() => setTab('misses')}>
                    Go to the miss log
                  </button>
                </>
              ) : (
                'None due.'
              )}
            </div>
          </div>
          <div style={box}>
            <b>3. One mixed question set</b>
            <div style={dim}>Shuffle questions across topics from the last 2 to 3 weeks.</div>
          </div>
          <div style={box}>
            <b>4. Write down the weekly number</b>
            <div style={dim}>First-try accuracy on the mixed set, per course. Watch the trend over 3 to 4 weeks, not one week.</div>
            <input style={field} list="wl-courses" placeholder="Course" value={wk.course} onChange={(e) => setWk({ ...wk, course: e.target.value })} />
            <div style={{ display: 'flex', gap: 6 }}>
              <input style={field} inputMode="numeric" placeholder="Right first try" value={wk.right} onChange={(e) => setWk({ ...wk, right: e.target.value })} />
              <input style={field} inputMode="numeric" placeholder="Out of" value={wk.total} onChange={(e) => setWk({ ...wk, total: e.target.value })} />
            </div>
            <button style={{ ...pill(true), marginTop: 6 }} onClick={addWeek}>
              Save
            </button>
            {weekNote && <div style={{ marginTop: 4, color: WARN }}>{weekNote}</div>}
            {[...new Set(data.weeks.map((w) => w.course))].map((c) => {
              const rows = data.weeks.filter((w) => w.course === c).slice(-8);
              return (
                <div key={c} style={{ marginTop: 8 }}>
                  <b>{c}</b>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 46, marginTop: 2 }}>
                    {rows.map((w) => (
                      <div key={w.t} title={`${day(w.t)}: ${w.right} of ${w.total}`} style={{ textAlign: 'center' }}>
                        <div style={{ width: 26, height: Math.max(3, (pct(w.right, w.total) / 100) * 30), background: BLUE, borderRadius: 3 }} />
                        <div style={{ fontSize: 10 }}>{pct(w.right, w.total)}%</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
