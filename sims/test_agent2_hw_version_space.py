#!/usr/bin/env python3
"""Unit tests for the exact bounded Mealy version-space audit."""
from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("agent2-hw-version-space-audit.py")
SPEC = importlib.util.spec_from_file_location("agent2_hw_version_space_audit", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("could not load version-space audit module")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class VersionSpaceAuditTests(unittest.TestCase):
    def test_finds_minimal_strongly_connected_alternative_with_future_difference(self):
        # Target has two states. The public trace sees only state 0 on input 0.
        # A one-state candidate can reproduce that trace but emit 1 on input 1.
        row = {
            "status": "completed",
            "state_count": 2,
            "seed": 0,
            "fixture_table": {
                "transitions": [[0, 1], [0, 1]],
                "outputs": [["0", "0"], ["1", "1"]],
                "initial_state": 0,
            },
            "observed_trace": [["0", "0"], ["0", "0"], ["0", "0"]],
            "target_post_trace_state": 0,
            "fixture_digest": "fixture-test",
            "trace_digest": "trace-test",
        }
        result = MODULE.audit_row(row, timeout_ms=5000)
        self.assertEqual(result["status"], "sat")
        witness = result["witness"]
        self.assertEqual(witness["candidate_state_count"], 1)
        self.assertTrue(witness["candidate_trace_verified"])
        self.assertTrue(witness["candidate_minimal_verified"])
        self.assertTrue(witness["candidate_strongly_connected_verified"])
        self.assertTrue(witness["target_trace_verified"])
        self.assertTrue(witness["future_counterexample"])
        self.assertNotEqual(
            witness["target_future_outputs"],
            witness["candidate_future_outputs"],
        )

    def test_finds_alternate_initial_state_inside_target_machine(self):
        # Both target states emit 0 on input 0 and loop there, so the same
        # public trace is consistent with either initial state. Input 1
        # distinguishes their post-trace behavior.
        row = {
            "status": "completed",
            "state_count": 2,
            "seed": 1,
            "fixture_table": {
                "transitions": [[0, 1], [1, 0]],
                "outputs": [["0", "0"], ["0", "1"]],
                "initial_state": 0,
            },
            "observed_trace": [["0", "0"], ["0", "0"]],
            "target_post_trace_state": 0,
            "fixture_digest": "fixture-alternate-start",
            "trace_digest": "trace-alternate-start",
        }
        result = MODULE.audit_row(row, timeout_ms=5000)
        self.assertEqual(result["status"], "sat")
        witness = result["witness"]
        self.assertEqual(
            witness["witness_source"],
            "same_target_machine_with_alternate_initial_state",
        )
        self.assertEqual(witness["candidate_initial_state"], 1)
        self.assertEqual(witness["candidate_post_trace_state"], 1)
        self.assertEqual(witness["future_counterexample"], ["1"])
        self.assertNotEqual(
            witness["target_future_outputs"],
            witness["candidate_future_outputs"],
        )

    def test_unsat_when_one_state_trace_fixes_all_future_outputs(self):
        # With one target state, observing both input/output pairs fixes every
        # possible future output of every one-state candidate.
        row = {
            "status": "completed",
            "state_count": 1,
            "seed": 0,
            "fixture_table": {
                "transitions": [[0, 0]],
                "outputs": [["0", "1"]],
                "initial_state": 0,
            },
            "observed_trace": [["0", "0"], ["1", "1"]],
            "target_post_trace_state": 0,
            "fixture_digest": "fixture-singleton",
            "trace_digest": "trace-singleton",
        }
        result = MODULE.audit_row(row, timeout_ms=5000)
        self.assertEqual(result["status"], "unsat")
        self.assertEqual(result["candidate_size_search"]["unsat_sizes"], [1])

    def test_minimization_preserves_strong_connectivity_and_state_mapping(self):
        transitions = [[1, 0], [0, 1]]
        outputs = [[0, 0], [0, 0]]
        minimized = MODULE.minimize_mealy(transitions, outputs, 0, 1)
        new_transitions, new_outputs, initial, post, _partition = minimized
        self.assertEqual(len(new_transitions), 1)
        self.assertEqual(new_transitions, [[0, 0]])
        self.assertEqual(new_outputs, [[0, 0]])
        self.assertEqual(initial, 0)
        self.assertEqual(post, 0)
        self.assertTrue(MODULE.is_strongly_connected(new_transitions))
        self.assertTrue(MODULE.is_minimal_mealy(new_transitions, new_outputs))

    def test_skips_rows_without_raw_evaluator_evidence(self):
        result = MODULE.audit_row({"status": "completed"}, timeout_ms=100)
        self.assertEqual(result["status"], "skipped")


if __name__ == "__main__":
    unittest.main(verbosity=2)
