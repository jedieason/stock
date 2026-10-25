"""Source-defined discovery universe, independent of recent returns.

TW: all listed/OTC ordinary companies + TPEx product/value-chain memberships.
US: Nasdaq screener industries, with an explicit investability prefilter.
Only public company identity and industry fields are retained.
"""
import concurrent.futures
import gzip
import hashlib
from html.parser import HTMLParser
import json
import pathlib
import re
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
TRANSLATIONS = json.loads((ROOT / 'scripts/nasdaq-industries-zh.json').read_text())
UNIVERSE_FILE = ROOT / 'data/rotation-universe.json.gz'
URLS = dict(twse='https://openapi.twse.com.tw/v1/opendata/t187ap03_L', tpex='https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O', nasdaq='https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=0&download=true', chain='https://ic.tpex.org.tw/introduce.php?ic=J000')
INDUSTRIES = {'01':'水泥','02':'食品','03':'塑膠','04':'紡織纖維','05':'電機機械','06':'電器電纜','07':'化學','08':'玻璃陶瓷','09':'造紙','10':'鋼鐵','11':'橡膠','12':'汽車','14':'建材營造','15':'航運','16':'觀光餐旅','17':'金融保險','18':'貿易百貨','20':'其他','21':'化學','22':'生技醫療','23':'油電燃氣','24':'半導體','25':'電腦週邊','26':'光電','27':'通信網路','28':'電子零組件','29':'電子通路','30':'資訊服務','31':'其他電子','32':'文化創意','33':'農業科技','34':'電子商務','35':'綠能環保','36':'數位雲端','37':'運動休閒','38':'居家生活'}


def read_json(path):
    opener = gzip.open if str(path).endswith('.gz') else open
    with opener(path, 'rt', encoding='utf-8') as stream:
        return json.load(stream)


def write_json(path, value):
    body = json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    # Deterministic gzip prevents unchanged snapshots creating new Git blobs.
    path.write_bytes(gzip.compress(body, mtime=0) if str(path).endswith('.gz') else body)


