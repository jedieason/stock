#!/usr/bin/env python3
"""Market data collector and snapshot updater for GitHub Actions & GitHub Pages."""
import argparse
import concurrent.futures
import csv
import datetime as dt
import json
import math
import os
import pathlib
import statistics
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from zoneinfo import ZoneInfo

TPE = ZoneInfo('Asia/Taipei')
ROOT = pathlib.Path(__file__).resolve().parent.parent
CATALOG_FILE = pathlib.Path(__file__).resolve().parent / 'catalog.json'
CATALOG = json.loads(CATALOG_FILE.read_text(encoding='utf-8'))
OUTPUT_FILE = ROOT / 'data/market.json'

def now():
    return dt.datetime.now(TPE)

def iso():
    return now().isoformat(timespec='seconds')

def number(v):
    try:
        n = float(str(v).replace(',', '').replace('%', ''))
        return n if math.isfinite(n) else None
    except (ValueError, TypeError):
        return None

def day(v):
    s = str(v).strip().replace('/', '').replace('-', '')
    if len(s) == 7:
        s = str(int(s[:3]) + 1911) + s[3:]
    if len(s) == 8:
        return f'{s[:4]}-{s[4:6]}-{s[6:8]}'
    return None

def observed(rows, key='date'):
    return max((x[key] for x in rows if x.get(key)), default=None)

def valid_rows(rows):
    today = now().date().isoformat()
    return sorted([r for r in rows if r.get('date') and '1990-01-01' <= r['date'] <= today], key=lambda x: x['date'])

def fm(dataset, symbol=None, days=800):
    q = {
        'dataset': dataset,
        'start_date': (now().date() - dt.timedelta(days=days)).isoformat(),
        'end_date': now().date().isoformat()
    }
    if symbol:
        q['data_id'] = symbol
    return 'https://api.finmindtrade.com/api/v4/data?' + urllib.parse.urlencode(q)

def fetch(key, title, url, parse, frequency='盤後日頻', existing_entry=None, interval='交易日 15:30 盤後'):
    t = time.time()
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 (TW-Market-Dashboard)',
        'Accept': 'application/json,text/csv,text/xml,*/*'
    }
    token = os.environ.get('FINMIND_TOKEN')
    if token and urllib.parse.urlparse(url).hostname == 'api.finmindtrade.com':
        headers['Authorization'] = 'Bearer ' + token

    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=15) as res:
            body = res.read(15_000_000)
        data = parse(body)
        if data is None or (isinstance(data, list) and not data):
            raise ValueError('來源未提供可用資料')
        dates = observed(data) if isinstance(data, list) else data.get('date') if isinstance(data, dict) else None
        entry = {
            'id': key,
            'title': title,
            'url': url,
            'data': data,
            'observed_at': dates,
            'retrieved_at': iso(),
            'attempted_at': iso(),
            'status': 'ok',
            'error': None,
            'frequency': frequency,
            'interval': interval
        }
    except Exception as ex:
        prev = existing_entry or {}
        entry = {
            **prev,
            'id': key,
            'title': title,
            'url': url,
            'data': prev.get('data'),
            'observed_at': prev.get('observed_at'),
            'retrieved_at': prev.get('retrieved_at'),
            'attempted_at': iso(),
            'status': 'stale' if prev.get('data') is not None else 'error',
            'error': f'{type(ex).__name__}: {str(ex)[:160]}',
            'frequency': frequency,
            'interval': interval
        }
    return entry

def j(b):
    return json.loads(b.decode('utf-8-sig'))

def fin_prices(b, us=False):
    x = j(b)
    if x.get('status') != 200:
        raise ValueError(x.get('msg', 'FinMind失敗'))
    r = []
    for v in x.get('data', []):
        row = {
            'date': v['date'],
            'close': number(v.get('Adj_Close') if us else v.get('close')),
            'open': number(v.get('Open') if us else v.get('open')),
            'high': number(v.get('High') if us else v.get('max')),
            'low': number(v.get('Low') if us else v.get('min')),
            'volume': number(v.get('Volume') if us else v.get('Trading_money'))
        }
        if row['close'] is not None:
            r.append(row)
    return valid_rows(r)

