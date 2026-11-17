import assert from 'node:assert/strict';
import {
  buildPoints, check, score, LEVELS, guessShape, NoteNode, stem, sameWord, record, emptyState,
  isMastered, masteryPct, allText, DAY, weakest, whatIfTarget, breakWord, suggestBack, readingGrade, pointsFor,
} from '../src/lib/analyze';

let n = 0;
const node = (text: string, ...children: NoteNode[]): NoteNode => ({ id: `r${n++}`, text, children });
let pass = 0;
const t = (name: string, fn: () => void) => {
  try { fn(); pass++; } catch (e) { console.error('FAIL', name); throw e; }
};

const gpcr = node('G-protein coupled receptors',
  node('Structure', node('Seven transmembrane helices span the membrane'), node('Hormone binds outside because water-soluble hormones cannot cross the lipid membrane')),
  node('Activation', node('Hormone binding changes receptor shape'), node('Receptor swaps GDP for GTP on G-alpha'), node('G-alpha-GTP dissociates from beta-gamma')),
  node('Effector', node('Gs activates adenylate cyclase which makes cAMP'), node('cAMP activates protein kinase A')),
  node('Turning off', node('G-alpha hydrolyzes GTP to GDP, so the signal stops'), node('Cholera toxin blocks GTP hydrolysis so the effector stays on')),
);
const pts = buildPoints(gpcr, 'G-protein coupled receptors');
const noteWords = [...new Set(pts.flatMap((p) => p.terms))];
const good = `The receptor is a protein that sits across the cell's outer skin, the membrane, because the hormone is water-soluble and can't get through the fatty membrane. When the hormone binds on the outside, the receptor changes shape. That makes it swap GDP for GTP on the G-alpha part, which is like flipping a switch on. Then G-alpha leaves the beta-gamma part and goes to turn on adenylate cyclase, an enzyme that makes cAMP, a small messenger. cAMP turns on protein kinase A. To stop, G-alpha cuts its own GTP back to GDP, so the signal shuts off. Cholera toxin blocks that cutting, so the signal stays on.`;
const bad = 'GPCRs somehow activate adenylate cyclase and phosphorylation happens downstream through heterotrimeric transduction.';

