import { valid, last, fmt, signed, tone, escapeHTML as e, safeURL, change, returns, seriesFor, latestQuote, periodRows, paginate, sortNumeric, companyRows, breadthPercent, monthLabel, timeLabel, snapshotAgeDays } from './model.mjs';
import { spark, chartSVG, chartKey, volumeSVG } from './charts.mjs';

const $ = selector => document.querySelector(selector);
const names = { taiex: '加權指數', tpex: '櫃買指數', '2330': '台積電', '2317': '鴻海', '2454': '聯發科', '2382': '廣達', '2308': '台達電', '3231': '緯創', SPY: 'S&P 500', QQQ: 'Nasdaq 100', SOXX: '半導體 ETF' };
const stockSymbols = ['2330', '2317', '2454', '2382', '2308', '3231'];
const colors = { taiex: '#2962ff', tpex: '#8064b4', '2330': '#ba4655', '2317': '#245d9a', '2454': '#ce932d', '2382': '#517b99', '2308': '#398b84', '3231': '#6c7597' };
const state = { packet: null, symbol: 'taiex', period: '66', candle: false, ma: false, companySearch: '', companySort: 'yoy', companyPage: 1, eventSearch: '', eventPage: 1, factorSearch: '', factorGroup: '全部', factorStatus: '全部', factorPage: 1, sourceFilter: '全部', sectorSort: 'desc', sectorAll: false, refreshing: false };
let refreshTimer, resizeTimer, scrollFrame, initialAnchorHandled = false;
const chartJobs = new Map();
const data = () => state.packet?.data || {};
const features = () => state.packet?.features || {};
const date = value => e(value || '尚未取得');
const deltaHTML = value => `<span class="${tone(value)} numeric">${signed(value)}</span>`;
const external = (url, text, className = '') => `<a href="${safeURL(url)}" target="_blank" rel="noopener noreferrer" class="${className}">${e(text)} ↗</a>`;
const statusTag = status => `<span class="tag ${status === 'ok' || status === '可觀測' ? 'ok' : status === 'stale' || status === '部分' || status === '代理' ? 'warn' : ''}">${e(({ ok: '抓取成功', stale: '保留前值', error: '未取得' })[status] || status || '未知')}</span>`;
function sourceMeta(id) {
  const source = (state.packet?.sources || []).find(row => row.id === id);
  return `${date(source?.observed_at)}${source?.status && source.status !== 'ok' ? ` · ${statusTag(source.status)}` : ''}`;
}
function section(id, title, description, body, trailing = '') {
  return `<section id="${id}" class="market-section" aria-labelledby="${id}-heading"><div class="section-heading"><div><h2 id="${id}-heading">${e(title)} <span class="chevron" aria-hidden="true">›</span></h2>${description ? `<p>${e(description)}</p>` : ''}</div>${trailing}</div>${body}</section>`;
}
function stat(label, value, note, className = '') {
  return `<div class="stat"><span class="stat-label">${e(label)}</span><strong class="stat-value numeric ${className}">${value}</strong><small class="stat-date">${note}</small></div>`;
}
function smallChart(rows, fields, labels, id, caption = '') {
  chartJobs.set(id, { rows, fields, labels });
  const width = Math.max(260, Math.min(560, window.innerWidth <= 640 ? window.innerWidth - 32 : (Math.min(window.innerWidth, 1600) - 140) / 2));
  return `<div class="small-chart" data-plot="${id}">${chartSVG(rows, { fields, width, height: 200, id, label: labels.join('／') })}</div>${chartKey(labels)}${caption ? `<p class="small-caption">${caption}</p>` : ''}`;
}
function resizeSmallCharts() {
  document.querySelectorAll('[data-plot]').forEach(host => {
    const job = chartJobs.get(host.dataset.plot);
    if (job && host.clientWidth) host.innerHTML = chartSVG(job.rows, { fields: job.fields, width: Math.max(240, host.clientWidth), height: host.clientHeight, id: host.dataset.plot, label: job.labels.join('／') });
  });
}
function rankRows(rows, { unit = '%', numbered = false, bars = false, decimals = 2, subtitle = false } = {}) {
  if (!rows.length) return '<p class="empty">尚無可用資料</p>';
  const max = Math.max(...rows.map(row => Math.abs(row.value || 0)), 1);
  return `<div class="rank-list ${bars ? 'bars' : ''}">${rows.map((row, i) => `<div class="rank-row">${numbered ? `<span class="rank-number">${i + 1}</span>` : ''}<div class="rank-name"><strong title="${e(row.name)}">${e(row.name)}</strong>${subtitle && row.date ? `<small>${date(row.date)}</small>` : ''}</div>${bars && valid(row.value) ? `<div class="bar-track"><i style="width:${Math.abs(row.value) / max * 100}%;background:var(--${row.value >= 0 ? 'up' : 'down'})"></i></div>` : ''}<div class="rank-value numeric ${tone(row.value)}">${signed(row.value, decimals, unit)}${valid(row.close) ? `<small>${fmt(row.close)} 點</small>` : ''}</div></div>`).join('')}</div>`;
}
function paginationHTML(result, scope, noun = '筆') {
  return `<div class="pagination"><span>共 ${result.total.toLocaleString()} ${noun}${result.total ? ` · 顯示 ${(result.page - 1) * (scope === 'event' ? 10 : scope === 'factor' ? 14 : 12) + 1}–${Math.min(result.total, result.page * (scope === 'event' ? 10 : scope === 'factor' ? 14 : 12))}` : ''}</span><div class="pagination-controls"><button data-page="${scope}" data-step="-1" aria-label="上一頁" ${result.page <= 1 ? 'disabled' : ''}>‹</button><span>${result.page} / ${result.pages}</span><button data-page="${scope}" data-step="1" aria-label="下一頁" ${result.page >= result.pages ? 'disabled' : ''}>›</button></div></div>`;
}

