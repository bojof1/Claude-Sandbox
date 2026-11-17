import { useEffect, useMemo, useRef, useState } from 'react';
import { usePlugin } from '@remnote/plugin-sdk';
import {
  Attempt,
  check,
  Check,
  ConceptState,
  DAY,
  emptyState,
  guessShape,
  isMastered,
  LEVELS,
  masteryPct,
  Point,
  pointsFor,
  record,
  score,
  Score,
  Shape,
  stem,
  suggestBack,
  sameWord,
  weakest,
  whatIfTarget,
  words,
  buildPoints,
  allText,
} from './analyze';
import { addQueueCard, copyText, loadPage, Loaded, namesOf, QUEUE_FRONT } from './rem';

/**
 * Feynman Coach: explain an idea from memory in plain words, get checked against your own notes,
 * fix the gaps, and climb five levels until the idea is mastered.
 * Everything is saved in your RemNote account, so it follows you between devices.
 */

const KEY = 'fc-data';
const DRAFT = 'fc-draft';

interface Saved {
  name: string;
  shape?: Shape;
  state: ConceptState;
  /** Your last explanation, to compare next time. */
  last?: string;
  queueCard?: string;
}
interface Data {
  concepts: Record<string, Saved>;
}
const EMPTY: Data = { concepts: {} };

interface Session {
  conceptId: string;
  name: string;
  shape: Shape;
  /** 1 to 5, or 0 for a "fill the gaps" round that does not move you on the ladder. */
  level: number;
  points: Point[];
  allPoints: Point[];
  prompt: string;
  related?: string;
  start: number;
}
interface Result {
  check: Check;
  score: Score;
  prev: ConceptState;
  attempt: Attempt;
  saidDifferently: string[];
  /** Notes for the result that are not in the score parts. */
  extra: string[];
  levelBefore: number;
}

const SELF_CHECKS = ['I did not look at my notes', 'No step felt like magic', 'A 12-year-old could follow it'];
const day = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const pill = (active: boolean): React.CSSProperties => ({
  padding: '6px 11px',
  minHeight: 32,
  borderRadius: 999,
  border: '1px solid rgba(138,147,163,0.5)',
  background: active ? '#4C9AFF' : 'transparent',
  color: active ? 'white' : 'inherit',
  fontSize: 12,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
});
const btn = (main = false): React.CSSProperties => ({
  padding: '8px 14px',
  minHeight: 36,
  borderRadius: 8,
  border: main ? 'none' : '1px solid rgba(138,147,163,0.5)',
  background: main ? '#4C9AFF' : 'transparent',
  color: main ? 'white' : 'inherit',
  fontSize: 13,
  fontWeight: main ? 600 : 400,
  cursor: 'pointer',
});
const box: React.CSSProperties = {
  border: '1px solid rgba(138,147,163,0.3)',
  borderRadius: 10,
  padding: 10,
  marginTop: 8,
};
const dim: React.CSSProperties = { opacity: 0.65 };
const WARN = '#F2994A';
const GOOD = '#36B37E';
const BAD = '#EB5757';

function Bar({ value, color = '#4C9AFF' }: { value: number; color?: string }) {
  return (
    <div style={{ height: 6, borderRadius: 3, background: 'rgba(138,147,163,0.25)', marginTop: 4 }}>
      <div style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: 6, borderRadius: 3, background: color }} />
    </div>
  );
}

function Ladder({ s }: { s: ConceptState }) {
  const done = isMastered(s);
  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
      {LEVELS.map((l) => {
        const passed = done || l.n < s.level;
        const here = !done && l.n === s.level;
        return (
          <div
            key={l.n}
            title={`${l.n}. ${l.name}`}
            style={{
              flex: 1,
              textAlign: 'center',
              fontSize: 10,
              padding: '3px 0',
              borderRadius: 6,
              background: passed ? GOOD : here ? '#4C9AFF' : 'rgba(138,147,163,0.2)',
              color: passed || here ? 'white' : 'inherit',
            }}
          >
            {l.name}
          </div>
        );
      })}
    </div>
  );
}

