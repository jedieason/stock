import { valid, last, fmt, signed, tone, escapeHTML as e, safeURL, change, returns, seriesFor, latestQuote, periodRows, paginate, sortNumeric, breadthPercent, monthLabel, timeLabel, snapshotAgeDays, getIndicator, indicatorTone, indicatorBadge } from './model.mjs';
import { spark, chartSVG, chartKey, volumeSVG } from './charts.mjs';

const $ = selector => document.querySelector(selector);
const names = { taiex: '加權指數', tpex: '櫃買指數', '2330': '台積電', '2317': '鴻海', '2454': '聯發科', '2382': '廣達', '2308': '台達電', '3231': '緯創', SPY: 'S&P 500', QQQ: 'Nasdaq 100', SOXX: '半導體 ETF' };
const stockSymbols = ['2330', '2317', '2454', '2382', '2308', '3231'];
const colors = { taiex: '#2962ff', tpex: '#8064b4', '2330': '#ba4655', '2317': '#245d9a', '2454': '#ce932d', '2382': '#517b99', '2308': '#398b84', '3231': '#6c7597' };
const state = { packet: null, symbol: 'taiex', period: '66', candle: false, ma: true, sourceFilter: '全部', sectorSort: 'desc', sectorAll: false, refreshing: false };
let refreshTimer, resizeTimer, scrollFrame, initialAnchorHandled = false;
const chartJobs = new Map();
const data = () => state.packet?.data || {};
const indicators = () => state.packet?.indicators || {};
const ind = id => getIndicator(state.packet, id);
const date = value => e(value || '尚未取得');
const deltaHTML = value => `<span class="${tone(value)} numeric">${signed(value)}</span>`;
const external = (url, text, className = '') => `<a href="${safeURL(url)}" target="_blank" rel="noopener noreferrer" class="${className}">${e(text)} ↗</a>`;
const statusTag = status => `<span class="tag ${status === 'ok' || status === '可觀測' ? 'ok' : status === 'stale' || status === '部分' || status === '代理' ? 'warn' : ''}">${e(({ ok: '抓取成功', stale: '保留前值', error: '未取得' })[status] || status || '未知')}</span>`;

function sourceMeta(id) {
  const source = (state.packet?.sources || []).find(row => row.id === id);
  return `${date(source?.observed_at)}${source?.status && source.status !== 'ok' ? ` · ${statusTag(source.status)}` : ''}`;
}

function section(id, title, description, body, trailing = '') {
  return `<section id="${id}" class="market-section" aria-labelledby="${id}-heading"><div class="section-heading"><div><h2 id="${id}-heading">${e(title)}</h2>${description ? `<p>${e(description)}</p>` : ''}</div>${trailing}</div>${body}</section>`;
}

function stat(label, value, note = '', className = '') {
  return `<div class="stat"><span class="stat-label">${e(label)}</span><strong class="stat-value numeric ${className}">${value}</strong>${note ? `<small class="stat-date">${note}</small>` : ''}</div>`;
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
  const max = Math.max(...rows.map(row => Math.abs(row.value ?? row.return ?? 0)), 1);
  return `<div class="rank-list ${bars ? 'bars' : ''}">${rows.map((row, i) => {
    const val = row.value ?? row.return;
    return `<div class="rank-row">${numbered ? `<span class="rank-number">${i + 1}</span>` : ''}<div class="rank-name"><strong title="${e(row.name)}">${e(row.name)}</strong>${subtitle && row.date ? `<small>${date(row.date)}</small>` : ''}</div>${bars && valid(val) ? `<div class="bar-track"><i style="width:${Math.abs(val) / max * 100}%;background:var(--${val >= 0 ? 'up' : 'down'})"></i></div>` : ''}<div class="rank-value numeric ${tone(val)}">${signed(val, decimals, unit)}${valid(row.close) ? `<small>${fmt(row.close)} 點</small>` : ''}</div></div>`;
  }).join('')}</div>`;
}

function indicatorHeading(id, name, status, label) {
  return `<div class="indicator-header" id="ind-${id}"><div class="indicator-title-group"><span class="indicator-badge-num">${String(id).padStart(2, '0')}</span><h3>${e(name)}</h3></div>${indicatorBadge(status, label)}</div>`;
}

function meterBar(pct, label = '', toneCls = '') {
  const p = Math.max(0, Math.min(100, pct || 0));
  return `<div class="meter-track"><div class="meter-fill ${toneCls}" style="width:${p}%"></div></div>${label ? `<div class="meter-labels"><span>0%</span><span>${e(label)}</span><span>100%</span></div>` : ''}`;
}

// --------------------------------------------------------------------------
// 15 指標即時監控矩陣 (Overview Matrix)
// --------------------------------------------------------------------------
function renderOverviewMatrix() {
  const inds = indicators();
  const targetMap = {
    '1': 'panel-trend', '2': 'panel-trend',
    '3': 'panel-breadth', '4': 'panel-breadth', '5': 'panel-breadth',
    '6': 'panel-volume', '7': 'panel-volume',
    '8': 'panel-leverage', '9': 'panel-leverage',
    '10': 'panel-sectors', '11': 'panel-sectors',
    '12': 'panel-sentiment', '13': 'panel-sentiment',
    '14': 'panel-fundamentals', '15': 'panel-fundamentals'
  };

  const cards = Array.from({ length: 15 }, (_, i) => {
    const id = String(i + 1);
    const item = inds[id] || {};
    let valHTML = '—';
    if (id === '1') valHTML = `${fmt(item.taiex?.close)} <span class="unit">點</span>`;
    else if (id === '2') valHTML = `MA20 ${signed(item.taiex?.dev20 != null ? item.taiex.dev20 * 100 : null)}`;
    else if (id === '3') valHTML = `漲跌比 ${fmt(item.ratio)} <small class="muted">(${item.net_advances > 0 ? '+' : ''}${item.net_advances ?? '—'})</small>`;
    else if (id === '4') valHTML = `站上月線 ${fmt(item.above_ma20_pct, 1)}<span class="unit">%</span>`;
    else if (id === '5') valHTML = `淨新高 ${item.net_high52 > 0 ? '+' : ''}${item.net_high52 ?? '—'} <span class="unit">家</span>`;
    else if (id === '6') valHTML = `${fmt(item.total_volume)} <span class="unit">億</span> <small class="muted">(${fmt(item.total_ratio)}×)</small>`;
    else if (id === '7') valHTML = `${e(item.active_pattern || '常態量價')}`;
    else if (id === '8') valHTML = `${fmt(item.total_margin)} <span class="unit">億</span> <small class="${tone(item.total_margin_pct5)}">${signed(item.total_margin_pct5)}</small>`;
    else if (id === '9') valHTML = `回落 ${fmt(item.margin_drop_pct)}<span class="unit">%</span>`;
    else if (id === '10') valHTML = `領漲 ${item.leading_count ?? '—'} <span class="unit">群</span>`;
    else if (id === '11') valHTML = `健康分 ${item.health_score ?? '—'} <span class="unit">/ 100</span>`;
    else if (id === '12') valHTML = `臺指 VIX ${fmt(item.taiwan_vix)} <small class="muted">(${fmt((item.taiwan_vix_pct252 || 0) * 100, 0)}%)</small>`;
    else if (id === '13') valHTML = `外資現貨 ${signed(item.foreign_net_today)} <span class="unit">億</span>`;
    else if (id === '14') valHTML = `營收 YoY ${signed(item.revenue_yoy)}`;
    else if (id === '15') valHTML = `FWD P/E ${fmt(item.forward_pe)} <span class="unit">倍</span>`;

    return `<button class="matrix-card" data-jump="${targetMap[id]}" data-ind="${id}" aria-label="查看指標 ${id} ${e(item.name)} 詳情"><div class="matrix-top"><span class="indicator-pill">${id.padStart(2, '0')}</span><span class="matrix-title">${e(item.name || `指標 ${id}`)}</span>${indicatorBadge(item.status, item.status_label)}</div><div class="matrix-value numeric">${valHTML}</div><div class="matrix-summary">${e(item.summary || '資料計算中…')}</div></button>`;
  }).join('');

  const body = `<div class="indicator-matrix">${cards}</div><p class="section-bottom">15 項核心指標每日由 GitHub Actions 盤後與盤中排程更新 · 點選任一指標卡片直達該項詳細分析面板。</p>`;
  return section('overview', '15 大核心指標監控總覽', '全市場多空結構、資金槓桿、量價與基本面全維度量化診斷。', body, '<span class="section-tag">15 項全維度指標</span>');
}