function quoteStrip() {
  return `<div class="quote-strip" role="group" aria-label="切換市場走勢">${['taiex', 'tpex', '2330', '2454'].map(symbol => {
    const q = latestQuote(data(), symbol);
    return `<button class="quote-chip ${state.symbol === symbol ? 'selected' : ''}" data-symbol="${symbol}" aria-pressed="${state.symbol === symbol}"><span class="symbol-mark" style="--mark:${colors[symbol]}">${({ taiex: 'TW', tpex: 'OTC' })[symbol] || symbol}</span><span class="quote-copy"><span class="quote-name">${e(names[symbol])}<small class="quote-date">${symbol === 'taiex' || symbol === 'tpex' ? '指數' : symbol}</small></span><span class="quote-value numeric">${fmt(q.close)}</span><span class="quote-change ${tone(q.delta)} numeric">${signed(q.delta)}</span></span></button>`;
  }).join('')}</div>`;
}
function renderIndices() {
  return section('indices', '台灣市場指標', '', `<div id="quote-strip">${quoteStrip()}</div><div id="main-chart-content"></div>`, '<span class="section-tag">TWSE · TPEx</span>');
}
function mainChart() {
  const symbol = state.symbol, allRows = seriesFor(data(), symbol), rows = periodRows(allRows, state.period), q = latestQuote(data(), symbol);
  const chartWidth = Math.max(280, $('#main-chart-content').clientWidth), chartHeight = window.innerWidth <= 640 ? 240 : window.innerWidth <= 900 ? 300 : 330;
  const unit = symbol === 'taiex' || symbol === 'tpex' ? '點' : 'TWD';
  const periods = [['22', '1M'], ['66', '3M'], ['132', '6M'], ['264', '1Y'], ['all', '全部']];
  $('#main-chart-content').innerHTML = `<div class="chart-summary"><div><strong class="chart-price numeric">${fmt(q.close)}<span class="unit">${unit}</span></strong><span class="chart-change ${tone(q.delta)} numeric"> ${signed(q.delta)}</span><p class="chart-caption">${e(names[symbol])} · ${date(q.date)} ${e(q.time || '盤後日線')} · ${sourceMeta(symbol)}${q.previous != null ? ' · 含來源最新報價' : ''}</p></div><div id="chart-readout" class="chart-readout">日線 · 拖曳量測區間報酬</div></div><div class="hero-chart" id="main-chart">${chartSVG(rows, { fields: state.ma && symbol === 'taiex' ? ['close', 'ma20', 'ma60'] : ['close'], width: chartWidth, height: chartHeight, candle: state.candle, area: !state.candle && !state.ma, id: 'main', label: `${names[symbol]}歷史日線` })}<div class="chart-hover" id="chart-hover"></div></div><div class="volume-chart">${volumeSVG(rows, chartWidth)}</div><div class="chart-controls"><div class="pills" role="group" aria-label="走勢期間">${periods.map(([value, label]) => `<button data-period="${value}" class="${state.period === value ? 'active' : ''}" aria-pressed="${state.period === value}">${label}</button>`).join('')}</div>${state.ma && symbol === 'taiex' ? chartKey(['收盤', 'MA20', 'MA60']) : ''}<div class="chart-options" role="group" aria-label="圖表設定"><button data-chart="area" aria-pressed="${!state.candle}" class="${!state.candle ? 'active' : ''}">走勢</button><button data-chart="candle" aria-pressed="${state.candle}" class="${state.candle ? 'active' : ''}">K 線</button>${symbol === 'taiex' ? `<button data-chart="ma" aria-pressed="${state.ma}" class="${state.ma ? 'active' : ''}">均線</button>` : ''}</div></div><p class="section-bottom">${rows.length} 筆日線 · ${date(rows[0]?.date)} — ${date(last(rows).date)} · ${symbol === 'taiex' || symbol === 'tpex' ? '指數報價與日線更新時間可能不同' : '歷史價格，非即時報價'} · 上漲紅／下跌綠</p>`;
  wireChart(rows);
}
function wireChart(rows) {
  const host = $('#main-chart'), overlay = $('#chart-hover'), readout = $('#chart-readout');
  let drag = null;
  const point = event => {
    const box = host.getBoundingClientRect(), fraction = Math.max(0, Math.min(1, ((event.clientX - box.left) - 4) / (box.width - 66)));
    return { index: Math.round(fraction * Math.max(0, rows.length - 1)), px: 4 + fraction * (box.width - 66), width: box.width };
  };
  host.addEventListener('pointermove', event => {
    if (!rows.length) return;
    const p = point(event), row = rows[p.index];
    const measure = drag == null ? null : change(row.close, rows[drag.index]?.close);
    overlay.innerHTML = `${drag != null ? `<div class="chart-measure" style="left:${Math.min(p.px, drag.px)}px;width:${Math.abs(p.px - drag.px)}px"></div>` : ''}<div class="crosshair" style="left:${p.px}px"></div><div class="chart-tooltip" style="left:${Math.max(0, Math.min(p.width - 165, p.px + 15))}px">${date(row.date)}<b>${fmt(row.close)}${drag != null ? ` · ${signed(measure)}` : ''}</b></div>`;
    readout.innerHTML = drag != null ? `${date(rows[drag.index]?.date)} → ${date(row.date)} · ${deltaHTML(measure)}` : `${date(row.date)} · 開 ${fmt(row.open)}　高 ${fmt(row.high)}　低 ${fmt(row.low)}　收 ${fmt(row.close)}`;
  });
  host.addEventListener('pointerdown', event => { if (event.pointerType === 'mouse' && rows.length) { drag = point(event); host.setPointerCapture(event.pointerId); } });
  host.addEventListener('pointerup', event => { if (drag != null) { drag = null; if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId); } });
  host.addEventListener('pointercancel', () => { drag = null; overlay.innerHTML = ''; });
  host.addEventListener('pointerleave', () => { if (drag == null) overlay.innerHTML = ''; });
}

