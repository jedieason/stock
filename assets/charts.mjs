import { valid, fmt, escapeHTML as e } from './model.mjs';

const COLORS = ['var(--blue)', 'var(--purple)', '#dc9b39', 'var(--down)'];
export function spark(rows, field = 'close', color = 'var(--blue)') {
  const values = (rows || []).slice(-36).map(row => row[field]).filter(valid);
  if (values.length < 2) return '';
  const min = Math.min(...values), span = Math.max(...values) - min || 1;
  const points = values.map((value, i) => `${i / (values.length - 1) * 100},${30 - (value - min) / span * 26}`).join(' ');
  return `<svg class="spark" viewBox="0 0 100 34" aria-hidden="true"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`;
}

export function chartSVG(rows, { fields = ['close'], width = 1200, height = 300, candle = false, area = false, label = '市場歷史走勢', id = 'chart', axes = true } = {}) {
  if (!rows?.length) return '<div class="empty">此來源尚無可用歷史資料</div>';
  const left = 4, right = axes ? 62 : 4, top = 16, bottom = axes ? 30 : 4;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const candleRows = rows.filter(row => ['open', 'high', 'low', 'close'].every(key => valid(row[key])));
  const showCandles = candle && candleRows.length > 0;
  const values = rows.flatMap(row => (showCandles ? ['high', 'low', ...fields] : fields).map(field => row[field])).filter(valid);
  if (!values.length) return '<div class="empty">此來源尚無可用數值</div>';
  const min = Math.min(...values), max = Math.max(...values), padding = (max - min || Math.abs(max) * .02 || 1) * .12;
  const low = min - padding, high = max + padding;
  const x = i => left + (rows.length === 1 ? .5 : i / (rows.length - 1)) * plotWidth;
  const y = value => top + (high - value) / (high - low) * plotHeight;
  const pathFor = field => {
    let open = false;
    return rows.map((row, i) => {
      if (!valid(row[field])) { open = false; return ''; }
      const command = open ? 'L' : 'M'; open = true;
      return `${command}${x(i).toFixed(2)} ${y(row[field]).toFixed(2)}`;
    }).join(' ');
  };
  const gradientId = `fill-${id.replace(/[^\w-]/g, '')}`;
  const grid = axes ? Array.from({ length: 4 }, (_, i) => {
    const value = high - (high - low) * i / 3, yy = y(value);
    return `<line class="chart-grid" x1="${left}" x2="${width - right}" y1="${yy}" y2="${yy}"/><text class="chart-label" x="${width - right + 12}" y="${yy + 4}">${fmt(value, Math.abs(max) < 100 ? 2 : 0)}</text>`;
  }).join('') : '';
  const labelCount = Math.min(rows.length, width < 500 ? 4 : 6);
  const dates = axes ? [...new Set(Array.from({ length: labelCount }, (_, i) => Math.round(i / Math.max(1, labelCount - 1) * (rows.length - 1))))].map(i => `<text class="chart-label" x="${x(i)}" y="${height - 6}" text-anchor="${i === 0 ? 'start' : i === rows.length - 1 ? 'end' : 'middle'}">${e(rows[i].date?.slice(5) || '')}</text>`).join('') : '';
  const areaPath = area && fields.length === 1 && !showCandles && rows.every(row => valid(row[fields[0]])) ? `<path d="${pathFor(fields[0])} L${x(rows.length - 1)} ${height - bottom} L${x(0)} ${height - bottom} Z" fill="url(#${gradientId})"/>` : '';
  const candles = showCandles ? rows.map((row, i) => {
    if (!['open', 'high', 'low', 'close'].every(key => valid(row[key]))) return '';
    const color = row.close >= row.open ? 'var(--up)' : 'var(--down)', bodyWidth = Math.max(1.4, Math.min(10, plotWidth / rows.length * .58));
    return `<line x1="${x(i)}" x2="${x(i)}" y1="${y(row.high)}" y2="${y(row.low)}" stroke="${color}"/><rect x="${x(i) - bodyWidth / 2}" y="${Math.min(y(row.open), y(row.close))}" width="${bodyWidth}" height="${Math.max(1, Math.abs(y(row.open) - y(row.close)))}" fill="${color}"/>`;
  }).join('') : '';
  const lines = fields.map((field, i) => showCandles && field === 'close' ? '' : `<path d="${pathFor(field)}" fill="none" stroke="${COLORS[i % COLORS.length]}" stroke-width="${i === 0 ? 2 : 1.2}" vector-effect="non-scaling-stroke"/>`).join('');
  const dot = area && rows.length > 0 && valid(rows.at(-1)[fields[0]]) ? `<circle cx="${x(rows.length - 1)}" cy="${y(rows.at(-1)[fields[0]])}" r="3.3" fill="var(--blue)"/>` : '';
  return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${e(label)}"><title>${e(label)} · ${e(rows[0].date)} 至 ${e(rows.at(-1).date)}</title><defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="var(--blue)" stop-opacity=".17"/><stop offset="1" stop-color="var(--blue)" stop-opacity="0"/></linearGradient></defs>${grid}${areaPath}${candles}${lines}${dot}${dates}</svg>`;
}

export function chartKey(labels) { return `<div class="chart-key">${labels.map((label, i) => `<span style="--key:${COLORS[i % COLORS.length]}">${e(label)}</span>`).join('')}</div>`; }

export function volumeSVG(rows, width = 1200) {
  const values = rows.map(row => row.volume).filter(valid);
  if (!values.length) return '';
  const max = Math.max(...values) || 1, plotWidth = width - 66;
  return `<svg viewBox="0 0 ${width} 52" preserveAspectRatio="none" role="img" aria-label="日成交值（與價格日期對齊；缺值不補）">${rows.map((row, i) => valid(row.volume) ? `<rect x="${4 + i / Math.max(1, rows.length - 1) * plotWidth}" y="${44 - row.volume / max * 36}" width="${Math.max(1, Math.min(8, plotWidth / rows.length * .55))}" height="${row.volume / max * 36}" fill="${row.close >= row.open ? 'var(--up)' : 'var(--down)'}" opacity=".35"/>` : '').join('')}<text class="chart-label" x="4" y="10">成交值</text></svg>`;
}
