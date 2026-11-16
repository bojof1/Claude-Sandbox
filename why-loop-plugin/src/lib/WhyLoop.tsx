import { useEffect, useRef, useState } from 'react';
import { usePlugin } from '@remnote/plugin-sdk';
import { addCard, addChild, copyText, QUESTION_SETS, richTextToLabel } from './rem';

/**
 * Why Loop tracker: the parts of the study loop that are not the map itself.
 * A checklist for each lecture, a miss log with one-week re-tests, and the weekly number.
 * Everything is saved in your RemNote account, so it follows you between devices.
 */

const DAY = 24 * 60 * 60 * 1000;
const KEY = 'wl-data';

interface Step {
  title: string;
  /** One line, shown in the list of all steps. */
  how: string;
  /** What to do, in order. */
  todo: string[];
  /** The same step done on a real lecture (G-protein receptors). */
  example: string;
  time: string;
}
const STEPS_FULL: Step[] = [
  {
    title: 'Sort',
    how: 'Topic by topic: is there a reason behind it, or do I just memorize it?',
    time: '2 min',
    todo: [
      'Skim the slide titles.',
      'For each topic ask: is there a reason behind this, or do I just have to memorize it?',
      'Reason topics get the full loop. Memorize topics (names, lists, labels) just get plain cards. Never invent a why for those.',
      'Not sure? If the slides give a reason, it is a reason topic. If you cannot find one in 2 minutes, treat it as memorize and write ?? next to it.',
    ],
    example:
      'How the G-protein cycle works has reasons, so it gets the loop. The list of G-protein types (Gs, Gi, Gq) is just a list, so plain cards.',
  },
  {
    title: 'Questions',
    how: 'Turn the learning objectives into how and why questions. Note the slide range.',
    time: '5 min',
    todo: [
      'Find the learning objectives. No objectives? Use practice questions, section headings, or slide titles.',
      'Rewrite each one as a How or Why question. Any wording is fine.',
      'Pick the shape: if you can point at it, it is a Thing. If it is a story of events, it is a Process. If you compute something, it is a Calculation.',
      'Type your questions below, one per line. They go into your page with the fixed questions under each.',
    ],
    example:
      'Objective: "Describe the G-protein cycle." Becomes: "How does a G-protein receptor pass the hormone\'s signal into the cell?" (slides 31 to 35). Shape: Thing.',
  },
  {
    title: 'Pretest',
    how: 'Answer 3 to 5 practice questions cold. Being wrong is fine. Skip if there are none.',
    time: '2 min',
    todo: [
      'Answer 3 to 5 of the professor\'s practice questions before reading anything.',
      'Being wrong is fine. Do not read the explanations yet.',
      'No practice questions, or only a few? Skip this step and save them for later.',
    ],
    example: 'The G-protein practice bank had one question, so this step was skipped.',
  },
  {
    title: 'Map',
    how: 'Sources open, 20 minutes max. Answer the fixed questions in your own words. Write ?? where no reason is given.',
    time: '20 min max',
    todo: [
      'Start the timer. Keep your sources open: slides first, then notes, then search the transcript.',
      'Under each fixed question, write the answer in your own words. Short phrases and arrows. This is read and rewrite, not a quiz.',
      'Every arrow needs a because. If the source gives a what but no why, write ??.',
      'When the timer ends, stop. Write ?? on anything unfinished.',
    ],
    example:
      'Where is it, and why there? "Spans the membrane, because a water-soluble hormone cannot cross the fatty membrane." What if it breaks? "??" (the slides did not say).',
  },
  {
    title: 'Cards',
    how: '10 to 15 at most. At least half blank the reason or what happens next. One what-if card.',
    time: '10 min',
    todo: [
      'Make 10 to 15 cards at most.',
      'At least half must blank the reason or what happens next. None may blank only a name.',
      'Add one what-if card.',
      'Check each card: could I get this right just by remembering a word? If yes, rewrite it.',
      'If you use the Bubble Map plugin, its Study button has a Card check that counts this for you.',
    ],
    example:
      'Bad: "Gs activates {{adenylate cyclase}}." Good: "The receptor sits across the membrane because {{a water-soluble hormone cannot cross the fatty membrane}}." What-if: "If G-alpha cannot cut GTP, then {{the effector stays on}}."',
  },
  {
    title: 'Quick test',
    how: '5 to 7 exam-style questions on this topic. Type "I think it is X because Y" first.',
    time: '10 min',
    todo: [
      'Do 5 to 7 exam-style questions on only this topic. Use the professor\'s set first.',
      'Before you look at the choices, type or say: "I think it is X because Y."',
      'Enter your score below. A good score right after studying is encouraging, not proof.',
    ],
    example: 'G-proteins: 7 of 7, including two twists never seen before.',
  },
  {
    title: 'Miss log',
    how: 'Log wrong reasoning only, not careless slips.',
    time: '2 min',
    todo: [
      'For each question you got wrong because your reasoning was wrong, log one line in the Miss log tab.',
      'Skip careless slips like misreading.',
      'Fix the map where the arrow was wrong, and add a what-if card on it.',
      'In one week the log brings each miss back. Use a fresh question, not the same one.',
    ],
    example:
      'Question: What dissociates after GTP binds? I said: the hormone-receptor complex. Right reason: G-alpha-GTP leaves the receptor and beta-gamma.',
  },
];
const STEPS: [string, string][] = STEPS_FULL.map((x) => [x.title, x.how]);
const MAP_STEP = 3;