function renderStocks() {
  const body = `<div class="mini-grid stock-grid">${stockSymbols.map(symbol => {
    const rows = data()[symbol] || [], row = last(rows), delta = returns(rows);
    return `<button class="mini-card as-button" data-stock="${symbol}" aria-label="查看${names[symbol]}歷史走勢"><div class="mini-card-top"><span class="symbol-mark" style="--mark:${colors[symbol]}">${symbol}</span><div><h3>${e(names[symbol])}</h3><small>${symbol} · TWSE</small></div></div><div class="mini-card-price numeric">${fmt(row.close)}<span class="unit">TWD</span></div><div class="mini-card-change ${tone(delta)} numeric">${signed(delta)}</div><div class="mini-card-bottom"><span>${date(row.date)}</span>${spark(rows, 'close', delta >= 0 ? 'var(--up)' : 'var(--down)')}</div></button>`;
  }).join('')}</div><p class="section-bottom">${stockSymbols.length} 檔既有追蹤個股 · 圖表為最近 36 筆日線 · 點選查看完整走勢與報酬</p>`;
  return section('stocks', '焦點台股', '從權值與科技股，看見市場動向。', body, '<span class="section-tag">歷史日線</span>');
}

function renderBreadth() {
  const daily = last(data().fmt);
  const b = data().market?.breadth || {}, f = features(), share = breadthPercent(b), total = (b.up || 0) + (b.down || 0) + (b.flat || 0);
  const bar = share == null ? '<p class="empty">尚無漲跌家數資料</p>' : `<div class="breadth-bar" role="img" aria-label="上漲 ${b.up} 家、下跌 ${b.down} 家、平盤 ${b.flat} 家"><i style="width:${b.up / total * 100}%;background:var(--up)"></i><i style="width:${b.flat / total * 100}%;background:var(--muted)"></i><i style="width:${b.down / total * 100}%;background:var(--down)"></i></div>`;
  const levels = [20, 60, 120, 240].map(days => `<div class="level-row"><span>${({ 20: '月線', 60: '季線', 120: '半年線', 240: '年線' })[days]} <small class="muted">MA${days}</small></span><strong class="numeric">${fmt(f[`ma${days}`])}</strong><span class="${tone(f[`dev${days}`])} numeric">${signed(valid(f[`dev${days}`]) ? f[`dev${days}`] * 100 : null)}</span></div>`).join('');
  const body = `<div class="split-row"><article><h3 class="subheading">市場參與度 <small>${date(b.date)}</small></h3><div class="breadth-head"><div><strong class="up numeric">${fmt(share, 1)}<span class="unit">%</span></strong><small>上漲家數占比 · 含平盤</small></div><span class="muted">${total ? fmt(total, 0) + ' 家' : '尚未取得'}</span></div>${bar}<div class="breadth-labels"><span class="up">上漲 ${fmt(b.up, 0)}</span><span class="muted">平盤 ${fmt(b.flat, 0)}</span><span class="down">下跌 ${fmt(b.down, 0)}</span></div><div class="inline-metrics"><div><strong class="up numeric">${fmt(b.limit_up, 0)}</strong><small>漲停家數</small></div><div><strong class="down numeric">${fmt(b.limit_down, 0)}</strong><small>跌停家數</small></div><div><strong class="numeric">${valid(f.volratio) ? fmt(f.volratio) + '×' : '—'}</strong><small>成交值／20日均值</small></div></div><p class="small-caption">${sourceMeta('market')} · 上市全證券口徑，非股票淨流入。<br>日成交值 ${valid(daily.volume) ? fmt(daily.volume / 1e8) : '—'} 億元 · ${date(daily.date)}（證交所日成交）</p></article><article><h3 class="subheading">價格結構 <small>${date(f.date)} · 乖離率</small></h3><div class="level-list">${levels}</div><div class="inline-metrics">${[1, 5, 20].map(n => `<div><strong class="${tone(f['r' + n])} numeric">${signed(valid(f['r' + n]) ? f['r' + n] * 100 : null)}</strong><small>近 ${n} 交易日</small></div>`).join('')}</div><p class="small-caption">60 日報酬 ${signed(valid(f.r60) ? f.r60 * 100 : null)} · 60 日高點回撤 ${signed(valid(f.dd60) ? f.dd60 * 100 : null)} · ATR14 ${fmt(f.atr14)} 點</p></article></div>`;
  return section('breadth', '市場廣度與價格', '指數之外，也看看有多少股票一起前進。', body);
}
function renderSectors() {
  return section('sectors', '產業與指數表現', '依最新單日漲跌幅排序，完整保留來源的產業與指數名稱。', '<div id="sector-content"></div>', `<button id="sector-expand" class="text-link">${state.sectorAll ? '收合' : '查看全部'} <span aria-hidden="true">↗</span></button>`);
}
function sectorsContent() {
  const rows = (data().market?.sectors || []).filter(row => valid(row.value)), sorted = sortNumeric(rows, 'value', state.sectorSort);
  if (!state.sectorAll) {
    $('#sector-content').innerHTML = `<div class="split-row"><article><h3 class="subheading">領先市場 <small>單日漲跌幅</small></h3>${rankRows(sortNumeric(rows, 'value').slice(0, 6), { numbered: true })}</article><article><h3 class="subheading">相對落後 <small>單日漲跌幅</small></h3>${rankRows(sortNumeric(rows, 'value', 'asc').slice(0, 6), { numbered: true })}</article></div><p class="section-bottom">${sourceMeta('market')} · 共 ${rows.length} 項 · 排名僅比較已有資料的指數。</p>`;
  } else {
    $('#sector-content').innerHTML = `<div class="table-toolbar"><span class="muted">共 ${rows.length} 項</span><select id="sector-sort" aria-label="產業排序"><option value="desc" ${state.sectorSort === 'desc' ? 'selected' : ''}>漲幅優先</option><option value="asc" ${state.sectorSort === 'asc' ? 'selected' : ''}>跌幅優先</option></select></div><div class="table-scroll"><table><thead><tr><th>產業／指數</th><th class="align-right">最新指數</th><th class="align-right">漲跌幅</th><th class="align-right">觀測日</th></tr></thead><tbody>${sorted.map(row => `<tr><td>${e(row.name)}</td><td class="align-right numeric">${fmt(row.close)}</td><td class="align-right numeric ${tone(row.value)}">${signed(row.value)}</td><td class="align-right muted">${date(row.date)}</td></tr>`).join('')}</tbody></table></div>`;
  }
}

