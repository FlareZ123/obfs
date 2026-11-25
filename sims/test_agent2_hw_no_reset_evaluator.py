#!/usr/bin/env python3
"""Unit tests for the no-reset hW benchmark's evaluator-only semantics."""
from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace


MODULE_PATH = Path(__file__).with_name("agent2-hw-no-reset-benchmark.py")
SPEC = importlib.util.spec_from_file_location("agent2_hw_no_reset_benchmark", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"cannot load benchmark module: {MODULE_PATH}")
BENCHMARK = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = BENCHMARK
SPEC.loader.exec_module(BENCHMARK)


def make_state(state_id, outputs):
    return SimpleNamespace(
        state_id=state_id,
        output_fun=dict(outputs),
        transitions={},
    )


def make_fixture_and_hypothesis(bad_post_trace: bool = False):
    fixture = BENCHMARK.Fixture(
        state_count=3,
        transitions=((1, 2), (1, 1), (2, 2)),
        outputs=(("0", "0"), ("1", "0"), ("1", "1")),
        initial_state=0,
        generation_attempts=1,
    )

    h_end = make_state("h-end", {"0": "1", "1": "0"})
    h_two = make_state("h-two", {"0": "1", "1": "1"})
    h_wrong = make_state("h-wrong", {"0": "1", "1": "1"})
    h_good = make_state("h-good", {"0": "0", "1": "0"})
    h_bad = make_state("h-bad", {"0": "0", "1": "1"})

    h_end.transitions.update({"0": h_end, "1": h_end})
    h_two.transitions.update({"0": h_two, "1": h_two})
    h_wrong.transitions.update({"0": h_wrong, "1": h_wrong})
    h_good.transitions.update({"0": h_end, "1": h_two})
    h_bad.transitions.update({
        "0": h_wrong if bad_post_trace else h_end,
        "1": h_two,
    })

    hypothesis = SimpleNamespace(states=[h_good, h_bad, h_end, h_two, h_wrong])
    trace = [("0", "0")]
    return fixture, hypothesis, trace


class EvaluatorTests(unittest.TestCase):
    def test_initial_ambiguity_can_still_identify_future_behavior(self):
        fixture, hypothesis, trace = make_fixture_and_hypothesis()
        result = BENCHMARK.evaluate_hypothesis(fixture, hypothesis, trace)

        self.assertEqual(result["candidate_count"], 2)
        self.assertTrue(result["ambiguous_initial_state"])
        self.assertFalse(result["attacker_initial_state_identified"])
        self.assertTrue(result["target_initial_behavior_present"])
        self.assertFalse(result["all_trace_candidates_initial_equivalent"])
        self.assertTrue(result["target_future_behavior_present"])
        self.assertTrue(result["all_trace_candidates_future_equivalent"])
        self.assertTrue(result["attacker_future_behavior_identified"])
        self.assertTrue(result["future_clone_success"])
        self.assertFalse(result["ambiguous_future_behavior"])

    def test_one_wrong_post_trace_candidate_blocks_future_clone(self):
        fixture, hypothesis, trace = make_fixture_and_hypothesis(
            bad_post_trace=True
        )
        result = BENCHMARK.evaluate_hypothesis(fixture, hypothesis, trace)

        self.assertEqual(result["candidate_count"], 2)
        self.assertTrue(result["target_future_behavior_present"])
        self.assertFalse(result["all_trace_candidates_future_equivalent"])
        self.assertFalse(result["future_clone_success"])
        self.assertTrue(result["ambiguous_future_behavior"])
        self.assertFalse(result["false_future_convergence"])

    def test_no_trace_consistent_candidate_is_not_false_convergence(self):
        fixture, hypothesis, _trace = make_fixture_and_hypothesis()
        result = BENCHMARK.evaluate_hypothesis(
            fixture, hypothesis, [("0", "not-the-observed-output")]
        )

        self.assertEqual(result["candidate_count"], 0)
        self.assertTrue(result["no_trace_matching_candidate"])
        self.assertFalse(result["future_clone_success"])
        self.assertFalse(result["false_future_convergence"])

    def test_fixture_and_trace_digests_are_stable_sha256(self):
        fixture, _hypothesis, trace = make_fixture_and_hypothesis()
        same_fixture, _same_hypothesis, same_trace = make_fixture_and_hypothesis()

        self.assertEqual(
            BENCHMARK.digest_fixture(fixture),
            BENCHMARK.digest_fixture(same_fixture),
        )
        self.assertEqual(BENCHMARK.digest_trace(trace), BENCHMARK.digest_trace(same_trace))
        self.assertEqual(len(BENCHMARK.digest_fixture(fixture)), 64)
        self.assertEqual(len(BENCHMARK.digest_trace(trace)), 64)

    def test_oracle_steps_are_a_subset_of_total_sul_steps(self):
        metrics = BENCHMARK.derive_step_metrics(1188, 720)

        self.assertEqual(metrics, {
            "steps_total": 1188,
            "steps_oracle": 720,
            "steps_non_oracle": 468,
        })

    def test_oracle_steps_cannot_exceed_total_steps(self):
        with self.assertRaises(ValueError):
            BENCHMARK.derive_step_metrics(10, 11)


if __name__ == "__main__":
    unittest.main(verbosity=2)