interface Lecture {
  id: string;
  course: string;
  name: string;
  t: number;
  remId?: string;
  done: boolean[];
  redrawn?: number;
  /** Which step the guide is on. */
  step?: number;
  quick?: [number, number];
  /** Teach it: your explanation and your own three checks. */
  teach?: string;
  teachOk?: boolean[];
}
interface Miss {
  id: string;
  t: number;
  where: string;
  question: string;
  said: string;
  right: string;
  due: number;
  closed?: number;
  lectureId?: string;
}
interface Week {
  t: number;
  course: string;
  right: number;
  total: number;
}
interface Data {
  lectures: Lecture[];
  misses: Miss[];
  weeks: Week[];
  /** Next exam per course, as YYYY-MM-DD. */
  exams: Record<string, string>;
  /** Your weekly review day, 0 = Sunday. */
  weeklyDay?: number;
  /** A tag you set by hand, kept until that course's exam passes. */
  override: Record<string, 'full' | 'cards'>;
}

const EMPTY: Data = { lectures: [], misses: [], weeks: [], exams: {}, override: {} };
const TEACH_CHECKS = ['I gave the reason', 'My arrows go the right way', 'I explained every big word'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const uid = () => Math.random().toString(36).slice(2, 10);
const day = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const pct = (r: number, n: number) => (n ? Math.round((100 * r) / n) : 0);

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
const WARN = '#F2994A';
const GOOD = '#36B37E';

export function WhyLoop({ pageId }: { pageId: string | undefined }) {
  const plugin = usePlugin();
  const [tab, setTab] = useState<'today' | 'lecture' | 'misses' | 'week'>('today');
  const [data, setData] = useState<Data>(EMPTY);
  const [ready, setReady] = useState(false);
  const [pageName, setPageName] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    plugin.storage
      .getSynced<Data>(KEY)
      .then((d) => setData({ ...EMPTY, ...(d || {}) }))
      .catch(() => {})
      .then(() => setReady(true));
  }, [plugin]);

  useEffect(() => {
    let cancelled = false;
    if (!pageId) return setPageName('');
    plugin.rem
      .findOne(pageId)
      .then((r: any) => !cancelled && setPageName(r ? richTextToLabel(r.text) : ''))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pageId, plugin]);

  const save = (next: Data) => {
    setData(next);
    plugin.storage.setSynced(KEY, next).catch(() => {});
  };

  const now = Date.now();
  const courses = [
    ...new Set([...data.lectures.map((l) => l.course), ...data.weeks.map((w) => w.course), ...Object.keys(data.exams)]),
  ].filter(Boolean);
  const dueMisses = data.misses.filter((m) => !m.closed && m.due <= now);
  const lastRedraw = (l: Lecture) => l.redrawn || 0;
  const redrawDue = data.lectures.filter((l) => now - l.t >= 6 * DAY && now - lastRedraw(l) >= 7 * DAY);

  // ---------- Triage: which course gets the full loop ----------
  const examTime = (c: string) => {
    const d = data.exams[c];
    if (!d) return 0;
    const t = new Date(`${d}T23:59:00`).getTime();
    return t >= now ? t : 0;
  };
  const byExam = courses.filter((c) => examTime(c)).sort((a, b) => examTime(a) - examTime(b));
  const weekPct = (c: string) => {
    const rows = data.weeks.filter((w) => w.course === c);
    return rows.length >= 2 ? pct(rows[rows.length - 1].right, rows[rows.length - 1].total) : null;
  };
  const fullSet = new Set<string>();
  if (byExam.length) {
    fullSet.add(byExam[0]);
    const scored = courses.filter((c) => c !== byExam[0] && weekPct(c) !== null).sort((a, b) => weekPct(a)! - weekPct(b)!);
    const second = scored[0] || byExam[1];
    if (second) fullSet.add(second);
  }
  /** 'full' = whole loop, 'cards' = cards only, '' = no exam dates yet so no tag. */
  const tagOf = (c: string): '' | 'full' | 'cards' => {
    if (!c || !byExam.length) return '';
    if (data.override[c] && examTime(c)) return data.override[c];
    return fullSet.has(c) ? 'full' : 'cards';
  };
  const flipTag = (c: string) => save({ ...data, override: { ...data.override, [c]: tagOf(c) === 'full' ? 'cards' : 'full' } });
  const daysTo = (c: string) => Math.max(0, Math.ceil((examTime(c) - now) / DAY));

  // ---------- Today: the one thing to do next ----------
  const unfinished = data.lectures.filter((l) => l.done.some((d) => !d));
  const fresh = unfinished
    .filter((l) => now - l.t <= 2 * DAY)
    .sort((a, b) => (tagOf(a.course) === 'cards' ? 1 : 0) - (tagOf(b.course) === 'cards' ? 1 : 0) || b.t - a.t);
  const late = unfinished.filter((l) => now - l.t > 2 * DAY);
  const lastWeekT = Math.max(0, ...data.weeks.map((w) => w.t));
  const weeklyToday = data.weeklyDay === new Date().getDay() && now - lastWeekT > 5 * DAY;
  const lname = (l: Lecture) => `${l.course ? `${l.course}: ` : ''}${l.name}`;
  const stepOf = (l: Lecture) => Math.min(l.step ?? Math.max(0, l.done.indexOf(false)), STEPS.length - 1);
  const goLecture = (l: Lecture, step?: number) => {
    if (step !== undefined) patch(l, { step });
    setOpenId(l.id);
    setTab('lecture');
  };
  interface Task {
    key: string;
    text: string;
    sub?: string;
    button: string;
    go: () => void;
    extra?: { button: string; go: () => void };
  }
  const tasks: Task[] = [];
  if (dueMisses.length)
    tasks.push({
      key: 'miss',
      text: `Re-test ${dueMisses.length} ${dueMisses.length === 1 ? 'miss' : 'misses'} from last week`,
      sub: 'Use a fresh question on the same idea.',
      button: 'Do re-tests',
      go: () => setTab('misses'),
    });
  for (const l of fresh) {
    const cardsOnly = tagOf(l.course) === 'cards';
    const i = cardsOnly ? Math.max(stepOf(l), 4) : stepOf(l);
    tasks.push({
      key: l.id,
      text: `${lname(l)}`,
      sub: `Step ${i + 1}: ${STEPS_FULL[i].title} (${STEPS_FULL[i].time})${cardsOnly ? '. Cards only for this course right now.' : ''}`,
      button: i === MAP_STEP ? 'Start 20 min map' : `Go to step ${i + 1}`,
      go: () => {
        goLecture(l, i);
        if (i === MAP_STEP) startTimer();
      },
    });
  }
  for (const l of late)
    tasks.push({
      key: l.id,
      text: `${lname(l)}`,
      sub: `Late (started ${day(l.t)}). Do the cards and the quick test only.`,
      button: 'Go to cards',
      go: () => goLecture(l, Math.max(stepOf(l), 4)),
      extra: { button: 'Mark done', go: () => patch(l, { done: l.done.map(() => true), step: STEPS.length }) },
    });
  for (const l of redrawDue)
    tasks.push({
      key: `r${l.id}`,
      text: `Redraw ${lname(l)} from memory`,
      sub: 'Blank page or the Bubble Map redraw. No sources.',
      button: 'Open redraws',
      go: () => setTab('week'),
    });
  if (weeklyToday)
    tasks.push({ key: 'wk', text: 'Weekly review', sub: 'Mixed question set and your weekly number.', button: 'Open Weekly', go: () => setTab('week') });

  // ---------- Quick miss ----------
  const [qm, setQm] = useState({ open: false, paste: false, question: '', said: '', right: '', lectureId: '', bulk: '' });
  const [offer, setOffer] = useState<{ lectureId: string; right: string } | null>(null);
  const [qmNote, setQmNote] = useState('');
  const recent = data.lectures.slice(0, 10);
  const bulkRows = qm.bulk
    .split('\n')
    .map((line) => line.split('|').map((x) => x.trim()))
    .filter((p) => p[0] && p.length >= 2 && p[p.length - 1]);
  const saveQuick = () => {
    const lec = data.lectures.find((l) => l.id === (qm.lectureId || recent[0]?.id));
    const rows = qm.paste
      ? bulkRows.map((p) => ({ question: p[0], said: p.length >= 3 ? p[1] : '', right: p[p.length - 1] }))
      : qm.question.trim() && qm.right.trim()
      ? [{ question: qm.question.trim(), said: qm.said.trim(), right: qm.right.trim() }]
      : [];
    if (!rows.length) return setQmNote(qm.paste ? 'Each line needs: question | what I said | right reason' : 'It needs the question and the right reason.');
    const made: Miss[] = rows.map((r) => ({
      id: uid(),
      t: Date.now(),
      due: Date.now() + 7 * DAY,
      where: lec ? lname(lec) : '',
      lectureId: lec?.id,
      ...r,
    }));
    save({ ...data, misses: [...made, ...data.misses] });
    setQm({ ...qm, question: '', said: '', right: '', bulk: '' });
    setQmNote(`Logged ${made.length}. Re-test on ${day(made[0].due)}.`);
    setOffer(lec?.remId && made.length === 1 ? { lectureId: lec.id, right: made[0].right } : null);
  };
  const addWhatIf = async () => {
    const lec = data.lectures.find((l) => l.id === offer?.lectureId);
    if (!lec?.remId || !offer) return;
    try {
      await addCard(plugin, lec.remId, 'What if (rewrite me): the step I got wrong were changed or blocked. What happens, and why?', offer.right);
      setQmNote('Card added to the lecture page. Reword the front so it names the step.');
    } catch (e: any) {
      setQmNote(`Could not add the card: ${String(e?.message || e)}`);
    }
    setOffer(null);
  };

  // ---------- Teach it ----------
  const [teachNote, setTeachNote] = useState('');
  const teachText = (l: Lecture) =>
    [
      'Please check my explanation. I wrote it from memory for a first-year student.',
      'Check three things: is the reason right, do the arrows go the right way, and is every big word explained?',
      'Do not teach me new material. Tell me which sentence to fix first.',
      '',
      `TOPIC: ${lname(l)}`,
      `MY EXPLANATION: ${l.teach || ''}`,
      `MY OWN CHECK, NOT SURE ABOUT: ${TEACH_CHECKS.filter((_, j) => !l.teachOk?.[j]).join('; ') || 'nothing'}`,
    ].join('\n');
  const addOpenQ = async (l: Lecture) => {
    if (!l.remId) return setTeachNote('This lecture is not linked to a page.');
    const no = TEACH_CHECKS.filter((_, j) => !l.teachOk?.[j]);
    try {
      await addChild(plugin, l.remId, `?? Explain again from memory (${no.join('; ').toLowerCase()})`);
      setTeachNote('Added a ?? note to the lecture page.');
    } catch (e: any) {
      setTeachNote(`Could not add it: ${String(e?.message || e)}`);
    }
  };

  // ---------- Lecture tab ----------
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
  const [qText, setQText] = useState('');
  const [qShape, setQShape] = useState('Thing');
  const [note, setNote] = useState('');
  const [score, setScore] = useState({ right: '', total: '' });
  /** Put the typed questions into the lecture's page, each with its fixed questions under it. */
  const addQuestions = async (l: Lecture) => {
    const lines = qText.split('\n').map((x) => x.trim()).filter(Boolean);
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

  // 20-minute map timer
  const [left, setLeft] = useState<number | null>(null);
  const tick = useRef<ReturnType<typeof setInterval>>();
  useEffect(() => () => clearInterval(tick.current), []);
  const startTimer = () => {
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

  // ---------- Miss log ----------
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

  // ---------- Weekly ----------
  const [wk, setWk] = useState({ course: '', right: '', total: '' });
  const [newCourse, setNewCourse] = useState('');
  const addWeek = () => {
    const right = Number(wk.right);
    const total = Number(wk.total);
    if (!wk.course.trim() || !total || right > total || right < 0) return;
    save({ ...data, weeks: [...data.weeks, { t: Date.now(), course: wk.course.trim(), right, total }] });
    setWk({ course: wk.course, right: '', total: '' });
  };

  if (!ready) return <div style={{ padding: 10, fontSize: 12 }}>Loading…</div>;

  return (
    <div style={{ padding: 8, fontSize: 12, lineHeight: 1.45, overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
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

      {tab === 'today' && (
        <>
          {tasks.length > 0 ? (
            <div style={{ ...box, borderColor: '#4C9AFF' }}>
              <div style={dim}>Now</div>
              <b style={{ fontSize: 14 }}>{tasks[0].text}</b>
              {tasks[0].sub && <div>{tasks[0].sub}</div>}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button style={{ ...pill(true), padding: '8px 16px', fontSize: 13 }} onClick={tasks[0].go}>
                  {tasks[0].button}
                </button>
                {tasks[0].extra && (
                  <button style={pill(false)} onClick={tasks[0].extra.go}>
                    {tasks[0].extra.button}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={box}>
              <b style={{ color: GOOD }}>{data.lectures.length ? 'Done for today.' : 'Welcome.'}</b>
              <div>{data.lectures.length ? 'Nothing is due. Had a new lecture? Start it below.' : 'Which lecture did you have today? Start it below and this screen will tell you what to do next.'}</div>
            </div>
          )}
          {tasks.length > 1 && (
            <div style={box}>
              <div style={dim}>Also today</div>
              {tasks.slice(1, 4).map((t) => (
                <div key={t.key} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
                  <span style={{ flex: 1 }}>
                    {t.text}
                    {t.sub && <div style={dim}>{t.sub}</div>}
                  </span>
                  <button style={pill(false)} onClick={t.go}>
                    {t.button}
                  </button>
                </div>
              ))}
              {tasks.length > 4 && <div style={{ ...dim, marginTop: 6 }}>and {tasks.length - 4} more after these</div>}
            </div>
          )}
          {byExam.length > 0 && (
            <div style={box}>
              <div style={dim}>This week's focus. Tap a tag to change it.</div>
              {courses.map((c) => (
                <div key={c} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                  <span style={{ flex: 1 }}>
                    {c}
                    {examTime(c) ? <span style={dim}> · exam in {daysTo(c)} {daysTo(c) === 1 ? 'day' : 'days'}</span> : null}
                  </span>
                  <button style={{ ...pill(tagOf(c) === 'full'), padding: '2px 8px' }} onClick={() => flipTag(c)}>
                    {tagOf(c) === 'full' ? 'Full loop' : 'Cards only'}
                  </button>
                </div>
              ))}
            </div>
          )}
          {byExam.length === 0 && data.lectures.length > 0 && (
            <div style={{ ...dim, marginTop: 8 }}>
              Add your exam dates in Weekly, and this screen will say which course gets the full loop.
            </div>
          )}
          <div style={box}>
            <b>Start a lecture</b>
            <div style={dim}>Do this within a day of class. Open the lecture's page first so it gets linked.</div>
            <input style={field} list="wl-courses" placeholder="Course (for example BN 779)" value={course} onChange={(e) => setCourse(e.target.value)} />
            <input style={field} placeholder={pageName ? `Lecture name (blank uses "${pageName}")` : 'Lecture name'} value={name} onChange={(e) => setName(e.target.value)} />
            <button style={{ ...pill(true), marginTop: 6 }} onClick={addLecture}>
              Start
            </button>
          </div>
          <div style={box}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }} onClick={() => setQm({ ...qm, open: !qm.open })}>
              <b style={{ flex: 1 }}>Quick miss</b>
              <span style={dim}>{qm.open ? 'Hide' : 'Got a practice question wrong? Log it'}</span>
            </div>
            {qm.open && (
              <>
                <div style={dim}>Only wrong reasoning, not careless slips. It comes back for a re-test in one week.</div>
                {qm.paste ? (
                  <>
                    <textarea
                      style={{ ...field, minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }}
                      placeholder={'One miss per line:\nquestion | what I said | right reason'}
                      value={qm.bulk}
                      onChange={(e) => setQm({ ...qm, bulk: e.target.value })}
                    />
                    <div style={dim}>{bulkRows.length} {bulkRows.length === 1 ? 'miss' : 'misses'} read so far.</div>
                  </>
                ) : (
                  <>
                    <input style={field} placeholder="The question (a few words is fine)" value={qm.question} onChange={(e) => setQm({ ...qm, question: e.target.value })} />
                    <input style={field} placeholder="What I said" value={qm.said} onChange={(e) => setQm({ ...qm, said: e.target.value })} />
                    <input style={field} placeholder="The right reason" value={qm.right} onChange={(e) => setQm({ ...qm, right: e.target.value })} />
                  </>
                )}
                {recent.length > 0 && (
                  <select style={field} value={qm.lectureId || recent[0].id} onChange={(e) => setQm({ ...qm, lectureId: e.target.value })}>
                    {recent.map((l) => (
                      <option key={l.id} value={l.id}>
                        {lname(l)}
                      </option>
                    ))}
                  </select>
                )}
                <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                  <button style={pill(true)} onClick={saveQuick}>
                    {qm.paste ? 'Log them all' : 'Log it'}
                  </button>
                  <button style={pill(false)} onClick={() => setQm({ ...qm, paste: !qm.paste })}>
                    {qm.paste ? 'One at a time' : 'Paste several'}
                  </button>
                </div>
                {qmNote && <div style={{ marginTop: 4, color: GOOD }}>{qmNote}</div>}
                {offer && (
                  <div style={{ marginTop: 6 }}>
                    Add a what-if card to that lecture's page?{' '}
                    <button style={pill(true)} onClick={addWhatIf}>
                      Yes
                    </button>{' '}
                    <button style={pill(false)} onClick={() => setOffer(null)}>
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
                {open && (() => {
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
                          style={{
                            ...pill(j === i),
                            padding: '2px 8px',
                            borderColor: l.done[j] ? GOOD : 'rgba(138,147,163,0.5)',
                          }}
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
                        <div>
                          Next: redraw the map from memory around {day(l.t + 7 * DAY)}. It will show up in the Weekly tab.
                        </div>
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
                        {i === 1 && (
                          <div style={{ marginTop: 8 }}>
                            <textarea
                              style={{ ...field, minHeight: 70, resize: 'vertical', fontFamily: 'inherit' }}
                              placeholder={'Your how and why questions, one per line'}
                              value={qText}
                              onChange={(e) => setQText(e.target.value)}
                            />
                            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                              <span style={dim}>Shape:</span>
                              {Object.keys(QUESTION_SETS).map((k) => (
                                <button key={k} style={{ ...pill(qShape === k), padding: '2px 8px' }} onClick={() => setQShape(k)} title={QUESTION_SETS[k].join('  ')}>
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
                              {left === null ? (
                                <button style={pill(false)} onClick={(e) => (e.preventDefault(), startTimer())}>
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
                        {i === 5 && (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
                            <input style={{ ...field, marginTop: 0 }} inputMode="numeric" placeholder="Right" value={score.right} onChange={(e) => setScore({ ...score, right: e.target.value })} />
                            <input style={{ ...field, marginTop: 0 }} inputMode="numeric" placeholder="Out of" value={score.total} onChange={(e) => setScore({ ...score, total: e.target.value })} />
                            <button
                              style={pill(false)}
                              onClick={() => {
                                const r = Number(score.right);
                                const t = Number(score.total);
                                if (t > 0 && r >= 0 && r <= t) patch(l, { quick: [r, t] });
                              }}
                            >
                              Save
                            </button>
                          </div>
                        )}
                        {i === 5 && l.quick && (
                          <div style={{ marginTop: 4 }}>
                            Saved: {l.quick[0]} of {l.quick[1]}.
                          </div>
                        )}
                        {i === 5 && (
                          <div style={{ ...box, marginTop: 10 }}>
                            <b>Teach it</b> <span style={dim}>(about 3 min)</span>
                            <div>
                              Pick the idea you felt least sure about. Explain it to a first-year student in about 5
                              sentences. No notes, and no big words without saying what they mean.
                            </div>
                            <textarea
                              style={{ ...field, minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }}
                              placeholder="Your explanation, from memory"
                              value={l.teach || ''}
                              onChange={(e) => patch(l, { teach: e.target.value })}
                            />
                            <div style={{ ...dim, marginTop: 6 }}>Now open your notes and check yourself:</div>
                            {TEACH_CHECKS.map((text, j) => (
                              <label key={text} style={{ display: 'flex', gap: 8, marginTop: 3, cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={!!l.teachOk?.[j]}
                                  onChange={(e) => {
                                    const row = [...(l.teachOk || [false, false, false])];
                                    row[j] = e.target.checked;
                                    patch(l, { teachOk: row });
                                  }}
                                />
                                {text}
                              </label>
                            ))}
                            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                              {l.remId && (
                                <button style={pill(false)} onClick={() => openPage(l.remId)}>
                                  Show my notes
                                </button>
                              )}
                              {(l.teach || '').trim() && (l.teachOk || []).filter(Boolean).length < 3 && l.remId && (
                                <button style={pill(false)} onClick={() => addOpenQ(l)}>
                                  Add a ?? to my page
                                </button>
                              )}
                              {(l.teach || '').trim() && (
                                <button
                                  style={pill(false)}
                                  onClick={async () =>
                                    setTeachNote((await copyText(teachText(l))) ? 'Copied. Paste it to an AI such as Claude if you want a second check.' : 'Could not copy from here.')
                                  }
                                >
                                  Copy for checking
                                </button>
                              )}
                            </div>
                            {teachNote && <div style={{ marginTop: 4, color: GOOD }}>{teachNote}</div>}
                          </div>
                        )}
                        {i === 6 && (
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
                          {i === 2 && (
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
                      <button
                        style={pill(false)}
                        onClick={() => save({ ...data, lectures: data.lectures.filter((x) => x.id !== l.id) })}
                      >
                        Remove
                      </button>
                    </div>
                  </>
                  );
                })()}
              </div>
            );
          })}
        </>
      )}

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
          {data.misses.filter((m) => !m.closed).length === 0 && <div style={{ ...dim, marginTop: 8 }}>Nothing open in the log.</div>}
          {data.misses
            .filter((m) => !m.closed)
            .sort((a, b) => a.due - b.due)
            .map((m) => {
              const due = m.due <= now;
              return (
                <div key={m.id} style={{ ...box, borderColor: due ? WARN : 'rgba(138,147,163,0.3)' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <b style={{ flex: 1 }}>{m.question}</b>
                    <span style={{ color: due ? WARN : undefined, ...(due ? {} : dim) }}>
                      {due ? 'Re-test now' : `Re-test ${day(m.due)}`}
                    </span>
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
          {data.misses.some((m) => m.closed) && (
            <div style={{ ...dim, marginTop: 8 }}>{data.misses.filter((m) => m.closed).length} fixed on re-test so far.</div>
          )}
        </>
      )}

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
                {DAYS.map((d, j) => (
                  <option key={d} value={j}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={box}>
            <b>1. Redraw this week's maps</b>
            <div style={dim}>Blank page, no sources. Draw the whole map from memory, then compare and fix it in another color. This is the most important step.</div>
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
            {[...new Set(data.weeks.map((w) => w.course))].map((c) => {
              const rows = data.weeks.filter((w) => w.course === c).slice(-8);
              return (
                <div key={c} style={{ marginTop: 8 }}>
                  <b>{c}</b>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 46, marginTop: 2 }}>
                    {rows.map((w) => (
                      <div key={w.t} title={`${day(w.t)}: ${w.right} of ${w.total}`} style={{ textAlign: 'center' }}>
                        <div style={{ width: 26, height: Math.max(3, (pct(w.right, w.total) / 100) * 30), background: '#4C9AFF', borderRadius: 3 }} />
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
