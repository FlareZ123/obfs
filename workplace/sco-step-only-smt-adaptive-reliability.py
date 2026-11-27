"""Independent local regression tests for the offline SMT attacker research.

Run: python workplace/sco-step-only-smt-adaptive-reliability.py
Linux libz3.so.4 required. All model-equivalence checks use separate product BFS.
"""
import importlib.util
from pathlib import Path
import random
import unittest
from unittest.mock import patch

root=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('smt_adaptive',root/'sco-step-only-smt-adaptive.py')
adaptive=importlib.util.module_from_spec(spec)
spec.loader.exec_module(adaptive)


class AdaptiveReliability(unittest.TestCase):
    def test_minimized_model_preserves_current_and_initial_behavior(self):
        randomizer=random.Random(0x23675)
        for states in range(1,9):
            for _ in range(2000):
                machine={
                    'next':[[randomizer.randrange(states) for _ in (0,1)] for _ in range(states)],
                    'output':[[randomizer.randrange(2) for _ in (0,1)] for _ in range(states)],
                    'state':0
                }
                reduced=adaptive.minimize_reference(machine)
                self.assertGreaterEqual(len(reduced['next']),1)
                self.assertLessEqual(len(reduced['next']),states)
                self.assertTrue(adaptive.equivalent(machine,reduced))
                for _ in range(randomizer.randrange(50)):
                    symbol=randomizer.randrange(2)
                    original_state=machine['state']
                    compact_state=reduced['state']
                    self.assertEqual(machine['output'][original_state][symbol],
                                     reduced['output'][compact_state][symbol])
                    machine['state']=machine['next'][original_state][symbol]
                    reduced['state']=reduced['next'][compact_state][symbol]
                self.assertTrue(adaptive.equivalent(machine,reduced))

    def test_model_extraction_unknown_is_inconclusive(self):
        q={'smt2':'(set-option :produce-models true)\n(check-sat)\n',
           'valuesCommand':'(get-value (A_q_0))\n'}
        with patch.object(adaptive.checker,'z3',side_effect=[('sat\n',0.01),('unknown\n',0.02)]) as solver:
            status,answer,elapsed=adaptive.solve(q,500)
            self.assertEqual((status,answer),('unknown','unknown\n'))
            self.assertAlmostEqual(elapsed,0.03)
            self.assertEqual(solver.call_count,2)

    def test_unsat_skips_model_extraction(self):
        q={'smt2':'(set-option :produce-models true)\n(check-sat)\n',
           'valuesCommand':'(get-value (A_q_0))\n'}
        with patch.object(adaptive.checker,'z3',return_value=('unsat\n',0.01)) as solver:
            result=adaptive.solve(q,500)
            self.assertEqual(result[0],'unsat')
            self.assertEqual(solver.call_count,1)

    def test_sat_model_extraction_keeps_values(self):
        q={'smt2':'(set-option :produce-models true)\n(check-sat)\n',
           'valuesCommand':'(get-value (A_q_0))\n'}
        with patch.object(adaptive.checker,'z3',side_effect=[('sat\n',0.01),('sat\n((A_q_0 0))\n',0.02)]):
            status,answer,_=adaptive.solve(q,500)
            self.assertEqual(status,'sat')
            self.assertEqual(adaptive.parse_values(answer),{'A_q_0':0})


if __name__=='__main__':
    unittest.main(verbosity=2)
