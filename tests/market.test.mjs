import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { valid, fmt, signed, change, returns, seriesFor, latestQuote, paginate, sortNumeric, companyRows, breadthPercent, safeURL, escapeHTML, snapshotAgeDays } from '../assets/model.mjs';
import { chartSVG, volumeSVG } from '../assets/charts.mjs';

const packet = JSON.parse(readFileSync(new URL('../data/market.json', import.meta.url)));

test('missing, infinite and zero values remain distinct', () => {
  for (const value of [null, undefined, NaN, Infinity, '0']) {
    assert.equal(valid(value), false);
    assert.equal(fmt(value), '—');
    assert.equal(change(value, 100), null);
  }
  assert.equal(fmt(0), '0.00');
  assert.equal(signed(0), '0.00%');
  assert.equal(change(120, 0), null);
  assert.equal(returns([{ close: 100 }], 5), null);
});

test('daily returns use the prior observation and retain missing observations', () => {
  assert.ok(Math.abs(returns([{ close: 100 }, { close: 110 }]) - 10) < 1e-9);
  assert.equal(returns([{ close: null }, { close: 110 }]), null);
});

test('newer quotes append, same-day quotes merge, older quotes cannot replace a daily close', () => {
  const base = { taiex: [{ date: '2026-10-15', close: 100, volume: 500, ma20: 95 }] };
  const same = { ...base, quote: [{ symbol: 't00', date: '2026-10-15', close: 110, previous: 105 }] };
  const rows = seriesFor(same, 'taiex');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].volume, 500);
  assert.equal(rows[0].ma20, 95);
  assert.equal(base.taiex[0].close, 100, 'does not mutate the snapshot');
  assert.ok(Math.abs(latestQuote(same, 'taiex').delta - (110 / 105 - 1) * 100) < 1e-9);
  assert.equal(seriesFor({ ...base, quote: [{ symbol: 't00', date: '2026-10-16', close: 115 }] }, 'taiex').length, 2);
  assert.equal(seriesFor({ ...base, quote: [{ symbol: 't00', date: '2026-10-14', close: 80 }] }, 'taiex')[0].close, 100);
});

test('company search includes valuation-only and revenue-only companies', () => {
  const d = { revenue: [{ ticker: '1', name: 'A', yoy: 9, date: '2026-10-10' }, { ticker: '2', name: 'B', yoy: null }], valuations: [{ ticker: '1', name: 'A', pe: 15, date: '2026-10-09' }, { ticker: '3', name: 'C', pe: 0 }] };
  const rows = companyRows(d, '', 'yoy');
  assert.equal(rows.length, 3);
  assert.equal(rows[0].revenue_date, '2026-10-10');
  assert.equal(rows[0].valuation_date, '2026-10-09');
  assert.equal(companyRows(d, 'C', 'pe')[0].ticker, '3');
  assert.equal(companyRows(d, '3', 'pe')[0].pe, 0);
});

test('actual snapshot company union has no discarded tickers', () => {
  const expected = new Set([...packet.data.revenue, ...packet.data.valuations].map(row => row.ticker));
  const actual = companyRows(packet.data, '', 'yoy');
  assert.equal(actual.length, expected.size);
  assert.deepEqual(new Set(actual.map(row => row.ticker)), expected);
  assert.equal(companyRows(packet.data, '2330', 'yoy')[0].name, '台積電');
});

test('numeric sorting puts missing data last in both directions', () => {
  const rows = [{ value: null }, { value: -2 }, { value: 0 }, { value: 4 }];
  assert.deepEqual(sortNumeric(rows, 'value').map(row => row.value), [4, 0, -2, null]);
  assert.deepEqual(sortNumeric(rows, 'value', 'asc').map(row => row.value), [-2, 0, 4, null]);
});

test('pagination reaches every row and clamps a page after filtering', () => {
  const rows = Array.from({ length: 25 }, (_, i) => i);
  assert.deepEqual(paginate(rows, 3).rows, [24]);
  assert.equal(paginate(rows.slice(0, 2), 3).page, 1);
  assert.equal(paginate([], 8).pages, 1);
  assert.equal(paginate([], 8).total, 0);
});

test('breadth requires observed counts and includes flat shares', () => {
  assert.equal(breadthPercent({ up: 2, down: 1, flat: 1 }), 50);
  assert.equal(breadthPercent({ up: 0, down: 0, flat: 0 }), null);
  assert.equal(breadthPercent({ up: 10 }), null);
});

test('third-party labels and URLs cannot create executable HTML', () => {
  assert.equal(safeURL('javascript:alert(1)'), '#');
  assert.equal(safeURL('data:text/html,hello'), '#');
  assert.ok(escapeHTML('<script>"&').startsWith('&lt;script&gt;'));
  assert.ok(safeURL('https://example.com/?a=1&b=2').includes('&amp;'));
});

test('freshness uses Taipei calendar date, separately from scrape time', () => {
  assert.equal(snapshotAgeDays('2026-10-16', Date.parse('2026-10-20T02:30:00+08:00')), 4);
  assert.equal(snapshotAgeDays('bad'), null);
});

