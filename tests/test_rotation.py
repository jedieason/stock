import datetime as dt
import json
import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'scripts'))
from rotation_universe import read_json
from rotation import fetch_prices, build_market, collect_rotation, parse_chart, rotation_indicator

CURRENT = dt.datetime(2026, 10, 25, 12, tzinfo=dt.timezone(dt.timedelta(hours=8)))
DATES = [(dt.date(2026, 10, 23) - dt.timedelta(days=89 - i)).isoformat() for i in range(90)]
CONFIG = dict(name='test', benchmark='BENCH', benchmark_name='test benchmark', timezone='Asia/Taipei', currency='TWD', min_turnover=1000, groups=[dict(id='cyber', name='cyber', sources=[], members=[dict(symbol=s, name=s) for s in 'ABC'])])


def entry(values, dates=DATES):
    return dict(status='ok', rows=[dict(date=d, adjusted=v, close=v, volume=1000000) for d, v in zip(dates, values)])


def prices():
    return dict(BENCH=entry([100 + i * .1 for i in range(90)]), A=entry([10 + i * .1 for i in range(90)]), B=entry([500 + i for i in range(90)]), C=entry([40 + i * .1 for i in range(90)]))


class RotationTests(unittest.TestCase):
    def test_equal_weight_matches_independent_window_arithmetic(self):
        p = prices()
        group = build_market(CONFIG, p, CURRENT)['groups'][0]
        expected = sum((p[s]['rows'][-1]['adjusted'] / p[s]['rows'][-21]['adjusted'] - 1) * 100 for s in 'ABC') / 3
        benchmark = (108.9 / 106.9 - 1) * 100
        self.assertAlmostEqual(group['return20'], expected, places=3)
        self.assertAlmostEqual(group['rs20'], expected - benchmark, places=3)
        self.assertEqual(len(group['trail']), 5)
        self.assertEqual(group['trail'][-1]['x'], group['rs20'])
        self.assertEqual(group['trail'][-1]['y'], group['acceleration'])
        self.assertEqual(group['history'][0]['group'], 100)
        self.assertEqual(group['history'][0]['benchmark'], 100)

    def test_one_stock_cannot_confirm_a_group(self):
        p = dict(BENCH=entry([100 + i * .01 for i in range(90)]), A=entry([100] * 89 + [120]), B=entry([100] * 90), C=entry([100] * 90))
        g = build_market(CONFIG, p, CURRENT)['groups'][0]
        self.assertGreater(g['rs20'], 0)
        self.assertEqual(g['breadth20'], 33.3)
        self.assertEqual(g['signal'], 'watch')

    def test_downside_resilience_uses_only_shared_down_days(self):
        benchmark, stock = [100], [100]
        for i in range(89):
            down = i % 2 == 0
            benchmark.append(benchmark[-1] * (.99 if down else 1.01))
            stock.append(stock[-1] * (1.001 if down else 1.005))
        p = dict(BENCH=entry(benchmark), **{s: entry(stock) for s in 'ABC'})
        g = build_market(CONFIG, p, CURRENT)['groups'][0]
        self.assertEqual(g['down_days'], 10)
        self.assertAlmostEqual(g['down_excess'], 1.1)
        self.assertEqual(g['down_win_rate'], 100)
        self.assertTrue(g['resilient'])
        self.assertEqual(g['signal'], 'resilient')
        p['BENCH'] = entry([100 + i for i in range(90)])
        g = build_market(CONFIG, p, CURRENT)['groups'][0]
        self.assertIsNone(g['down_excess'])
        self.assertFalse(g['resilient'])

    def test_defensive_relative_strength_is_not_a_new_trend(self):
        benchmark, defensive, trend = [100], [100], [100]
        for i in range(89):
            down = i % 2 == 0
            benchmark.append(benchmark[-1] * (.994 if down else 1.004))
            defensive.append(defensive[-1] * (.998 if down else 1))
            trend.append(trend[-1] * (1.002 if down else 1.012))
        p = dict(BENCH=entry(benchmark), **{s:entry(defensive) for s in 'ABC'})
        g = build_market(CONFIG, p, CURRENT)['groups'][0]
        self.assertGreater(g['rs20'], 0)
        self.assertLess(g['return20'], 0)
        self.assertEqual(g['opportunity'], 'defensive')
        p.update({s:entry(trend) for s in 'ABC'})
        g = build_market(CONFIG, p, CURRENT)['groups'][0]
        self.assertEqual(g['opportunity'], 'trend')
        self.assertGreater(g['up_excess'], 0)
        self.assertEqual(g['breakout20_pct'], 100)
        # A strong advance resting below its recent high is not evidence of hedging.
        plateau = trend[:-10] + [trend[-11]] * 10
        p.update({s:entry(plateau) for s in 'ABC'})
        g = build_market(CONFIG, p, CURRENT)['groups'][0]
        self.assertGreater(g['return20'], 0)
        self.assertGreater(g['up_excess'], 0)
        self.assertEqual(g['breakout20_pct'], 0)
        self.assertNotEqual(g['opportunity'], 'defensive')

    def test_rebound_below_longer_trend_is_separate(self):
        stock = [100 * .99 ** i for i in range(85)]
        for _ in range(5): stock.append(stock[-1] * 1.02)
        p = dict(BENCH=entry([100] * 90), **{s:entry(stock) for s in 'ABC'})
        g = build_market(CONFIG, p, CURRENT)['groups'][0]
        self.assertEqual(g['opportunity'], 'rebound')
        self.assertLess(g['return60'], 0)
        self.assertEqual(g['above_ma60'], 0)

    def test_discovery_coverage_keeps_failures_but_removes_known_illiquid_members(self):
        p=prices()
        p['D']=entry([100]*90)
        for r in p['D']['rows']: r['volume']=0
        config=dict(CONFIG, coverage_after_liquidity=True, groups=[dict(CONFIG['groups'][0], origin='tpex-chain', members=CONFIG['groups'][0]['members']+[dict(symbol='D',name='D')])])
        g=build_market(config,p,CURRENT)['groups'][0]
        self.assertEqual((g['count'],g['total'],g['universe_count']), (3,3,4))
        self.assertEqual(g['status'],'ok')
        p['D']['status']='stale'
        g=build_market(config,p,CURRENT)['groups'][0]
        self.assertEqual((g['count'],g['total']), (3,4))
        self.assertEqual(g['coverage'],75)

    def test_gaps_failures_low_liquidity_and_price_anomalies_do_not_become_zero_returns(self):
        for mutate, reason in [
            (lambda p: p['A']['rows'].pop(-20), '日期缺口'),
            (lambda p: p['A'].update(status='stale'), '抓取失敗'),
            (lambda p: [r.update(volume=0) for r in p['A']['rows']], '成交額'),
            (lambda p: p['A']['rows'][-1].update(adjusted=1000), '跳動'),
        ]:
            with self.subTest(reason=reason):
                p = prices(); mutate(p)
                g = build_market(CONFIG, p, CURRENT)['groups'][0]
                self.assertEqual(g['status'], 'insufficient')
                self.assertNotIn('rs20', g)
                self.assertIn(reason, g['excluded'][0]['reason'])
                self.assertEqual(g['count'], 2)

    def test_stale_or_failed_benchmark_stops_all_signals(self):
        for status, now in [('stale', CURRENT), ('ok', CURRENT + dt.timedelta(days=10)), ('ok', CURRENT - dt.timedelta(days=10))]:
            p = prices(); p['BENCH']['status'] = status
            m = build_market(CONFIG, p, now)
            self.assertEqual(m['status'], 'unavailable')
            self.assertEqual(m['groups'], [])
        self.assertIsNone(rotation_indicator({})['leading_count'])
        self.assertEqual(rotation_indicator({})['top_sectors'], [])

    def test_adapter_requires_adjusted_prices_and_rejects_incomplete_session(self):
        dates = [dt.datetime(2026, 7, 25, 9, tzinfo=CURRENT.tzinfo) + dt.timedelta(days=i) for i in range(91)]
        dates[-1] = CURRENT.replace(hour=9)
        timestamps = [int(d.timestamp()) for d in dates]
        result = dict(meta=dict(symbol='ABC', currentTradingPeriod=dict(regular=dict(start=timestamps[-1], end=int((CURRENT + dt.timedelta(hours=1)).timestamp())))), timestamp=timestamps, indicators=dict(quote=[dict(close=[100] * 91, volume=[100] * 91)], adjclose=[dict(adjclose=[95] * 91)]))
        payload = dict(chart=dict(result=[result]))
        rows = parse_chart(payload, 'ABC', 'Asia/Taipei', CURRENT)
        self.assertEqual(len(rows), 90)
        self.assertLess(rows[-1]['date'], CURRENT.date().isoformat())
        self.assertEqual(rows[-1]['adjusted'], 95)
        with self.assertRaises(ValueError):
            parse_chart(payload, 'WRONG', 'Asia/Taipei', CURRENT)
        del result['indicators']['adjclose']
        with self.assertRaises(ValueError):
            parse_chart(payload, 'ABC', 'Asia/Taipei', CURRENT)

    def test_rate_limit_is_not_retried_on_another_host(self):
        from urllib.error import HTTPError
        with patch('rotation.urllib.request.urlopen', side_effect=HTTPError('url',429,'limit',{},None)) as request:
            result=fetch_prices('ABC', CONFIG, CURRENT)
        self.assertEqual(result['status'],'rate_limited')
        self.assertEqual(request.call_count,1)

    def test_one_market_refresh_preserves_other_market_and_failure_preserves_history(self):
        config = dict(CONFIG, benchmark='BENCH')
        catalog = dict(version=1, reviewed_at='2026-10-25', markets=dict(tw=config, us=config))
        previous = dict(markets=dict(us=dict(status='ok', groups=[dict(id='sentinel')])))
        with tempfile.TemporaryDirectory() as directory, patch('rotation.CATALOG', catalog):
            cache_file = pathlib.Path(directory) / 'prices.json'
            p = prices()
            result = collect_rotation('daily_close', previous, CURRENT, cache_file, lambda s, c, n, prev: p[s], universe={})
            self.assertEqual(result['markets']['us'], previous['markets']['us'])
            original = result['markets']['tw']['observed_at']
            failed = collect_rotation('daily_close', result, CURRENT, cache_file, lambda s, c, n, prev: dict(prev or {}, status='stale'), universe={})
            self.assertEqual(failed['markets']['tw']['status'], 'stale')
            self.assertEqual(failed['markets']['tw']['observed_at'], original)
            self.assertEqual(rotation_indicator(failed)['top_sectors'], [])

    def test_live_snapshot_reconciles_to_cached_constituent_prices(self):
        root = pathlib.Path(__file__).resolve().parents[1]
        packet = dict(data=dict(theme_rotation=read_json(root / 'data/rotation.json.gz')))
        cache = read_json(root / 'data/rotation-prices.json.gz')
        for market in packet['data']['theme_rotation']['markets'].values():
            bench = {r['date']: r['adjusted'] for r in cache[market['benchmark']]['rows']}
            for g in market['groups']:
                self.assertEqual(g['count'] + len(g['excluded']), g['universe_count'])
                if g['status'] != 'ok':
                    continue
                dates = sorted(d for d in bench if d <= market['observed_at'])
                expected = []
                for member in g['members']:
                    p = {r['date']: r['adjusted'] for r in cache[member['symbol']]['rows']}
                    expected.append((p[dates[-1]] / p[dates[-21]] - 1) * 100)
                    self.assertEqual(member['observed_at'], market['observed_at'])
                self.assertAlmostEqual(g['return20'], sum(expected) / len(expected), places=3)
                self.assertAlmostEqual(g['rs20'], sum(expected) / len(expected) - (bench[dates[-1]] / bench[dates[-21]] - 1) * 100, places=3)
                self.assertFalse(any('指數' in m['name'] for m in g['members']))


if __name__ == '__main__':
    unittest.main()