def margin_parse(b):
    x = j(b)
    if x.get('status') != 200:
        raise ValueError(x.get('msg', 'FinMind失敗'))
    return valid_rows([{'date': r['date'], 'value': r['TodayBalance'] / 1e8} for r in x['data'] if r['name'] == 'MarginPurchaseMoney'])

def cboe(b):
    return valid_rows([
        {
            'date': dt.datetime.strptime(r['DATE'], '%m/%d/%Y').date().isoformat(),
            'value': number(r.get('CLOSE', r.get('VVIX')))
        }
        for r in csv.DictReader(b.decode('utf-8-sig').splitlines())
    ])[-800:]

def quotes(b):
    x = j(b)
    if x.get('rtcode') not in [None, '0000']:
        raise ValueError(x.get('rtmessage', 'MIS unavailable'))
    return valid_rows([
        {
            'date': day(v.get('d')),
            'time': v.get('t'),
            'symbol': v.get('c'),
            'name': v.get('n'),
            'close': number(v.get('z')),
            'previous': number(v.get('y')),
            'open': number(v.get('o')),
            'high': number(v.get('h')),
            'low': number(v.get('l'))
        }
        for v in x.get('msgArray', [])
    ])

def fmt(b):
    return valid_rows([
        {'date': day(r['Date']), 'close': number(r['TAIEX']), 'volume': number(r['TradeValue']), 'change': number(r['Change'])}
        for r in j(b)
    ])

def tpex(b):
    return valid_rows([
        {'date': day(r['Date']), **{k.lower(): number(r[k]) for k in ['Open', 'High', 'Low', 'Close']}}
        for r in j(b)
    ])

def market(b):
    x = j(b)
    if x.get('stat') != 'OK':
        raise ValueError(x.get('stat', '報表未發布'))
    date = day(x.get('date'))
    breadth = None
    sectors = []
    for t in x.get('tables', []):
        if t.get('title') == '漲跌證券數合計':
            col = t['fields'].index('股票')
            v = {r[0]: r[col] for r in t['data']}
            def count(s): return int(s.replace(',', '').split('(')[0])
            def limit(s): return int(s.split('(')[1].strip(')').replace(',', '')) if '(' in s else None
            breadth = {
                'date': date,
                'up': count(v['上漲(漲停)']),
                'down': count(v['下跌(跌停)']),
                'flat': count(v['持平']),
                'limit_up': limit(v['上漲(漲停)']),
                'limit_down': limit(v['下跌(跌停)']),
                'no_trade': count(v['未成交']),
                'no_comparison': count(v['無比價'])
            }
        if '價格指數(臺灣證券交易所)' in t.get('title', ''):
            sectors = [
                {'date': date, 'name': r[0], 'close': number(r[1]), 'value': number(r[4])}
                for r in t['data'] if number(r[4]) is not None
            ]
    return {'date': date, 'breadth': breadth, 'sectors': sectors}

def marginofficial(b):
    x = j(b)
    if x.get('stat') != 'OK':
        raise ValueError(x.get('stat', '未發布'))
    for t in x.get('tables', []):
        for r in t.get('data', []):
            if r[0] == '融資金額(仟元)':
                return {
                    'date': day(x['date']),
                    'buy': number(r[1]) / 1e5,
                    'sell': number(r[2]) / 1e5,
                    'repay': number(r[3]) / 1e5,
                    'previous': number(r[4]) / 1e5,
                    'value': number(r[5]) / 1e5
                }
    raise ValueError('找不到融資金額欄位')

def institutions(b):
    x = j(b)
    if x.get('stat') != 'OK':
        raise ValueError(x.get('stat', '未發布'))
    return [{'date': day(x['date']), 'name': r[0], 'value': number(r[3]) / 1e8} for r in x['data']]

