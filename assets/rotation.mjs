import { escapeHTML as e, fmt, signed, safeURL, valid } from './model.mjs';
import { chartSVG, chartKey } from './charts.mjs';

const labels = { leading: '強勢延續', improving: '加速轉強', resilient: '抗跌蓄勢', early: '新訊號・待持續', watch: '尚待確認', insufficient: '覆蓋不足' };
const opportunityLabels = { trend: '趨勢候選', defensive: '防禦輪動特徵', rebound: '反彈修復', early: '初現動能', unconfirmed: '結構待確認' };
const opportunityPriority = { trend: 0, early: 1, defensive: 2, rebound: 3, unconfirmed: 4 };
const quadrants = { leading: '領先', improving: '轉強', cooling: '降溫', lagging: '落後' };
const priority = { resilient: 0, improving: 1, early: 2, leading: 3, watch: 4, insufficient: 5 };
const pp = value => signed(value, 2, ' pp');
const external = (url, label) => `<a href="${safeURL(url)}" target="_blank" rel="noopener noreferrer">${e(label)} ↗</a>`;

export function currentMarket(market, now = Date.now()) {
  if (!market) return false;
  const age = (now - Date.parse(`${market.observed_at}T00:00:00+08:00`)) / 86400000;
  return market.status === 'ok' && Number.isFinite(age) && Math.floor(age) >= 0 && Math.floor(age) <= 7;
}

export function rotationOverview(rotation, now = Date.now()) {
  const market = id => rotation?.markets?.[id];
  const count = id => currentMarket(market(id), now) ? (market(id).groups || []).filter(g => g.status === 'ok' && g.opportunity === 'trend').length : null;
  const tw = count('tw'), us = count('us');
  return { leading_count: tw, us_leading_count: us, status: tw === null && us === null ? 'unavailable' : 'observing', status_label: tw === null && us === null ? '歷史資料' : '價格結構', summary: `趨勢候選：台 ${tw ?? '—'} 群／美 ${us ?? '—'} 群 · 另列防禦輪動與反彈修復` };
}

export function rankedGroups(market) {
  return [...(market?.groups || [])].sort((a, b) => (opportunityPriority[a.opportunity] ?? 4) - (opportunityPriority[b.opportunity] ?? 4) || (priority[a.signal] ?? 4) - (priority[b.signal] ?? 4) || (b.rs20 ?? -Infinity) - (a.rs20 ?? -Infinity));
}

export function diverseGroups(groups, limit = 12) {
  const chosen = [], families = new Map();
  for (const group of groups) {
    const cohort = new Set((group.members || []).map(m => m.symbol));
    if (chosen.some(g => {
      const other = new Set((g.members || []).map(m => m.symbol));
      const overlap = [...cohort].filter(s => other.has(s)).length;
      return overlap / (cohort.size + other.size - overlap || 1) > .65;
    }) || (families.get(group.family) || 0) >= 2) continue;
    chosen.push(group); families.set(group.family, (families.get(group.family) || 0) + 1);
    if (chosen.length >= limit) break;
  }
  return chosen;
}

export function plottedGroups(market, selected, focus = 'all') {
  const groups = rankedGroups(market).filter(g => g.status === 'ok');
  const strong = diverseGroups(groups.filter(g => g.opportunity !== 'unconfirmed'), 8);
  const weak = diverseGroups([...groups].sort((a, b) => a.rs20 - b.rs20), 3);
  const improving = diverseGroups([...groups].sort((a, b) => b.acceleration - a.acceleration), 3);
  const focused = focus === 'all' ? [] : groups.filter(g => matchesFocus(g, focus));
  const plotted = diverseGroups([...focused, ...strong, ...improving, ...weak, ...groups], 12);
  const active = groups.find(g => g.id === selected);
  if (active && !plotted.some(g => g.id === selected)) plotted.push(active);
  return plotted;
}

function matchesFocus(g, focus) {
  if (focus === 'all') return true;
  if (focus === 'resilient') return g.opportunity === 'defensive';
  if (focus === 'improving') return g.opportunity === 'early';
  return g.opportunity === focus;
}

