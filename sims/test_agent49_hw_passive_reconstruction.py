#!/usr/bin/env python3
"""Adversarial controls for solver-free public-trace finite-state certificates."""
import copy
import itertools
import random
import unittest

import agent49_hw_passive_reconstruction as P


def replay(transitions, outputs, initial, inputs):
    state = initial
    trace = []
    for a in inputs:
        trace.append([str(a), str(outputs[state][a])])
        state = transitions[state][a]
    return trace, state


def future_difference(left_d, left_o, left_s, right_d, right_o, right_s):
    """Independently decide future output equivalence by product BFS."""
    seen = set()
    todo = [(left_s, right_s)]
    while todo:
        a, b = todo.pop()
        if (a, b) in seen:
            continue
        seen.add((a, b))
        for letter in range(2):
            if left_o[a][letter] != right_o[b][letter]:
                return True
            todo.append((left_d[a][letter], right_d[b][letter]))
    return False


class PublicPassiveReconstructionTests(unittest.TestCase):
    def test_two_state_full_table_and_tampered_witness_refusal(self):
        inputs = list(map(int, "11011111100100101001101110111000101101000001001101"))
        delta = [[1, 0], [0, 1]]
        outputs = [[0, 1], [1, 0]]
        trace, post = replay(delta, outputs, 0, inputs)
        proof = P.derive_certificate(trace, 12)
        self.assertEqual(proof["observational_state_lower_bound"], 2)
        self.assertTrue(proof["bounded_future_uniqueness_certified"])
        self.assertTrue(P.verify_public_certificate(trace, proof))
        reconstructed = proof["reconstruction"]
        self.assertEqual(reconstructed["known_transitions"], 4)
        self.assertEqual(reconstructed["known_outputs"], 4)
        self.assertEqual(
            len({post for _, post in reconstructed["matching_initial_post_states"]}),
            1,
        )
        row = {
            "state_count": 2, "target_post_trace_state": post,
            "observed_trace": trace,
            "fixture_table": {
                "transitions": delta, "outputs": outputs, "initial_state": 0,
            },
        }
        self.assertTrue(P.verify_reconstruction_against_private_fixture(row, proof))
        tampered = copy.deepcopy(proof)
        tampered["reconstruction"]["transitions"][0][0] ^= 1
        with self.assertRaises(AssertionError):
            P.verify_public_certificate(trace, tampered)

    def test_unobserved_one_input_edges_cannot_be_called_unique(self):
        delta = [[1, 0], [0, 1]]
        outputs = [[0, 1], [1, 0]]
        trace, _ = replay(delta, outputs, 0, [0] * 20)
        proof = P.derive_certificate(trace, 12)
        self.assertEqual(proof["observational_state_lower_bound"], 2)
        self.assertFalse(proof["bounded_future_uniqueness_certified"])

    def test_nonbinary_observation_refused(self):
        with self.assertRaises(ValueError):
            P.derive_certificate([["0", "1"], ["2", "0"]], 4)

    def test_exhaustive_small_model_family_against_all_matching_futures(self):
        # 4 one-state and 512 two-state machine/initial-state combinations.
        all_models = []
        for n in (1, 2):
            for flat_d in itertools.product(range(n), repeat=2 * n):
                delta = [list(flat_d[2*i:2*i+2]) for i in range(n)]
                for flat_o in itertools.product((0, 1), repeat=2 * n):
                    outputs = [list(flat_o[2*i:2*i+2]) for i in range(n)]
                    for initial in range(n):
                        all_models.append((delta, outputs, initial))
        self.assertEqual(len(all_models), 516)
        rng = random.Random(0xA49C0)
        positive = 0
        for sample in range(24):
            delta, outputs, initial = rng.choice(all_models)
            inputs = [rng.randrange(2) for _ in range(45)]
            trace, post = replay(delta, outputs, initial, inputs)
            proof = P.derive_certificate(trace, 10)
            if not proof["bounded_future_uniqueness_certified"]:
                continue
            positive += 1
            self.assertTrue(P.verify_public_certificate(trace, proof))
            limit = proof["observational_state_lower_bound"]
            for cd, co, ci in all_models:
                if len(cd) > limit:
                    continue
                candidate_trace, candidate_post = replay(cd, co, ci, inputs)
                if candidate_trace != trace:
                    continue
                self.assertFalse(future_difference(
                    delta, outputs, post, cd, co, candidate_post,
                ), msg=f"false certificate on sample {sample}")
        self.assertGreaterEqual(positive, 5)

    def test_all_140484_three_state_or_smaller_candidates(self):
        # Exact independent exhaustive oracle: 4+512+3^6*2^6*3=140,484.
        delta = [[1, 2], [2, 0], [0, 1]]
        outputs = [[0, 1], [1, 0], [0, 0]]
        rng = random.Random(0)
        inputs = [rng.randrange(2) for _ in range(150)]
        trace, target_post = replay(delta, outputs, 0, inputs)
        proof = P.derive_certificate(trace, 12)
        self.assertEqual(proof["observational_state_lower_bound"], 3)
        self.assertTrue(proof["bounded_future_uniqueness_certified"])
        self.assertTrue(P.verify_public_certificate(trace, proof))
        candidates = matches = 0
        for n in (1, 2, 3):
            for flat_d in itertools.product(range(n), repeat=2 * n):
                cd = [list(flat_d[2*i:2*i+2]) for i in range(n)]
                for flat_o in itertools.product((0, 1), repeat=2 * n):
                    co = [list(flat_o[2*i:2*i+2]) for i in range(n)]
                    for initial in range(n):
                        candidates += 1
                        candidate_trace, candidate_post = replay(cd, co, initial, inputs)
                        if candidate_trace != trace:
                            continue
                        matches += 1
                        self.assertFalse(future_difference(
                            delta, outputs, target_post, cd, co, candidate_post,
                        ))
        self.assertEqual(candidates, 140484)
        self.assertEqual(matches, 6)


if __name__ == "__main__":
    unittest.main(verbosity=2)