def daytrade(b):
    x = j(b)
    if x.get('stat') != 'OK':
        raise ValueError(x.get('stat', '未發布'))
    t = next((t for t in x.get('tables', []) if '當日沖銷交易統計資訊' in t.get('title', '')), None)
    if not t:
        raise ValueError('無當沖統計表')
    r = t['data'][0]
    return {
        'date': day(x['date']),
        'volume_share': number(r[1]),
        'buy_share': number(r[3]),
        'sell_share': number(r[5])
    }

def putcall(b):
    text = b.decode('utf-8-sig').strip()
    rows = json.loads(text) if text.startswith('[') else list(csv.DictReader(text.splitlines()))
    return valid_rows([
        {
            'date': day(r.get('Date', r.get('日期'))),
            'volume': number(r.get('PutCallVolumeRatio%', r.get('買賣權成交量比率%'))),
            'oi': number(r.get('PutCallOIRatio%', r.get('買賣權未平倉量比率%')))
        }
        for r in rows
    ])

def fx(b):
    return valid_rows([{'date': day(r['Date']), 'twd': number(r['USD/NTD']), 'jpy': number(r['USD/JPY'])} for r in j(b)])

def futures(b):
    return valid_rows([{'date': day(r['Date']), 'contract': r['ContractCode'], 'name': r['Item'], 'value': number(r['OpenInterest(Net)'])} for r in j(b)])

def treasury(b):
    r = []
    for entry in ET.fromstring(b).findall('{http://www.w3.org/2005/Atom}entry'):
        p = entry.find('.//{http://schemas.microsoft.com/ado/2007/08/dataservices/metadata}properties')
        if p is None:
            continue
        v = {a.tag.split('}')[-1]: a.text for a in p}
        date = (v.get('NEW_DATE') or '')[:10]
        if date:
            r.append({'date': date, 'y2': number(v.get('BC_2YEAR')), 'y10': number(v.get('BC_10YEAR')), 'y30': number(v.get('BC_30YEAR'))})
    return valid_rows(r)

def news_parse(b):
    return [
        {
            'date': day(r.get('發言日期')),
            'time': r.get('發言時間'),
            'ticker': r.get('公司代號'),
            'name': r.get('公司名稱'),
            'title': r.get('主旨 ', r.get('主旨')),
            'detail': r.get('說明'),
            'event_date': r.get('事實發生日')
        }
        for r in j(b)
    ][:150]

def revenue_parse(b):
    result = []
    for r in j(b):
        result.append({
            'date': day(r.get('出表日期')),
            'period': r.get('資料年月'),
            'ticker': r.get('公司代號'),
            'name': r.get('公司名稱'),
            'industry': r.get('產業別'),
            'revenue': number(r.get('營業收入-當月營收')),
            'mom': number(r.get('營業收入-上月比較增減(%)')),
            'yoy': number(r.get('營業收入-去年同月增減(%)'))
        })
    return result

def valuations(b):
    return [
        {
            'date': day(r.get('Date')),
            'ticker': r.get('Code'),
            'name': r.get('Name'),
            'pe': number(r.get('PEratio')),
            'pb': number(r.get('PBratio')),
            'yield': number(r.get('DividendYield'))
        }
        for r in j(b)
    ]

def ret(rows, n, key='close'):
    return rows[-1][key] / rows[-n-1][key] - 1 if len(rows) > n and rows[-1].get(key) is not None and rows[-n-1].get(key) not in [None, 0] else None

