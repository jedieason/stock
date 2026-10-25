import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { currentMarket, plottedGroups, diverseGroups, rotationOverview, rotationDomains, rotationSelection, rotationSVG, renderRotation } from '../assets/rotation.mjs';

const snapshot = JSON.parse(gunzipSync(readFileSync(new URL('../data/rotation.json.gz', import.meta.url))));
const now = Date.parse('2026-10-25T12:00:00+08:00');

test('each market expires by observation date and source status, not refresh time', () => {
  const market = { status: 'ok', observed_at: '2026-10-23' };
  assert.equal(currentMarket(market, now), true);
  assert.equal(currentMarket({ ...market, status: 'stale' }, now), false);
  assert.equal(currentMarket(market, now + 10 * 86400000), false);
  assert.equal(currentMarket({ ...market, observed_at: '2026-10-26' }, now), false);
});

test('both markets share domains that contain every historical point', () => {
  const domain = rotationDomains(snapshot);
  for (const m of Object.values(snapshot.markets)) for (const g of plottedGroups(m)) for (const p of g.trail) {
    assert.ok(Math.abs(p.x) <= domain.x);
    assert.ok(Math.abs(p.y) <= domain.y);
  }
});

test('all groups remain inspectable and selection can cross markets', () => {
  const selection = rotationSelection(snapshot, { rotationMarket: 'us', rotationTheme: 'cyber' });
  assert.equal(selection.group.id, 'cyber');
  assert.equal(selection.id, 'us');
  for (const focus of ['all', 'improving', 'resilient']) {
    const html = renderRotation(snapshot, { rotationFocus: focus }, now);
    assert.match(html, /data-rotation-card="tw"/);
    assert.match(html, /data-rotation-card="us"/);
    assert.match(html, /data-rotation-theme="cyber"/);
    assert.match(html, /覆蓋/);
    assert.doesNotMatch(html, /NaN|Infinity|undefined/);
  }
});

test('narrow and wide SVGs preserve valid geometry, keyboard access and units', () => {
  for (const m of Object.values(snapshot.markets)) for (const width of [270, 320, 560, 720]) {
    const html = rotationSVG(m, { width, domains: rotationDomains(snapshot) });
    assert.match(html, /tabindex="0"/);
    assert.match(html, /20 日超額報酬（pp）/);
    assert.doesNotMatch(html, /NaN|Infinity|undefined/);
  }
  assert.match(rotationSVG({ groups: [] }), /尚無足夠/);
  assert.match(renderRotation(null), /不產生強弱排名/);
});

test('provider labels are escaped and stale markets cannot nominate current candidates', () => {
  const copy = structuredClone(snapshot);
  for (const m of Object.values(copy.markets)) {
    m.status = 'stale';
    m.groups[0].name = '<img src=x onerror=alert(1)>';
  }
  const html = renderRotation(copy, {}, now);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img/);
  assert.match(html, /歷史觀測/);
  assert.match(html, /暫停當期候選判讀/);
  assert.doesNotMatch(html, /class="rotation-row /);
});

test('graph display limit never limits searchable external taxonomy', () => {
  const market = snapshot.markets.tw;
  assert.ok(market.groups.length > 100);
  assert.ok(plottedGroups(market).length <= 12);
  const passive = market.groups.find(g => g.name === '被動元件');
  assert.ok(passive && passive.origin === 'tpex-chain');
  const selected = plottedGroups(market, passive.id);
  assert.ok(selected.some(g => g.id === passive.id));
  const html = renderRotation(snapshot, { rotationSearch:'被動元件' }, now);
  assert.match(html,/電阻器/);
  assert.match(html,/電容器/);
  assert.match(html,/電感器/);
  const overview = rotationOverview(snapshot, now + 20 * 86400000);
  assert.equal(overview.leading_count,null);
  assert.equal(overview.us_leading_count,null);
});

test('overlapping cohorts cannot fill the opening graph with duplicate evidence', () => {
  const members = ['A','B','C'].map(symbol=>({symbol}));
  const chosen = diverseGroups([{id:'one',family:'f',members},{id:'two',family:'g',members},{id:'three',family:'h',members:[{symbol:'D'}]}]);
  assert.deepEqual(chosen.map(g=>g.id),['one','three']);
});