// --------------------------------------------------------------------------
// 面板 01：市場趨勢與偏離 (指標 1 & 2)
// --------------------------------------------------------------------------
function quoteStrip() {
  return `<div class="quote-strip" role="group" aria-label="切換市場走勢">${['taiex', 'tpex', '2330', '2454'].map(symbol => {
    const q = latestQuote(data(), symbol);
    return `<button class="quote-chip ${state.symbol === symbol ? 'selected' : ''}" data-symbol="${symbol}" aria-pressed="${state.symbol === symbol}"><span class="symbol-mark" style="--mark:${colors[symbol]}">${({ taiex: 'TW', tpex: 'OTC' })[symbol] || symbol}</span><span class="quote-copy"><span class="quote-name">${e(names[symbol])}<small class="quote-date">${symbol === 'taiex' || symbol === 'tpex' ? '指數' : symbol}</small></span><span class="quote-value numeric">${fmt(q.close)}</span><span class="quote-change ${tone(q.delta)} numeric">${signed(q.delta)}</span></span></button>`;
  }).join('')}</div>`;
}

function renderPanelTrend() {
  const i1 = ind('1'), i2 = ind('2');
  const t = i1.taiex || {}, tp = i1.tpex || {};
  const t2 = i2.taiex || {}, tp2 = i2.tpex || {};

  const body = `
    <div class="indicator-block">
      ${indicatorHeading('1', '市場趨勢', i1.status, i1.status_label)}
      <div class="indicator-summary-bar"><span>加權指數與櫃買指數 OHLC、20／60／120 日均線、波段前高前低防守</span></div>
      <div id="quote-strip">${quoteStrip()}</div>
      <div id="main-chart-content"></div>
      <div class="split-row" style="margin-top:22px">
        <article>
          <h4 class="subheading">加權指數波段高低點 <small>${date(t.date)}</small></h4>
          <div class="level-list">
            <div class="level-row"><span>20日波段前高</span><strong class="numeric">${fmt(t.high20)} 點</strong><span class="${tone(t.high20_dist)} numeric">${signed(valid(t.high20_dist) ? t.high20_dist * 100 : null)}</span></div>
            <div class="level-row"><span>20日波段前低</span><strong class="numeric">${fmt(t.low20)} 點</strong><span class="${tone(t.low20_dist)} numeric">${signed(valid(t.low20_dist) ? t.low20_dist * 100 : null)}</span></div>
            <div class="level-row"><span>前低防守狀態</span><strong>${t.low20_held ? '<span class="up">守住未破底</span>' : '<span class="down">破底警戒</span>'}</strong><span class="muted">${t.low20_date || '—'}</span></div>
            <div class="level-row"><span>MA20 斜率</span><strong class="numeric">${signed(valid(t.ma20_slope) ? t.ma20_slope * 100 : null)}</strong><span class="muted">5日斜率</span></div>
          </div>
        </article>
        <article>
          <h4 class="subheading">櫃買指數波段高低點 <small>${date(tp.date)}</small></h4>
          <div class="level-list">
            <div class="level-row"><span>20日波段前高</span><strong class="numeric">${fmt(tp.high20)} 點</strong><span class="${tone(tp.high20_dist)} numeric">${signed(valid(tp.high20_dist) ? tp.high20_dist * 100 : null)}</span></div>
            <div class="level-row"><span>20日波段前低</span><strong class="numeric">${fmt(tp.low20)} 點</strong><span class="${tone(tp.low20_dist)} numeric">${signed(valid(tp.low20_dist) ? tp.low20_dist * 100 : null)}</span></div>
            <div class="level-row"><span>前低防守狀態</span><strong>${tp.low20_held ? '<span class="up">守住未破底</span>' : '<span class="down">破底警戒</span>'}</strong><span class="muted">${tp.low20_date || '—'}</span></div>
            <div class="level-row"><span>MA20 / MA60</span><strong class="numeric">${fmt(tp.ma20)} / ${fmt(tp.ma60)}</strong><span class="muted">櫃買均線</span></div>
          </div>
        </article>
      </div>
    </div>

    <div class="indicator-block">
      ${indicatorHeading('2', '趨勢偏離程度', i2.status, i2.status_label)}
      <div class="indicator-summary-bar"><span>加權與櫃買 20／60 日均線乖離率、近期最大回撤幅度</span></div>
      <div class="stats-strip">
        ${stat('加權 MA20 乖離率', signed(valid(t2.dev20) ? t2.dev20 * 100 : null), '月線偏離', tone(t2.dev20))}
        ${stat('加權 MA60 乖離率', signed(valid(t2.dev60) ? t2.dev60 * 100 : null), '季線偏離', tone(t2.dev60))}
        ${stat('加權 60日最大回撤', signed(valid(t2.dd60) ? t2.dd60 * 100 : null), '高點拉回', tone(t2.dd60))}
        ${stat('櫃買 60日最大回撤', signed(valid(tp2.dd60) ? tp2.dd60 * 100 : null), '中小型股拉回', tone(tp2.dd60))}
      </div>
      <div class="split-row">
        <article>
          <h4 class="subheading">加權均線偏離結構 <small>${date(t.date)}</small></h4>
          <div class="level-list">
            <div class="level-row"><span>MA20 月線</span><strong class="numeric">${fmt(t.ma20)}</strong><span class="${tone(t2.dev20)} numeric">${signed(valid(t2.dev20) ? t2.dev20 * 100 : null)}</span></div>
            <div class="level-row"><span>MA60 季線</span><strong class="numeric">${fmt(t.ma60)}</strong><span class="${tone(t2.dev60)} numeric">${signed(valid(t2.dev60) ? t2.dev60 * 100 : null)}</span></div>
            <div class="level-row"><span>MA120 半年線</span><strong class="numeric">${fmt(t.ma120)}</strong><span class="${tone(t2.dev120)} numeric">${signed(valid(t2.dev120) ? t2.dev120 * 100 : null)}</span></div>
            <div class="level-row"><span>ATR14 真實波幅</span><strong class="numeric">${fmt(t2.atr14)} 點</strong><span class="muted">距離季線 ${fmt(t2.dist_ma60_atr)} ATR</span></div>
          </div>
        </article>
        <article>
          <h4 class="subheading">櫃買均線偏離結構 <small>${date(tp.date)}</small></h4>
          <div class="level-list">
            <div class="level-row"><span>MA20 月線</span><strong class="numeric">${fmt(tp.ma20)}</strong><span class="${tone(tp2.dev20)} numeric">${signed(valid(tp2.dev20) ? tp2.dev20 * 100 : null)}</span></div>
            <div class="level-row"><span>MA60 季線</span><strong class="numeric">${fmt(tp.ma60)}</strong><span class="${tone(tp2.dev60)} numeric">${signed(valid(tp2.dev60) ? tp2.dev60 * 100 : null)}</span></div>
            <div class="level-row"><span>MA120 半年線</span><strong class="numeric">${fmt(tp.ma120)}</strong><span class="${tone(tp2.dev120)} numeric">${signed(valid(tp2.dev120) ? tp2.dev120 * 100 : null)}</span></div>
            <div class="level-row"><span>120日波段回撤</span><strong class="numeric">${signed(valid(t2.dd120) ? t2.dd120 * 100 : null)}</strong><span class="muted">半年波段</span></div>
          </div>
        </article>
      </div>
    </div>
  `;
  return section('panel-trend', '01 趨勢與偏離', '大盤與櫃買核心走勢、均線架構、高低點防守與偏離回撤。', body, '<span class="section-tag">指標 1 & 2</span>');
}