function renderFlows() {
  const d = data(), f = features(), m = d.margin_official || {}, pc = last(d.putcall), total = (d.institutions || []).find(row => row.name === '合計'), ins = (d.institutions || []).filter(row => !['合計', '外資自營商'].includes(row.name)), futures = (d.futures || []).filter(row => row.contract === '臺股期貨');
  const stats = `<div class="stats-strip">${stat('三大法人現貨合計', `${fmt(total?.value)}<span class="unit">億元</span>`, date(total?.date), tone(total?.value))}${stat('上市融資本金', `${fmt(m.value ?? f.margin)}<span class="unit">億元</span>`, date(m.date || last(d.margin).date))}${stat('Put / Call 未平倉比', `${fmt(pc.oi)}<span class="unit">%</span>`, date(pc.date))}${stat('當沖股數占比', `${fmt(d.daytrade?.volume_share)}<span class="unit">%</span>`, date(d.daytrade?.date))}</div>`;
  const reconciliation = m.date ? `<div class="reconcile">${[['前日餘額', m.previous], ['＋ 買進', m.buy], ['− 賣出', m.sell], ['− 現償', m.repay], ['＝ 今日餘額', m.value]].map(([label, value]) => `<div><small>${label}</small><strong class="numeric">${fmt(value)}</strong></div>`).join('')}</div>` : '<p class="empty">尚無官方融資拆解資料</p>';
  const body = `${stats}<div class="split-row"><article><h3 class="subheading">三大法人買賣超 <small>億元 · ${date(ins[0]?.date)}</small></h3>${rankRows(ins, { unit: ' 億', bars: true })}<div class="chart-block"><h4>融資本金趨勢 <span class="unit">億元</span></h4>${smallChart((d.margin || []).slice(-132), ['value'], ['融資本金'], 'margin', `${sourceMeta('margin')} · 近 20 日變化 ${signed(valid(f.margin20) ? f.margin20 * 100 : null)}`)}</div></article><article><h3 class="subheading">臺股期貨淨未平倉 <small>口 · ${date(futures[0]?.date)}</small></h3>${rankRows(futures, { unit: ' 口', bars: true, decimals: 0 })}<div class="chart-block"><h4>Put / Call Ratio <span class="unit">%</span></h4>${smallChart(d.putcall || [], ['volume', 'oi'], ['成交量比', '未平倉比'], 'putcall', `${sourceMeta('putcall')} · 100% 表示 1 倍，兩者分母不同。`)}</div></article></div><div class="row-divider"></div><div class="split-row"><article><h3 class="subheading">融資變動拆解 <small>${date(m.date)} · 億元</small></h3>${reconciliation}<p class="small-caption">融券餘額 ${fmt(m.short_balance, 0)} 張 · 融券買進 ${fmt(m.short_buy, 0)} 張 · 賣出 ${fmt(m.short_sell, 0)} 張 · 償還 ${fmt(m.short_repay, 0)} 張</p></article><article><h3 class="subheading">交易與集中度 <small>各指標日期分開</small></h3><div class="level-list"><div class="level-row"><span>當沖買／賣</span><strong>${fmt(d.daytrade?.buy_share)}% / ${fmt(d.daytrade?.sell_share)}%</strong><span class="muted">${date(d.daytrade?.date?.slice(5))}</span></div><div class="level-row"><span>台積電成交占比</span><strong>${valid(f.tsmc_vol_share) ? fmt(f.tsmc_vol_share * 100) + '%' : '—'}</strong><span class="muted">${date(f.date?.slice(5))}</span></div><div class="level-row"><span>六檔成交占比</span><strong>${valid(f.top6_vol_share) ? fmt(f.top6_vol_share * 100) + '%' : '—'}</strong><span class="muted">${date(f.date?.slice(5))}</span></div></div></article></div><p class="section-bottom">現貨與期貨不相加；避險部位不直接代表方向。融資現償可為轉現股，不等於強迫平倉。公開資料無整戶維持率與私人質押資訊。</p>`;
  return section('flows', '法人與籌碼', '資金流向、槓桿變化與市場交易結構。', body, '<span class="section-tag">盤後資料</span>');
}

