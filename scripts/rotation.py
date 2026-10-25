"""Price-led thematic rotation. Pure calculations plus a daily adjusted-price adapter.

Research baskets are versioned independently of price performance. Missing/failed
members are never zero-filled; every horizon uses one date-aligned fixed cohort.
"""
import concurrent.futures
import datetime as dt
import json
import math
import pathlib
import statistics
import time
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo
from rotation_universe import refresh_universe, read_json, write_json

ROOT = pathlib.Path(__file__).resolve().parent.parent
CATALOG = json.loads((ROOT / 'scripts/rotation-catalog.json').read_text())
CACHE_FILE = ROOT / 'data/rotation-prices.json.gz'
MIN_HISTORY = 90
MIN_MEMBERS = 3
MIN_COVERAGE = .7
MAX_AGE_DAYS = 7


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def chart_url(symbol, host='query1'):
    return f'https://{host}.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol, safe="")}?range=1y&interval=1d&includeAdjustedClose=true'


def parse_chart(payload, symbol, timezone, current):
    chart = payload.get('chart', {})
    if chart.get('error') or not chart.get('result'):
        raise ValueError('價格來源未回傳日線')
    result = chart['result'][0]
    meta = result.get('meta', {})
    if meta.get('symbol', '').upper() != symbol.upper():
        raise ValueError('價格代號不符')
    zone = ZoneInfo(timezone)
    timestamps = result.get('timestamp', [])
    quote = (result.get('indicators', {}).get('quote') or [{}])[0]
    adjusted = (result.get('indicators', {}).get('adjclose') or [{}])[0].get('adjclose', [])
    closes, volumes = quote.get('close', []), quote.get('volume', [])
    # The current session's candle can be returned before it closes. Never use it.
    regular = meta.get('currentTradingPeriod', {}).get('regular', {})
    active_date = dt.datetime.fromtimestamp(regular['start'], zone).date() if regular.get('start') else None
    complete = {}
    for i, timestamp in enumerate(timestamps):
        date = dt.datetime.fromtimestamp(timestamp, zone).date()
        if date > current.astimezone(zone).date():
            continue
        if date == active_date and current.timestamp() < regular.get('end', 0):
            continue
        a = adjusted[i] if i < len(adjusted) else None
        c = closes[i] if i < len(closes) else None
        v = volumes[i] if i < len(volumes) else None
        if not (finite(a) and a > 0 and finite(c) and c > 0 and finite(v) and v >= 0):
            continue
        complete[date.isoformat()] = dict(date=date.isoformat(), adjusted=round(a, 6), close=round(c, 6), volume=v)
    rows = [complete[d] for d in sorted(complete)]
    if len(rows) < MIN_HISTORY:
        raise ValueError('完整還原日線不足 90 日')
    return rows[-260:]


def fetch_prices(symbol, config, current, previous=None):
    error = None
    for host in ['query1', 'query2']:
        try:
            request = urllib.request.Request(chart_url(symbol, host), headers={'User-Agent': 'Mozilla/5.0 (Market Research Dashboard)', 'Accept': 'application/json'})
            with urllib.request.urlopen(request, timeout=18) as response:
                body = json.load(response)
            rows = parse_chart(body, symbol, config['timezone'], current)
            return dict(rows=rows, status='ok', observed_at=rows[-1]['date'], retrieved_at=current.isoformat(), url=chart_url(symbol, host))
        except Exception as ex:
            error = f'{type(ex).__name__}: {str(ex)[:100]}'
            if hasattr(ex, 'close'): ex.close()
            if getattr(ex, 'code', None) == 429:
                return {**(previous or {}), 'status': 'rate_limited', 'attempted_at': current.isoformat(), 'error': '來源限流，停止本批請求'}
            if host == 'query1':
                time.sleep(.2)
    # Keep history for diagnostics, but failed members cannot confirm a new signal.
    return {**(previous or {}), 'status': 'stale' if previous else 'error', 'attempted_at': current.isoformat(), 'error': error}


def pct(values, n, end=-1):
    end = len(values) - 1 if end == -1 else end
    return (values[end] / values[end - n] - 1) * 100


def quadrant(rs20, acceleration):
    return ('leading' if acceleration >= 0 else 'cooling') if rs20 >= 0 else ('improving' if acceleration >= 0 else 'lagging')