function mainChart() {
  const symbol = state.symbol, allRows = seriesFor(data(), symbol), rows = periodRows(allRows, state.period), q = latestQuote(data(), symbol);
  const chartWidth = Math.max(280, $('#main-chart-content')?.clientWidth || 800), chartHeight = window.innerWidth <= 640 ? 240 : window.innerWidth <= 900 ? 300 : 330;
  const unit = symbol === 'taiex' || symbol === 'tpex' ? '點' : 'TWD';
  const periods = [['22', '1M'], ['66', '3M'], ['132', '6M'], ['264', '1Y'], ['all', '全部']];
  if (!$('#main-chart-content')) return;
  $('#main-chart-content').innerHTML = `<div class="chart-summary"><div><strong class="chart-price numeric">${fmt(q.close)}<span class="unit">${unit}</span></strong><span class="chart-change ${tone(q.delta)} numeric"> ${signed(q.delta)}</span><p class="chart-caption">${e(names[symbol])} · ${date(q.date)} ${e(q.time || '盤後日線')} · ${sourceMeta(symbol)}${q.previous != null ? ' · 含來源最新報價' : ''}</p></div><div id="chart-readout" class="chart-readout">日線 · 拖曳量測區間報酬</div></div><div class="hero-chart" id="main-chart">${chartSVG(rows, { fields: state.ma ? ['close', 'ma20', 'ma60'] : ['close'], width: chartWidth, height: chartHeight, candle: state.candle, area: !state.candle && !state.ma, id: 'main', label: `${names[symbol]}歷史日線` })}<div class="chart-hover" id="chart-hover"></div></div><div class="volume-chart">${volumeSVG(rows, chartWidth)}</div><div class="chart-controls"><div class="pills" role="group" aria-label="走勢期間">${periods.map(([value, label]) => `<button data-period="${value}" class="${state.period === value ? 'active' : ''}" aria-pressed="${state.period === value}">${label}</button>`).join('')}</div>${state.ma ? chartKey(['收盤', 'MA20', 'MA60']) : ''}<div class="chart-options" role="group" aria-label="圖表設定"><button data-chart="area" aria-pressed="${!state.candle}" class="${!state.candle ? 'active' : ''}">走勢</button><button data-chart="candle" aria-pressed="${state.candle}" class="${state.candle ? 'active' : ''}">K 線</button><button data-chart="ma" aria-pressed="${state.ma}" class="${state.ma ? 'active' : ''}">均線</button></div></div><p class="section-bottom">${rows.length} 筆日線 · ${date(rows[0]?.date)} — ${date(last(rows).date)} · 上漲紅／下跌綠</p>`;
  wireChart(rows);
}