def features(data):
    p = data.get('taiex') or []
    f = {}
    if p:
        for i, r in enumerate(p):
            for n in [20, 60, 120, 240]:
                r['ma' + str(n)] = sum(v['close'] for v in p[i - n + 1:i + 1]) / n if i + 1 >= n else None
        c = p[-1]['close']
        f = {'close': c, 'date': p[-1]['date'], **{'r' + str(n): ret(p, n) for n in [1, 5, 20, 60]}}
        for n in [20, 60, 120, 240]:
            ma = p[-1]['ma' + str(n)]
            f['ma' + str(n)] = ma
            f['dev' + str(n)] = c / ma - 1 if ma else None
            old = p[-6].get('ma' + str(n)) if len(p) > 5 else None
            f['slope' + str(n)] = ma / old - 1 if old and ma else None
        f['dd60'] = c / max(r['close'] for r in p[-60:]) - 1 if len(p) >= 60 else None
        trs = [
            max(p[i]['high'] - p[i]['low'], abs(p[i]['high'] - p[i - 1]['close']), abs(p[i]['low'] - p[i - 1]['close']))
            for i in range(max(1, len(p) - 14), len(p))
            if all(p[i].get(k) is not None for k in ['high', 'low'])
        ]
        f['atr14'] = sum(trs) / 14 if len(trs) == 14 else None
        f['location'] = (c - p[-1]['low']) / (p[-1]['high'] - p[-1]['low']) if p[-1].get('high') != p[-1].get('low') else None
        vols = [r['volume'] for r in p[-21:-1] if r.get('volume') is not None]
        f['volratio'] = p[-1]['volume'] / (sum(vols) / 20) if len(vols) == 20 and sum(vols) > 0 else None
        logs = [math.log(p[i]['close'] / p[i - 1]['close']) for i in range(max(1, len(p) - 20), len(p))]
        f['rv20'] = statistics.stdev(logs) * math.sqrt(252) if len(logs) == 20 else None

    m = data.get('margin') or []
    if m:
        f.update(
            margin=m[-1]['value'],
            margin5=ret(m, 5, 'value'),
            margin20=ret(m, 20, 'value'),
            margin_dd=m[-1]['value'] / max(r['value'] for r in m[-20:]) - 1 if len(m) >= 20 else None
        )
    v = data.get('vix') or []
    v3 = data.get('vix3m') or []
    if v:
        f.update(
            vix=v[-1]['value'],
            vix5=ret(v, 5, 'value'),
            vix_date=v[-1]['date'],
            vix_pct=sum(r['value'] <= v[-1]['value'] for r in v[-252:]) / 252 if len(v) >= 252 else None
        )
        if v3 and v[-1]['date'] == v3[-1]['date']:
            f['vixratio'] = v[-1]['value'] / v3[-1]['value']
    return f