function renderGlobal() {
  const d = data(), tr = last(d.treasury), fx = last(d.fx), vix = last(d.vix), vix3m = last(d.vix3m);
  const cards = [
    ...['SPY', 'QQQ', 'SOXX'].map(symbol => ({ label: symbol, sub: names[symbol], value: last(d[symbol]).close, rows: d[symbol], delta: returns(d[symbol]), date: last(d[symbol]).date, unit: 'USD', field: 'close' })),
    { label: 'VIX', sub: 'Cboe 波動率', value: vix.value, rows: d.vix, delta: returns(d.vix, 1, 'value'), date: vix.date, unit: '', field: 'value' },
    { label: 'US 10Y', sub: '美國十年公債', value: tr.y10, rows: d.treasury, delta: null, date: tr.date, unit: '%', field: 'y10' },
    { label: 'USD/TWD', sub: '美元／新台幣', value: fx.twd, rows: d.fx, delta: null, date: fx.date, unit: '', field: 'twd' }
  ];
  const cardHTML = `<div class="mini-grid global-grid">${cards.map((card, i) => `<article class="mini-card"><div class="mini-card-top"><span class="symbol-mark" style="--mark:${['#4269ad', '#5a6b9e', '#7884a7', '#8b6cce', '#447c83', '#64758e'][i]}">${['US', '100', 'CHIP', 'VIX', '10Y', 'FX'][i]}</span><div><h3>${e(card.label)}</h3><small>${e(card.sub)}</small></div></div><div class="mini-card-price numeric">${fmt(card.value, card.label === 'USD/TWD' ? 3 : 2)}<span class="unit">${card.unit}</span></div><div class="mini-card-change ${tone(card.delta)}">${valid(card.delta) ? signed(card.delta) : '<span class="muted" style="font-size:10px;font-weight:400">參考數值</span>'}</div><div class="mini-card-bottom"><span>${date(card.date)}</span>${spark(card.rows, card.field)}</div></article>`).join('')}</div>`;
  const v3Map = new Map((d.vix3m || []).map(row => [row.date, row.value]));
  const volatility = (d.vix || []).slice(-66).map(row => ({ date: row.date, vix: row.value, vix3m: v3Map.get(row.date) ?? null }));
  const body = `${cardHTML}<div class="global-chart-row"><article><h3>波動率期限比較</h3>${smallChart(volatility, ['vix', 'vix3m'], ['VIX', 'VIX3M'], 'volatility', `VIX3M ${fmt(vix3m.value)} · ${date(vix3m.date)}<br>比值 ${fmt(vix.date === vix3m.date && valid(vix3m.value) && vix3m.value !== 0 ? vix.value / vix3m.value : null)} · 僅比較同日資料，非期貨曲線`)}</article><article><h3>美國公債殖利率 <span class="unit">%</span></h3>${smallChart((d.treasury || []).slice(-66), ['y2', 'y10', 'y30'], ['2 年', '10 年', '30 年'], 'treasury', `${sourceMeta('treasury')} · 殖利率不等於債券報酬`)}</article><article><h3>美元／日圓與 VVIX</h3>${smallChart(d.fx || [], ['jpy'], ['USD / JPY'], 'jpy', `${sourceMeta('fx')} · 最新 ${fmt(fx.jpy, 3)}<br>VVIX ${fmt(last(d.vvix).value)} · ${sourceMeta('vvix')}`)}</article></div><div class="row-divider"></div><div class="split-row"><article><h3 class="subheading">美股近 5 交易日報酬</h3>${rankRows(['SPY', 'QQQ', 'SOXX'].map(symbol => ({ name: `${symbol} · ${names[symbol]}`, value: returns(d[symbol], 5), date: last(d[symbol]).date })), { bars: true, subtitle: true })}</article><article><h3 class="subheading">VVIX · 波動之波動</h3>${smallChart((d.vvix || []).slice(-66), ['value'], ['VVIX'], 'vvix', `${sourceMeta('vvix')} · 與 VIX 屬同一風險群`)}</article></div><p class="section-bottom">海外市場僅供台股背景參考，各市場交易日不同。信用利差、美元資金、商品價格與總體修訂資料尚未完整接通，請參考研究因子的覆蓋缺口。</p>`;
  return section('global', '全球市場參考', '與台股連動的科技股、波動率、利率與匯率。', body, '<span class="section-tag">海外收盤資料</span>');
}

function renderCompanies() {
  return section('companies', '月營收與估值', '從公司數字，追蹤產業與成長。', `<div class="table-toolbar"><label class="search-field"><span aria-hidden="true">⌕</span><input id="company-search" type="search" aria-label="搜尋公司營收與估值" placeholder="搜尋代碼、公司、產業" value="${e(state.companySearch)}"></label><div class="table-filters"><select id="company-sort" aria-label="營收與估值排序">${[['yoy', '營收年增率 ↓'], ['mom', '營收月增率 ↓'], ['revenue', '營收規模 ↓'], ['yield', '殖利率 ↓'], ['pe', '本益比 ↓']].map(([value, label]) => `<option value="${value}" ${state.companySort === value ? 'selected' : ''}>${label}</option>`).join('')}</select><span class="section-tag">上市公司</span></div></div><div id="company-results"></div><p class="section-bottom">營收出表 ${sourceMeta('revenue')} · 估值 ${sourceMeta('valuations')} · 營收單位為仟元；缺少本益比保留空值。兩種來源的公司清單取聯集，皆可搜尋。</p>`);
}
function companiesContent() {
  const result = paginate(companyRows(data(), state.companySearch, state.companySort), state.companyPage);
  state.companyPage = result.page;
  $('#company-results').innerHTML = `<div class="table-scroll"><table><thead><tr><th>公司／產業</th><th>營收月份</th><th class="align-right">營收 <span class="unit">仟元</span></th><th class="align-right">MoM</th><th class="align-right">YoY</th><th class="align-right">本益比</th><th class="align-right">股價淨值比</th><th class="align-right">殖利率</th></tr></thead><tbody>${result.rows.map(row => `<tr><td><div class="company-cell"><span class="symbol-mark">${e(row.ticker)}</span><span><strong>${e(row.name)}</strong><small>${e(row.ticker)} · ${e(row.industry || '產業未提供')}</small></span></div></td><td class="numeric">${e(monthLabel(row.period))}</td><td class="align-right numeric">${fmt(row.revenue, 0)}</td><td class="align-right numeric ${tone(row.mom)}">${signed(row.mom)}</td><td class="align-right numeric ${tone(row.yoy)}">${signed(row.yoy)}</td><td class="align-right numeric" title="估值日期 ${date(row.valuation_date)}">${fmt(row.pe)}</td><td class="align-right numeric">${fmt(row.pb)}</td><td class="align-right numeric">${valid(row.yield) ? fmt(row.yield) + '%' : '—'}</td></tr>`).join('')}</tbody></table></div>${!result.total ? '<div class="empty">沒有符合的公司，請嘗試其他代碼或名稱。</div>' : ''}${paginationHTML(result, 'company')}`;
}