export function FeynmanCoach({ pageId, lineId }: { pageId: string | undefined; lineId: string | undefined }) {
  const plugin = usePlugin();
  const [data, setData] = useState<Data>(EMPTY);
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<'home' | 'explain' | 'result'>('home');
  const [source, setSource] = useState<'page' | 'line'>('page');
  const targetId = source === 'line' && lineId ? lineId : pageId;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadNote, setLoadNote] = useState('');
  const [reloadTick, setReloadTick] = useState(0);
  const [sess, setSess] = useState<Session | null>(null);
  const [text, setText] = useState('');
  const [sure, setSure] = useState(0);
  const [ticks, setTicks] = useState<boolean[]>([false, false, false]);
  const [result, setResult] = useState<Result | null>(null);
  const [note, setNote] = useState('');
  const [practice, setPractice] = useState<number | null>(null);
  const [related, setRelated] = useState<{ id: string; name: string }[]>([]);
  const [relatedPick, setRelatedPick] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const dataRef = useRef(data);
  dataRef.current = data;

  // ---------- Saved data ----------
  useEffect(() => {
    plugin.storage
      .getSynced<Data>(KEY)
      .then((d) => setData({ ...EMPTY, ...(d || {}), concepts: { ...((d && d.concepts) || {}) } }))
      .catch(() => {})
      .then(() => setReady(true));
    // a draft left when the sidebar closed mid-explanation
    plugin.storage
      .getLocal<{ sess: Session; text: string; sure: number; ticks: boolean[] }>(DRAFT)
      .then((d) => {
        if (d && d.sess && d.text && Date.now() - d.sess.start < 2 * DAY) {
          setSess(d.sess);
          setText(d.text);
          setSure(d.sure || 0);
          setTicks(d.ticks || [false, false, false]);
          setScreen('explain');
        }
      })
      .catch(() => {});
  }, [plugin]);

  const save = (next: Data) => {
    setData(next);
    plugin.storage.setSynced(KEY, next).catch(() => setNote('Could not save to RemNote. Your work is still on screen.'));
  };
  const patchConcept = (id: string, change: Partial<Saved>) => {
    const d = dataRef.current;
    const cur = d.concepts[id] || { name: change.name || 'Untitled', state: emptyState() };
    save({ ...d, concepts: { ...d.concepts, [id]: { ...cur, ...change } } });
  };

  // keep the draft while typing, so closing the sidebar loses nothing
  useEffect(() => {
    if (screen !== 'explain' || !sess) return;
    const h = setTimeout(() => plugin.storage.setLocal(DRAFT, { sess, text, sure, ticks }).catch(() => {}), 600);
    return () => clearTimeout(h);
  }, [text, sure, ticks, sess, screen, plugin]);
  const clearDraft = () => plugin.storage.setLocal(DRAFT, null).catch(() => {});

  // a clock for the timer and "ready now" labels
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), screen === 'explain' ? 1000 : 30000);
    return () => clearInterval(h);
  }, [screen]);

  // ---------- Read the notes for the page (or line) ----------
  useEffect(() => {
    let cancelled = false;
    setLoaded(null);
    setLoadNote('');
    setRelated([]);
    setPractice(null);
    setRelatedPick('');
    if (!targetId) return;
    setLoading(true);
    loadPage(plugin, targetId)
      .then(async (l) => {
        if (cancelled) return;
        setLoaded(l);
        if (l) {
          const names = await namesOf(plugin, l.linked);
          if (!cancelled) setRelated(names);
        }
      })
      .catch(() => !cancelled && setLoadNote('Could not read this page. Try Reload notes.'))
      .then(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [targetId, plugin, reloadTick]);

  const points = useMemo(() => (loaded ? buildPoints(loaded.root, loaded.name) : []), [loaded]);
  const saved = targetId ? data.concepts[targetId] : undefined;
  const state = saved?.state || emptyState();
  const autoShape = useMemo(() => (loaded ? guessShape(allText(loaded.root)) : 'Thing'), [loaded]);
  const shape: Shape = saved?.shape || autoShape;
  const mains = points.filter((p) => p.main);

  // ---------- Start an explanation ----------
  const promptFor = (level: number, name: string, st: ConceptState, pts: Point[], rel?: string): { prompt: string; use: Point[] } => {
    const L = LEVELS[level - 1];
    if (level === 3) {
      const target = whatIfTarget(st, pts);
      const what = target ? (target.text.length > 140 ? `${target.text.slice(0, 140)}...` : target.text) : name;
      const focus = target ? pts.filter((p) => p.id === target.id || (p.area === target.area && !p.main)).map((p) => p.id) : [];
      return {
        prompt: `What would happen if this went wrong or was missing: "${what}"? Walk through what happens next, step by step, and why.`,
        use: pointsFor(L, pts, focus),
      };
    }
    if (level === 4)
      return {
        prompt: `How does ${name} connect to ${rel || 'a related idea'}? Explain ${name} first, then say what one does to the other.`,
        use: pointsFor(L, pts),
      };
    const weak = weakest(st, pts, 2);
    const extra = level === 2 && weak.length ? ` Take extra care with: ${[...new Set(weak.map((w) => w.area))].join('; ')}.` : '';
    return { prompt: `${L.ask}${extra}`, use: pointsFor(L, pts) };
  };

  const begin = (level: number) => {
    if (!targetId || !loaded || !points.length) return;
    if (level === 4 && !relatedPick.trim()) return setNote('Pick or type the idea to connect to first.');
    const { prompt, use } = promptFor(level, loaded.name, state, points, relatedPick.trim());
    setSess({
      conceptId: targetId,
      name: loaded.name,
      shape,
      level,
      points: use,
      allPoints: points,
      prompt,
      related: level === 4 ? relatedPick.trim() : undefined,
      start: Date.now(),
    });
    if (!saved) patchConcept(targetId, { name: loaded.name, state: emptyState() });
    setText('');
    setSure(0);
    setTicks([false, false, false]);
    setResult(null);
    setNote('');
    setShowNotes(false);
    setScreen('explain');
  };

  /** A round on only the parts you missed. Practice only: it does not move you on the ladder. */
  const beginGaps = () => {
    if (!sess || !result) return;
    const missed = result.check.points.filter((p) => p.status !== 'hit').map((p) => p.id);
    const use = sess.points.filter((p) => missed.includes(p.id));
    if (!use.length) return;
    const areas = [...new Set(use.map((p) => (p.main ? p.text : p.area)))];
    setSess({
      ...sess,
      level: 0,
      points: use,
      prompt: `Explain only the parts you missed, in plain words and with reasons: ${areas.join('; ')}. Read your notes on them first if you need to, then close them.`,
      start: Date.now(),
    });
    setText('');
    setSure(0);
    setTicks([false, false, false]);
    setResult(null);
    setScreen('explain');
  };

  // ---------- Check ----------
  const evaluate = (s: Session, txt: string, said: string[], tickCount: number, prev: ConceptState, sureNow: number): Result => {
    const noteWords = [...new Set(s.allPoints.flatMap((p) => p.terms))];
    const c = check(txt, s.points, s.shape, noteWords);
    // "I said this differently": count those points as said
    for (const r of c.points) if (said.includes(r.id)) r.status = 'hit';
    if (c.points.length)
      c.coverage = c.points.reduce((a, r) => a + (r.status === 'hit' ? 1 : r.status === 'part' ? 0.4 : 0), 0) / c.points.length;
    const L = LEVELS[Math.max(1, s.level) - 1];
    const sc = score(c, s.level === 0 ? { ...L, n: 0 } : L, tickCount, s.shape);
    const extra: string[] = [];
    if (s.level === 4 && s.related) {
      const relStems = words(s.related).map((x) => stem(x.w)).filter((x) => x.length >= 3);
      const said = words(txt).map((x) => stem(x.w));
      const named = relStems.length > 0 && relStems.every((r) => said.some((x) => sameWord(x, r)));
      if (!named) {
        sc.total = Math.min(sc.total, 60);
        extra.push(`You never named ${s.related}, so the link was not shown.`);
      }
    }
    if (s.level === 1 && !c.analogy) extra.push('Try one comparison to everyday life ("it is like a ...").');
    if (s.shape === 'Calculation' && !c.hasNumbers) extra.push('Walk through one example with real numbers.');
    const misses = c.points.filter((p) => p.status !== 'hit').map((p) => p.id);
    const attempt: Attempt = { t: Date.now(), level: s.level, score: sc.total, missed: misses, sure: sureNow || undefined, words: c.words };
    return { check: c, score: sc, prev, attempt, saidDifferently: said, extra, levelBefore: prev.level };
  };

  const commit = (s: Session, r: Result, txt: string) => {
    const hits = r.check.points.filter((p) => p.status === 'hit').map((p) => p.id);
    const misses = r.check.points.filter((p) => p.status !== 'hit').map((p) => p.id);
    const next = record(r.prev, r.attempt, hits, misses);
    const cur = dataRef.current.concepts[s.conceptId];
    patchConcept(s.conceptId, { name: s.name, shape: cur?.shape, state: next, last: txt.slice(0, 4000) });
  };

  const runCheck = () => {
    if (!sess) return;
    if (words(text).length < 5) return setNote('Write at least a few sentences first.');
    const prev = dataRef.current.concepts[sess.conceptId]?.state || emptyState();
    const r = evaluate(sess, text, [], ticks.filter(Boolean).length, prev, sure);
    setResult(r);
    commit(sess, r, text);
    clearDraft();
    setNote('');
    setScreen('result');
  };

  const saidDifferently = (id: string) => {
    if (!sess || !result) return;
    const said = [...result.saidDifferently, id];
    const r = evaluate(sess, text, said, ticks.filter(Boolean).length, result.prev, sure);
    setResult(r);
    commit(sess, r, text);
  };

  // ---------- Extras ----------
  const openRem = async (id?: string) => {
    if (!id) return;
    try {
      const rem = await plugin.rem.findOne(id);
      if (rem) await plugin.window.openRem(rem);
    } catch {
      setNote('Could not open that note.');
    }
  };

  const queue = async () => {
    if (!targetId || !loaded) return;
    if (saved?.queueCard) {
      const exists = await plugin.rem.findOne(saved.queueCard).catch(() => undefined);
      if (exists) return setNote('This idea is already in your RemNote queue.');
    }
    try {
      const id = await addQueueCard(
        plugin,
        targetId,
        `${QUEUE_FRONT} ${loaded.name}`,
        'Open Feynman Coach in the right sidebar and do your next level. Grade this card by how that went.',
      );
      patchConcept(targetId, { name: loaded.name, queueCard: id });
      setNote('Added one card under this page. RemNote will bring the idea back on its own schedule.');
    } catch {
      setNote('Could not add the card. Check that the page is not read-only.');
    }
  };

  const copyForClaude = async () => {
    if (!sess || !result) return;
    const L = sess.level ? LEVELS[sess.level - 1] : null;
    const missed = result.check.points.filter((p) => p.status !== 'hit');
    const lines = [
      'Please grade my Feynman explanation like a strict but kind tutor. Use plain words.',
      `Topic: ${sess.name}`,
      L ? `Level ${L.n} (${L.name}): ${sess.prompt}` : `Gaps round: ${sess.prompt}`,
      '',
      'My notes (the answer key):',
      ...sess.points.map((p) => `- ${p.text}`),
      '',
      'My explanation:',
      text,
      '',
      `The plugin's check: ${result.score.total}/100. Missed or partly said: ${missed.map((m) => sess.points.find((p) => p.id === m.id)?.text || '').join(' | ') || 'none'}. Big words not explained: ${result.check.bigWords.join(', ') || 'none'}.`,
      '',
      'Tell me: 1) anything I got wrong or left out, 2) any step that sounds right but is not, 3) one harder question to test me next.',
    ];
    const ok = await copyText(lines.join('\n'));
    setNote(ok ? 'Copied. Paste it into a chat with Claude.' : 'Could not copy. Select the text by hand.');
  };

  const removeConcept = (id: string) => {
    const { [id]: _, ...rest } = dataRef.current.concepts;
    save({ ...dataRef.current, concepts: rest });
    setRemoving(null);
  };

  // ---------- Screens ----------
  if (!ready) return <div style={{ padding: 12, ...dim }}>Loading...</div>;

  const wrap: React.CSSProperties = { padding: 12, fontSize: 13, lineHeight: 1.45, overflowY: 'auto', height: '100%', boxSizing: 'border-box' };
  const Note = () => (note ? <div style={{ ...box, borderColor: WARN, fontSize: 12 }}>{note}</div> : null);

  if (screen === 'explain' && sess) {
    const secs = Math.max(0, Math.floor((now - sess.start) / 1000));
    const wc = words(text).length;
    const L = sess.level ? LEVELS[sess.level - 1] : null;
    return (
      <div style={wrap}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b>{L ? `Level ${L.n}: ${L.name}` : 'Fill the gaps'}</b>
          <span style={dim}>
            {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}
          </span>
        </div>
        <div style={{ ...dim, fontSize: 12 }}>{sess.name}</div>
        <div style={{ ...box, background: 'rgba(76,154,255,0.08)' }}>{sess.prompt}</div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type your explanation here, from memory. Short sentences. Say why, not just what."
          autoFocus
          style={{
            width: '100%',
            boxSizing: 'border-box',
            minHeight: 220,
            marginTop: 8,
            padding: 10,
            borderRadius: 8,
            border: '1px solid rgba(138,147,163,0.5)',
            background: 'transparent',
            color: 'inherit',
            fontSize: 14,
            lineHeight: 1.5,
            resize: 'vertical',
          }}
        />
        <div style={{ ...dim, fontSize: 11 }}>{wc} words</div>
        <div style={{ marginTop: 10, fontSize: 12 }}>How sure are you that this is right?</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} style={pill(sure === n)} onClick={() => setSure(n)}>
              {['Guessing', 'Unsure', 'Fairly', 'Sure', 'Certain'][n - 1]}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 10, fontSize: 12 }}>Tick only what is true:</div>
        {SELF_CHECKS.map((c, i) => (
          <label key={c} style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 30, cursor: 'pointer' }}>
            <input type="checkbox" checked={ticks[i]} onChange={() => setTicks(ticks.map((t, j) => (j === i ? !t : t)))} />
            {c}
          </label>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button style={btn(true)} onClick={runCheck} disabled={wc < 5}>
            Check it
          </button>
          <button
            style={btn()}
            onClick={() => {
              clearDraft();
              setScreen(result ? 'result' : 'home');
            }}
          >
            Cancel
          </button>
        </div>
        <Note />
      </div>
    );
  }

  if (screen === 'result' && sess && result) {
    const c = result.check;
    const L = sess.level ? LEVELS[sess.level - 1] : null;
    const after = dataRef.current.concepts[sess.conceptId]?.state || result.prev;
    const passed = L ? result.score.total >= L.pass : result.score.total >= 70;
    const byId = new Map(sess.points.map((p) => [p.id, p]));
    const missed = c.points.filter((p) => p.status === 'miss');
    const part = c.points.filter((p) => p.status === 'part');
    const hit = c.points.filter((p) => p.status === 'hit');
    let move = '';
    if (L) {
      if (after.level > result.levelBefore) move = `Up to Level ${after.level}: ${LEVELS[after.level - 1].name}.`;
      else if (after.level < result.levelBefore) move = `Back to Level ${after.level} to firm up the basics.`;
      else if (isMastered(after)) move = 'Mastered. Two cold teach-backs, days apart.';
      else if (L.n === 5 && passed) move = 'Cold pass saved. Pass once more at least 3 days later to master it.';
      else if (sess.level !== result.levelBefore) move = 'Practice round. Your level did not change.';
      else move = `Need ${L.pass} to move up.`;
    }
    const sure = result.attempt.sure;
    const calib =
      sure && sure >= 4 && result.score.total < 60
        ? 'You felt sure but scored low. That gap is where exam mistakes come from, so these misses matter most.'
        : sure && sure <= 2 && result.score.total >= 80
          ? 'You knew more than you thought. Trust this one a little more.'
          : '';
    return (
      <div style={wrap}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <b>{L ? `Level ${L.n}: ${L.name}` : 'Fill the gaps'}</b>
          <span style={{ fontSize: 26, fontWeight: 700, color: passed ? GOOD : result.score.total >= 50 ? WARN : BAD }}>{result.score.total}</span>
        </div>
        <div style={{ ...dim, fontSize: 12 }}>{sess.name}</div>
        {move && <div style={{ marginTop: 4, fontWeight: 600 }}>{move}</div>}
        {calib && <div style={{ ...box, borderColor: WARN, fontSize: 12 }}>{calib}</div>}

        <div style={box}>
          {result.score.parts.map((p) => (
            <div key={p.name} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span>{p.name}</span>
                <span style={dim}>
                  {Math.round(p.got)} / {Math.round(p.of)}
                </span>
              </div>
              <Bar value={(100 * p.got) / (p.of || 1)} color={p.got >= p.of * 0.8 ? GOOD : WARN} />
              {p.tip && <div style={{ ...dim, fontSize: 11 }}>{p.tip}</div>}
            </div>
          ))}
          <div style={{ ...dim, fontSize: 11 }}>
            {c.words} words · reading level grade {c.grade} {c.grade > 10 ? '(aim for 8 or lower)' : ''} · {c.strongReasons} "because" links
          </div>
        </div>

        {(missed.length > 0 || part.length > 0) && (
          <div style={box}>
            <b>Gaps</b>
            <div style={{ ...dim, fontSize: 11 }}>From your notes. Read each one, then explain it again.</div>
            {[...missed, ...part].map((r) => {
              const p = byId.get(r.id);
              if (!p) return null;
              return (
                <div key={r.id} style={{ marginTop: 8, paddingLeft: 8, borderLeft: `3px solid ${r.status === 'miss' ? BAD : WARN}` }}>
                  <div>{p.text}</div>
                  {!p.main && <div style={{ ...dim, fontSize: 11 }}>Under: {p.area}</div>}
                  <div style={{ ...dim, fontSize: 11 }}>
                    {r.status === 'part'
                      ? `Partly said (${p.show.filter((_, i) => r.found.includes(p.terms[i])).join(', ')}). Missing: ${p.show.filter((_, i) => !r.found.includes(p.terms[i])).join(', ')}`
                      : `Key words: ${p.show.join(', ')}`}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    <button style={pill(false)} onClick={() => saidDifferently(r.id)}>
                      I said this differently
                    </button>
                    <button style={pill(false)} onClick={() => openRem(p.id)}>
                      Open note
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {(c.bigWords.length > 0 || c.vague.length > 0 || c.orderSwaps.length > 0 || result.extra.length > 0) && (
          <div style={box}>
            <b>Make it simpler</b>
            {c.bigWords.length > 0 && <div style={{ marginTop: 4 }}>Say what these mean in plain words: {c.bigWords.join(', ')}.</div>}
            {c.vague.length > 0 && <div style={{ marginTop: 4 }}>"{c.vague.join('", "')}" can hide a gap. What actually happens there?</div>}
            {c.orderSwaps.map(([a, b]) => (
              <div key={a + b} style={{ marginTop: 4 }}>
                Order: you told "{a}" before "{b}". Your notes have it the other way.
              </div>
            ))}
            {result.extra.map((e) => (
              <div key={e} style={{ marginTop: 4 }}>
                {e}
              </div>
            ))}
          </div>
        )}

        {hit.length > 0 && (
          <details style={{ ...box }}>
            <summary style={{ cursor: 'pointer' }}>Got it ({hit.length})</summary>
            {hit.map((r) => (
              <div key={r.id} style={{ marginTop: 4, color: GOOD }}>
                {byId.get(r.id)?.text}
              </div>
            ))}
          </details>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {missed.length + part.length > 0 && (
            <button style={btn(true)} onClick={beginGaps}>
              Fill the gaps
            </button>
          )}
          <button
            style={btn(!(missed.length + part.length))}
            onClick={() => {
              setScreen('home');
              setResult(null);
            }}
          >
            Done
          </button>
          <button style={btn()} onClick={copyForClaude}>
            Copy for Claude
          </button>
        </div>
        <Note />
      </div>
    );
  }

  // ---------- Home ----------
  const list = Object.entries(data.concepts)
    .map(([id, s]) => ({ id, s, back: suggestBack(s.state), pct: masteryPct(s.state) }))
    .filter((x) => x.s.state.attempts.length)
    .sort((a, b) => (isMastered(a.s.state) ? 1 : 0) - (isMastered(b.s.state) ? 1 : 0) || a.back - b.back || a.pct - b.pct);
  const nextUp = list.find((x) => x.back <= now && !isMastered(x.s.state) && x.id !== targetId);
  const last = state.attempts[state.attempts.length - 1];
  const lvl = practice ?? state.level;
  const L = LEVELS[lvl - 1];

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <b style={{ fontSize: 15 }}>Feynman Coach</b>
        <div style={{ display: 'flex', gap: 4 }}>
          <button style={pill(source === 'page')} onClick={() => setSource('page')}>
            Page
          </button>
          <button style={pill(source === 'line')} onClick={() => setSource('line')} title="Teach just the line your cursor is on, and what is under it">
            This line
          </button>
        </div>
      </div>

      {!targetId && <div style={{ ...box, ...dim }}>{source === 'line' ? 'Click into a line in your notes first.' : 'Open a page of notes to start.'}</div>}
      {targetId && loading && <div style={{ ...box, ...dim }}>Reading your notes...</div>}
      {loadNote && <div style={{ ...box, borderColor: WARN }}>{loadNote}</div>}

      {targetId && loaded && !loading && (
        <div style={box}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <b style={{ fontSize: 14 }}>{loaded.name}</b>
            <span style={{ fontWeight: 700 }}>{masteryPct(state)}%</span>
          </div>
          <Ladder s={state} />
          {!points.length ? (
            <div style={{ marginTop: 8 }}>
              There are no notes under this {source === 'line' ? 'line' : 'page'} yet. The coach checks you against your own notes, so add the key points as lines
              under it first (one idea per line), then tap Reload notes.
            </div>
          ) : (
            <>
              <div style={{ ...dim, fontSize: 11, marginTop: 6 }}>
                Found {mains.length} main {mains.length === 1 ? 'point' : 'points'} and {points.length - mains.length} details in your notes
                {loaded.cut ? ' (big page: only the first 400 lines were read)' : ''}. They stay hidden until you check.
              </div>
              {mains.length > 10 && source === 'page' && (
                <div style={{ fontSize: 11, color: WARN, marginTop: 4 }}>
                  That is a lot for one explanation. Click into one section and use This line to teach it piece by piece.
                </div>
              )}
              <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11, ...dim }}>Type:</span>
                {(['Thing', 'Process', 'Calculation'] as Shape[]).map((sh) => (
                  <button key={sh} style={pill(shape === sh)} onClick={() => patchConcept(targetId, { name: loaded.name, shape: sh, state })}>
                    {sh}
                  </button>
                ))}
              </div>
              {isMastered(state) && <div style={{ marginTop: 8, color: GOOD, fontWeight: 600 }}>Mastered. Come back before the exam for a cold teach-back.</div>}
              <div style={{ marginTop: 10, fontSize: 12 }}>
                <b>
                  {practice ? 'Practice' : 'Next'}: Level {L.n}, {L.name}
                </b>
                <div style={dim}>{L.ask}</div>
              </div>
              {lvl === 4 && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 11, ...dim }}>Connect it to:</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                    {related.map((r) => (
                      <button key={r.id} style={pill(relatedPick === r.name)} onClick={() => setRelatedPick(r.name)}>
                        {r.name.length > 40 ? `${r.name.slice(0, 40)}...` : r.name}
                      </button>
                    ))}
                  </div>
                  <input
                    value={relatedPick}
                    onChange={(e) => setRelatedPick(e.target.value)}
                    placeholder="Or type another idea"
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '6px 10px',
                      borderRadius: 8,
                      border: '1px solid rgba(138,147,163,0.5)',
                      background: 'transparent',
                      color: 'inherit',
                      fontSize: 12,
                      marginTop: 6,
                    }}
                  />
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button style={btn(true)} onClick={() => begin(lvl)}>
                  Start Level {lvl}
                </button>
                <button style={btn()} onClick={queue}>
                  {saved?.queueCard ? 'In queue' : '+ Queue'}
                </button>
                <button style={btn()} onClick={() => setReloadTick((x) => x + 1)}>
                  Reload notes
                </button>
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11, ...dim }}>Practice another level:</span>
                {LEVELS.map((l) => (
                  <button key={l.n} style={pill(lvl === l.n)} onClick={() => setPractice(l.n === state.level ? null : l.n)}>
                    {l.n}
                  </button>
                ))}
              </div>
              {last && (
                <div style={{ ...dim, fontSize: 11, marginTop: 8 }}>
                  Last try {day(last.t)}: {last.score}/100 {last.level ? `at Level ${last.level}` : 'on gaps'}.{' '}
                  {suggestBack(state) > now ? `Best time to come back: ${day(suggestBack(state))}.` : 'Ready for another go.'}
                </div>
              )}
              {saved?.last && (
                <details style={{ marginTop: 6, fontSize: 12 }}>
                  <summary style={{ cursor: 'pointer', ...dim }}>Your last explanation</summary>
                  <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{saved.last}</div>
                </details>
              )}
              <details style={{ marginTop: 6, fontSize: 12 }} open={showNotes} onToggle={(e) => setShowNotes((e.target as HTMLDetailsElement).open)}>
                <summary style={{ cursor: 'pointer', ...dim }}>Peek at the points the coach will look for</summary>
                {showNotes &&
                  mains.map((p) => (
                    <div key={p.id} style={{ marginTop: 4 }}>
                      {p.text} <span style={{ ...dim, fontSize: 11 }}>({p.show.join(', ')})</span>
                    </div>
                  ))}
              </details>
            </>
          )}
        </div>
      )}

      {nextUp && (
        <div style={{ ...box, borderColor: '#4C9AFF' }}>
          <div style={{ fontSize: 11, ...dim }}>Next up</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span>
              {nextUp.s.name} <span style={dim}>(Level {nextUp.s.state.level})</span>
            </span>
            <button style={pill(true)} onClick={() => openRem(nextUp.id)}>
              Open
            </button>
          </div>
        </div>
      )}

      {list.length > 0 && (
        <div style={box}>
          <b>Your ideas</b>
          <div style={{ ...dim, fontSize: 11 }}>Weakest and most ready first. Tap a name to open it.</div>
          {list.map((x) => (
            <div key={x.id} style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <span style={{ cursor: 'pointer', textDecoration: x.id === targetId ? 'underline' : 'none' }} onClick={() => openRem(x.id)}>
                  {x.s.name}
                </span>
                <span style={{ fontSize: 11, whiteSpace: 'nowrap', ...dim }}>
                  {isMastered(x.s.state) ? 'Mastered' : x.back <= now ? 'Ready' : day(x.back)}
                  {removing === x.id ? (
                    <>
                      {' '}
                      <button style={pill(false)} onClick={() => removeConcept(x.id)}>
                        Remove
                      </button>{' '}
                      <button style={pill(false)} onClick={() => setRemoving(null)}>
                        Keep
                      </button>
                    </>
                  ) : (
                    <button
                      style={{ ...pill(false), border: 'none', padding: '2px 6px', minHeight: 0 }}
                      onClick={() => setRemoving(x.id)}
                      title="Remove from this list"
                    >
                      ×
                    </button>
                  )}
                </span>
              </div>
              <Bar value={x.pct} color={isMastered(x.s.state) ? GOOD : '#4C9AFF'} />
              <div style={{ ...dim, fontSize: 10 }}>
                {x.pct}% · Level {x.s.state.level} {LEVELS[x.s.state.level - 1]?.name}
              </div>
            </div>
          ))}
        </div>
      )}

      <details style={{ ...box, fontSize: 12 }}>
        <summary style={{ cursor: 'pointer' }}>How it works</summary>
        <div style={{ marginTop: 6 }}>
          1. Open a page (or click a line and choose This line). The coach reads the notes under it and finds the main points and details.
          <br />
          2. Explain it from memory, in plain words, as if teaching someone new. Then tap Check it.
          <br />
          3. You get a score from your own notes: points you covered, reasons you gave, and big words you did not explain. The gaps show the exact
          notes you missed.
          <br />
          4. Fill the gaps, then try again. Pass a level to move up: Simple, Why, What if, Connect, Teach cold. Score under 50 and you drop one level.
          <br />
          5. Mastered means two cold teach-backs at 85 or more, at least 3 days apart.
          <br />
          The check matches key words, so it can miss a point you said in other words. Tap I said this differently when that happens. For a deeper
          check, use Copy for Claude. + Queue adds one card so RemNote's own schedule brings the idea back.
        </div>
      </details>
      <Note />
    </div>
  );
}