def build_market(config, prices, current):
    bench_entry = prices.get(config['benchmark'], {})
    bench_rows = bench_entry.get('rows', [])
    shell = {k: config[k] for k in ['name', 'benchmark', 'benchmark_name', 'currency', 'min_turnover']}
    shell.update(status='unavailable', groups=[], observed_at=bench_rows[-1]['date'] if bench_rows else None)
    if bench_entry.get('status') != 'ok' or len(bench_rows) < MIN_HISTORY:
        return {**shell, 'error': '基準未成功更新或完整歷史不足，停止產生當期訊號。'}
    bench_rows = bench_rows[-MIN_HISTORY:]
    dates = [r['date'] for r in bench_rows]
    shell['observed_at'] = dates[-1]
    age = (current.date() - dt.date.fromisoformat(dates[-1])).days
    if age < 0 or age > MAX_AGE_DAYS:
        return {**shell, 'error': '基準日線已超過 7 個日曆日，停止產生當期訊號。'}
    benchmark = [r['adjusted'] for r in bench_rows]
    member_metrics = {}
    exclusions = {}
    for member in {m['symbol']: m for g in config['groups'] for m in g['members']}.values():
        symbol = member['symbol']
        entry = prices.get(symbol, {})
        mapping = {r['date']: r for r in entry.get('rows', [])}
        reason = None
        if entry.get('status') != 'ok':
            reason = '價格抓取失敗'
        elif any(d not in mapping for d in dates):
            reason = '日期缺口／不足 90 個共同交易日'
        if reason:
            exclusions[symbol] = reason
            continue
        rows = [mapping[d] for d in dates]
        values = [r['adjusted'] for r in rows]
        turnover = statistics.mean(r['close'] * r['volume'] for r in rows[-20:])
        if turnover < config['min_turnover']:
            reason = '20 日均成交額未達門檻'
        elif sum(r['volume'] > 0 for r in rows[-20:]) < 18:
            reason = '近期無成交日過多'
        elif any(abs(values[i] / values[i-1] - 1) > .4 for i in range(1, len(values))):
            reason = '還原價格單日跳動超過 40%，待人工核對'
        if reason:
            exclusions[symbol] = reason
            continue
        metric = dict(**member, observed_at=dates[-1], retrieved_at=entry.get('retrieved_at'), price_source=entry.get('url'), close=rows[-1]['close'], turnover20=round(turnover), above_ma20=values[-1] > statistics.mean(values[-20:]), above_ma60=values[-1] > statistics.mean(values[-60:]), volume_ratio=round(statistics.mean(r['volume'] for r in rows[-5:]) / statistics.mean(r['volume'] for r in rows[-25:-5]), 3) if sum(r['volume'] for r in rows[-25:-5]) > 0 else None)
        for n in [5, 20, 60]:
            metric[f'return{n}'] = round(pct(values, n), 4)
            metric[f'rs{n}'] = round(pct(values, n) - pct(benchmark, n), 4)
        metric['near_high60'] = values[-1] >= max(values[-60:]) * .95
        metric['breakout20'] = any(values[end] > max(values[end-20:end]) for end in range(len(values)-5, len(values)))
        member_metrics[symbol] = (metric, values)
    groups = []
    for group in config['groups']:
        included = [(dict(member_metrics[m['symbol']][0], name=m['name'], exposure=m.get('exposure', group['name'])), member_metrics[m['symbol']][1]) for m in group['members'] if m['symbol'] in member_metrics]
        count, universe_count = len(included), len(group['members'])
        liquidity_excluded = sum(exclusions.get(m['symbol']) in ['20 日均成交額未達門檻', '近期無成交日過多'] for m in group['members'])
        total = universe_count - liquidity_excluded if config.get('coverage_after_liquidity') and group.get('origin') != 'curated' else universe_count
        row = dict(id=group['id'], name=group['name'], family=group.get('family', group['name']), classification_name=group.get('source_name'), origin=group.get('origin', 'curated'), universe_count=universe_count, liquidity_excluded=liquidity_excluded, count=count, total=total, coverage=round(count / total * 100, 1) if total else 0, note=group.get('note', ''), sources=group.get('sources', []), excluded=[dict(symbol=m['symbol'], name=m['name'], reason=exclusions.get(m['symbol'])) for m in group['members'] if m['symbol'] in exclusions], status='insufficient', signal='insufficient', trail=[], members=[])
        row['members'] = [m for m, _ in included]
        if count < MIN_MEMBERS or not total or count / total < MIN_COVERAGE:
            groups.append(row)
            continue
        series = [v for _, v in included]
        def ew(n, end=MIN_HISTORY - 1):
            return statistics.mean(pct(v, n, end) for v in series)
        def rs(n, end=MIN_HISTORY - 1):
            return ew(n, end) - pct(benchmark, n, end)
        for n in [5, 20, 60]:
            excess = [m[f'rs{n}'] for m, _ in included]
            row.update({f'return{n}': round(ew(n), 4), f'rs{n}': round(rs(n), 4), f'median_rs{n}': round(statistics.median(excess), 4), f'breadth{n}': round(sum(x > 0 for x in excess) / count * 100, 1)})
        row['acceleration'] = round(rs(5) - rs(5, MIN_HISTORY - 6), 4)
        row['above_ma20'] = round(sum(m['above_ma20'] for m, _ in included) / count * 100, 1)
        row['near_high60_pct'] = round(sum(m['near_high60'] for m, _ in included) / count * 100, 1)
        row['breakout20_pct'] = round(sum(m['breakout20'] for m, _ in included) / count * 100, 1)
        row['above_ma60'] = round(sum(m['above_ma60'] for m, _ in included) / count * 100, 1)
        row['volume_ratio'] = round(statistics.median(m['volume_ratio'] for m, _ in included if m['volume_ratio'] is not None), 3)
        row['positive_rs5_days'] = sum(rs(5, end) > 0 for end in range(MIN_HISTORY - 5, MIN_HISTORY))
        row['positive_rs20_days'] = sum(rs(20, end) > 0 for end in range(MIN_HISTORY - 5, MIN_HISTORY))
        down = []
        for end in range(MIN_HISTORY - 20, MIN_HISTORY):
            b = pct(benchmark, 1, end)
            if b < 0:
                down.append((ew(1, end), b))
        up = [(ew(1, end), pct(benchmark, 1, end)) for end in range(MIN_HISTORY - 20, MIN_HISTORY) if pct(benchmark, 1, end) > 0]
        row['up_days'] = len(up)
        row['up_excess'] = round(statistics.mean(g - b for g, b in up), 4) if len(up) >= 3 else None
        row['down_days'] = len(down)
        row['down_excess'] = round(statistics.mean(g - b for g, b in down), 4) if len(down) >= 3 else None
        row['down_return'] = round(statistics.mean(g for g, _ in down), 4) if len(down) >= 3 else None
        row['down_win_rate'] = round(sum(g > b for g, b in down) / len(down) * 100, 1) if len(down) >= 3 else None
        row['resilient'] = len(down) >= 3 and row['down_excess'] >= .25 and row['down_win_rate'] >= 66.6 and row['rs20'] > 0 and row['breadth20'] >= 60 and row['median_rs20'] > 0 and row['above_ma20'] >= 60
        improving = row['rs5'] > 0 and row['acceleration'] > 0 and row['breadth5'] >= 60 and row['median_rs5'] > 0 and row['positive_rs5_days'] >= 3 and row['above_ma20'] >= 60
        leading = row['rs20'] > 0 and row['rs5'] > 0 and row['breadth20'] >= 60 and row['median_rs20'] > 0 and row['positive_rs20_days'] >= 3 and row['above_ma20'] >= 60
        early = row['rs5'] > 0 and row['acceleration'] > 0 and row['breadth5'] >= 60 and row['median_rs5'] > 0 and row['above_ma20'] >= 60
        row['signal'] = 'resilient' if row['resilient'] else 'improving' if improving else 'leading' if leading else 'early' if early else 'watch'
        trend = row['return20'] > 0 and row['rs20'] > 0 and row['breadth20'] >= 60 and row['median_rs20'] > 0 and row['above_ma60'] >= 60 and row['near_high60_pct'] >= 40 and row['positive_rs20_days'] >= 3 and row['up_excess'] is not None and row['up_excess'] > 0 and row['breakout20_pct'] >= 20
        defensive = pct(benchmark, 20) < 0 and len(down) >= 3 and row['down_excess'] > .25 and row['rs20'] > 0 and (row['return20'] <= 0 or (row['up_excess'] is not None and row['up_excess'] <= 0 and row['breakout20_pct'] < 20))
        rebound = row['return5'] > 0 and row['acceleration'] > 0 and row['return60'] < 0 and row['above_ma60'] < 50
        row['opportunity'] = 'trend' if trend else 'defensive' if defensive else 'rebound' if rebound else 'early' if early else 'unconfirmed'
        row['quadrant'] = quadrant(row['rs20'], row['acceleration'])
        row['status'] = 'ok'
        # Five weekly-spaced observations, computed with exactly the same cohort.
        row['trail'] = [dict(date=dates[end], x=round(rs(20, end), 4), y=round(rs(5, end) - rs(5, end - 5), 4)) for end in range(MIN_HISTORY - 21, MIN_HISTORY, 5)]
        start = MIN_HISTORY - 66
        row['history'] = [dict(date=dates[end], group=round(statistics.mean(v[end] / v[start] * 100 for v in series), 4), benchmark=round(benchmark[end] / benchmark[start] * 100, 4)) for end in range(start, MIN_HISTORY)]
        groups.append(row)
    return {**shell, 'status': 'ok', 'retrieved_at': bench_entry.get('retrieved_at'), 'benchmark_returns': {str(n): round(pct(benchmark, n), 4) for n in [5, 20, 60]}, 'groups': groups, 'eligible_stocks': len(member_metrics), 'total_stocks': len(member_metrics) + len(exclusions), 'market_breadth60': round(sum(m['above_ma60'] for m, _ in member_metrics.values()) / len(member_metrics) * 100, 1) if member_metrics else None, 'benchmark_above_ma60': benchmark[-1] > statistics.mean(benchmark[-60:]), 'price_source': 'Yahoo Finance daily chart API (unofficial)', 'price_basis': 'split-and-dividend-adjusted', 'available_groups': sum(g['status'] == 'ok' for g in groups)}


