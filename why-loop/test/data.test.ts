import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY, merge, normalize, type Data } from '../src/lib/data';

const lecture = (id: string, extra: object = {}) => ({ id, course: 'BN 779', name: id, t: 1, done: [false], ...extra });

test('normalize drops malformed items and fills defaults', () => {
  const d = normalize({ lectures: [lecture('a'), { name: 'no id' }, null], misses: 'oops', weeks: [{ t: 1 }, { t: 'x' }] });
  assert.equal(d.lectures.length, 1);
  assert.deepEqual(d.misses, []);
  assert.equal(d.weeks.length, 1);
  assert.deepEqual(d.exams, {});
});

test('normalize of nothing is empty', () => {
  assert.deepEqual(normalize(undefined), { ...EMPTY, weeklyDay: undefined });
});

test('merge keeps a lecture added on another device', () => {
  const base: Data = { ...EMPTY, lectures: [lecture('a')] };
  const mine: Data = { ...base, lectures: [lecture('a', { step: 2 })] };
  const theirs: Data = { ...base, lectures: [lecture('a'), lecture('b')] };
  const out = merge(base, mine, theirs);
  assert.deepEqual(out.lectures.map((l) => l.id).sort(), ['a', 'b']);
  assert.equal(out.lectures.find((l) => l.id === 'a')!.step, 2);
});

test('merge applies a removal made on this device', () => {
  const base: Data = { ...EMPTY, lectures: [lecture('a'), lecture('b')] };
  const mine: Data = { ...base, lectures: [lecture('b')] };
  const out = merge(base, mine, base);
  assert.deepEqual(out.lectures.map((l) => l.id), ['b']);
});

test('merge does not undo an edit made elsewhere to an item this device left alone', () => {
  const base: Data = { ...EMPTY, lectures: [lecture('a'), lecture('b')] };
  const mine: Data = { ...base, lectures: [lecture('a', { step: 1 }), lecture('b')] };
  const theirs: Data = { ...base, lectures: [lecture('a'), lecture('b', { step: 4 })] };
  const out = merge(base, mine, theirs);
  assert.equal(out.lectures.find((l) => l.id === 'b')!.step, 4);
});

test('merge of exam dates and weekly day', () => {
  const base: Data = { ...EMPTY, exams: { 'BN 779': '2026-12-10' }, weeklyDay: 0 };
  const mine: Data = { ...base, exams: { 'BN 779': '2026-12-12' } };
  const theirs: Data = { ...base, exams: { 'BN 779': '2026-12-10', 'CI 675': '2026-12-15' }, weeklyDay: 3 };
  const out = merge(base, mine, theirs);
  assert.deepEqual(out.exams, { 'BN 779': '2026-12-12', 'CI 675': '2026-12-15' });
  assert.equal(out.weeklyDay, 3);
});
