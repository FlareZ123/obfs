#!/usr/bin/env python3
"""Public-trace-only certified state lower bound for deterministic Mealy oracles.

This is an evaluator-side forensic tool; it does not access any protected
server endpoint. The certificate itself is checkable from the observed public
input/output trace, independent of a hidden target state assignment, target
state count, or Z3 solver.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def trace_output_diversity_state_lower_bound(trace, max_depth: int = 12):
    """Certified lower bound from fixed input words with distinct outputs.

    In a deterministic Mealy machine, a given input word has precisely one
    output word from each start state. Hence if the *same* input word occurs
    in the public no-reset trace with m distinct output words, any machine
    reproducing that trace must have at least m states. This never uses the
    held-out target table or an inferred state assignment.

    The certificate contains one trace index for each distinct output word;
    reviewers can validate it directly from the public input/output trace.
    Depth is bounded for predictable O(depth * trace_length) work and memory.
    """
    if max_depth < 1:
        raise ValueError("max_depth must be positive")
    if not trace:
        return {
            "minimum_states": 1, "depth": 0, "input_word": "",
            "output_witnesses": [],
        }
    bits = []
    for i, pair in enumerate(trace):
        if len(pair) != 2 or str(pair[0]) not in ("0", "1") or str(pair[1]) not in ("0", "1"):
            raise ValueError(f"nonbinary public Mealy trace at index {i}")
        bits.append((int(pair[0]), int(pair[1])))
    best_count = 1
    best_depth = 1
    best_input_word = 0
    best_witnesses = {bits[0][1]: 0}
    for depth in range(1, min(max_depth, len(bits)) + 1):
        mask = (1 << depth) - 1
        input_word = 0
        output_word = 0
        # input-pattern -> (output-pattern -> first trace index)
        groups = {}
        for index, (input_bit, output_bit) in enumerate(bits):
            input_word = ((input_word << 1) | input_bit) & mask
            output_word = ((output_word << 1) | output_bit) & mask
            if index + 1 < depth:
                continue
            outputs = groups.setdefault(input_word, {})
            if output_word not in outputs:
                outputs[output_word] = index - depth + 1
                if len(outputs) > best_count:
                    best_count = len(outputs)
                    best_depth = depth
                    best_input_word = input_word
                    best_witnesses = outputs.copy()
    return {
        "minimum_states": best_count,
        "depth": best_depth,
        "input_word": format(best_input_word, f"0{best_depth}b"),
        "output_witnesses": [
            {"output_word": format(output_word, f"0{best_depth}b"),
             "start_index": start_index}
            for output_word, start_index in sorted(best_witnesses.items())
        ],
    }


def verify_trace_diversity_certificate(trace, certificate):
    """Reject any certificate not reproduced by public trace slices."""
    bound = certificate["minimum_states"]
    depth = certificate["depth"]
    word = certificate["input_word"]
    witnesses = certificate["output_witnesses"]
    if bound < 1 or (trace and depth < 1) or len(word) != depth:
        raise AssertionError("invalid state-count certificate")
    if len(witnesses) != bound and trace:
        raise AssertionError("incorrect witness count")
    found_outputs = set()
    for witness in witnesses:
        start = witness["start_index"]
        if not isinstance(start, int) or start < 0 or start + depth > len(trace):
            raise AssertionError("witness index out of trace bounds")
        actual = trace[start:start + depth]
        if "".join(str(pair[0]) for pair in actual) != word:
            raise AssertionError("state-count certificate input mismatch")
        outputs = "".join(str(pair[1]) for pair in actual)
        if outputs != witness["output_word"] or outputs in found_outputs:
            raise AssertionError("state-count certificate output mismatch")
        found_outputs.add(outputs)
    return True


def verify_hidden_fixture_consistency(row, certificate):
    """Evaluator-only check that certificate witnesses start at distinct states."""
    fixture = row["fixture_table"]
    trace = row["observed_trace"]
    state = int(fixture["initial_state"])
    states = []
    for letter, output in trace:
        states.append(state)
        a = int(letter)
        if str(fixture["outputs"][state][a]) != str(output):
            raise AssertionError("fixture output differs from archived public trace")
        state = int(fixture["transitions"][state][a])
    if state != int(row["target_post_trace_state"]):
        raise AssertionError("fixture post-trace state differs")
    observed_states = [states[x["start_index"]] for x in certificate["output_witnesses"]]
    if len(observed_states) != len(set(observed_states)):
        raise AssertionError("witnesses are not different target states")
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="Evaluator JSON containing public trace")
    parser.add_argument("--output", required=True, help="Proof-certificate JSON output")
    parser.add_argument("--max-depth", type=int, default=12)
    parser.add_argument("--check-fixture", action="store_true",
                        help="Independently replay private evaluator fixture for witness verification")
    args = parser.parse_args()
    if not 1 <= args.max_depth <= 20:
        raise SystemExit("--max-depth must be between 1 and 20")
    source_path = Path(args.input)
    raw = source_path.read_bytes()
    archive = json.loads(raw)
    cases = []
    for row in archive.get("results", []):
        if row.get("status") != "completed":
            continue
        trace = row.get("observed_trace")
        if not isinstance(trace, list):
            raise AssertionError("completed row has no public trace")
        certificate = trace_output_diversity_state_lower_bound(
            trace, args.max_depth
        )
        verify_trace_diversity_certificate(trace, certificate)
        result = {
            "state_count": row.get("state_count"),
            "seed": row.get("seed"),
            "trace_digest": row.get("trace_digest"),
            "trace_length": len(trace),
            "certificate": certificate,
        }
        if args.check_fixture:
            verify_hidden_fixture_consistency(row, certificate)
            result["fixture_consistency_verified"] = True
            if certificate["minimum_states"] > int(row["state_count"]):
                raise AssertionError("certificate contradicts evaluator target size")
        cases.append(result)
    total_candidates = sum(int(row["state_count"]) for row in cases)
    skipped_sizes = sum(row["certificate"]["minimum_states"]-1 for row in cases)
    exact_counts = sum(
        row["certificate"]["minimum_states"] == int(row["state_count"])
        for row in cases
    )
    payload = {
        "experiment": "public-no-reset-mealy-output-diversity-lower-bound",
        "input_json_sha256": hashlib.sha256(raw).hexdigest(),
        "max_observed_input_depth": args.max_depth,
        "scope": {
            "machine": "deterministic binary-input, binary-output Mealy",
            "observation": "single public no-reset input/output trace",
            "proof": "same input word, distinct output words imply distinct start states",
            "solver": "none",
            "private_fixture_used_for_certificate": False,
            "fixture_replay_checked": bool(args.check_fixture),
        },
        "summary": {
            "completed_cases": len(cases),
            "full_upper_bound_candidate_sizes": total_candidates,
            "analytically_eliminated_candidate_sizes": skipped_sizes,
            "remaining_candidate_sizes": total_candidates-skipped_sizes,
            "target_state_count_lower_bound_exact_cases": exact_counts,
        },
        "cases": cases,
    }
    Path(args.output).write_text(json.dumps(payload, indent=2, sort_keys=True)+"\n")
    print("HW_TRACE_STATE_LOWER_BOUND "+json.dumps(payload["summary"],sort_keys=True))


if __name__ == "__main__":
    main()