function wireChart(rows) {
  const host = $('#main-chart'), overlay = $('#chart-hover'), readout = $('#chart-readout');
  if (!host || !overlay || !readout) return;
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

// --------------------------------------------------------------------------
// 面板 02：市場廣度與動能 (指標 3, 4, 5)
// --------------------------------------------------------------------------
function renderPanelBreadth() {
  const i3 = ind('3'), i4 = ind('4'), i5 = ind('5');
  const total = (i3.up || 0) + (i3.down || 0) + (i3.flat || 0);
  const upPct = total ? (i3.up / total * 100) : 50;
  const flatPct = total ? (i3.flat / total * 100) : 0;
  const downPct = total ? (i3.down / total * 100) : 50;

  const body = `
    <div class="indicator-block">
      ${indicatorHeading('3', '漲跌家數與累積 A/D Line', i3.status, i3.status_label)}
      <div class="indicator-summary-bar"><span>全市場上漲／下跌家數比、漲停跌停家數與累積騰落指標 (Advance-Decline Line)</span></div>
      <div class="breadth-head">
        <div><strong class="up numeric">${fmt(i3.up_share, 1)}<span class="unit">%</span></strong><small>全市場上漲家數占比 · 漲跌比 ${fmt(i3.ratio)}</small></div>
        <span class="muted">${total ? fmt(total, 0) + ' 家參與交易' : '—'}</span>
      </div>
      <div class="breadth-bar" role="img" aria-label="上漲 ${i3.up} 家、平盤 ${i3.flat} 家、下跌 ${i3.down} 家">
        <i style="width:${upPct}%;background:var(--up)"></i>
        <i style="width:${flatPct}%;background:var(--muted)"></i>
        <i style="width:${downPct}%;background:var(--down)"></i>
      </div>
      <div class="breadth-labels">
        <span class="up">上漲 ${fmt(i3.up, 0)} 家 (漲停 ${fmt(i3.limit_up, 0)})</span>
        <span class="muted">平盤 ${fmt(i3.flat, 0)} 家</span>
        <span class="down">下跌 ${fmt(i3.down, 0)} 家 (跌停 ${fmt(i3.limit_down, 0)})</span>
      </div>
      <div class="stats-strip" style="margin-top:20px;border-bottom:0">
        ${stat('淨上漲家數 (Net A/D)', `${i3.net_advances > 0 ? '+' : ''}${fmt(i3.net_advances, 0)}<span class="unit">家</span>`, '當日淨推力', tone(i3.net_advances))}
        ${stat('累積 A/D Line 指標', `${fmt(i3.ad_line, 0)}<span class="unit">點</span>`, '累計騰落趨勢', 'up')}
        ${stat('漲停家數', `${fmt(i3.limit_up, 0)}<span class="unit">家</span>`, '強勢鎖死', 'up')}
        ${stat('跌停家數', `${fmt(i3.limit_down, 0)}<span class="unit">家</span>`, '恐慌拋售', 'down')}
      </div>
    </div>

    <div class="indicator-block">
      ${indicatorHeading('4', '均線廣度', i4.status, i4.status_label)}
      <div class="indicator-summary-bar"><span>上市＋上櫃全市場股票站上 20／60／120 日均線的真實比例</span></div>
      <div class="grid-3">
        <div class="mini-card">
          <span class="eyebrow">SHORT TERM BREADTH</span>
          <div class="stat-value numeric">${fmt(i4.above_ma20_pct, 1)}<span class="unit">%</span></div>
          <p class="muted">站上 20 日均線 (月線)</p>
          ${meterBar(i4.above_ma20_pct, '站上月線', tone(i4.above_ma20_pct - 50))}
        </div>
        <div class="mini-card">
          <span class="eyebrow">MEDIUM TERM BREADTH</span>
          <div class="stat-value numeric">${fmt(i4.above_ma60_pct, 1)}<span class="unit">%</span></div>
          <p class="muted">站上 60 日均線 (季線)</p>
          ${meterBar(i4.above_ma60_pct, '站上季線', tone(i4.above_ma60_pct - 50))}
        </div>
        <div class="mini-card">
          <span class="eyebrow">LONG TERM BREADTH</span>
          <div class="stat-value numeric">${fmt(i4.above_ma120_pct, 1)}<span class="unit">%</span></div>
          <p class="muted">站上 120 日均線 (半年線)</p>
          ${meterBar(i4.above_ma120_pct, '站上半年線', tone(i4.above_ma120_pct - 50))}
        </div>
      </div>
    </div>

    <div class="indicator-block">
      ${indicatorHeading('5', '新高／新低廣度', i5.status, i5.status_label)}
      <div class="indicator-summary-bar"><span>全市場創 52 週新高、新低家數及其 5 日擴張／收縮變化</span></div>
      <div class="stats-strip" style="border-bottom:0;padding-bottom:0">
        ${stat('創 52 週新高', `${fmt(i5.high52, 0)}<span class="unit">家</span>`, '領先衝刺', 'up')}
        ${stat('創 52 週新低', `${fmt(i5.low52, 0)}<span class="unit">家</span>`, '破底弱勢', 'down')}
        ${stat('淨新高家數 (Highs - Lows)', `${i5.net_high52 > 0 ? '+' : ''}${fmt(i5.net_high52, 0)}<span class="unit">家</span>`, '新高擴張差額', tone(i5.net_high52))}
        ${stat('5日淨新高變化', `${i5.net_change5 > 0 ? '+' : ''}${fmt(i5.net_change5, 0)}<span class="unit">家</span>`, '新高動能擴散', tone(i5.net_change5))}
      </div>
    </div>
  `;
  return section('panel-breadth', '02 市場廣度與動能', '市場多數股票是否跟隨指數、均線支撐力與新高新低推力。', body, '<span class="section-tag">指標 3、4、5</span>');
}

// --------------------------------------------------------------------------
// 面板 03：成交值與量價反應 (指標 6 & 7)
// --------------------------------------------------------------------------
function renderPanelVolume() {
  const i6 = ind('6'), i7 = ind('7');

  const body = `
    <div class="indicator-block">
      ${indicatorHeading('6', '市場成交值', i6.status, i6.status_label)}
      <div class="indicator-summary-bar"><span>上市、上櫃股票每日成交金額及相對 20 日均量倍數</span></div>
      <div class="stats-strip">
        ${stat('全市場總成交值', `${fmt(i6.total_volume)}<span class="unit">億元</span>`, `相對 20MA 的 ${fmt(i6.total_ratio)}×`, tone(i6.total_ratio - 1))}
        ${stat('上市成交值', `${fmt(i6.twse_volume)}<span class="unit">億元</span>`, `20MA ${fmt(i6.twse_ma20)} 億 (${fmt(i6.twse_ratio)}×)`)}
        ${stat('上櫃成交值', `${fmt(i6.tpex_volume)}<span class="unit">億元</span>`, `20MA ${fmt(i6.tpex_ma20)} 億 (${fmt(i6.tpex_ratio)}×)`)}
        ${stat('量能水位判定', `${i6.status_label}`, '20 日均值對照', tone(i6.total_ratio - 1))}
      </div>
    </div>

    <div class="indicator-block">
      ${indicatorHeading('7', '量價反應', i7.status, i7.status_label)}
      <div class="indicator-summary-bar"><span>四大量價反應情境診斷：放量突破、放量不漲、放量下跌、跌深後放量止跌</span></div>
      <div class="callout-box ${indicatorTone(i7.status)}">
        <strong>當前量價診斷：${e(i7.active_pattern)}</strong>
        <p>${e(i7.detail)}</p>
      </div>
      <div class="grid-3" style="margin-top:16px">
        <div class="mini-card">
          <span class="eyebrow">VOLUME RATIO</span>
          <div class="stat-value numeric">${fmt(i7.volume_ratio)}<span class="unit">倍 20MA</span></div>
          <p class="muted">全市場成交量能倍數</p>
        </div>
        <div class="mini-card">
          <span class="eyebrow">DAILY RETURN</span>
          <div class="stat-value numeric ${tone(i7.return_1d)}">${signed(valid(i7.return_1d) ? i7.return_1d * 100 : null)}</div>
          <p class="muted">加權單日價格變動</p>
        </div>
        <div class="mini-card">
          <span class="eyebrow">BAR LOCATION</span>
          <div class="stat-value numeric">${fmt(valid(i7.close_location) ? i7.close_location * 100 : null, 1)}<span class="unit">%</span></div>
          <p class="muted">當日收盤於全日高低區間位置</p>
        </div>
      </div>
    </div>
  `;
  return section('panel-volume', '03 成交值與量價反應', '成交金額變化、量能均線倍數與突破／出貨／止跌行為診斷。', body, '<span class="section-tag">指標 6 & 7</span>');
}

// --------------------------------------------------------------------------
// 面板 04：融資與槓桿清洗 (指標 8 & 9)
// --------------------------------------------------------------------------
function renderPanelLeverage() {
  const i8 = ind('8'), i9 = ind('9');
  const d = data(), mHist = (d.margin || []).slice(-132);

  const body = `
    <div class="indicator-block">
      ${indicatorHeading('8', '融資餘額', i8.status, i8.status_label)}
      <div class="indicator-summary-bar"><span>上市、上櫃融資餘額及 5／20 日增減額、增減率、融券餘額與現金償還</span></div>
      <div class="stats-strip">
        ${stat('上市＋上櫃融資總額', `${fmt(i8.total_margin)}<span class="unit">億元</span>`, `5日 ${signed(i8.total_margin_pct5)}`, tone(-i8.total_margin_pct5))}
        ${stat('上市融資餘額', `${fmt(i8.twse_margin)}<span class="unit">億元</span>`, `5日 ${signed(i8.twse_margin_chg5)} 億 (${signed(i8.twse_margin_pct5)})`)}
        ${stat('上櫃融資餘額', `${fmt(i8.tpex_margin)}<span class="unit">億元</span>`, `5日 ${signed(i8.tpex_margin_chg5)} 億 (${signed(i8.tpex_margin_pct5)})`)}
        ${stat('融資現金償還', `${fmt(i8.cash_repayment)}<span class="unit">億元</span>`, `融券餘額 ${fmt(i8.short_balance, 0)} 張`)}
      </div>
      <div class="chart-block">
        <h4>融資歷史走勢 <span class="unit">億元</span></h4>
        ${smallChart(mHist, ['value'], ['融資餘額'], 'margin-chart', `上市融資 20 日變化 ${signed(i8.twse_margin_pct20)} · 浮額流向觀測`)}
      </div>
    </div>

    <div class="indicator-block">
      ${indicatorHeading('9', '槓桿清洗程度', i9.status, i9.status_label)}
      <div class="indicator-summary-bar"><span>融資從近期波段高點回落幅度、融資變化與股價變化的關係 (去槓桿差額)</span></div>
      <div class="split-row">
        <article>
          <h4 class="subheading">融資回落 vs 指數拉回</h4>
          <div class="level-list">
            <div class="level-row"><span>融資波段高點</span><strong class="numeric">${fmt(i9.margin_peak)} 億元</strong><span class="muted">近60日</span></div>
            <div class="level-row"><span>融資自高點回落</span><strong class="numeric ${tone(-i9.margin_drop_pct)}">${fmt(i9.margin_drop_pct)}%</strong><span class="muted">去槓桿幅度</span></div>
            <div class="level-row"><span>大盤距高點回落</span><strong class="numeric ${tone(i9.index_drop_pct)}">${fmt(i9.index_drop_pct)}%</strong><span class="muted">指數拉回</span></div>
            <div class="level-row"><span>去槓桿差額</span><strong class="numeric">${signed(i9.deleveraging_diff)}%</strong><span class="muted">融資減幅−指數跌幅</span></div>
          </div>
        </article>
        <article>
          <h4 class="subheading">槓桿健康度診斷</h4>
          <div class="callout-box ${indicatorTone(i9.status)}" style="margin-top:0">
            <strong>清洗品質：${e(i9.washout_quality)}</strong>
            <p>20 日融資增減率與指數漲跌率差值為 <b>${signed(i9.leverage_spread20)}%</b>。<br>當融資減幅大於指數跌幅時，代表散戶浮額加速離場，籌碼向法人大戶沉澱，為底部成型之關鍵訊號。</p>
          </div>
        </article>
      </div>
    </div>
  `;
  return section('panel-leverage', '04 融資與槓桿清洗', '市場槓桿籌碼規模、融資去化速度與高點回落之浮額清洗品質。', body, '<span class="section-tag">指標 8 & 9</span>');
}

// --------------------------------------------------------------------------
// 面板 05：產業族群與強勢股 (指標 10 & 11)
// --------------------------------------------------------------------------
function renderPanelSectors() {
  const i10 = ind('10'), i11 = ind('11');
  const topSectors = (i10.top_sectors || []).slice(0, 5);
  const lagSectors = (i10.lagging_sectors || []).slice(0, 5);
  const leaders = i11.leaders || [];

  const body = `
    <div class="indicator-block">
      ${indicatorHeading('10', '領漲族群', i10.status, i10.status_label)}
      <div class="indicator-summary-bar"><span>各產業相對大盤強度 (Alpha vs TAIEX)、漲幅貢獻與領漲族群數量</span></div>
      <div class="split-row">
        <article>
          <h4 class="subheading">相對強勢領先類股 <small>Alpha 超額強度</small></h4>
          ${rankRows(topSectors.map(s => ({ name: s.name, value: s.alpha, close: s.close })), { unit: '%', numbered: true, bars: true })}
        </article>
        <article>
          <h4 class="subheading">相對落後弱勢類股 <small>Alpha 超額強度</small></h4>
          ${rankRows(lagSectors.map(s => ({ name: s.name, value: s.alpha, close: s.close })), { unit: '%', numbered: true, bars: true })}
        </article>
      </div>
      <p class="small-caption" style="margin-top:14px">全市場目前有 <b>${i10.leading_count}</b> 個產業超越大盤且維持多頭，族群輪動廣泛度：<b>${e(i10.status_label)}</b>。</p>
    </div>

    <div class="indicator-block">
      ${indicatorHeading('11', '強勢股健康程度', i11.status, i11.status_label)}
      <div class="indicator-summary-bar"><span>原先領漲股的相對強弱、跌破關鍵均線 (MA20/MA60) 或補跌的比例</span></div>
      <div class="stats-strip">
        ${stat('強勢股健康綜合分數', `${i11.health_score ?? '—'}<span class="unit">/ 100</span>`, '姿態評級', tone(i11.health_score - 50))}
        ${stat('跌破 20MA (月線) 比例', `${fmt(i11.below_ma20_pct, 0)}<span class="unit">%</span>`, '短線轉弱', tone(-i11.below_ma20_pct))}
        ${stat('跌破 60MA (季線) 比例', `${fmt(i11.below_ma60_pct, 0)}<span class="unit">%</span>`, '中期轉弱', tone(-i11.below_ma60_pct))}
        ${stat('補跌重挫比例', `${fmt(i11.catchup_breakdown_pct, 0)}<span class="unit">%</span>`, '高檔破線出貨', tone(-i11.catchup_breakdown_pct))}
      </div>
      <div class="mini-grid stock-grid" style="margin-top:16px">
        ${leaders.map(stk => `
          <div class="mini-card">
            <div class="mini-card-top"><span class="symbol-mark" style="--mark:${colors[stk.symbol] || 'var(--blue)'}">${stk.symbol}</span><div><h3>${names[stk.symbol] || stk.symbol}</h3><small>${stk.symbol}</small></div></div>
            <div class="mini-card-price numeric">${fmt(stk.close)}<span class="unit">TWD</span></div>
            <div class="mini-card-change ${tone(stk.return_1d)} numeric">${signed(stk.return_1d)}</div>
            <div class="mini-card-bottom"><span>MA20 ${signed(valid(stk.dev20) ? stk.dev20 * 100 : null)}</span>${stk.below_ma20 ? '<span class="tag warn">破月線</span>' : '<span class="tag ok">守月線</span>'}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  return section('panel-sectors', '05 產業族群與強勢股', '產業輪動、相對大盤超額回報與領頭羊個股破線補跌風險。', body, '<span class="section-tag">指標 10 & 11</span>');
}

// --------------------------------------------------------------------------
// 面板 06：恐慌與法人籌碼 (指標 12 & 13)
// --------------------------------------------------------------------------
function renderPanelSentiment() {
  const i12 = ind('12'), i13 = ind('13');
  const d = data(), fut = (d.futures || []).filter(row => row.contract === '臺股期貨');

  const body = `
    <div class="indicator-block">
      ${indicatorHeading('12', '恐慌程度', i12.status, i12.status_label)}
      <div class="indicator-summary-bar"><span>臺指選擇權波動率指數（臺指 VIX）及歷史百分位、跨市場波動率對照</span></div>
      <div class="stats-strip">
        ${stat('臺指選擇權 VIX', fmt(i12.taiwan_vix), `5日變化 ${signed(valid(i12.taiwan_vix_chg5) ? i12.taiwan_vix_chg5 * 100 : null)}`, tone(i12.taiwan_vix - 25))}
        ${stat('臺指 VIX 252日分位', `${fmt(valid(i12.taiwan_vix_pct252) ? i12.taiwan_vix_pct252 * 100 : null, 1)}<span class="unit">%</span>`, '歷史情緒位階', tone(i12.taiwan_vix_pct252 - 0.5))}
        ${stat('美股 Cboe VIX', fmt(i12.cboe_vix), `分位 ${fmt(valid(i12.cboe_vix_pct252) ? i12.cboe_vix_pct252 * 100 : null, 1)}%`)}
        ${stat('VVIX (波動之波動)', fmt(i12.vvix), `VIX/VIX3M ${fmt(i12.vix_ratio)}`)}
      </div>
      <div class="split-row">
        <article>
          <h4 class="subheading">臺指 VIX vs 美股 Cboe VIX 走勢對照</h4>
          ${smallChart(d.vix_trend || [], ['taiwan_vix', 'cboe_vix'], ['臺指 VIX', '美股 VIX'], 'sentiment-vix', `最新臺指 VIX ${fmt(i12.taiwan_vix)} · 美股 Cboe VIX ${fmt(i12.cboe_vix)} · 臺美雙市場恐慌情緒走勢對照`)}
        </article>
        <article>
          <div class="callout-box ${indicatorTone(i12.status)}" style="margin-top:0">
            <strong>恐慌診斷：${e(i12.status_label)}</strong>
            <p>目前臺指 VIX 報 <b>${fmt(i12.taiwan_vix)}</b> 點，處於歷史百分位 <b>${fmt(valid(i12.taiwan_vix_pct252) ? i12.taiwan_vix_pct252 * 100 : null, 1)}%</b>。<br>美股 Cboe VIX 報 <b>${fmt(i12.cboe_vix)}</b> 點（歷史分位 <b>${fmt(valid(i12.cboe_vix_pct252) ? i12.cboe_vix_pct252 * 100 : null, 1)}%</b>），跨市場期限比值 VIX/VIX3M 為 <b>${fmt(i12.vix_ratio)}</b>。<br>當 VIX 衝破 30 且百分位超越 80% 時，市場充斥避險與恐慌拋售，短線往往逼近情緒賣壓高潮。</p>
          </div>
        </article>
      </div>
    </div>

    <div class="indicator-block">
      ${indicatorHeading('13', '法人與資金動向', i13.status, i13.status_label)}
      <div class="indicator-summary-bar"><span>外資現貨買賣超、臺股期貨外資淨未平倉部位與 Put/Call Ratio</span></div>
      <div class="stats-strip">
        ${stat('外資現貨單日買賣超', `${signed(i13.foreign_net_today)}<span class="unit">億元</span>`, `上市 ${signed(i13.foreign_twse)} 億 / 櫃買 ${signed(i13.foreign_tpex)} 億`, tone(i13.foreign_net_today))}
        ${stat('臺指期外資淨未平倉', `${fmt(i13.futures_foreign_oi, 0)}<span class="unit">口</span>`, '避險留倉淨部位', tone(i13.futures_foreign_oi))}
        ${stat('投信現貨買賣超', `${signed(i13.trust_net_today)}<span class="unit">億元</span>`, '內資法人', tone(i13.trust_net_today))}
        ${stat('Put / Call 未平倉比', `${fmt(i13.putcall_oi_ratio)}<span class="unit">%</span>`, '期交所 PCR OI', tone(i13.putcall_oi_ratio - 100))}
      </div>
      <div class="split-row">
        <article>
          <h4 class="subheading">期貨法人未平倉口數</h4>
          ${rankRows(fut.map(r => ({ name: r.name, value: r.value })), { unit: ' 口', bars: true, decimals: 0 })}
        </article>
        <article>
          <h4 class="subheading">選擇權 Put / Call Ratio 趨勢</h4>
          ${smallChart(d.putcall || [], ['volume', 'oi'], ['成交量比', '未平倉比'], 'sentiment-putcall', `最新 OI 比率 ${fmt(i13.putcall_oi_ratio)}% · 100% 為多空平衡線`)}
        </article>
      </div>
    </div>
  `;
  return section('panel-sentiment', '06 恐慌與法人動向', '選擇權恐慌波動率指數、外資現貨與台指期多空淨留倉。', body, '<span class="section-tag">指標 12 & 13</span>');
}

// --------------------------------------------------------------------------
// 面板 07：基本面與估值預期 (指標 14 & 15)
// --------------------------------------------------------------------------
function renderPanelFundamentals() {
  const i14 = ind('14'), i15 = ind('15');

  const body = `
    <div class="indicator-block">
      ${indicatorHeading('14', '基本面變化', i14.status, i14.status_label)}
      <div class="indicator-summary-bar"><span>上市櫃月營收趨勢、主要產業 EPS 預期及修正方向</span></div>
      <div class="stats-strip">
        ${stat('上市櫃全市場營收中位 YoY', signed(i14.revenue_yoy), '營收年增率動能', tone(i14.revenue_yoy))}
        ${stat('營收中位 MoM', signed(i14.revenue_mom), '營收月增率', tone(i14.revenue_mom))}
        ${stat('營收高成長家數', `${fmt(i14.high_revenue_count, 0)}<span class="unit">家</span>`, 'YoY 成長 > 30%')}
        ${stat('主要產業 EPS 趨勢', `${e(i14.eps_direction_label)}`, '產業獲利修正動能', tone(i14.revenue_yoy))}
      </div>
      <div class="callout-box ${indicatorTone(i14.status)}">
        <strong>基本面動能：${e(i14.status_label)}</strong>
        <p>全市場營收 YoY 中位數成長 <b>${signed(i14.revenue_yoy)}</b>，MoM 成長 <b>${signed(i14.revenue_mom)}</b>，共有 <b>${i14.high_revenue_count}</b> 家上市櫃企業呈現逾 30% 之高速成長。半導體與 AI 伺服器供應鏈維持強勁需求，推動核心產業 EPS 正向調升。</p>
      </div>
    </div>

    <div class="indicator-block">
      ${indicatorHeading('15', '估值與預期', i15.status, i15.status_label)}
      <div class="indicator-summary-bar"><span>全市場 Forward P/E、歷史估值百分位、預期獲利成長率與 PEG 吸引力</span></div>
      <div class="stats-strip">
        ${stat('歷史本益比 (Trailing P/E)', `${fmt(i15.trailing_pe, 1)}<span class="unit">倍</span>`, '全市場中位數')}
        ${stat('預估本益比 (Forward P/E)', `${fmt(i15.forward_pe, 1)}<span class="unit">倍</span>`, '獲利年化推估', 'up')}
        ${stat('歷史估值百分位', `${fmt(valid(i15.pe_percentile) ? i15.pe_percentile * 100 : null, 0)}<span class="unit">%</span>`, '近3年估值分位', tone(0.75 - i15.pe_percentile))}
        ${stat('預期獲利成長率', `${fmt(i15.expected_growth, 1)}<span class="unit">%</span>`, `PEG ${fmt(i15.peg_ratio, 2)}`)}
      </div>
      <div class="split-row">
        <article>
          <h4 class="subheading">全市場評價水平</h4>
          <div class="level-list">
            <div class="level-row"><span>股價淨值比 (P/B)</span><strong class="numeric">${fmt(i15.market_pb)} 倍</strong><span class="muted">資產重置價值</span></div>
            <div class="level-row"><span>現金殖利率</span><strong class="numeric">${fmt(i15.dividend_yield)}%</strong><span class="muted">全市場中位</span></div>
            <div class="level-row"><span>PEG 評價比率</span><strong class="numeric">${fmt(i15.peg_ratio)}</strong><span class="muted">低於 1.0 具成長吸引力</span></div>
          </div>
        </article>
        <article>
          <h4 class="subheading">估值位階診斷</h4>
          <div class="callout-box ${indicatorTone(i15.status)}" style="margin-top:0">
            <strong>評價位階：${e(i15.status_label)}</strong>
            <p>目前預估本益比 (Forward P/E) 約為 <b>${fmt(i15.forward_pe, 1)} 倍</b>，處於歷史三年估值 <b>${fmt(valid(i15.pe_percentile) ? i15.pe_percentile * 100 : null, 0)}%</b> 分位。搭配 <b>${fmt(i15.expected_growth, 1)}%</b> 之預期獲利成長，PEG 評價落在合理健康區間。</p>
          </div>
        </article>
      </div>
    </div>
  `;
  return section('panel-fundamentals', '07 基本面與估值預期', '營收成長率、主要產業獲利 EPS 修正方向與 Forward P/E 估值位階。', body, '<span class="section-tag">指標 14 & 15</span>');
}

// --------------------------------------------------------------------------
// 資料來源與排程
// --------------------------------------------------------------------------
function renderSources() {
  return section('sources', '資料來源與更新', '抓取成功不代表即時；每項資料皆保留原始觀測時間。', `<div class="table-toolbar"><div id="source-summary" class="source-summary"></div><select id="source-filter" aria-label="來源連線狀態">${['全部', '抓取成功', '更新異常'].map(value => `<option ${state.sourceFilter === value ? 'selected' : ''}>${value}</option>`).join('')}</select></div><div id="source-results"></div><div class="schedule-grid"><div><b>台股盤中 · 每 10 分鐘</b><p>交易日 09:00–13:30 排程取得指數報價。網頁每分鐘檢查快照，資料發布與部署可能延遲。</p></div><div><b>台股盤後 · 15:30</b><p>價格、廣度、法人、融資、營收與公告依各來源發布節奏更新。</p></div><div><b>海外收盤 · 06:00</b><p>美股、VIX 與美債排程更新。週末、休市或抓取失敗時顯示最後可用資料。</p></div></div>`);
}

function sourcesContent() {
  const sources = state.packet?.sources || [], ok = sources.filter(row => row.status === 'ok').length;
  const rows = sources.filter(row => state.sourceFilter === '全部' || (state.sourceFilter === '抓取成功' ? row.status === 'ok' : row.status !== 'ok'));
  if ($('#source-summary')) $('#source-summary').innerHTML = `<span><span class="status-dot"></span>${ok} 抓取成功</span><span>${sources.length - ok} 更新異常</span><span>共 ${sources.length} 個來源</span>`;
  const localTime = value => {
    const parsed = new Date(value);
    return value && Number.isFinite(parsed.getTime()) ? parsed.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }) : '尚未成功';
  };
  if ($('#source-results')) $('#source-results').innerHTML = `<div class="table-scroll"><table class="source-table"><thead><tr><th>資料來源</th><th>狀態</th><th>最後觀測日</th><th>成功抓取時間（台北）</th><th>發布頻率／排程</th><th>更新詳情</th></tr></thead><tbody>${rows.map(row => `<tr><td>${external(row.url, row.title)}</td><td>${statusTag(row.status)}</td><td class="numeric">${date(row.observed_at)}</td><td class="numeric muted">${e(localTime(row.retrieved_at))}</td><td class="muted">${e(row.frequency || '未提供')}<br><small>${e(row.interval || '依來源排程')}</small></td><td class="source-error">${e(row.error || '—')}</td></tr>`).join('')}</tbody></table></div>${!rows.length ? '<p class="empty">此篩選條件沒有資料來源。</p>' : ''}`;
}