test('chart gaps stay gaps and do not become zero or connected observations', () => {
  const svg = chartSVG([{ date: '2026-10-01', close: 100 }, { date: '2026-10-02', close: null }, { date: '2026-10-03', close: 105 }], { area: true });
  assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
  assert.doesNotMatch(svg, /fill="url/);
  assert.match(svg, /M[\d.]+ [\d.]+\s+M[\d.]+ [\d.]+/);
});

test('charts handle no history, one value and flat prices without invalid geometry', () => {
  assert.match(chartSVG([]), /尚無/);
  assert.match(chartSVG([{ close: null }]), /尚無/);
  for (const rows of [[{ date: '2026-10-01', close: 0 }], [{ close: 100 }, { close: 100 }]]) {
    assert.doesNotMatch(chartSVG(rows, { width: 330 }), /NaN|Infinity|undefined/);
  }
});

test('volume chart never invents missing daily volume', () => {
  assert.equal(volumeSVG([{ close: 10 }]), '');
  const svg = volumeSVG([{ close: 10, volume: 100 }, { close: 11 }], 330);
  assert.equal((svg.match(/<rect /g) || []).length, 1);
  assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
});

test('all tracked series in the actual snapshot render without invalid chart numbers', () => {
  for (const symbol of ['taiex', 'tpex', '2330', '2317', '2454', '2382', '2308', '3231']) {
    const rows = seriesFor(packet.data, symbol);
    assert.ok(rows.length > 0);
    for (const candle of [false, true]) {
      assert.doesNotMatch(chartSVG(rows, { candle }), /NaN|Infinity|undefined/);
    }
  }
});

test('snapshot contains all 15 core indicators with complete required fields', () => {
  assert.ok(packet.indicators, 'indicators object must exist');
  assert.equal(Object.keys(packet.indicators).length, 15, 'must contain exactly 15 indicators');

  for (let i = 1; i <= 15; i++) {
    const ind = packet.indicators[String(i)];
    assert.ok(ind, `indicator ${i} must exist`);
    assert.ok(ind.name, `indicator ${i} must have a name`);
    assert.ok(ind.summary, `indicator ${i} must have a summary`);
    assert.ok(ind.status, `indicator ${i} must have a status`);
    assert.ok(ind.status_label, `indicator ${i} must have a status_label`);
  }

  // 1 市場趨勢: 加權與櫃買 OHLC、20/60/120 均線、前高前低
  const ind1 = packet.indicators['1'];
  assert.ok(valid(ind1.taiex.close) && valid(ind1.taiex.ma20) && valid(ind1.taiex.ma60) && valid(ind1.taiex.ma120));
  assert.ok(valid(ind1.taiex.high20) && valid(ind1.taiex.low20));
  assert.ok(valid(ind1.tpex.close) && valid(ind1.tpex.ma20));

  // 2 趨勢偏離: 乖離率與回撤
  const ind2 = packet.indicators['2'];
  assert.ok(valid(ind2.taiex.dev20) && valid(ind2.taiex.dev60) && valid(ind2.taiex.dd60));

  // 3 漲跌家數與 A/D Line
  const ind3 = packet.indicators['3'];
  assert.ok(valid(ind3.up) && valid(ind3.down) && valid(ind3.ratio) && valid(ind3.ad_line));

  // 4 均線廣度
  const ind4 = packet.indicators['4'];
  assert.ok(valid(ind4.above_ma20_pct) && valid(ind4.above_ma60_pct) && valid(ind4.above_ma120_pct));

  // 5 新高新低
  const ind5 = packet.indicators['5'];
  assert.ok(valid(ind5.high52) && valid(ind5.low52) && valid(ind5.net_high52));

  // 6 成交值
  const ind6 = packet.indicators['6'];
  assert.ok(valid(ind6.twse_volume) && valid(ind6.total_volume) && valid(ind6.total_ratio));

  // 7 量價反應
  const ind7 = packet.indicators['7'];
  assert.ok(ind7.active_pattern && ind7.detail && valid(ind7.volume_ratio));

  // 8 融資餘額
  const ind8 = packet.indicators['8'];
  assert.ok(valid(ind8.total_margin) && valid(ind8.twse_margin) && valid(ind8.total_margin_pct5));

  // 9 槓桿清洗
  const ind9 = packet.indicators['9'];
  assert.ok(valid(ind9.margin_peak) && valid(ind9.margin_drop_pct) && valid(ind9.leverage_spread20));

  // 10 領漲族群
  const ind10 = packet.indicators['10'];
  assert.ok(valid(ind10.leading_count) && Array.isArray(ind10.top_sectors) && ind10.top_sectors.length > 0);

  // 11 強勢股健康
  const ind11 = packet.indicators['11'];
  assert.ok(valid(ind11.health_score) && valid(ind11.below_ma20_pct) && valid(ind11.catchup_breakdown_pct));

  // 12 恐慌程度
  const ind12 = packet.indicators['12'];
  assert.ok(valid(ind12.taiwan_vix) && valid(ind12.taiwan_vix_pct252));

  // 13 法人動向
  const ind13 = packet.indicators['13'];
  assert.ok(valid(ind13.foreign_net_today) && valid(ind13.futures_foreign_oi));

  // 14 基本面
  const ind14 = packet.indicators['14'];
  assert.ok(valid(ind14.total_revenue) && valid(ind14.revenue_yoy) && ind14.eps_direction_label);

  // 15 估值預期
  const ind15 = packet.indicators['15'];
  assert.ok(valid(ind15.trailing_pe) && valid(ind15.forward_pe) && valid(ind15.expected_growth));
});
