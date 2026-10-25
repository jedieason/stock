import pathlib
import sys
import unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'scripts'))
from rotation_universe import ChainParser, tw_groups, us_groups


class UniverseTests(unittest.TestCase):
    def test_value_chain_membership_finds_passives_without_a_curated_theme(self):
        parser = ChainParser()
        parser.feed('''<select><option value="J000">被動元件</option></select>
          <div id="companyList_J500" title="電阻器"><div><a href="company_basic.php?stk_code=2327">國巨</a><a href="company_basic.php?stk_code=2492">華新科</a></div></div>
          <div id="companyList_J600" title="電容器"><a href="company_basic.php?stk_code=2327">國巨</a><a href="company_basic.php?stk_code=6173">信昌電</a><a href="company_basic.php?stk_code=9999">非上市櫃</a></div>
          <noscript><div id="companyList_J500" title="電阻器"><a href="company_basic.php?stk_code=2327">國巨</a></div></noscript>''')
        companies = {s:dict(symbol=s + '.TW', name=s, industry='28') for s in ['2327','2492','6173','8888']}
        groups = tw_groups(companies, [('J000','被動元件',parser)])
        parent = next(g for g in groups if g['id'] == 'chain_J000')
        self.assertEqual({m['symbol'] for m in parent['members']}, {'2327.TW','2492.TW','6173.TW'})
        self.assertEqual(len(parser.nodes['J500']['codes']), 2)
        all_symbols = {m['symbol'] for g in groups for m in g['members']}
        self.assertIn('8888.TW', all_symbols)  # Exchange backstop retains unchained stocks.
        self.assertNotIn('9999.TW', all_symbols)

    def test_nasdaq_membership_uses_investability_not_performance(self):
        rows = [dict(symbol='S' + str(i), name='Company Common Stock', marketCap='500000000', lastsale='$10', volume='1000000', industry='Industry ' + str(i), sector='Sector', pctchange='-99%') for i in range(81)]
        groups, total = us_groups(rows)
        self.assertEqual(len(groups), 81)
        self.assertEqual(total, 81)
        rows += [dict(rows[0], symbol='TINY', marketCap='1000'), dict(rows[0], symbol='PREF', name='Company Preferred Stock')]
        changed, _ = us_groups(rows)
        self.assertEqual({m['symbol'] for g in changed for m in g['members']}, {m['symbol'] for g in groups for m in g['members']})
        for r in rows:r['pctchange']='99%'
        same, _ = us_groups(rows)
        self.assertEqual(changed, same)

if __name__ == '__main__': unittest.main()