def collect_rotation(mode, previous, current, cache_file=CACHE_FILE, fetcher=fetch_prices, universe=None):
    selected = ['tw', 'us'] if mode in ['full', 'rotation'] else ['tw'] if mode == 'daily_close' else ['us'] if mode == 'us_close' else []
    if not selected:
        return previous
    try:
        cache = read_json(cache_file)
    except (FileNotFoundError, ValueError, OSError):
        legacy = ROOT / 'data/rotation-prices.json'
        cache = read_json(legacy) if legacy.exists() else {}
    universe = refresh_universe(current) if universe is None else universe
    result = dict(previous or {})
    markets = dict(result.get('markets', {}))
    for market in selected:
        config = dict(CATALOG['markets'][market])
        discovery = universe.get(market, {})
        source_groups = discovery.get('groups', [])
        curated = [dict(g, origin='curated', family=g['name']) for g in config['groups']]
        config['groups'] = source_groups + curated
        config['coverage_after_liquidity'] = bool(source_groups)
        symbols = sorted({m['symbol'] for g in config['groups'] for m in g['members']} | {config['benchmark']})
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            for offset in range(0, len(symbols), 64):
                batch = symbols[offset:offset + 64]
                entries = list(pool.map(lambda s: (s, fetcher(s, config, current, cache.get(s))), batch))
                cache.update(entries)
                if any(e.get('status') == 'rate_limited' for _, e in entries) or sum(e.get('status') != 'ok' for _, e in entries) >= max(12, len(entries) * .8):
                    for symbol in symbols[offset + 64:]:
                        cache[symbol] = {**cache.get(symbol, {}), 'status': 'skipped', 'error': '來源大量失敗／限流，本次停止新請求', 'attempted_at':current.isoformat()}
                    break
                if len(symbols) > 200 and offset % 512 == 0:
                    print(f'Rotation {market}: {min(offset + 64, len(symbols))}/{len(symbols)} prices', flush=True)
        computed = build_market(config, cache, current)
        computed['universe'] = {k:v for k,v in discovery.items() if k != 'groups'}
        computed['universe']['discovery_groups'] = len(source_groups)
        computed['universe']['curated_groups'] = len(curated)
        computed['universe']['fallback_curated_only'] = not source_groups
        if computed['status'] != 'ok' and markets.get(market, {}).get('groups'):
            computed = {**markets[market], 'status': 'stale', 'error': computed['error']}
        markets[market] = computed
        print(f"Rotation {market}: {computed.get('available_groups', 0)}/{len(config['groups'])} groups · {computed.get('observed_at')} · {computed['status']}")
    cache_file.parent.mkdir(parents=True, exist_ok=True)
    for entry in cache.values():
        if entry.get('rows'): entry['rows'] = entry['rows'][-110:]
    write_json(cache_file, cache)
    result.update(version=1, catalog_version=CATALOG['version'], catalog_reviewed_at=CATALOG['reviewed_at'], attempted_at=current.isoformat(), markets=markets)
    return result


def rotation_indicator(rotation):
    markets = (rotation or {}).get('markets', {})
    tw, us = markets.get('tw', {}), markets.get('us', {})
    def qualified(m):
        return [g for g in m.get('groups', []) if g.get('status') == 'ok'] if m.get('status') == 'ok' else []
    groups = qualified(tw)
    confirmed = [g for g in groups if g.get('opportunity') == 'trend']
    us_trends = sum(g.get('opportunity') == 'trend' for g in qualified(us))
    ranked = sorted(groups, key=lambda g: g['rs20'], reverse=True)
    items = lambda rows: [dict(name=g['name'], alpha=g['rs20'], **{'return': g['return20']}) for g in rows]
    return dict(id='10', key='leading_sectors', name='題材輪動', status='observing' if groups else 'unavailable', status_label='價格訊號' if groups else '等待有效資料', summary=f"趨勢候選：台 {len(confirmed)} 群／美 {us_trends} 群 · 另列防禦輪動與反彈修復", leading_count=len(confirmed) if groups else None, us_leading_count=us_trends if qualified(us) else None, total_sectors=len(groups), top_sectors=items(ranked[:5]), lagging_sectors=items(list(reversed(ranked[-5:]))))