function shortLabel(value) {
  let width = 0, text = '';
  for (const c of value) {
    width += /[\x00-\x7F]/.test(c) ? 6 : 11;
    if (width > 99) return text + '…';
    text += c;
  }
  return text;
}

export function rotationSelection(rotation, state = {}) {
  const id = state.rotationMarket === 'us' ? 'us' : 'tw';
  const market = rotation?.markets?.[id];
  const group = market?.groups?.find(g => g.id === state.rotationTheme) || rankedGroups(market).find(g => g.status === 'ok') || market?.groups?.[0];
  return { id, market, group };
}

export function rotationDomains(rotation, selection = {}, focus = 'all') {
  const points = Object.entries(rotation?.markets || {}).flatMap(([id, m]) => plottedGroups(m, selection.id === id ? selection.group?.id : null, focus).flatMap(g => g.trail || []));
  return { x: Math.max(5, Math.ceil(Math.max(0, ...points.map(p => Math.abs(p.x))) * 1.18)), y: Math.max(2, Math.ceil(Math.max(0, ...points.map(p => Math.abs(p.y))) * 1.25)) };
}

export function rotationSVG(market, { marketId = 'tw', selected, focus = 'all', domains, width = 560 } = {}) {
  width = Math.max(270, width);
  const height = 330, left = 42, right = width - 20, top = 28, bottom = height - 50;
  const groups = plottedGroups(market, selected, focus).filter(g => valid(g.rs20) && valid(g.acceleration));
  if (!groups.length) return '<p class="empty">尚無足夠的共同交易日資料</p>';
  const range = domains || rotationDomains({ markets: { market } });
  const x = v => left + (v + range.x) / (2 * range.x) * (right - left);
  const y = v => bottom - (v + range.y) / (2 * range.y) * (bottom - top);
  const zeroX = x(0), zeroY = y(0);
  const grid = [-1, -.5, 0, .5, 1].map(f => `<line x1="${x(f * range.x)}" y1="${top}" x2="${x(f * range.x)}" y2="${bottom}" class="rotation-grid"/><line x1="${left}" y1="${y(f * range.y)}" x2="${right}" y2="${y(f * range.y)}" class="rotation-grid"/><text class="rotation-tick" x="${x(f * range.x)}" y="${bottom + 18}" text-anchor="middle">${(f * range.x).toFixed(0)}</text><text class="rotation-tick" x="${left - 8}" y="${y(f * range.y) + 4}" text-anchor="end">${(f * range.y).toFixed(1)}</text>`).join('');
  const placed = [];
  const intersects = (a, b) => a.x < b.x + b.w + 5 && a.x + a.w + 5 > b.x && a.y < b.y + b.h + 3 && a.y + a.h + 3 > b.y;
  const points = [...groups].sort((a, b) => Number(b.id === selected) - Number(a.id === selected)).map(g => {
    const cx = x(g.rs20), cy = y(g.acceleration), active = g.id === selected;
    const matches = matchesFocus(g, focus);
    const label = shortLabel(g.name);
    const textWidth = Math.min(108, [...label].reduce((n, c) => n + (/[\x00-\x7F]/.test(c) ? 6 : 11), 0)) + 8;
    let box;
    for (const dy of [-21, 9, -39, 27, -57, 45, -75, 63]) {
      for (const dx of [10, -textWidth - 10, -textWidth / 2]) {
        const candidate = { x: Math.min(right - textWidth, Math.max(left + 2, cx + dx)), y: Math.min(bottom - 16, Math.max(top + 18, cy + dy)), w: textWidth, h: 16 };
        if (!placed.some(p => intersects(candidate, p))) { box = candidate; break; }
      }
      if (box) break;
    }
    box ||= { x: Math.min(right - textWidth, Math.max(left + 2, cx + 10)), y: Math.min(bottom - 16, Math.max(top + 18, cy - 21)), w: textWidth, h: 16 };
    placed.push(box);
    const trail = active || matches ? (g.trail || []).map(p => `${x(p.x)},${y(p.y)}`).join(' ') : '';
    const title = `${g.name} · 20日超額 ${pp(g.rs20)} · 加速度 ${pp(g.acceleration)} · 跑贏家數 ${fmt(g.breadth20, 0)}%`;
    return `<g class="rotation-point quadrant-${e(g.quadrant)} ${active ? 'selected' : ''} ${matches ? '' : 'dimmed'}" role="button" tabindex="0" data-rotation-market="${marketId}" data-rotation-theme="${e(g.id)}" aria-label="${e(title)}" aria-pressed="${active}"><title>${e(title)}</title>${trail ? `<polyline points="${trail}" class="rotation-trail"/>` : ''}${g.resilient ? `<circle cx="${cx}" cy="${cy}" r="10" class="rotation-ring"/>` : ''}<circle cx="${cx}" cy="${cy}" r="${active ? 6 : 4.5}" class="rotation-dot"/><line x1="${cx}" y1="${cy}" x2="${box.x + box.w / 2}" y2="${box.y + 8}" class="rotation-leader"/><rect x="${box.x}" y="${box.y}" width="${box.w}" height="16" rx="3" class="rotation-label-bg"/><text x="${box.x + 4}" y="${box.y + 12}" class="rotation-label">${e(label)}</text></g>`;
  }).reverse().join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="group" aria-label="${e(market.name)}題材輪動圖，橫軸20日超額報酬，縱軸5日超額報酬加速度"><title>${e(market.name)} · ${e(market.observed_at)} · 台美共用刻度</title><rect x="${left}" y="${top}" width="${right - left}" height="${bottom - top}" class="rotation-plot-bg"/>${grid}<line x1="${left}" y1="${zeroY}" x2="${right}" y2="${zeroY}" class="rotation-zero"/><line x1="${zeroX}" y1="${top}" x2="${zeroX}" y2="${bottom}" class="rotation-zero"/><text x="${left + 8}" y="${top + 13}" class="rotation-quadrant quadrant-improving">轉強 ↗</text><text x="${right - 8}" y="${top + 13}" text-anchor="end" class="rotation-quadrant quadrant-leading">領先 ↗</text><text x="${left + 8}" y="${bottom - 8}" class="rotation-quadrant quadrant-lagging">落後 ↙</text><text x="${right - 8}" y="${bottom - 8}" text-anchor="end" class="rotation-quadrant quadrant-cooling">降溫 ↘</text>${points}<text x="${(left + right) / 2}" y="${height - 8}" text-anchor="middle" class="rotation-axis">20 日超額報酬（pp） →</text><text x="${left}" y="14" class="rotation-axis">↑ 5 日強度加速度（pp）</text></svg>`;
}

function groupButton(g, marketId, active, maximum, current) {
  const width = valid(g.rs20) ? Math.min(50, Math.abs(g.rs20) / maximum * 50) : 0;
  return `<button class="rotation-row ${active ? 'active' : ''}" data-rotation-market="${marketId}" data-rotation-theme="${e(g.id)}" aria-pressed="${active}"><span class="rotation-row-name"><strong>${e(g.name)}</strong><small>${current ? e(opportunityLabels[g.opportunity] || labels[g.signal] || '尚待確認') : '歷史觀測'} · ${g.count}/${g.total} 檔</small></span><span class="rotation-bar"><i style="width:${width}%;left:${g.rs20 < 0 ? 50 - width : 50}%" class="${g.rs20 < 0 ? 'negative' : ''}"></i></span><span class="rotation-row-value">${pp(g.rs20)}</span></button>`;
}

function marketCard(id, market, selection, focus, domains, now, search = '') {
  if (!market) return `<article class="rotation-market"><h4>${id === 'tw' ? '台股' : '美股'}</h4><p class="empty">尚未取得此市場資料</p></article>`;
  const current = currentMarket(market, now), groups = rankedGroups(market), validGroups = groups.filter(g => g.status === 'ok');
  const candidates = current ? validGroups.filter(g => ['trend', 'defensive', 'rebound'].includes(g.opportunity) && matchesFocus(g, focus)) : [];
  const list = diverseGroups(candidates, 3);
  const shown = search ? groups.filter(g => `${g.name} ${(g.members || []).map(m => m.name + m.symbol).join(' ')}`.toLowerCase().includes(search.toLowerCase())) : groups;
  const early = current ? diverseGroups(validGroups.filter(g => g.opportunity === 'early' && ['all', 'early', 'improving'].includes(focus)), 2) : [];
  const maximum = Math.max(1, ...validGroups.map(g => Math.abs(g.rs20)));
  return `<article class="rotation-market" data-rotation-card="${id}">
    <header class="rotation-market-header"><div><h4>${e(market.name)} <span>${e(market.observed_at || '尚無觀測')}</span></h4><p>相對 ${e(market.benchmark_name)} · 20 日 ${signed(market.benchmark_returns?.['20'])}</p></div><span class="rotation-count">${market.available_groups ?? 0}<small>/${market.groups?.length || 12} 題材有效</small></span></header>
    ${market.universe?.status === 'stale' || market.universe?.fallback_curated_only ? `<p class="rotation-warning">外部分類更新異常，以下保留可用分類；母體可能不完整。${e(market.universe?.error || '')}</p>` : ''}
    ${!current ? `<p class="rotation-warning" role="status">${e(market.error || '日線已過期，以下僅供歷史檢視。')} 暫停當期候選判讀。</p>` : ''}
    <p class="rotation-universe">掃描 ${market.total_stocks ?? '—'} 檔 · 有效 ${market.eligible_stocks ?? '—'} 檔 · 來源 ${market.universe?.discovery_groups ?? 0} 群＋自訂補充 ${market.universe?.curated_groups ?? 12} 群（可重疊）${market.universe?.fallback_curated_only ? ' · 外部分類未取得，範圍受限' : ''}</p>
    <p class="rotation-regime">掃描母體站上季線 ${fmt(market.market_breadth60, 0)}% · 基準${market.benchmark_above_ma60 ? '站上' : '跌破'}季線</p>
    <div class="rotation-types">${[['trend','趨勢候選'],['defensive','防禦特徵'],['rebound','反彈修復']].map(([kind,label]) => `<span>${label} <b>${current ? validGroups.filter(g => g.opportunity === kind).length : '—'}</b><small>群</small></span>`).join('')}</div>
    <div class="rotation-chart" data-rotation-chart="${id}">${rotationSVG(market, { marketId: id, selected: selection.id === id ? selection.group?.id : null, focus, domains })}</div>
    <div class="rotation-queue-head"><strong>價格結構線索</strong><span>20 日超額 · 等權重</span></div>
    <div class="rotation-queue">${list.length ? list.map(g => groupButton(g, id, selection.id === id && selection.group?.id === g.id, maximum, current)).join('') : '<p class="rotation-no-signal">本次篩選尚無通過價格結構確認的族群</p>'}</div>
    ${early.length ? `<div class="rotation-early"><strong>初現動能</strong>${early.map(g => `<button data-rotation-market="${id}" data-rotation-theme="${e(g.id)}">${e(g.name)} <span>5 日 ${pp(g.rs5)} · 正強度 ${g.positive_rs5_days}/5 日</span></button>`).join('')}<small>近期動能改善，趨勢結構尚待確認</small></div>` : ''}
    <details class="rotation-all" ${search ? 'open' : ''}><summary>比較 ${shown.length} / ${groups.length} 個題材 <span>5／20／60 日訊號</span></summary><div class="table-scroll"><table class="rotation-table"><caption>RS＝成分股等權重報酬－同市場基準報酬；單位 pp。跑贏比率的分母為有效成分股數。</caption><thead><tr><th>題材／覆蓋</th><th>RS 5日</th><th>RS 20日</th><th>RS 60日</th><th>20日跑贏</th></tr></thead><tbody>${shown.map(g => `<tr><td><button data-rotation-market="${id}" data-rotation-theme="${e(g.id)}">${e(g.name)}</button><small>${g.count}/${g.total} 計價檔 · ${e(current ? opportunityLabels[g.opportunity] || labels[g.signal] : '歷史觀測')}</small></td><td>${pp(g.rs5)}</td><td>${pp(g.rs20)}</td><td>${pp(g.rs60)}</td><td>${valid(g.breadth20) ? `${fmt(g.breadth20, 0)}%` : '—'}</td></tr>`).join('')}</tbody></table></div></details>
  </article>`;
}

export function rotationHistorySVG(group, width = 900) {
  return chartSVG(group?.history || [], { fields: ['group', 'benchmark'], width: Math.max(260, width), height: 190, id: 'rotation-relative-history', label: '題材等權重與同市場基準，區間起點100' });
}

function memberTable(g) {
  return `<table class="rotation-table rotation-members"><caption>點選股票可開啟價格歷史。個股皆為等權重；被排除者不進入分母。</caption><thead><tr><th>股票／題材關聯</th><th>RS 5日</th><th>RS 20日</th><th>月線</th></tr></thead><tbody>${[...(g.members || [])].sort((a, b) => b.rs20 - a.rs20).map(m => `<tr><td>${external(`https://finance.yahoo.com/quote/${encodeURIComponent(m.symbol)}/history/`, m.name)}<small>${e(m.symbol)} · ${e(m.exposure)}</small></td><td>${pp(m.rs5)}</td><td>${pp(m.rs20)}</td><td>${m.above_ma20 ? '站上' : '跌破'}</td></tr>`).join('')}</tbody></table>`;
}

function detail(rotation, selection, now) {
  const { id, market, group: g } = selection;
  if (!g) return '';
  const current = currentMarket(market, now), peerId = id === 'tw' ? 'us' : 'tw', peerMarket = rotation.markets?.[peerId];
  const peer = peerMarket?.groups?.find(p => p.id === g.id && p.status === 'ok');
  const sources = (g.sources || []).map((url, i) => external(url, `${g.origin === 'curated' ? '業務依據' : '分類來源'} ${i + 1}`)).join(' · ');
  return `<article class="rotation-detail" id="rotation-detail"><header><div><p class="rotation-detail-kicker">${e(market.name)} · 成分股驗證</p><h4>${e(g.name)} <span class="rotation-signal signal-${current ? e(g.signal) : 'watch'}">${current ? e(opportunityLabels[g.opportunity] || labels[g.signal]) : '歷史觀測'}</span></h4></div><p>${g.count}/${g.total} 計價檔 · 品質覆蓋 ${fmt(g.coverage, 0)}%</p></header>
    <p class="rotation-disclosure">${g.origin === 'curated' ? '自訂補充題材' : '外部分類自動納入'} · 來源成分 ${g.universe_count ?? g.total} 檔，流動性排除 ${g.liquidity_excluded ?? 0} 檔。${g.origin !== 'curated' ? '品質覆蓋以扣除已知低流動性後的成分計算。' : ''}</p>
    ${g.status !== 'ok' ? '<p class="rotation-warning">至少需要 3 檔且覆蓋達 70% 才能計算族群訊號。此題材暫不排名。</p><div class="table-scroll">' + memberTable(g) + '</div>' : `<div class="rotation-evidence"><div><span>5 日超額</span><b>${pp(g.rs5)}</b><small>絕對報酬 ${signed(g.return5)}</small></div><div><span>20 日超額</span><b>${pp(g.rs20)}</b><small>60 日超額 ${pp(g.rs60)}</small></div><div><span>20 日跑贏大盤</span><b>${fmt(g.breadth20, 0)}<small>%</small></b><small>站上月線 ${fmt(g.above_ma20, 0)}%</small></div><div><span>大盤下跌日超額</span><b>${pp(g.down_excess)}</b><small>${g.down_days >= 3 ? `${g.down_days} 日平均 · 勝率 ${fmt(g.down_win_rate, 0)}%` : `僅 ${g.down_days} 日，樣本不足`}</small></div></div>
    <div class="rotation-structure"><strong>${e(opportunityLabels[g.opportunity] || '結構待確認')}</strong><span>絕對 20 日 ${signed(g.return20)} · 近 5 日突破 20 日高 ${fmt(g.breakout20_pct, 0)}% · 距 60 日高點 5% 內 ${fmt(g.near_high60_pct, 0)}% · 大盤上漲日超額 ${pp(g.up_excess)}（${g.up_days ?? 0} 日）</span><p>${g.opportunity === 'trend' ? '絕對上漲、相對領先、突破廣度與上漲日參與同時出現；列為下一波研究候選，仍待催化劑與基本面驗證。' : g.opportunity === 'defensive' ? '弱市中的相對領先主要仍呈現防守特徵，族群仍未絕對上漲，或上漲日參與與近期突破均未確認；不能據此認定是避險資金。' : g.opportunity === 'rebound' ? '短線回升，但多數成分尚未收復季線、60 日絕對報酬仍負，先視為反彈修復。' : '目前證據尚不足以區分新趨勢與短線輪動；不把相對強勢直接當成下一波主流。'}</p></div>
    <div class="rotation-detail-grid"><div><div data-rotation-history>${rotationHistorySVG(g)}</div>${chartKey([`${g.name} · 等權重`, market.benchmark_name])}<p class="small-caption">起點 100 · ${e(g.history?.[0]?.date)} 至 ${e(market.observed_at)} · 同一組有效成分股</p><p class="rotation-context">下跌日族群平均 ${signed(g.down_return)} · 量能 ${fmt(g.volume_ratio)}×<small>最近 5 日量／之前 20 日量，成分股中位數</small></p></div><div class="table-scroll">${memberTable(g)}</div></div>`}
    ${peer ? `<p class="rotation-peer">同題材對照 · ${e(peerMarket.name)}「${e(peer.name)}」20 日超額 <strong>${pp(peer.rs20)}</strong> · ${e(peerMarket.observed_at)}${!currentMarket(peerMarket, now) ? '（歷史資料）' : ''}。兩地各自對大盤計算，屬相關供應鏈觀察。</p>` : ''}
    ${g.note ? `<p class="rotation-disclosure">${e(g.note)}</p>` : ''}
    ${g.excluded?.length ? `<p class="rotation-disclosure">排除：${g.excluded.map(m => `${e(m.name)}（${e(m.symbol)}，${e(m.reason)}）`).join('；')}。</p>` : ''}
    <p class="rotation-source">${g.classification_name ? `原始分類 ${e(g.classification_name)} · ` : ''}${sources}</p>
  </article>`;
}

export function renderRotation(rotation, state = {}, now = Date.now()) {
  if (!rotation?.markets) return '<p class="empty">題材日線尚未建立，等待盤後更新；缺漏資料不產生強弱排名。</p>';
  const selection = rotationSelection(rotation, state), focus = state.rotationFocus || 'all', domains = rotationDomains(rotation, selection, focus);
  return `<div class="rotation-intro"><p><strong>找正在轉強、跌不下去的族群</strong><span>向右＝跑贏大盤 · 向上＝近期加速 · 選取軌跡＝近 4 週 · 外圈＝抗跌確認</span></p><div class="rotation-filters" role="group" aria-label="研究候選篩選">${[['all', '全部線索'], ['trend', '趨勢候選'], ['defensive', '防禦輪動'], ['rebound', '反彈修復'], ['early', '初現動能']].map(([v, label]) => `<button data-rotation-focus="${v}" class="${focus === v ? 'active' : ''}" aria-pressed="${focus === v}">${label}</button>`).join('')}</div></div>
    <label class="rotation-search">找產業或股票 <input id="rotation-search" type="search" value="${e(state.rotationSearch || '')}" placeholder="例如：被動元件、資安、2327" autocomplete="off"></label>
    <div class="rotation-markets">${['tw', 'us'].map(id => marketCard(id, rotation.markets[id], selection, focus, domains, now, state.rotationSearch || '')).join('')}</div>
    <p class="rotation-reading">點選題材查看成分股。散點自動選取最多 12 個具結構訊號、加速或落後的不同成分群，點選其他族群可加到圖上；全部外部分類均可搜尋檢視。台美共用刻度。價格型態是研究線索，無法確認資金動機或保證下一波行情。</p>
    ${detail(rotation, selection, now)}
    <details class="rotation-method"><summary>資料範圍與訊號怎麼算</summary><div><p>RS＝各成分股區間報酬的等權平均－同期間基準報酬。橫軸採 20 日 RS；縱軸採本期 5 日 RS－前一期 5 日 RS（單位皆為百分點 pp）。這是透明的自訂輪動圖，非 JdK RRG 指標。</p><p>加速轉強：5 日 RS、加速度與個股 RS 中位數均大於零，至少 60% 個股跑贏、60% 站上月線，最近 5 次觀測至少 3 次 RS 為正。強勢延續採相同廣度門檻，並要求 20 日 RS 與中位數為正、5 日 RS 為正及 20 日 RS 持續性。抗跌蓄勢要求 20 日 RS、中位數為正、相同廣度與月線門檻，且近 20 日至少 3 個基準下跌日，平均超額 ≥ 0.25 pp、勝率 ≥ 2/3。初現動能符合短線價格、廣度與月線條件，但尚未同時通過較高優先的趨勢、防守或修復結構條件，獨立列示。抗跌不等於絕對上漲。</p><p>趨勢候選另需：20 日絕對報酬與 RS 為正、跑贏及季線廣度 ≥ 60%、近 60 日高點 5% 內家數 ≥ 40%、近 5 日曾突破前 20 日高點的廣度 ≥ 20%、20 日 RS 最近 5 次至少 3 次為正、基準上漲日平均超額 > 0。防禦輪動特徵需弱市、下跌日相對支撐，且族群 20 日絕對報酬不正，或上漲日超額不正且近期突破廣度不足 20%。反彈修復指 5 日回升加速，但 60 日報酬負且多數未收復季線。這些是自訂研究規則，不是股癌公式，也不是資金流向鑑識。</p><p>以 Yahoo Finance 完整收盤還原股價計算，調整拆股與股息；台股對 006204 加權 ETF，美股對 SPY，均為含息 ETF 價格代理，仍有費用與追蹤誤差。量能僅作確認線索，不宣稱量測資金流。下跌日平均與勝率均採基準下跌的相同日期。</p><p>每檔需 90 個連續共同交易日、近 20 日至少 18 日有成交；20 日均成交額台股 ≥ 2,000 萬 TWD、美股 ≥ 500 萬 USD。還原日報酬絕對值 > 40% 暫排除待核對；真實事件跳空也可能被排除。每群至少 3 檔、品質覆蓋 ≥ 70%（外部分類先扣除已確認低流動性成分；失敗、缺日與異常仍算品質缺口），所有期間使用同一組有效成分股；缺漏不補零，抓取異常的股票不參與確認。基準失敗或超過 7 日保留歷史並停止當期訊號。</p><p>台股以 TWSE／TPEx 全體普通股為母體，納入櫃買中心價值鏈子分類與交易所分類。美股使用 Nasdaq Screener 產業：普通股／ADR、市值 ≥ 3 億 USD、價格 ≥ 2 USD、分類更新當日成交額 ≥ 500 萬 USD；這會排除微型與低流動性股，不是所有美股。分類每 7 日刷新，兩地另保留自訂補充題材；業務關聯不等於營收純度，組合可有多角化公司。跨市場同名題材的產業結構也可能不同。名單檢視日 ${e(rotation.catalog_reviewed_at)}；目前成分回算歷史，有存活者與選樣偏差，不能用來聲稱回測績效或預測下一波行情。</p><p>${external('https://in.help.yahoo.com/kb/adjusted-close-sln28256.html', '還原價說明')} · ${external('https://www.twse.com.tw/en/ETFortune-institute/etfInfo/006204', '台股基準')} · ${external('https://help.stockcharts.com/charts-and-tools/other-charting-tools/rrg-charts', '輪動圖概念')} · 最近嘗試 ${e(rotation.attempted_at || '未知')}</p></div></details>`;
}