// --------------------------------------------------------------------------
// 主渲染函數
// --------------------------------------------------------------------------
function render() {
  chartJobs.clear();
  $('#content').innerHTML = [
    renderOverviewMatrix(),
    renderPanelTrend(),
    renderPanelBreadth(),
    renderPanelVolume(),
    renderPanelLeverage(),
    renderPanelSectors(),
    renderPanelSentiment(),
    renderPanelFundamentals(),
    renderSources()
  ].join('');
  $('#content').setAttribute('aria-busy', 'false');
  mainChart();
  sourcesContent();
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
  if (!nav || !sections.length) return;
  const section = sections.reverse().find(section => section.getBoundingClientRect().top <= nav.offsetHeight + 40);
  const id = section?.id || 'overview';
  nav.querySelectorAll('a').forEach(link => {
    const active = link.hash === '#' + id;
    link.classList.toggle('active', active);
    if (active) {
      link.setAttribute('aria-current', 'location');
      if (nav.scrollWidth > nav.clientWidth && (link.offsetLeft < nav.scrollLeft + 12 || link.offsetLeft + link.offsetWidth > nav.scrollLeft + nav.clientWidth - 12)) {
        nav.scrollTo({ left: link.offsetLeft - nav.clientWidth / 2 + link.offsetWidth / 2, behavior: 'smooth' });
      }
    } else link.removeAttribute('aria-current');
  });
}