def factor_rows(data, sources, f):
    by = {x['id']: x for x in sources}
    out = []
    def attach(id, keys, value, status='可觀測', note=None):
        row = next(r for r in out if r['id'] == id)
        ss = [by[k] for k in keys if k in by]
        available = [s for s in ss if data.get(s['id']) is not None or s.get('data') is not None]
        row.update(
            status=status if available else '缺漏',
            value=value if available else None,
            sources=[{k: s.get(k) for k in ['id', 'title', 'url', 'observed_at', 'retrieved_at', 'status', 'error']} for s in ss],
            observed_at=min((s['observed_at'] for s in available if s.get('observed_at')), default=None),
            missing_reason=note or (None if available else '公開端點未取得有效回應')
        )
    for c in CATALOG:
        out.append({**c, 'status': '缺漏', 'value': None, 'observed_at': None, 'sources': [], 'missing_reason': '尚未接通公開資料，或需付費權限／人工研究。'})
    n = lambda x, d=2: '—' if x is None else f'{x:,.{d}f}'
    pc = lambda x: '—' if x is None else f'{x*100:+.2f}%'

    attach('P01', ['taiex'], n(f.get('close')) + ' 點')
    attach('P02', ['tpex'], n((data.get('tpex') or [{}])[-1].get('close')) + ' 點', '部分', '櫃買公開端點僅短窗；未建立長期序列。')
    attach('P03', ['SPY', 'QQQ', 'SOXX'], 'SPY / QQQ / SOXX 調整後日價', '代理', 'ETF代理，不是SPX／NDX／SOX指數。')
    for id, key, label in [('P04', 'ma60', 'MA60 '), ('P05', 'slope60', 'MA60 5日斜率 '), ('P06', 'dev20', 'MA20乖離 '), ('P07', 'atr14', 'ATR14 '), ('P08', 'dd60', '60日回撤 '), ('P09', 'location', '收盤區間位置 '), ('P20', 'volratio', '成交值/前20日均值 '), ('V06', 'rv20', '20日年化實現波動 ')]:
        value = f.get(key)
        attach(id, ['taiex'], label + (pc(value) if id in ['P05', 'P06', 'P08', 'V06'] else n(value * 100) + '%' if id == 'P09' and value is not None else n(value)), '部分' if id in ['P05', 'P06', 'P09'] else '可觀測', '僅量化代理；反彈失敗、分位與後續承接需另外確認。' if id in ['P05', 'P06', 'P09'] else None)
    attach('P11', ['taiex'], '5日 ' + pc(f.get('r5')) + ' / 20日 ' + pc(f.get('r20')), '部分', '報酬代理，回測修復品質需完整情境。')
    attach('P12', ['2330', '2317', '2454', '2382', '2308', '3231'], '六檔科技觀察股', '代理', '觀察樣本不是完整產業等權指數。')
    attach('P13', ['taiex', 'tpex'], '加權／櫃買相對變化', '部分', '未取得歷史成分等權指數。')
    b = (data.get('market') or {}).get('breadth')
    attach('P14', ['market'], f"上漲 {b['up']} / 下跌 {b['down']} / 持平 {b['flat']}" if b else None, '部分', '僅最新盤後廣度，未建連續AD。')
    attach('P17', ['market'], f"跌停 {b['limit_down']} 家" if b else None, '可觀測', '收盤跌停不代表全天鎖死。')
    dtv = data.get('daytrade')
    attach('P21', ['daytrade'], f"股數占比 {n(dtv.get('volume_share'))}%" if dtv else None)
    attach('L01', ['margin_official', 'margin'], n(f.get('margin')) + ' 億元')
    attach('L02', ['margin'], '5日 ' + pc(f.get('margin5')) + ' / 20日 ' + pc(f.get('margin20')))
    attach('L09', ['institutions'], '外資／投信／自營現貨淨買賣超')
    attach('L10', ['futures'], '分契約法人淨OI', '部分', '截至來源實際日期，規模不同不得加總。')
    p = data.get('putcall') or []
    attach('L12', ['putcall'], f"成交 {n(p[-1]['volume'])}% / OI {n(p[-1]['oi'])}%" if p else None)
    attach('L15', ['fx'], 'USD/JPY 參考匯率', '代理', '匯率不能證明carry unwind；無CFTC部位與私人槓桿。')
    for id, key, value in [('V01', 'vix', n(f.get('vix'))), ('V02', 'vix', '252日分位 ' + (n(f.get('vix_pct') * 100) + '%' if f.get('vix_pct') is not None else '—')), ('V03', 'vix3m', 'VIX/VIX3M ' + n(f.get('vixratio'))), ('V04', 'vvix', 'VVIX ' + n((data.get('vvix') or [{}])[-1].get('value')))]:
        attach(id, [key], value, '部分' if id == 'V04' else '可觀測', 'VVIX已接通，VIX9D未接通。' if id == 'V04' else None)
    attach('F01', ['revenue'], '上市公司最新月營收與YoY', '部分', '原始營收單位仟元；本次不做跨月持續性推論。')
    attach('F03', ['news'], '最新重大訊息', '部分', '原文公告可查；未做擴產投產時程與供給量結構化。')
    attach('F08', ['valuations'], '上市公司PE / PB / 殖利率', '部分', '本益比為歷史口徑；無forward EPS與券商共識。')
    attach('F09', ['news'], '公司公告檢索', '部分', '原文不等於AI需求已驗證，需人工閱讀。')
    attach('F10', ['news'], '重大訊息與政策相關公告', '部分', '尚無全球政府政策完整事件庫。')
    attach('F12', ['treasury'], '美債2 / 10 / 30年殖利率', '部分', '未接Fed政策利率與修訂版本。')
    attach('F14', ['fx'], 'USD/TWD / USD/JPY 參考匯率')
    return out