t('stems meet', () => {
  assert.ok(sameWord(stem('activates'), stem('activation')));
  assert.ok(sameWord(stem('activated'), stem('activate')));
  assert.ok(!sameWord(stem('phosphorylation'), stem('phosphatase')));
  assert.equal(stem('mTORC1'), 'mtorc1');
});
t('points: 4 mains, details, no topic name as a term', () => {
  assert.equal(pts.filter((p) => p.main).length, 4);
  assert.ok(pts.length > 4);
  for (const p of pts) assert.ok(!p.terms.some((x) => sameWord(x, stem('receptors')) && p.main && p.text === 'Structure'));
  for (const p of pts) assert.ok(p.terms.length >= 1 && p.terms.length <= 6);
});
t('good explanation passes level 1 and 2', () => {
  const c1 = check(good, pointsFor(LEVELS[0], pts), guessShape(pts), noteWords);
  assert.ok(score(c1, LEVELS[0], 3, 'Thing').total >= 85, 'L1');
  assert.equal(c1.bigWords.length, 0, 'explained words: ' + c1.bigWords);
  assert.ok(c1.analogy);
  const c2 = check(good, pts, 'Thing', noteWords);
  assert.ok(score(c2, LEVELS[1], 3, 'Thing').total >= 75, 'L2');
});
t('jargon dump fails and is flagged', () => {
  const c = check(bad, pointsFor(LEVELS[0], pts), 'Thing', noteWords);
  const s = score(c, LEVELS[0], 3, 'Thing');
  assert.ok(s.total < 40, String(s.total));
  assert.ok(c.bigWords.includes('heterotrimeric'));
  assert.deepEqual(c.vague, ['somehow']);
});
t('short text is capped', () => {
  const c = check('Hormone binds receptor, GTP, adenylate cyclase, cholera toxin.', pointsFor(LEVELS[0], pts), 'Thing', noteWords);
  assert.ok(score(c, LEVELS[0], 3, 'Thing').total <= 40);
});
t('copying the notes word for word is not rewarded on clarity', () => {
  const dump = pts.map((p) => p.text).join('. ');
  const c = check(dump, pts, 'Thing', noteWords);
  assert.ok(c.coverage! > 0.9);
  const s = score(c, LEVELS[0], 0, 'Thing');
  assert.ok(s.parts[2].got < s.parts[2].of, 'clarity should drop');
});
t('empty and odd input never throws', () => {
  for (const x of ['', '   ', '!!!', '🧠🧠🧠', '\n\n\n', 'a'.repeat(100000), 'é ü ß 中文 العربية', '((((', '[[link]] {{cloze}}']) {
    const c = check(x, pts, 'Process', noteWords);
    const s = score(c, LEVELS[4], 0, 'Process');
    assert.ok(s.total >= 0 && s.total <= 100 && Number.isFinite(s.total));
  }
  assert.equal(readingGrade('').words, 0);
});
t('no notes: no points, no crash', () => {
  assert.deepEqual(buildPoints(node('Empty'), 'Empty'), []);
  assert.deepEqual(buildPoints(node('Only blanks', node(''), node('  ')), 'Only blanks'), []);
  const c = check('some words here and more words', [], 'Thing', []);
  assert.equal(c.coverage, null);
});
t('page with one heading looks one level down', () => {
  const p = node('Topic', node('Overview', node('Alpha cells release glucagon'), node('Beta cells release insulin'), node('Delta cells release somatostatin')));
  const b = buildPoints(p, 'Topic');
  assert.equal(b.filter((x) => x.main).length, 3);
});
t('question prompts are headings, not content', () => {
  const p = node('Insulin', node('What turns it on, and why?', node('High blood glucose after meals')), node('What happens next?', node('GLUT4 moves to the membrane')), node('What if it breaks?', node('Hyperglycemia, diabetes')));
  const b = buildPoints(p, 'Insulin');
  for (const x of b) assert.ok(!x.terms.includes('turn'));
  assert.ok(b.some((x) => x.terms.some((y) => sameWord(y, stem('glucose')))));
});
t('process order swaps are found', () => {
  const p = node('Action potential', node('Sodium channels open and sodium rushes in'), node('Potassium channels open and potassium leaves'), node('Pump restores the gradient'));
  const b = buildPoints(p, 'Action potential');
  const c = check('First the pump restores the gradient. Then potassium leaves through potassium channels. Then sodium rushes in.', b, 'Process', []);
  assert.ok(c.orderSwaps.length >= 1);
  const ok = check('Sodium rushes in when sodium channels open. Then potassium channels open and potassium leaves. Then the pump restores the gradient.', b, 'Process', []);
  assert.equal(ok.orderSwaps.length, 0);
});
t('shape guess', () => {
  const calc = buildPoints(node('Dilution', node('C1V1 = C2V2'), node('Stock is 10 mg/ml'), node('Need 2 mg in 5 ml = 0.4 mg/ml')), 'Dilution');
  assert.equal(guessShape(allText(node('Dilution', node('C1V1 = C2V2'), node('Stock is 10 mg/ml'), node('Need 2 mg in 5 ml = 0.4 mg/ml')))), 'Calculation');
  assert.equal(guessShape(calc.map((x) => x.text).join('\n') + '\nNeed 2 mg in 5 ml = 0.4 mg/ml'), 'Calculation');
  assert.equal(calc.length, 3, 'number-only line kept');
  const proc = buildPoints(node('Western', node('1. Lyse cells'), node('2. Run gel then transfer'), node('3. Block, then antibody'), node('4. Next ECL')), 'Western');
  assert.equal(guessShape(proc), 'Process');
});
t('huge page stays fast and capped', () => {
  const big = node('Huge', ...Array.from({ length: 300 }, (_, i) => node(`Main idea ${i} about enzyme${i} kinetics and substrate${i}`, ...Array.from({ length: 5 }, (_, j) => node(`detail ${i}-${j} phosphatase${j} binds ligand${i}x${j}`)))));
  const t0 = Date.now();
  const b = buildPoints(big, 'Huge');
  assert.ok(b.filter((x) => !x.main).length <= 40);
  const essay = Array.from({ length: 2000 }, (_, i) => `enzyme${i % 300} binds substrate because it fits.`).join(' ');
  check(essay, b, 'Process', [...new Set(b.flatMap((p) => p.terms))]);
  assert.ok(Date.now() - t0 < 3000, `slow: ${Date.now() - t0}ms`);
});
t('deep nesting does not blow the stack', () => {
  let deep = node('leaf');
  for (let i = 0; i < 2000; i++) deep = node(`level${i} thing`, deep);
  buildPoints(node('Deep', deep), 'Deep');
});
t('ladder: up on pass, down under 50, practice does not move', () => {
  let s = emptyState();
  s = record(s, { t: 0, level: 1, score: 80, missed: [], words: 100 }, ['a'], []);
  assert.equal(s.level, 2);
  s = record(s, { t: 1, level: 2, score: 60, missed: [], words: 100 }, [], ['b']);
  assert.equal(s.level, 2);
  s = record(s, { t: 2, level: 2, score: 40, missed: [], words: 100 }, [], ['b']);
  assert.equal(s.level, 1);
  s = record(s, { t: 3, level: 4, score: 100, missed: [], words: 100 }, [], []);
  assert.equal(s.level, 1, 'practice at another level');
  s = record(s, { t: 4, level: 0, score: 100, missed: [], words: 100 }, ['b'], []);
  assert.equal(s.level, 1, 'gaps round');
  assert.equal(s.pointStats.b.miss, 2);
  assert.equal(s.pointStats.b.hit, 1);
});
t('mastery needs two cold passes 3+ days apart', () => {
  let s = { ...emptyState(), level: 5 };
  s = record(s, { t: 0, level: 5, score: 90, missed: [], words: 200 }, [], []);
  assert.ok(!isMastered(s));
  s = record(s, { t: DAY, level: 5, score: 95, missed: [], words: 200 }, [], []);
  assert.ok(!isMastered(s), 'too soon');
  assert.equal(s.coldPasses.length, 1);
  s = record(s, { t: 4 * DAY, level: 5, score: 88, missed: [], words: 200 }, [], []);
  assert.ok(isMastered(s));
  assert.equal(masteryPct(s), 100);
});
t('mastery % grows with the ladder and stays 0..100', () => {
  const vals = [1, 2, 3, 4, 5].map((l) => masteryPct({ ...emptyState(), level: l, attempts: [{ t: 0, level: l, score: 60, missed: [], words: 50 }] }));
  for (let i = 1; i < vals.length; i++) assert.ok(vals[i] > vals[i - 1]);
  assert.equal(masteryPct(emptyState()), 0);
  for (const v of vals) assert.ok(v >= 0 && v < 100);
});
t('adaptive: weakest and what-if target follow misses', () => {
  let s = emptyState();
  const target = pts.find((p) => p.text.startsWith('Cholera'))!;
  for (let i = 0; i < 3; i++) s = record(s, { t: i, level: 1, score: 30, missed: [target.id], words: 50 }, [], [target.id]);
  assert.equal(weakest(s, pts, 1)[0].id, target.id);
  assert.equal(whatIfTarget(s, pts)!.id, target.id);
  assert.ok(/cholera/i.test(breakWord(target)), breakWord(target));
  const fresh = emptyState();
  assert.ok(whatIfTarget(fresh, pts)!.main);
});
t('attempts are capped so storage stays small', () => {
  let s = emptyState();
  for (let i = 0; i < 500; i++) s = record(s, { t: i, level: 1, score: 10, missed: [], words: 5 }, [], []);
  assert.ok(s.attempts.length <= 30);
  assert.ok(JSON.stringify(s).length < 10000);
});
t('come-back hint', () => {
  const s = record(emptyState(), { t: 1000, level: 1, score: 90, missed: [], words: 80 }, [], []);
  assert.equal(suggestBack(s), 1000 + 4 * DAY);
  assert.ok(suggestBack(emptyState(), 5) === 5);
});
console.log(`analyze: ${pass} tests passed`);
