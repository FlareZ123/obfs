#!/usr/bin/env python3
"""Solver-free, public-trace-only finite-state reconstruction certificates.

For binary deterministic Mealy machines, different responses to one common
input word require different start states. When k distinct responses are
observed, these k states exhaust any candidate with <= k states. Response
signatures and deterministic transitions can then force a full table.
All labels, transitions and the post-trace replay are derived from *public*
observations; a private target fixture is never used to make deductions.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path


def binary_trace(trace):
    if not isinstance(trace, list):
        raise ValueError("trace must be a list")
    out = []
    for i, pair in enumerate(trace):
        if (not isinstance(pair, (list, tuple)) or len(pair) != 2
                or str(pair[0]) not in ("0", "1")
                or str(pair[1]) not in ("0", "1")):
            raise ValueError(f"nonbinary Mealy trace at index {i}")
        out.append((int(pair[0]), int(pair[1])))
    return out


def full_diversity_patterns(bits, max_depth=12):
    """Return (k, patterns): every input word witnessing maximal response count."""
    if not 1 <= max_depth <= 20:
        raise ValueError("max_depth must be 1..20")
    if not bits:
        return 1, []
    best = 1
    patterns = []
    for d in range(1, min(max_depth, len(bits)) + 1):
        mask = (1 << d) - 1
        inp = out = 0
        grouped = defaultdict(dict)
        occurrences = defaultdict(int)
        for index, (a, b) in enumerate(bits):
            inp = ((inp << 1) | a) & mask
            out = ((out << 1) | b) & mask
            if index + 1 < d:
                continue
            grouped[inp].setdefault(out, index + 1 - d)
            occurrences[inp] += 1
        for inp_word, witnesses in grouped.items():
            count = len(witnesses)
            if count > best:
                best = count
                patterns = []
            if count == best:
                patterns.append({
                    "depth": d,
                    "word_bits": inp_word,
                    "occurrences": occurrences[inp_word],
                    "first_positions": dict(witnesses),
                })
    patterns.sort(key=lambda p: (-p["occurrences"], p["depth"], p["word_bits"]))
    return best, patterns


def forced_table_from_pattern(bits, k, pattern):
    """Use only sound state-equality, response-exclusion and edge deductions.

    The k distinct response words to the same input word are injective over
    any k-state candidate; alphabetically-numbered response words therefore
    canonically label every candidate state. A state position matching an
    anchored response is known. One known transition propagates its endpoint;
    two known endpoints fix that transition. For any known state, a different
    output response to an identical public input word excludes that state
    from a position; if only one of the k labels survives, it is fixed.
    """
    d, word = pattern["depth"], pattern["word_bits"]
    first = pattern["first_positions"]
    labels = {value: i for i, value in enumerate(sorted(first))}
    if len(labels) != k:
        raise ValueError("fingerprint count inconsistent with state bound")
    state = [None] * (len(bits) + 1)
    inp = out = anchor_count = 0
    mask = (1 << d) - 1
    for index, (a, b) in enumerate(bits):
        inp = ((inp << 1) | a) & mask
        out = ((out << 1) | b) & mask
        if index + 1 >= d and inp == word:
            label = labels.get(out)
            if label is None:
                raise ValueError("fingerprint response not in candidate labels")
            pos = index + 1 - d
            if state[pos] is not None and state[pos] != label:
                raise ValueError("contradictory fingerprint")
            state[pos] = label
            anchor_count += 1

    windows_by_depth = []
    for depth in range(1, min(12, len(bits)) + 1):
        mask = (1 << depth) - 1
        window_in = window_out = 0
        windows = [None] * len(bits)
        for index, (a, b) in enumerate(bits):
            window_in = ((window_in << 1) | a) & mask
            window_out = ((window_out << 1) | b) & mask
            if index + 1 >= depth:
                windows[index + 1 - depth] = (window_in, window_out)
        windows_by_depth.append(windows)

    delta = [[None, None] for _ in range(k)]
    outputs = [[None, None] for _ in range(k)]
    rounds = 0
    while True:
        rounds += 1
        changed = False
        for index, (a, b) in enumerate(bits):
            s = state[index]
            if s is None:
                continue
            if outputs[s][a] is None:
                outputs[s][a] = b
                changed = True
            elif outputs[s][a] != b:
                raise ValueError("contradictory known-state output")
            next_state = state[index + 1]
            if next_state is not None:
                if delta[s][a] is None:
                    delta[s][a] = next_state
                    changed = True
                elif delta[s][a] != next_state:
                    raise ValueError("contradictory known-state transition")
            if delta[s][a] is not None:
                if state[index + 1] is None:
                    state[index + 1] = delta[s][a]
                    changed = True
                elif state[index + 1] != delta[s][a]:
                    raise ValueError("contradictory forward state inference")

        signatures = []
        for windows in windows_by_depth:
            responses = defaultdict(dict)
            for index, s in enumerate(state[:-1]):
                if s is None or windows[index] is None:
                    continue
                response_word, response_out = windows[index]
                prior = responses[response_word].get(s)
                if prior is not None and prior != response_out:
                    raise ValueError("contradictory known-state response signature")
                responses[response_word][s] = response_out
            signatures.append(responses)
        for index, s in enumerate(state[:-1]):
            if s is not None:
                continue
            a, b = bits[index]
            possible = set(range(k))
            for label in range(k):
                if outputs[label][a] is not None and outputs[label][a] != b:
                    possible.discard(label)
            for windows, responses in zip(windows_by_depth, signatures):
                if windows[index] is None:
                    break
                response_word, response_out = windows[index]
                possible.difference_update(
                    label for label, known in responses[response_word].items()
                    if known != response_out
                )
                if len(possible) <= 1:
                    break
            if not possible:
                raise ValueError("no candidate state survives public responses")
            if len(possible) == 1:
                state[index] = possible.pop()
                changed = True
        if not changed:
            break
        if rounds > 2 * len(bits) + k:
            raise AssertionError("monotone inference failed to terminate")

    known_delta = sum(x is not None for row in delta for x in row)
    known_output = sum(x is not None for row in outputs for x in row)
    full = known_delta == 2 * k and known_output == 2 * k
    matching_initial_post = []
    if full:
        for initial in range(k):
            q = initial
            for a, b in bits:
                if outputs[q][a] != b:
                    break
                q = delta[q][a]
            else:
                matching_initial_post.append([initial, q])
        if not matching_initial_post:
            raise ValueError("fully forced machine cannot replay public trace")
    status = (
        "complete-unique-future"
        if full and len({post for _, post in matching_initial_post}) == 1
        else "complete-ambiguous-post" if full else "incomplete"
    )
    return {
        "status": status,
        "candidate_states": k,
        "fingerprint_input_word": format(word, f"0{d}b"),
        "fingerprint_output_witnesses": [
            {"label": label, "output_word": format(value, f"0{d}b"),
             "start_index": first[value]}
            for value, label in sorted(labels.items())
        ],
        "fingerprint_occurrences": anchor_count,
        "propagation_rounds": rounds,
        "known_transitions": known_delta,
        "known_outputs": known_output,
        "known_trace_state_positions": sum(q is not None for q in state),
        "transitions": delta if full else None,
        "outputs": outputs if full else None,
        "matching_initial_post_states": matching_initial_post if full else None,
        "unique_post_state": (
            matching_initial_post[0][1] if status == "complete-unique-future"
            else None
        ),
    }


def derive_certificate(trace, max_depth=12):
    """Attempt a constructive upper-bounded future-uniqueness proof."""
    bits = binary_trace(trace)
    bound, patterns = full_diversity_patterns(bits, max_depth)
    best = None
    failed = 0
    for pattern in patterns:
        try:
            candidate = forced_table_from_pattern(bits, bound, pattern)
        except ValueError:
            failed += 1
            continue
        if best is None or (
            candidate["known_transitions"], candidate["known_outputs"]
        ) > (best["known_transitions"], best["known_outputs"]):
            best = candidate
        if candidate["status"] == "complete-unique-future":
            best = candidate
            break
    return {
        "public_trace_length": len(bits),
        "observational_state_lower_bound": bound,
        "max_observed_input_depth": max_depth,
        "full_diversity_patterns_considered": len(patterns),
        "inconsistent_k_state_patterns": failed,
        "reconstruction": best,
        "bounded_future_uniqueness_certified": bool(
            best and best["status"] == "complete-unique-future"
        ),
    }


def verify_public_certificate(trace, proof):
    """Check the given finished proof using just the public trace and witness."""
    rec = proof["reconstruction"]
    if not rec or not proof["bounded_future_uniqueness_certified"]:
        return False
    bits = binary_trace(trace)
    k = proof["observational_state_lower_bound"]
    witnesses = rec["fingerprint_output_witnesses"]
    word = rec["fingerprint_input_word"]
    depth = len(word)
    if len(witnesses) != k or not depth:
        raise AssertionError("wrong witness cardinality")
    first = {}
    for expected_label, witness in enumerate(witnesses):
        if witness["label"] != expected_label:
            raise AssertionError("noncanonical witness ordering")
        index = witness["start_index"]
        if not isinstance(index, int) or not 0 <= index <= len(bits) - depth:
            raise AssertionError("witness index out of bounds")
        segment = bits[index:index + depth]
        if ("".join(str(a) for a, _ in segment) != word
                or "".join(str(b) for _, b in segment)
                != witness["output_word"]):
            raise AssertionError("witness does not match the public trace")
        first[int(witness["output_word"], 2)] = index
    if len(first) != k:
        raise AssertionError("duplicate response fingerprints")
    pattern = {"depth": depth, "word_bits": int(word, 2),
               "first_positions": first}
    fresh = forced_table_from_pattern(bits, k, pattern)
    for key in (
        "status", "candidate_states", "fingerprint_input_word",
        "fingerprint_output_witnesses", "fingerprint_occurrences",
        "known_transitions", "known_outputs", "known_trace_state_positions",
        "transitions", "outputs", "matching_initial_post_states",
        "unique_post_state",
    ):
        if fresh[key] != rec[key]:
            raise AssertionError(f"public proof replay differs at {key}")
    if fresh["status"] != "complete-unique-future":
        raise AssertionError("replayed certificate does not fix the future")
    return True


def verify_reconstruction_against_private_fixture(row, proof):
    """Evaluator-only *independent* check after all public inference finishes."""
    rec = proof["reconstruction"]
    if not proof["bounded_future_uniqueness_certified"]:
        return False
    n = int(row["state_count"])
    if rec["candidate_states"] != n:
        return False
    target = row["fixture_table"]
    delta, output = target["transitions"], target["outputs"]
    true_states = []
    q = int(target["initial_state"])
    for a, b in binary_trace(row["observed_trace"]):
        true_states.append(q)
        if int(output[q][a]) != b:
            raise AssertionError("fixture output does not replay observed trace")
        q = int(delta[q][a])
    if q != int(row["target_post_trace_state"]):
        raise AssertionError("fixture post-state mismatch")
    mapping = [None] * n
    for w in rec["fingerprint_output_witnesses"]:
        mapping[w["label"]] = true_states[w["start_index"]]
    if len(set(mapping)) != n:
        raise AssertionError("fingerprint labels are not distinct target states")
    for s in range(n):
        for a in range(2):
            real = mapping[s]
            if rec["outputs"][s][a] != int(output[real][a]):
                raise AssertionError("public output disagrees with evaluator")
            if mapping[rec["transitions"][s][a]] != int(delta[real][a]):
                raise AssertionError("public transition disagrees with evaluator")
    initial_canonical = mapping.index(int(target["initial_state"]))
    post_canonical = mapping.index(int(row["target_post_trace_state"]))
    if ([initial_canonical, post_canonical]
            not in rec["matching_initial_post_states"]):
        raise AssertionError("true initial/post absent from public replay")
    if rec["unique_post_state"] != post_canonical:
        raise AssertionError("public post state disagrees with evaluator")
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--max-depth", type=int, default=12)
    parser.add_argument("--check-fixture", action="store_true")
    args = parser.parse_args()
    if not 1 <= args.max_depth <= 20:
        raise SystemExit("--max-depth must be 1..20")
    data = Path(args.input).read_bytes()
    source = json.loads(data)
    cases = []
    for row in source.get("results", []):
        if row.get("status") != "completed":
            continue
        proof = derive_certificate(row["observed_trace"], args.max_depth)
        record = {
            "state_count": row.get("state_count"),
            "seed": row.get("seed"),
            "trace_digest": row.get("trace_digest"),
            **proof,
        }
        if proof["bounded_future_uniqueness_certified"]:
            record["public_certificate_replayed"] = verify_public_certificate(
                row["observed_trace"], proof
            )
        if args.check_fixture:
            record["private_fixture_crosscheck_passed"] = (
                verify_reconstruction_against_private_fixture(row, proof)
            )
        cases.append(record)
    certified = [r for r in cases if r["bounded_future_uniqueness_certified"]]
    at_target = [r for r in certified
                 if r["observational_state_lower_bound"] == r["state_count"]]
    result = {
        "experiment": "public-no-reset-Mealy-unique-future-certificate",
        "input_json_sha256": hashlib.sha256(data).hexdigest(),
        "max_depth": args.max_depth,
        "scope": {
            "model": "deterministic binary-input/output Mealy",
            "candidate_sizes": "1..observational_state_lower_bound",
            "private_fixture_used_for_inference": False,
            "fixture_crosscheck": bool(args.check_fixture),
            "solver": "none",
            "proof": ("response fingerprints label every state; deterministic "
                      "and response-signature propagation forces every table "
                      "entry; all trace-matching initial states have one post "
                      "state; smaller machines violate trace diversity"),
        },
        "summary": {
            "completed_cases": len(cases),
            "full_table_unique_future_certificates": len(certified),
            "certificates_at_true_target_state_bound": len(at_target),
            "crosschecked_fixtures": sum(
                bool(r.get("private_fixture_crosscheck_passed")) for r in cases
            ),
        },
        "cases": cases,
    }
    Path(args.output).write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    print("HW_PUBLIC_TRACE_FULL_RECONSTRUCTION",
          json.dumps(result["summary"], sort_keys=True))


if __name__ == "__main__":
    main()
