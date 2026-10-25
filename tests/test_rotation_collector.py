import copy
import datetime as dt
import json
import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'scripts'))
import update_market as collector
from rotation_universe import read_json,write_json


class CollectorTests(unittest.TestCase):
    def test_rotation_only_rehydrates_compressed_snapshot_and_preserves_unrelated_market(self):
        root=pathlib.Path(__file__).resolve().parents[1]
        original=json.loads((root/'data/market.json').read_text())
        rotation=read_json(root/'data/rotation.json.gz')
        with tempfile.TemporaryDirectory() as directory:
            temp=pathlib.Path(directory);(temp/'data').mkdir()
            output=temp/'data/market.json';output.write_text(json.dumps(original))
            write_json(temp/'data/rotation.json.gz',rotation)
            with patch.object(collector,'ROOT',temp),patch.object(collector,'OUTPUT_FILE',output),patch.object(collector,'collect_rotation',return_value=rotation) as refresh,patch.object(collector,'features',side_effect=AssertionError('unrelated feature recalculation')):
                updated=collector.collect('rotation')
            self.assertEqual(refresh.call_args.args[1],rotation)
            self.assertEqual(updated['features'],original['features'])
            self.assertEqual(updated['factors'],original['factors'])
            self.assertEqual({k:v for k,v in updated['indicators'].items() if k!='10'},{k:v for k,v in original['indicators'].items() if k!='10'})
            self.assertEqual({k:v for k,v in updated['data'].items() if k!='theme_rotation'},{k:v for k,v in original['data'].items() if k!='theme_rotation'})
            self.assertEqual(updated['data']['theme_rotation']['snapshot_url'],'data/rotation.json.gz')
            self.assertEqual(read_json(temp/'data/rotation.json.gz'),rotation)

if __name__=='__main__':unittest.main()