def get(url):
    request = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0 (Industry Research Dashboard)', 'Accept':'application/json,text/html,*/*'})
    with urllib.request.urlopen(request, timeout=25) as response:
        return response.read().decode('utf-8-sig')


class ChainParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.families, self.nodes, self.divs = {}, {}, []
        self.option = None
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'option':
            self.option = a.get('value')
        if tag == 'div':
            node = a.get('id', '')
            node = node.removeprefix('companyList_') if node.startswith('companyList_') else None
            self.divs.append(node)
            if node:
                self.nodes.setdefault(node, dict(name=a.get('title', node), codes=set()))
        if tag == 'a':
            match = re.search(r'^company_basic\.php\?stk_code=(\d{4,6})$', a.get('href', ''))
            active = next((n for n in reversed(self.divs) if n), None)
            if active and match:
                self.nodes[active]['codes'].add(match[1])
    def handle_endtag(self, tag):
        if tag == 'option': self.option = None
        if tag == 'div' and self.divs: self.divs.pop()
    def handle_data(self, data):
        if self.option and data.strip(): self.families[self.option] = data.strip()


def tw_companies(twse, tpex):
    companies = {}
    for source, rows, code, name, industry, suffix in [
        ('twse', twse, '公司代號', '公司簡稱', '產業別', '.TW'),
        ('tpex', tpex, 'SecuritiesCompanyCode', 'CompanyAbbreviation', 'SecuritiesIndustryCode', '.TWO')]:
        for row in rows:
            symbol = row.get(code, '').strip()
            if not re.fullmatch(r'\d{4}', symbol): continue
            companies[symbol] = dict(symbol=symbol + suffix, name=row.get(name, symbol).strip(), exposure=INDUSTRIES.get(row.get(industry), '其他'), industry=row.get(industry), source=URLS[source])
    if len(companies) < 1500: raise ValueError('上市櫃公司母體異常縮小')
    return companies


def tw_groups(companies, pages):
    groups = []
    for family, family_name, parser in pages:
        parent_members = set()
        for node, data in parser.nodes.items():
            codes = sorted(c for c in data['codes'] if c in companies)
            parent_members.update(codes)
            if not codes: continue
            groups.append(dict(id='chain_' + node, name=family_name + '／' + data['name'], family=family_name, origin='tpex-chain', members=[dict(companies[c], exposure=data['name']) for c in codes], sources=['https://ic.tpex.org.tw/introduce.php?ic=' + family], note='櫃買中心產業價值鏈產品／服務分類；公司可跨鏈，業務關聯不等於營收純度。'))
        if parent_members:
            groups.append(dict(id='chain_' + family, name=family_name, family=family_name, origin='tpex-chain', members=[companies[c] for c in sorted(parent_members)], sources=['https://ic.tpex.org.tw/introduce.php?ic=' + family], note='櫃買中心產業價值鏈的上市櫃成分聯集；含上下游，多角化公司可跨鏈。'))
    # A broad exchange-classification backstop also covers companies not in a chain.
    for code in sorted({c['industry'] for c in companies.values()}):
        members = [c for c in companies.values() if c['industry'] == code]
        name = INDUSTRIES.get(code, '其他 ' + str(code))
        groups.append(dict(id='tw_industry_' + code, name=name + '（交易所分類）', family=name, origin='exchange-industry', members=members, sources=[URLS['twse'], URLS['tpex']], note='交易所寬分類，補足價值鏈未分類公司；仍以普通股等權計算，非類股指數。'))
    # Identical memberships add no independent evidence; retain the first source label.
    unique = {}
    for group in groups:
        cohort = tuple(sorted(m['symbol'] for m in group['members']))
        unique.setdefault(cohort, group)
    return list(unique.values())


def us_groups(rows):
    groups, total = {}, 0
    for row in rows:
        symbol, name = row.get('symbol', ''), row.get('name', '')
        if not re.fullmatch(r'[A-Z][A-Z0-9.-]{0,9}', symbol): continue
        if re.search(r'Preferred|Warrants?|Rights|\bUnits?\b|Depositary Shares Each|Acquisition', name, re.I): continue
        total += 1
        try:
            cap = float(row.get('marketCap') or 0)
            price = float(row.get('lastsale', '0').replace('$', '').replace(',', '') or 0)
            volume = float(row.get('volume') or 0)
        except ValueError: continue
        # A transparent size/price/liquidity scope, never a return ranking.
        if cap < 300e6 or price < 2 or price * volume < 5e6 or not row.get('industry'): continue
        industry = row['industry']
        group = groups.setdefault(industry, dict(id='nasdaq_' + hashlib.sha1(industry.encode()).hexdigest()[:12], name=industry, family=row.get('sector') or 'Other', origin='nasdaq-industry', members=[], sources=[URLS['nasdaq']], note='Nasdaq Screener 產業分類；非所有美股，母體先經市值／價格／當日成交額篩選，另以 20 日均成交額驗證。'))
        group['members'].append(dict(symbol=symbol.replace('.', '-'), name=name.replace(' Common Stock', '').replace(' Ordinary Shares', '').strip(), exposure=industry))
    if len(groups) < 80: raise ValueError('Nasdaq 產業母體異常縮小')
    return list(groups.values()), total


def localize(result):
    for group in result.get('us', {}).get('groups', []):
        original = group.get('source_name', group['name'])
        group['source_name'] = original
        group['name'] = TRANSLATIONS.get(original.strip(), original)
    return result


def refresh_universe(current, path=UNIVERSE_FILE):
    try: previous = read_json(path)
    except (FileNotFoundError, ValueError, OSError): previous = {}
    age = (current.date() - __import__('datetime').date.fromisoformat(previous['retrieved_at'][:10])).days if previous.get('retrieved_at') else 999
    if 0 <= age < 7: return localize(previous)
    result = dict(previous)
    result['status'] = 'ok'
    errors = []
    # Keep markets independent: one provider failure cannot discard the other market.
    try:
        twse, tpex, root = get(URLS['twse']), get(URLS['tpex']), get(URLS['chain'])
        companies = tw_companies(json.loads(twse), json.loads(tpex))
        base = ChainParser(); base.feed(root)
        if len(base.families) < 30: raise ValueError('價值鏈產業目錄不足')
        def load(item):
            code, name = item
            p = ChainParser(); p.feed(root if code == 'J000' else get('https://ic.tpex.org.tw/introduce.php?ic=' + code))
            if not p.nodes: raise ValueError('價值鏈沒有公司分類：' + code)
            return code, name, p
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            pages = list(pool.map(load, base.families.items()))
        groups = tw_groups(companies, pages)
        result['tw'] = dict(groups=groups, listed_stocks=len(companies), requested_stocks=len({m['symbol'] for g in groups for m in g['members']}), family_count=len(pages), retrieved_at=current.isoformat(), status='ok', source_urls=[URLS['twse'], URLS['tpex'], 'https://ic.tpex.org.tw/'])
    except Exception as ex:
        errors.append('tw: ' + str(ex)[:160])
        result['tw'] = {**previous.get('tw', {}), 'status':'stale', 'error':str(ex)[:160]}
    try:
        payload = json.loads(get(URLS['nasdaq']))
        groups, listed = us_groups(payload['data']['rows'])
        result['us'] = dict(groups=groups, listed_stocks=listed, requested_stocks=len({m['symbol'] for g in groups for m in g['members']}), family_count=len({g['family'] for g in groups}), retrieved_at=current.isoformat(), status='ok', source_urls=[URLS['nasdaq']], prefilter='普通股／ADR；市值 ≥ 3 億 USD、股價 ≥ 2 USD、當日成交額 ≥ 500 萬 USD，產業須有分類')
    except Exception as ex:
        errors.append('us: ' + str(ex)[:160])
        result['us'] = {**previous.get('us', {}), 'status':'stale', 'error':str(ex)[:160]}
    result.update(retrieved_at=current.isoformat() if not errors else previous.get('retrieved_at'), attempted_at=current.isoformat(), status='stale' if errors else 'ok', errors=errors)
    path.parent.mkdir(parents=True, exist_ok=True)
    localize(result)
    write_json(path, result)
    return result
