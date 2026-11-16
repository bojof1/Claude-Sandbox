import { useEffect, useRef, useState } from 'react';
import { usePlugin } from '@remnote/plugin-sdk';
import { addChild, QUESTION_SETS, richTextToLabel } from './rem';

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
}

const EMPTY: Data = { lectures: [], misses: [], weeks: [] };
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
  const [tab, setTab] = useState<'lecture' | 'misses' | 'week'>('lecture');
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
  const courses = [...new Set([...data.lectures.map((l) => l.course), ...data.weeks.map((w) => w.course)])].filter(Boolean);
  const dueMisses = data.misses.filter((m) => !m.closed && m.due <= now);
  const lastRedraw = (l: Lecture) => l.redrawn || 0;
  const redrawDue = data.lectures.filter((l) => now - l.t >= 6 * DAY && now - lastRedraw(l) >= 7 * DAY);

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

      {tab === 'lecture' && (
        <>
          <div style={box}>
            <b>Start a lecture</b>
            <div style={dim}>Do this within a day of class. Open the lecture's page first so it gets linked.</div>
            <input style={field} list="wl-courses" placeholder="Course (for example BN 779)" value={course} onChange={(e) => setCourse(e.target.value)} />
            <input style={field} placeholder={pageName ? `Lecture name (blank uses "${pageName}")` : 'Lecture name'} value={name} onChange={(e) => setName(e.target.value)} />
            <button style={{ ...pill(true), marginTop: 6 }} onClick={addLecture}>
              Start
            </button>
          </div>
          {data.lectures.length === 0 && <div style={{ ...dim, marginTop: 8 }}>No lectures yet.</div>}
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
