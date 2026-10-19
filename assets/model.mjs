// All calculations retain missing values; a missing observation is never zero.
export const valid = value => typeof value === 'number' && Number.isFinite(value);
export const last = rows => Array.isArray(rows) ? rows.at(-1) || {} : {};
export const fmt = (value, digits = 2) => valid(value) ? value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
export const signed = (value, digits = 2, suffix = '%') => valid(value) ? `${value > 0 ? '+' : ''}${fmt(value, digits)}${suffix}` : '—';
export const tone = value => !valid(value) || value === 0 ? '' : value > 0 ? 'up' : 'down';
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export function safeURL(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? escapeHTML(url.href) : '#'; } catch { return '#'; }
}
export function change(value, previous) {
  return valid(value) && valid(previous) && previous !== 0 ? (value / previous - 1) * 100 : null;
}
export function returns(rows, days = 1, field = 'close') {
  if (!Array.isArray(rows) || rows.length <= days) return null;
  return change(last(rows)[field], rows.at(-1 - days)?.[field]);
}
export function seriesFor(data, symbol) {
  const rows = (data[symbol] || []).filter(row => valid(row.close)).map(row => ({ ...row }));
  const quote = (data.quote || []).find(row => row.symbol === (symbol === 'taiex' ? 't00' : symbol === 'tpex' ? 'o00' : null));
  if (quote && valid(quote.close) && quote.date && quote.date >= (last(rows).date || '')) {
    if (quote.date === last(rows).date) rows[rows.length - 1] = { ...last(rows), ...quote };
    else rows.push({ ...quote });
  }
  return rows;
}
export function latestQuote(data, symbol) {
  const rows = seriesFor(data, symbol), row = last(rows);
  // A quoted previous close takes precedence over a historical daily observation.
  return { ...row, delta: valid(row.previous) ? change(row.close, row.previous) : returns(rows) };
}
export function periodRows(rows, count) { return count === 'all' ? rows : rows.slice(-Number(count)); }
export function paginate(rows, page = 1, size = 12) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(pages, Math.max(1, page));
  return { rows: rows.slice((current - 1) * size, current * size), page: current, pages, total: rows.length };
}
export function sortNumeric(rows, key, direction = 'desc') {
  return [...rows].sort((a, b) => {
    if (!valid(a[key])) return valid(b[key]) ? 1 : 0;
    if (!valid(b[key])) return -1;
    return direction === 'asc' ? a[key] - b[key] : b[key] - a[key];
  });
}
export function companyRows(data, search, sort) {
  const valuations = new Map((data.valuations || []).map(row => [row.ticker, row]));
  const revenue = new Map((data.revenue || []).map(row => [row.ticker, row]));
  const tickers = new Set([...revenue.keys(), ...valuations.keys()]);
  const query = search.trim().toLowerCase();
  const rows = [...tickers].map(ticker => {
    const r = revenue.get(ticker) || {}, v = valuations.get(ticker) || {};
    return { ...v, ...r, pe: v.pe, pb: v.pb, yield: v.yield, valuation_date: v.date, revenue_date: r.date, ticker };
  }).filter(row => !query || [row.ticker, row.name, row.industry].some(value => String(value || '').toLowerCase().includes(query)));
  return sortNumeric(rows, sort);
}
export function breadthPercent(breadth) {
  const { up, down, flat } = breadth || {};
  if (![up, down, flat].every(valid) || up + down + flat === 0) return null;
  return up / (up + down + flat) * 100;
}
export function monthLabel(value) {
  if (!value) return '—';
  const text = String(value);
  return text.length === 5 ? `${Number(text.slice(0, 3)) + 1911}/${text.slice(3)}` : text;
}
export function timeLabel(value) {
  const text = String(value || '').padStart(6, '0');
  return /^\d{6}$/.test(text) && value ? `${text.slice(0, 2)}:${text.slice(2, 4)}` : '';
}
export function snapshotAgeDays(date, now = Date.now()) {
  const parsed = Date.parse(`${String(date).slice(0, 10)}T00:00:00+08:00`);
  return Number.isFinite(parsed) ? Math.floor((now - parsed) / 86400000) : null;
}