function freshness() {
  const packet = state.packet, sources = packet.sources || [], priceDate = latestQuote(data(), 'taiex').date || packet.features?.date;
  const age = snapshotAgeDays(priceDate), snapshotTime = new Date(packet.asof);
  if ($('#snapshot-status')) {
    $('#snapshot-status').innerHTML = `<span class="status-dot ${age != null && age > 3 ? 'old' : ''}"></span>最新行情 ${date(priceDate)}<span aria-hidden="true">　·　</span>快照 ${Number.isFinite(snapshotTime.getTime()) ? e(snapshotTime.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })) : '時間未知'}（台北）`;
  }
  const notices = [];
  if (age != null && age > 3) notices.push(`最新行情距今 ${age} 個日曆日，以下為最後可用資料。`);
  const errors = sources.filter(row => row.status !== 'ok');
  if (errors.length) notices.push(`${errors.length} 個來源更新異常，請核對各項觀測日期。`);
  if ($('#notice')) {
    $('#notice').hidden = !notices.length;
    $('#notice').innerHTML = notices.map(e).join(' ') + (notices.length ? ' <a href="#sources">查看資料來源 ›</a>' : '');
  }
}

async function refresh(manual = false) {
  if (state.refreshing) return;
  state.refreshing = true;
  if ($('#refresh')) { $('#refresh').disabled = true; $('#refresh').textContent = '更新中…'; }
  try {
    const response = await fetch(`data/market.json?t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`資料回應 ${response.status}`);
    const packet = await response.json();
    if (!packet || !packet.data || !Array.isArray(packet.sources)) throw new Error('市場快照格式不完整');
    const changed = !state.packet || JSON.stringify(packet) !== JSON.stringify(state.packet);
    state.packet = packet;
    if (changed) render();
    freshness();
    if (manual && !changed && $('#snapshot-status')) $('#snapshot-status').insertAdjacentHTML('beforeend', ' · 已檢查最新快照');
  } catch (error) {
    if ($('#notice')) {
      $('#notice').hidden = false;
      $('#notice').textContent = `${error.name === 'TimeoutError' ? '讀取資料逾時' : '無法讀取市場快照'}。${state.packet ? '畫面保留上次成功載入資料，請核對觀測日期。' : '請重新整理再試一次。'}`;
    }
    if (!state.packet && $('#content')) {
      $('#content').innerHTML = '<div class="loading-state">市場資料暫時無法載入，請使用上方「重新整理」重試。</div>';
      $('#content').setAttribute('aria-busy', 'false');
      if ($('#snapshot-status')) $('#snapshot-status').textContent = '市場資料未載入';
    }
  } finally {
    state.refreshing = false;
    if ($('#refresh')) { $('#refresh').disabled = false; $('#refresh').innerHTML = '重新整理 <span aria-hidden="true">↻</span>'; }
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refresh(), Math.max(60, Number(state.packet?.refresh_seconds) || 60) * 1000);
  }
}

// --------------------------------------------------------------------------
// 事件監聽器
// --------------------------------------------------------------------------
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || !state.packet) return;

  // Jump from indicator matrix directly to panel or specific indicator
  if (button.dataset.jump) {
    const panel = document.getElementById(button.dataset.jump);
    const indEl = button.dataset.ind ? document.getElementById(`ind-${button.dataset.ind}`) : null;
    const target = indEl || panel;
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  if (button.dataset.symbol) {
    state.symbol = button.dataset.symbol;
    const strip = $('#quote-strip');
    if (strip) strip.innerHTML = quoteStrip();
    mainChart();
  }
  if (button.dataset.period) {
    state.period = button.dataset.period;
    mainChart();
  }
  if (button.dataset.chart) {
    if (button.dataset.chart === 'ma') state.ma = !state.ma;
    else state.candle = button.dataset.chart === 'candle';
    mainChart();
  }
});

document.addEventListener('change', event => {
  const input = event.target;
  if (input.id === 'source-filter') {
    state.sourceFilter = input.value;
    sourcesContent();
  }
});

$('#refresh')?.addEventListener('click', () => refresh(true));

function updateThemeLabel() {
  const label = document.documentElement.dataset.theme === 'dark' ? '切換淺色模式' : '切換深色模式';
  const toggle = $('#theme-toggle');
  if (toggle) { toggle.setAttribute('aria-label', label); toggle.title = label; }
}

$('#theme-toggle')?.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('tw-markets-theme', theme); } catch {}
  updateThemeLabel();
});

$('#close-dialog')?.addEventListener('click', () => $('#detail-dialog')?.close());
$('.section-nav')?.addEventListener('click', event => {
  const link = event.target.closest('a');
  if (link) {
    $('.section-nav').querySelectorAll('a').forEach(a => a.classList.toggle('active', a === link));
  }
});

document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (state.packet) {
      mainChart();
      resizeSmallCharts();
      updateActiveNav();
    }
  }, 150);
});
window.addEventListener('scroll', () => {
  if (!scrollFrame) scrollFrame = requestAnimationFrame(() => {
    updateActiveNav();
    scrollFrame = null;
  });
}, { passive: true });

updateThemeLabel();
refresh();
