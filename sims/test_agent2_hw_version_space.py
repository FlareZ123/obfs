#!/usr/bin/env python3
"""Unit tests for the exact bounded Mealy version-space audit."""
from __future__ import annotations

import importlib.util
import itertools
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

    def test_z3_finds_two_state_strongly_connected_alternative(self):
        # Repeated input 0 is observed with outputs 0 and 1, forcing at least
        # two states. The target's initial state is uniquely trace-consistent,
        # but a different two-state minimal strongly connected machine matches
        # the trace and differs on the first future input 1.
        row = {
            "status": "completed",
            "state_count": 2,
            "seed": 2,
            "fixture_table": {
                "transitions": [[1, 0], [0, 1]],
                "outputs": [["0", "0"], ["1", "1"]],
                "initial_state": 0,
            },
            "observed_trace": [["0", "0"], ["1", "1"], ["0", "1"]],
            "target_post_trace_state": 0,
            "fixture_digest": "fixture-two-state-z3",
            "trace_digest": "trace-two-state-z3",
        }
        result = MODULE.audit_row(row, timeout_ms=5000)
        self.assertEqual(result["status"], "sat")
        witness = result["witness"]
        self.assertEqual(witness["witness_source"], "z3_candidate_machine")
        self.assertEqual(witness["candidate_state_count"], 2)
        self.assertEqual(result["candidate_size_search"]["unsat_sizes_before_witness"], [1])
        self.assertTrue(witness["candidate_trace_verified"])
        self.assertTrue(witness["candidate_minimal_verified"])
        self.assertTrue(witness["candidate_strongly_connected_verified"])
        self.assertEqual(witness["future_counterexample"], ["1"])
        self.assertNotEqual(
            witness["target_future_outputs"],
            witness["candidate_future_outputs"],
        )

    def test_z3_finds_three_state_strongly_connected_alternative(self):
        # Three occurrences of input prefix 00 have distinct output prefixes
        # (01, 10, 00), forcing at least three states. The target's initial
        # state is unique for this trace, but a distinct three-state minimal
        # strongly connected machine can match it and diverge in the future.
        row = {
            "status": "completed",
            "state_count": 3,
            "seed": 3,
            "fixture_table": {
                "transitions": [[1, 0], [2, 1], [0, 2]],
                "outputs": [["0", "0"], ["1", "0"], ["0", "1"]],
                "initial_state": 0,
            },
            "observed_trace": [["0", "0"], ["0", "1"], ["0", "0"], ["0", "0"]],
            "target_post_trace_state": 1,
            "fixture_digest": "fixture-three-state-z3",
            "trace_digest": "trace-three-state-z3",
        }
        result = MODULE.audit_row(row, timeout_ms=5000)
        self.assertEqual(result["status"], "sat")
        witness = result["witness"]
        self.assertEqual(witness["witness_source"], "z3_candidate_machine")
        self.assertEqual(witness["candidate_state_count"], 3)
        self.assertEqual(result["candidate_size_search"]["unsat_sizes_before_witness"], [1, 2])
        self.assertTrue(witness["candidate_trace_verified"])
        self.assertTrue(witness["candidate_minimal_verified"])
        self.assertTrue(witness["candidate_strongly_connected_verified"])
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

    def test_trace_prefix_output_conflicts_force_distinct_states(self):
        trace = [["0", "0"], ["0", "1"], ["1", "0"], ["0", "0"]]
        pairs = MODULE.trace_state_separation_pairs(trace, max_depth=1)
        self.assertIn((0, 1), pairs)
        self.assertNotIn((0, 2), pairs)

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

    def test_bfs_canonical_relabeling_is_complete_through_four_states(self):
        """Exhaustively check transition-only BFS canonical representative."""
        counts = {}
        for n in range(1, 5):
            reachable_count = canonical_count = 0
            for edges in itertools.product(range(n), repeat=2 * n):
                table = [list(edges[2 * state:2 * state + 2])
                         for state in range(n)]

                def bfs_relabel(t):
                    discovered = [0]
                    indexes = {0: 0}
                    for state in discovered:
                        for nxt in t[state]:
                            if nxt not in indexes:
                                indexes[nxt] = len(discovered)
                                discovered.append(nxt)
                    if len(discovered) != n:
                        return None
                    return [[indexes[t[old][0]], indexes[t[old][1]]]
                            for old in discovered]

                def is_bfs_canonical(t):
                    max_seen = 0
                    for state in range(n):
                        if state > max_seen:
                            return False
                        for nxt in t[state]:
                            if nxt > max_seen + 1:
                                return False
                            max_seen = max(max_seen, nxt)
                    return max_seen == n - 1

                normalized = bfs_relabel(table)
                if normalized is not None:
                    reachable_count += 1
                    self.assertTrue(is_bfs_canonical(normalized))
                if is_bfs_canonical(table):
                    canonical_count += 1
                    self.assertIsNotNone(normalized)
            counts[n] = reachable_count, canonical_count
        self.assertEqual(counts, {
            1: (1, 1), 2: (12, 12),
            3: (432, 216), 4: (31488, 5248),
        })

    def test_bfs_solver_preserves_known_sat_and_unsat_decisions(self):
        cases = [
            ({
                "status": "completed", "state_count": 2, "seed": 2,
                "fixture_table": {
                    "transitions": [[1, 0], [0, 1]],
                    "outputs": [["0", "0"], ["1", "1"]],
                    "initial_state": 0,
                },
                "observed_trace": [["0", "0"], ["1", "1"], ["0", "1"]],
                "target_post_trace_state": 0,
            }, "sat"),
            ({
                "status": "completed", "state_count": 1, "seed": 0,
                "fixture_table": {
                    "transitions": [[0, 0]],
                    "outputs": [["0", "1"]],
                    "initial_state": 0,
                },
                "observed_trace": [["0", "0"], ["1", "1"]],
                "target_post_trace_state": 0,
            }, "unsat"),
        ]
        for row, expected in cases:
            with self.subTest(states=row["state_count"], expected=expected):
                predecessor = MODULE.audit_row(
                    row, timeout_ms=5000, candidate_labeling="predecessor"
                )
                canonical = MODULE.audit_row(
                    row, timeout_ms=5000, candidate_labeling="bfs"
                )
                self.assertEqual(predecessor["status"], expected)
                self.assertEqual(canonical["status"], expected)
                if expected == "sat":
                    self.assertTrue(canonical["witness"]["candidate_trace_verified"])
                    self.assertTrue(canonical["witness"]["candidate_minimal_verified"])
                    self.assertTrue(canonical["witness"]["candidate_strongly_connected_verified"])
                    self.assertTrue(canonical["witness"]["future_counterexample"])

    def test_skips_rows_without_raw_evaluator_evidence(self):
        result = MODULE.audit_row({"status": "completed"}, timeout_ms=100)
        self.assertEqual(result["status"], "skipped")


if __name__ == "__main__":
    unittest.main(verbosity=2)