def collect(mode='full'):
    existing_snap = {}
    if OUTPUT_FILE.exists():
        try:
            existing_snap = json.loads(OUTPUT_FILE.read_text(encoding='utf-8'))
        except Exception:
            existing_snap = {}

    existing_data = existing_snap.get('data', {})
    existing_sources_dict = {s['id']: s for s in existing_snap.get('sources', [])}

    tasks = []
    # Mode: intraday (盤中即時報價，每 10 分鐘，09:00-13:30)
    # Mode: daily_close (每日台股收盤後，更新日線、融資、三大法人、當沖、估值、營收、新聞等)
    # Mode: us_close (每日美股收盤後，更新 VIX、美債、美股 ETF)
    # Mode: full (全量更新)

    year = now().year

    # 1. 盤中價格（即時行情）
    if mode in ['intraday', 'full']:
        tasks.append(('quote', '台股盤中指數', 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_t00.tw%7Cotc_o00.tw&json=1&delay=0', quotes, '盤中報價（來源時間為準）', '交易日 09:00–13:30 每 10 分鐘'))

    # 2. 台股日頻與盤後資料
    if mode in ['daily_close', 'full']:
        tasks.extend([
            ('fmt', '證交所日成交', 'https://openapi.twse.com.tw/v1/exchangeReport/FMTQIK', fmt, '盤後日頻'),
            ('taiex', 'FinMind 加權歷史', fm('TaiwanStockPrice', 'TAIEX'), fin_prices, '盤後日頻'),
            ('margin', 'FinMind 融資歷史', fm('TaiwanStockTotalMarginPurchaseShortSale'), margin_parse, '盤後日頻'),
            ('tpex', '櫃買指數', 'https://www.tpex.org.tw/openapi/v1/tpex_index', tpex, '盤後日頻'),
            ('putcall', '期交所 Put/Call', 'https://openapi.taifex.com.tw/v1/PutCallRatio', putcall, '盤後日頻'),
            ('fx', '期交所參考匯率', 'https://openapi.taifex.com.tw/v1/DailyForeignExchangeRates', fx, '日參考匯率'),
            ('futures', '法人期貨淨部位', 'https://openapi.taifex.com.tw/v1/MarketDataOfMajorInstitutionalTradersDetailsOfFuturesContractsBytheDate', futures, '盤後日頻'),
            ('valuations', '上市估值', 'https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL', valuations, '盤後日頻'),
            ('revenue', '上市月營收', 'https://openapi.twse.com.tw/v1/opendata/t187ap05_L', revenue_parse, '每月發布'),
            ('news', '上市重大訊息', 'https://openapi.twse.com.tw/v1/opendata/t187ap04_L', news_parse, '公告發布時更新')
        ])
        for k in ['2330', '2317', '2454', '2382', '2308', '3231']:
            tasks.append((k, k + ' 台股歷史', fm('TaiwanStockPrice', k, 180), fin_prices, '盤後日頻'))

    # 3. 美股、VIX、美債
    if mode in ['us_close', 'full']:
        for k in ['vix', 'vix3m', 'vvix']:
            tasks.append((k, 'Cboe ' + k.upper(), f'https://cdn-api.cboe.com/api/global/us_indices/daily_prices/{k.upper()}_History.csv', cboe, '美國盤後日頻', '美股收盤後 06:00'))
        for k in ['SPY', 'QQQ', 'SOXX']:
            tasks.append((k, k + ' ETF歷史', fm('USStockPrice', k, 500), lambda b: fin_prices(b, True), '美國盤後日頻', '美股收盤後 06:00'))
        tasks.append(('treasury', '美國財政部殖利率', f'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value={year}', treasury, '美國盤後日頻', '美股收盤後 06:00'))

    print(f"[{now().isoformat()}] Running mode '{mode}', fetching {len(tasks)} sources...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        fetched_sources = list(pool.map(lambda t: fetch(t[0], t[1], t[2], t[3], t[4], existing_sources_dict.get(t[0]), t[5] if len(t) > 5 else '交易日 15:30 盤後'), tasks))

    # Merge fetched sources with existing sources
    merged_sources_map = dict(existing_sources_dict)
    for s in fetched_sources:
        merged_sources_map[s['id']] = s

    merged_data = dict(existing_data)
    for s in fetched_sources:
        if s['data'] is not None:
            merged_data[s['id']] = s['data']

    # If daily_close or full, also query TWSE special exchangeReport tables if latest date is present
    if mode in ['daily_close', 'full']:
        latest = max((r['date'] for k in ['fmt', 'taiex'] for r in (merged_data.get(k) or [])), default=None)
        if latest:
            ds = latest.replace('-', '')
            more = [
                ('market', '證交所股票廣度與產業', f'https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date={ds}&type=ALLBUT0999', market, '盤後日頻'),
                ('margin_official', '證交所融資本金', f'https://www.twse.com.tw/exchangeReport/MI_MARGN?response=json&date={ds}&selectType=ALL', marginofficial, '盤後日頻'),
                ('institutions', '證交所三大法人', f'https://www.twse.com.tw/fund/BFI82U?response=json&dayDate={ds}&type=day', institutions, '盤後日頻'),
                ('daytrade', '證交所當沖統計', f'https://www.twse.com.tw/exchangeReport/TWTB4U?response=json&date={ds}&selectType=All', daytrade, '盤後日頻')
            ]
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
                extra = list(pool.map(lambda t: fetch(t[0], t[1], t[2], t[3], t[4], existing_sources_dict.get(t[0]), t[5] if len(t) > 5 else '交易日 15:30 盤後'), more))
            for s in extra:
                merged_sources_map[s['id']] = s
                if s['data'] is not None:
                    merged_data[s['id']] = s['data']

    sources_list = list(merged_sources_map.values())
    f = features(merged_data)
    f['calendar_age_days'] = (now().date() - dt.date.fromisoformat(f['date'])).days if f.get('date') else None
    factors = factor_rows(merged_data, sources_list, f)

    for factor in factors:
        fs = factor.get('sources', [])
        factor.update(
            published_at=None,
            known_at=None,
            retrieved_at=max((s['retrieved_at'] for s in fs if s.get('retrieved_at')), default=None),
            source_url=[s['url'] for s in fs],
            unit={'P': '依來源：點／%／家／億元', 'L': '依來源：億元／口／%', 'V': '指數點／比率／%', 'F': '依來源：仟元／倍／%／匯率'}[factor['id'][0]],
            universe='台股為主；美股與全球風險為背景',
            frequency='依來源發布頻率',
            vintage_status='current-provider-history' if fs else 'unknown'
        )

    meta = [{k: v for k, v in s.items() if k not in ['data']} for s in sources_list]
    snap = {
        'asof': iso(),
        'timezone': 'Asia/Taipei',
        'mode': 'online',
        'update_mode': mode,
        'data': merged_data,
        'features': f,
        'factors': factors,
        'sources': meta,
        'refresh_seconds': 60
    }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps(snap, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"[{now().isoformat()}] Snapshot successfully written to {OUTPUT_FILE} ({len(json.dumps(snap))} bytes)")
    return snap

def main():
    p = argparse.ArgumentParser(description="TW Market Snapshot Collector")
    p.add_argument('--mode', choices=['intraday', 'daily_close', 'us_close', 'full'], default='full', help='Update mode')
    args = p.parse_args()
    collect(mode=args.mode)

if __name__ == '__main__':
    main()