function renderEvents() {
  return section('events', '公司最新公告', '公開資訊觀測站重大訊息，點選可閱讀原始內容。', `<div class="table-toolbar"><label class="search-field"><span aria-hidden="true">⌕</span><input id="event-search" type="search" aria-label="搜尋公司公告" placeholder="搜尋代碼、公司、公告主旨" value="${e(state.eventSearch)}"></label>${external('https://mops.twse.com.tw/', '公開資訊觀測站', 'text-link')}</div><div id="event-results"></div>`);
}
function eventsContent() {
  const query = state.eventSearch.trim().toLowerCase(), all = [...(data().news || [])].sort((a, b) => `${b.date || ''}${String(b.time || '').padStart(6, '0')}`.localeCompare(`${a.date || ''}${String(a.time || '').padStart(6, '0')}`)).filter(row => !query || [row.ticker, row.name, row.title].some(value => String(value || '').toLowerCase().includes(query)));
  const result = paginate(all, state.eventPage, 10); state.eventPage = result.page;
  $('#event-results').innerHTML = `<div class="event-grid">${result.rows.map(row => `<details class="event-item"><summary><time class="event-date">${date(row.date)}<br>${e(timeLabel(row.time))}</time><div class="event-copy"><strong>${e(row.ticker)} ${e(row.name)}</strong><p>${e(row.title)}</p></div><span class="event-plus" aria-hidden="true">＋</span></summary><div class="event-detail">${e(row.detail || '來源未提供公告全文')}<small>事實發生日 ${date(row.event_date)} · 可知時間採公告日期與時間。</small></div></details>`).join('')}</div>${!result.total ? '<div class="empty">沒有符合的公告。</div>' : ''}${paginationHTML(result, 'event')}<p class="section-bottom">${sourceMeta('news')} · 僅顯示後端已抓取的 ${data().news?.length || 0} 則公告。</p>`;
}

function renderResearch() {
  const factors = state.packet.factors || [], groups = ['全部', ...new Set(factors.map(row => row.group).filter(Boolean))];
  return section('research', `${factors.length} 項研究因子`, '可觀測、代理與資料缺口，逐項核對來源。', `<div class="table-toolbar"><label class="search-field"><span aria-hidden="true">⌕</span><input id="factor-search" type="search" aria-label="搜尋研究因子" placeholder="搜尋因子、代碼、資料需求" value="${e(state.factorSearch)}"></label><select id="factor-status" aria-label="因子觀測狀態">${['全部', '可觀測', '部分', '代理', '缺漏'].map(status => `<option ${state.factorStatus === status ? 'selected' : ''}>${e(status)}</option>`).join('')}</select></div><div class="table-filters" style="margin-bottom:12px"><div class="pills" role="group" aria-label="因子類別">${groups.map(group => `<button data-factor-group="${e(group)}" aria-pressed="${state.factorGroup === group}" class="${state.factorGroup === group ? 'active' : ''}">${e(group)}</button>`).join('')}</div></div><div id="factor-results"></div>`, '<span class="section-tag">來源與計算方法</span>');
}
function factorsContent() {
  const query = state.factorSearch.trim().toLowerCase(), rows = (state.packet.factors || []).filter(row => (state.factorGroup === '全部' || row.group === state.factorGroup) && (state.factorStatus === '全部' || row.status === state.factorStatus) && (!query || [row.id, row.name, row.method, row.value, row.missing_reason].some(value => String(value || '').toLowerCase().includes(query))));
  const result = paginate(rows, state.factorPage, 14); state.factorPage = result.page;
  $('#factor-results').innerHTML = `<div class="table-scroll"><table class="factor-table"><thead><tr><th>因子</th><th>狀態</th><th>最新可用資訊</th><th>觀測日期</th><th>來源</th></tr></thead><tbody>${result.rows.map(row => `<tr><td><button class="factor-button" data-factor="${e(row.id)}" aria-label="查看 ${e(row.id)} ${e(row.name)} 詳情"><span class="factor-code">${e(row.id)}</span>${e(row.name)} <span class="muted">↗</span></button></td><td>${statusTag(row.status)}</td><td class="factor-value">${e(row.value || row.missing_reason || '尚無資料')}</td><td class="numeric muted">${date(row.observed_at)}</td><td class="factor-value muted">${e((row.sources || []).map(source => source.title).join('、') || '未接通')}</td></tr>`).join('')}</tbody></table></div>${!result.total ? '<p class="empty">沒有符合的因子。</p>' : ''}${paginationHTML(result, 'factor', '項')}<p class="section-bottom">相關因子不重複計為獨立證據。點選因子可查看計算方法、來源、觀測日期與限制。</p>`;
}

function renderSources() {
  return section('sources', '資料來源與更新', '抓取成功不代表即時；每項資料皆保留原始觀測時間。', `<div class="table-toolbar"><div id="source-summary" class="source-summary"></div><select id="source-filter" aria-label="來源連線狀態">${['全部', '抓取成功', '更新異常'].map(value => `<option ${state.sourceFilter === value ? 'selected' : ''}>${value}</option>`).join('')}</select></div><div id="source-results"></div><div class="schedule-grid"><div><b>台股盤中 · 每 10 分鐘</b><p>交易日 09:00–13:30 排程取得指數報價。網頁每分鐘檢查快照，資料發布與部署可能延遲。</p></div><div><b>台股盤後 · 15:30</b><p>價格、廣度、法人、融資、營收與公告依各來源發布節奏更新。</p></div><div><b>海外收盤 · 06:00</b><p>美股、VIX 與美債排程更新。週末、休市或抓取失敗時顯示最後可用資料。</p></div></div>`);
}
function sourcesContent() {
  const sources = state.packet.sources || [], ok = sources.filter(row => row.status === 'ok').length;
  const rows = sources.filter(row => state.sourceFilter === '全部' || (state.sourceFilter === '抓取成功' ? row.status === 'ok' : row.status !== 'ok'));
  $('#source-summary').innerHTML = `<span><span class="status-dot"></span>${ok} 抓取成功</span><span>${sources.length - ok} 更新異常</span><span>共 ${sources.length} 個來源</span>`;
  const localTime = value => {
    const parsed = new Date(value);
    return value && Number.isFinite(parsed.getTime()) ? parsed.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }) : '尚未成功';
  };
  $('#source-results').innerHTML = `<div class="table-scroll"><table class="source-table"><thead><tr><th>資料來源</th><th>狀態</th><th>最後觀測日</th><th>成功抓取時間（台北）</th><th>發布頻率／排程</th><th>更新詳情</th></tr></thead><tbody>${rows.map(row => `<tr><td>${external(row.url, row.title)}</td><td>${statusTag(row.status)}</td><td class="numeric">${date(row.observed_at)}</td><td class="numeric muted">${e(localTime(row.retrieved_at))}</td><td class="muted">${e(row.frequency || '未提供')}<br><small>${e(row.interval || '依來源排程')}</small></td><td class="source-error">${e(row.error || '—')}</td></tr>`).join('')}</tbody></table></div>${!rows.length ? '<p class="empty">此篩選條件沒有資料來源。</p>' : ''}`;
}

