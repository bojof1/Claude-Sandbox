const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert/strict');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 380, height: 800 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('file://' + path.resolve(__dirname, 'index.html'));
  const txt = () => page.locator('body').innerText();
  const has = async (s) => { await page.waitForFunction((s) => document.body.innerText.includes(s), s, { timeout: 5000 }).catch(() => {}); return (await txt()).includes(s); };
  let n = 0; const ok = (name) => { n++; console.log('ok', name); };

  // 1. no page
  assert.ok(await has('Open a page of notes')); ok('no page open');

  // build notes
  const ids = await page.evaluate(() => {
    const m = window.mock;
    const empty = m.add('Empty page');
    const g = m.add('G-protein coupled receptors');
    const s = m.add('Structure', g); m.add('Seven transmembrane helices span the membrane', s); m.add('Hormone binds outside because water-soluble hormones cannot cross the lipid membrane', s);
    const a = m.add('Activation', g); m.add('Hormone binding changes receptor shape', a); m.add('Receptor swaps GDP for GTP on G-alpha', a); m.add('G-alpha-GTP dissociates from beta-gamma', a);
    const e = m.add('Effector', g); m.add('Gs activates adenylate cyclase which makes cAMP', e); m.add('cAMP activates protein kinase A', e);
    const o = m.add('Turning off', g); m.add('G-alpha hydrolyzes GTP to GDP, so the signal stops', o); const ch = m.add('Cholera toxin blocks GTP hydrolysis so the effector stays on', o);
    m.add('query: hidden search', g);
    const other = m.add('Second messengers'); m.add('cAMP is made by adenylate cyclase', other); m.add('IP3 releases calcium from the ER', other); m.add('DAG activates protein kinase C', other);
    const huge = m.add('Huge page');
    for (let i = 0; i < 120; i++) { const x = m.add(`Main idea ${i} enzyme${i} kinetics`, huge); for (let j = 0; j < 5; j++) m.add(`detail ${i}-${j} ligand${i}x${j}`, x); }
    return { empty, g, other, huge, ch, structure: s };
  });

  // 2. empty
  await page.evaluate((id) => window.setPage(id), ids.empty);
  assert.ok(await has('no notes under this page')); ok('empty page message');

  // 3. GPCR level 1
  await page.evaluate((id) => window.setPage(id), ids.g);
  assert.ok(await has('Found 4 main points')); ok('finds 4 main points, skips query: rems');
  assert.ok(!(await txt()).includes('hidden search'));
  await page.getByText('Start Level 1').click();
  assert.ok(await has('Explain it to a 12-year-old'));
  const good = `The receptor is a protein that sits across the cell's outer skin, the membrane, because the hormone is water-soluble and can't get through the fatty membrane. When the hormone binds on the outside, the receptor changes shape. That makes it swap GDP for GTP on the G-alpha part, which is like flipping a switch on. Then G-alpha leaves the beta-gamma part and goes to turn on adenylate cyclase, an enzyme that makes cAMP, a small messenger. cAMP turns on protein kinase A. To stop, G-alpha cuts its own GTP back to GDP, so the signal shuts off. Cholera toxin blocks that cutting, so the signal stays on.`;
  await page.locator('textarea').fill(good);
  await page.waitForTimeout(800);
  const draft = await page.evaluate(() => window.mock.local['fc-draft']);
  assert.ok(draft && draft.text.includes('receptor')); ok('draft kept while typing');
  await page.getByText('Sure', { exact: true }).click();
  for (const c of await page.locator('input[type=checkbox]').all()) await c.check();
  await page.getByText('Check it').click();
  assert.ok(await has('Up to Level 2')); ok('level 1 pass moves up');
  let st = await page.evaluate((id) => window.mock.storage['fc-data'].concepts[id].state, ids.g);
  assert.equal(st.level, 2);
  assert.equal(await page.evaluate(() => window.mock.local['fc-draft']), null); ok('saved, draft cleared');

  await page.screenshot({ path: path.resolve(__dirname, 'result1.png'), fullPage: true });
  // 4. level 2 with a weak answer
  await page.getByText('Done').click();
  assert.ok(await has('Next: Level 2, Why'));
  await page.getByText('Start Level 2').click();
  await page.locator('textarea').fill('GPCRs somehow activate adenylate cyclase and phosphorylation happens downstream through heterotrimeric transduction. It is complicated stuff.');
  await page.getByText('Certain').click();
  await page.getByText('Check it').click();
  assert.ok(await has('Gaps')); ok('gaps shown');
  assert.ok(await has('You felt sure but scored low')); ok('confidence warning');
  assert.ok(await has('heterotrimeric')); ok('big words flagged');
  assert.ok(await has('Back to Level 1')); ok('drops a level under 50');
  await page.screenshot({ path: path.resolve(__dirname, 'result2.png'), fullPage: true });
  const before = Number(await page.locator('span', { hasText: /^\d+$/ }).first().innerText());
  await page.getByText('I said this differently').first().click();
  await page.waitForTimeout(200);
  const after = Number(await page.locator('span', { hasText: /^\d+$/ }).first().innerText());
  assert.ok(after >= before, `${before} -> ${after}`); ok(`said differently rescored ${before} -> ${after}`);
  await page.getByText('Copy for Claude').click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(clip.includes('My notes (the answer key)') && clip.includes('heterotrimeric')); ok('copy for Claude');
  await page.getByText('Fill the gaps').click();
  assert.ok(await has('Explain only the parts you missed'));
  await page.locator('textarea').fill('Seven helices cross the membrane. Cholera toxin stops GTP being cut, so the effector stays on because the switch never turns off.');
  await page.getByText('Check it').click();
  assert.ok(await has('Fill the gaps')); 
  st = await page.evaluate((id) => window.mock.storage['fc-data'].concepts[id].state, ids.g);
  assert.equal(st.level, 1, 'gaps round does not move'); ok('gaps round keeps level');

  // 5. what-if picks a weak point
  await page.getByText('Done').click();
  await page.getByRole('button', { name: '3', exact: true }).click();
  await page.getByText('Start Level 3').click();
  assert.ok(await has('went wrong or was missing')); ok('what-if prompt: ' + (await page.locator('div', { hasText: 'went wrong' }).last().innerText()).slice(0, 90));
  await page.getByText('Cancel').click();

  // 6. connect needs a named link
  await page.getByRole('button', { name: '4', exact: true }).click();
  await page.getByText('Start Level 4').click();
  assert.ok(await has('Pick or type the idea')); ok('connect asks for an idea');
  await page.getByPlaceholder('Or type another idea').fill('Second messengers');
  await page.getByText('Start Level 4').click();
  await page.locator('textarea').fill(good);
  await page.getByText('Check it').click();
  assert.ok(await has('You never named Second messengers')); ok('connect capped when link not named');
  await page.getByText('Done').click();

  // 7. queue card
  await page.getByRole('button', { name: '+ Queue' }).click();
  assert.ok(await has('Added one card')); 
  const card = await page.evaluate((id) => window.mock.db[id].kids.map((k) => window.mock.db[k].text[0]), ids.g);
  assert.ok(card.some((t) => t.startsWith('Teach from memory'))); ok('queue card made under page');
  await page.getByRole('button', { name: 'In queue' }).click();
  assert.ok(await has('already in your RemNote queue')); ok('no duplicate card');
  await page.getByRole('button', { name: 'Reload notes' }).click();
  assert.ok(await has('Found 4 main points')); ok('queue card is not read back as a note');

  // 8. switching pages mid-explanation keeps the session
  await page.getByText('Start Level').first().click();
  await page.locator('textarea').fill('half written');
  await page.evaluate((id) => window.setPage(id), ids.other);
  await page.waitForTimeout(300);
  assert.equal(await page.locator('textarea').inputValue(), 'half written'); ok('page switch keeps your explanation');
  await page.getByText('Cancel').click();
  assert.ok(await has('Second messengers')); ok('home follows new page');

  // 9. This line
  await page.evaluate(([p, l]) => window.setPage(p, l), [ids.g, ids.structure]);
  await page.getByRole('button', { name: 'This line' }).click();
  assert.ok(await has('Found 2 main points')); ok('this line mode reads just that line');
  await page.getByRole('button', { name: 'Page', exact: true }).click();

  // 10. storage failure
  await page.evaluate(() => { window.mock.failSync = true; });
  await page.getByText('Start Level').first().click();
  await page.locator('textarea').fill(good);
  await page.getByText('Check it').click();
  assert.ok(await has('Could not save')); ok('save failure is shown, work stays');
  await page.evaluate(() => { window.mock.failSync = false; });
  await page.getByText('Done').click();

  // 11. huge page + slow RemNote
  await page.evaluate(() => { window.mock.slow = 5; });
  const t0 = Date.now();
  await page.evaluate((id) => window.setPage(id), ids.huge);
  assert.ok(await has('only the first 400 lines')); ok(`huge page capped, read in ${Date.now() - t0} ms`);
  assert.ok(await has('That is a lot for one explanation')); ok('suggests This line for big pages');
  await page.getByText('Start Level').first().click();
  const essay = Array.from({ length: 4000 }, (_, i) => `enzyme${i % 120} kinetics matter because ligands bind.`).join(' ');
  const t1 = Date.now();
  await page.locator('textarea').fill(essay);
  await page.getByText('Check it').click();
  await has('Covered your notes');
  ok(`28k-word explanation checked in ${Date.now() - t1} ms`);
  assert.ok(Date.now() - t1 < 8000);
  await page.getByText('Done').click();
  await page.evaluate(() => { window.mock.slow = 0; });

  // 12. hammer: rapid clicks and page flips
  for (let i = 0; i < 30; i++) await page.evaluate(([a, b, i]) => window.setPage(i % 2 ? a : b), [ids.g, ids.other, i]);
  await page.waitForTimeout(500);
  ok('30 rapid page flips');

  // 13. list + remove
  assert.ok(await has('Your ideas'));
  await page.locator('button[title="Remove from this list"]').first().click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  ok('remove from list (two taps)');

  // 14. phone width: no sideways scroll
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(sw <= 380, `scrollWidth ${sw}`); ok('no sideways scroll at phone width');
  await page.screenshot({ path: path.resolve(__dirname, 'home.png'), fullPage: true });

  assert.deepEqual(errors, []); ok('no console errors');
  console.log(`ui: ${n} checks passed`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