function openDetail(kicker, title, body) {
  $('#detail-kicker').textContent = kicker;
  $('#detail-title').textContent = title;
  $('#detail-body').innerHTML = body;
  $('#detail-dialog').showModal();
  resizeSmallCharts();
}
function openStock(symbol) {
  const rows = data()[symbol] || [], row = last(rows);
  openDetail(`${symbol} · TWSE · 歷史日線`, names[symbol], `<p><strong class="chart-price numeric">${fmt(row.close)}<span class="unit">TWD</span></strong> ${deltaHTML(returns(rows))}</p><p class="chart-caption">觀測 ${date(row.date)} · ${sourceMeta(symbol)}</p>${smallChart(rows, ['close'], [names[symbol]], 'detail-stock')}<dl>${[['開盤', fmt(row.open)], ['最高／最低', `${fmt(row.high)} / ${fmt(row.low)}`], ['成交值', valid(row.volume) ? `${fmt(row.volume / 1e8)} 億元` : '—'], ['5／20／60 日報酬', [5, 20, 60].map(n => signed(returns(rows, n))).join(' / ')]].map(([label, value]) => `<div><dt>${label}</dt><dd class="numeric">${value}</dd></div>`).join('')}</dl><button class="refresh-button" data-open-chart="${symbol}">在市場總覽查看 K 線 ↗</button>`);
}
function openFactor(id) {
  const row = state.packet.factors.find(row => row.id === id);
  if (!row) return;
  const info = [['目前觀測', row.value || '未知'], ['觀測日期', row.observed_at || '未取得'], ['發布時間', row.published_at || '來源未提供'], ['可知時間', row.known_at || '來源未提供'], ['成功抓取', row.retrieved_at || '尚未成功'], ['單位／範圍', `${row.unit || '未知'} · ${row.universe || '未提供'}`], ['更新頻率', row.frequency || '未知'], ['計算方法', row.method], ['判讀限制', row.caveat], ['資料缺口', row.missing_reason || '請參閱判讀限制'], ['研究依據', row.basis], ['歷史版本', row.vintage_status || '未提供']];
  openDetail(`${row.id} · ${row.group}`, row.name, `${statusTag(row.status)}<dl>${info.map(([label, value]) => `<div><dt>${e(label)}</dt><dd>${e(value || '—')}</dd></div>`).join('')}</dl>${(row.sources || []).map(source => `<a class="detail-source" href="${safeURL(source.url)}" target="_blank" rel="noopener noreferrer">${e(source.title)} ↗<small>觀測 ${date(source.observed_at)} · 抓取 ${date(source.retrieved_at)}</small></a>`).join('')}`);
}

function render() {
  chartJobs.clear();
  $('#content').innerHTML = [renderIndices(), renderStocks(), renderBreadth(), renderSectors(), renderFlows(), renderGlobal(), renderCompanies(), renderEvents(), renderResearch(), renderSources()].join('');
  $('#content').setAttribute('aria-busy', 'false');
  mainChart(); sectorsContent(); companiesContent(); eventsContent(); factorsContent(); sourcesContent();
  resizeSmallCharts();
  updateActiveNav();
  if (!initialAnchorHandled) {
    initialAnchorHandled = true;
    const anchor = document.getElementById(location.hash.slice(1));
    if (anchor) requestAnimationFrame(() => { anchor.scrollIntoView({ behavior: 'instant', block: 'start' }); updateActiveNav(); });
  }
}
function updateActiveNav() {
  const nav = $('.section-nav'), sections = [...document.querySelectorAll('.market-section')];
  const section = sections.reverse().find(section => section.getBoundingClientRect().top <= nav.offsetHeight + 40);
  const id = section?.id === 'breadth' ? 'indices' : section?.id || 'indices';
  nav.querySelectorAll('a').forEach(link => {
    const active = link.hash === '#' + id;
    link.classList.toggle('active', active);
    if (active) {
      link.setAttribute('aria-current', 'location');
      if (nav.scrollWidth > nav.clientWidth && (link.offsetLeft < nav.scrollLeft + 12 || link.offsetLeft + link.offsetWidth > nav.scrollLeft + nav.clientWidth - 12)) nav.scrollTo({ left: link.offsetLeft - nav.clientWidth / 2 + link.offsetWidth / 2, behavior: 'smooth' });
    } else link.removeAttribute('aria-current');
  });
}
function freshness() {
  const packet = state.packet, sources = packet.sources || [], priceDate = latestQuote(data(), 'taiex').date || features().date;
  const age = snapshotAgeDays(priceDate), snapshotTime = new Date(packet.asof);
  $('#snapshot-status').innerHTML = `<span class="status-dot ${age != null && age > 3 ? 'old' : ''}"></span>最新行情 ${date(priceDate)}<span aria-hidden="true">　·　</span>快照 ${Number.isFinite(snapshotTime.getTime()) ? e(snapshotTime.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })) : '時間未知'}（台北）`;
  const notices = [];
  if (age != null && age > 3) notices.push(`最新行情距今 ${age} 個日曆日，以下為最後可用資料。`);
  if (data().market?.date && features().date && data().market.date !== features().date) notices.push(`市場廣度 ${data().market.date} 與日線 ${features().date} 的觀測日不同。`);
  const errors = sources.filter(row => row.status !== 'ok');
  if (errors.length) notices.push(`${errors.length} 個來源更新異常，請核對各項觀測日期。`);
  $('#notice').hidden = !notices.length;
  $('#notice').innerHTML = notices.map(e).join(' ') + (notices.length ? ' <a href="#sources">查看資料來源 ›</a>' : '');
}
async function refresh(manual = false) {
  if (state.refreshing) return;
  state.refreshing = true; $('#refresh').disabled = true; $('#refresh').textContent = '更新中…';
  try {
    const response = await fetch(`data/market.json?t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`資料回應 ${response.status}`);
    const packet = await response.json();
    if (!packet || !packet.data || !Array.isArray(packet.sources) || !Array.isArray(packet.factors)) throw new Error('市場快照格式不完整');
    const changed = !state.packet || JSON.stringify(packet) !== JSON.stringify(state.packet);
    state.packet = packet;
    if (changed) render();
    freshness();
    if (manual && !changed) $('#snapshot-status').insertAdjacentHTML('beforeend', ' · 已檢查最新快照');
  } catch (error) {
    $('#notice').hidden = false;
    $('#notice').textContent = `${error.name === 'TimeoutError' ? '讀取資料逾時' : '無法讀取市場快照'}。${state.packet ? '畫面保留上次成功載入資料，請核對觀測日期。' : '請重新整理再試一次。'}`;
    if (!state.packet) { $('#content').innerHTML = '<div class="loading-state">市場資料暫時無法載入，請使用上方「重新整理」重試。</div>'; $('#content').setAttribute('aria-busy', 'false'); $('#snapshot-status').textContent = '市場資料未載入'; }
  } finally {
    state.refreshing = false; $('#refresh').disabled = false; $('#refresh').innerHTML = '重新整理 <span aria-hidden="true">↻</span>';
    clearTimeout(refreshTimer); refreshTimer = setTimeout(() => refresh(), Math.max(60, Number(state.packet?.refresh_seconds) || 60) * 1000);
  }
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || !state.packet) return;
  if (button.dataset.symbol) { state.symbol = button.dataset.symbol; $('#quote-strip').innerHTML = quoteStrip(); mainChart(); }
  if (button.dataset.period) { state.period = button.dataset.period; mainChart(); }
  if (button.dataset.chart) { if (button.dataset.chart === 'ma') state.ma = !state.ma; else state.candle = button.dataset.chart === 'candle'; mainChart(); }
  if (button.dataset.stock) openStock(button.dataset.stock);
  if (button.dataset.openChart) { state.symbol = button.dataset.openChart; state.candle = true; $('#detail-dialog').close(); $('#quote-strip').innerHTML = quoteStrip(); mainChart(); $('#indices').scrollIntoView({ behavior: 'smooth' }); }
  if (button.dataset.factor) openFactor(button.dataset.factor);
  if (button.dataset.factorGroup) { state.factorGroup = button.dataset.factorGroup; state.factorPage = 1; document.querySelectorAll('[data-factor-group]').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); }); factorsContent(); }
  if (button.id === 'sector-expand') { state.sectorAll = !state.sectorAll; button.innerHTML = `${state.sectorAll ? '收合' : '查看全部'} <span aria-hidden="true">↗</span>`; sectorsContent(); }
  if (button.dataset.page) {
    const scope = button.dataset.page, prop = scope === 'company' ? 'companyPage' : scope === 'event' ? 'eventPage' : 'factorPage', resultId = scope === 'company' ? '#company-results' : scope === 'event' ? '#event-results' : '#factor-results';
    const top = $(resultId).getBoundingClientRect().top; state[prop] += Number(button.dataset.step);
    ({ company: companiesContent, event: eventsContent, factor: factorsContent })[scope]();
    if (top < 62) $(resultId).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});
document.addEventListener('input', event => {
  const input = event.target;
  if (input.id === 'company-search') { state.companySearch = input.value; state.companyPage = 1; companiesContent(); }
  if (input.id === 'event-search') { state.eventSearch = input.value; state.eventPage = 1; eventsContent(); }
  if (input.id === 'factor-search') { state.factorSearch = input.value; state.factorPage = 1; factorsContent(); }
});
document.addEventListener('change', event => {
  const input = event.target;
  if (input.id === 'company-sort') { state.companySort = input.value; state.companyPage = 1; companiesContent(); }
  if (input.id === 'sector-sort') { state.sectorSort = input.value; sectorsContent(); }
  if (input.id === 'factor-status') { state.factorStatus = input.value; state.factorPage = 1; factorsContent(); }
  if (input.id === 'source-filter') { state.sourceFilter = input.value; sourcesContent(); }
});
$('#refresh').addEventListener('click', () => refresh(true));
function updateThemeLabel() { const label = document.documentElement.dataset.theme === 'dark' ? '切換淺色模式' : '切換深色模式'; $('#theme-toggle').setAttribute('aria-label', label); $('#theme-toggle').title = label; }
$('#theme-toggle').addEventListener('click', () => { const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = theme; try { localStorage.setItem('tw-markets-theme', theme); } catch {} updateThemeLabel(); });
$('#close-dialog').addEventListener('click', () => $('#detail-dialog').close());
$('#detail-dialog').addEventListener('click', event => { if (event.target === $('#detail-dialog')) { const box = event.target.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) event.target.close(); } });
$('#site-search').addEventListener('keydown', event => { if (event.key === 'Enter' && state.packet) { state.companySearch = event.target.value; state.companyPage = 1; $('#company-search').value = state.companySearch; companiesContent(); $('#companies').scrollIntoView({ behavior: 'smooth' }); $('#company-search').focus({ preventScroll: true }); } });
$('.section-nav').addEventListener('click', event => { const link = event.target.closest('a'); if (link) { $('.section-nav').querySelectorAll('a').forEach(a => a.classList.toggle('active', a === link)); } });
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (state.packet) { mainChart(); resizeSmallCharts(); updateActiveNav(); } }, 150); });
window.addEventListener('scroll', () => { if (!scrollFrame) scrollFrame = requestAnimationFrame(() => { updateActiveNav(); scrollFrame = null; }); }, { passive: true });
updateThemeLabel();
refresh();
