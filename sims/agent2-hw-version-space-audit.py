#!/usr/bin/env python3
"""Exact bounded version-space search for no-reset Mealy observations.

The learner is not given the target fixture or its state count. This evaluator
uses the held-out target only to ask whether any minimal, strongly connected
binary Mealy machine with 1..N states can reproduce the public trace yet have
different future behavior. N is the target's hidden state count, used only as
an evaluator upper bound. A SAT result is a constructive ambiguity witness;
UNSAT is exact only within this finite machine class and bound.
"""
from __future__ import annotations

import argparse
import json
import time
from collections import deque
from pathlib import Path

import z3
from z3 import And, Array, If, Int, IntSort, K, Or, Select, Solver, Store, sat, unknown


def is_strongly_connected(transitions: list[list[int]]) -> bool:
    n = len(transitions)
    for start in range(n):
        seen = {start}
        todo = [start]
        while todo:
            state = todo.pop()
            for nxt in transitions[state]:
                if nxt not in seen:
                    seen.add(nxt)
                    todo.append(nxt)
        if len(seen) != n:
            return False
    return True


def is_minimal_mealy(transitions: list[list[int]], outputs: list[list[int]]) -> bool:
    n = len(transitions)
    partition = [0] * n
    while True:
        signatures = [
            (
                tuple(outputs[state]),
                tuple(partition[transitions[state][a]] for a in range(2)),
            )
            for state in range(n)
        ]
        classes = {}
        refined = []
        for signature in signatures:
            if signature not in classes:
                classes[signature] = len(classes)
            refined.append(classes[signature])
        if refined == partition:
            break
        partition = refined
    return len(set(partition)) == n


def minimize_mealy(transitions, outputs, initial_state: int, extra_state: int):
    """Quotient a deterministic Mealy machine by behavioral equivalence."""
    n = len(transitions)
    partition = [0] * n
    while True:
        signatures = [
            (
                tuple(outputs[state]),
                tuple(partition[transitions[state][a]] for a in range(2)),
            )
            for state in range(n)
        ]
        classes = {}
        refined = []
        for signature in signatures:
            if signature not in classes:
                classes[signature] = len(classes)
            refined.append(classes[signature])
        if refined == partition:
            break
        partition = refined

    representatives = {}
    for state, class_id in enumerate(partition):
        representatives.setdefault(class_id, state)
    ordered_classes = sorted(representatives)
    remap = {class_id: index for index, class_id in enumerate(ordered_classes)}
    minimized_transitions = [
        [
            remap[partition[transitions[representatives[class_id]][a]]]
            for a in range(2)
        ]
        for class_id in ordered_classes
    ]
    minimized_outputs = [
        list(outputs[representatives[class_id]]) for class_id in ordered_classes
    ]
    return (
        minimized_transitions,
        minimized_outputs,
        remap[partition[initial_state]],
        remap[partition[extra_state]],
        partition,
    )


def replay_trace(transitions, outputs, initial_state: int, trace):
    state = initial_state
    for letter, observed in trace:
        a = int(letter)
        if outputs[state][a] != int(observed):
            return False, None
        state = transitions[state][a]
    return True, state


def product_counterexample(
    target_transitions,
    target_outputs,
    candidate_transitions,
    candidate_outputs,
    target_start: int,
    candidate_start: int,
):
    """Return the shortest future input word with differing output, if any."""
    queue = deque([(target_start, candidate_start, [])])
    seen = {(target_start, candidate_start)}
    while queue:
        target_state, candidate_state, prefix = queue.popleft()
        for a in range(2):
            if target_outputs[target_state][a] != candidate_outputs[candidate_state][a]:
                return [str(x) for x in prefix + [a]]
            pair = (
                target_transitions[target_state][a],
                candidate_transitions[candidate_state][a],
            )
            if pair not in seen:
                seen.add(pair)
                queue.append((pair[0], pair[1], prefix + [a]))
    return None


def trace_state_separation_pairs(trace, max_depth: int = 4, max_pairs: int = 100000):
    """Soundly separate positions with equal input prefixes but unequal outputs."""
    pairs = set()
    for depth in range(1, min(max_depth, len(trace)) + 1):
        groups = {}
        for start in range(len(trace) - depth + 1):
            inputs = tuple(int(trace[start + offset][0]) for offset in range(depth))
            outputs = tuple(int(trace[start + offset][1]) for offset in range(depth))
            groups.setdefault(inputs, {}).setdefault(outputs, []).append(start)
        for output_groups in groups.values():
            if len(output_groups) < 2:
                continue
            representatives = {
                output_word: positions[0]
                for output_word, positions in output_groups.items()
            }
            for output_word, positions in output_groups.items():
                other_representatives = [
                    representative
                    for other_word, representative in representatives.items()
                    if other_word != output_word
                ]
                for position in positions:
                    for other in other_representatives:
                        if position != other:
                            pairs.add((min(position, other), max(position, other)))
                            if len(pairs) >= max_pairs:
                                return sorted(pairs)
    return sorted(pairs)


def target_alternate_start_witness(
    target_transitions,
    target_outputs,
    target_initial: int,
    target_post: int,
    trace,
):
    """Find a second trace-consistent initial state in the target machine itself."""
    n = len(target_transitions)
    matching = []
    for start in range(n):
        matched, post = replay_trace(target_transitions, target_outputs, start, trace)
        if matched:
            matching.append({"initial_state": start, "post_trace_state": post})
    for alternative in matching:
        alt_initial = alternative["initial_state"]
        alt_post = alternative["post_trace_state"]
        if alt_initial == target_initial:
            continue
        word = product_counterexample(
            target_transitions,
            target_outputs,
            target_transitions,
            target_outputs,
            target_post,
            alt_post,
        )
        if word is None:
            continue
        target_state = target_post
        alternative_state = alt_post
        target_future_outputs = []
        alternative_future_outputs = []
        for letter in word:
            a = int(letter)
            target_future_outputs.append(str(target_outputs[target_state][a]))
            alternative_future_outputs.append(str(target_outputs[alternative_state][a]))
            target_state = target_transitions[target_state][a]
            alternative_state = target_transitions[alternative_state][a]
        return {
            "witness_source": "same_target_machine_with_alternate_initial_state",
            "candidate_state_count": n,
            "candidate_initial_state": alt_initial,
            "candidate_post_trace_state": alt_post,
            "candidate_transitions": target_transitions,
            "candidate_outputs": target_outputs,
            "future_counterexample": word,
            "target_future_outputs": target_future_outputs,
            "candidate_future_outputs": alternative_future_outputs,
            "trace_matching_target_starts": matching,
            "candidate_trace_verified": True,
            "candidate_minimal_verified": True,
            "candidate_strongly_connected_verified": True,
            "target_trace_verified": True,
            "target_post_trace_state_verified": True,
        }
    return None


def solve_for_size(row, candidate_size: int, timeout_ms: int, candidate_labeling: str = "predecessor"):
    fixture = row["fixture_table"]
    target_transitions = [[int(x) for x in r] for r in fixture["transitions"]]
    target_outputs = [[int(x) for x in r] for r in fixture["outputs"]]
    target_n = len(target_transitions)
    target_initial = int(fixture["initial_state"])
    trace = row["observed_trace"]
    target_post = int(row["target_post_trace_state"])
    k = candidate_size
    tag = f"case_{row['state_count']}_{row['seed']}_k_{k}"

    solver = Solver()
    solver.set(timeout=timeout_ms)
    solver.set(random_seed=0)
    delta = Array(f"delta_{tag}", IntSort(), IntSort())
    output = Array(f"output_{tag}", IntSort(), IntSort())

    for state in range(k):
        for a in range(2):
            index = 2 * state + a
            solver.add(Select(delta, index) >= 0, Select(delta, index) < k)
            solver.add(Select(output, index) >= 0, Select(output, index) <= 1)

    trace_states = [Int(f"trace_state_{tag}_{i}") for i in range(len(trace) + 1)]
    for state in trace_states:
        solver.add(state >= 0, state < k)
    for i, (letter, observed) in enumerate(trace):
        a = int(letter)
        y = int(observed)
        solver.add(Select(output, 2 * trace_states[i] + a) == y)
        solver.add(trace_states[i + 1] == Select(delta, 2 * trace_states[i] + a))

    # If two trace positions see the same future input prefix but different
    # output prefixes, they cannot be the same deterministic Mealy state.
    separation_pairs = trace_state_separation_pairs(trace, max_depth=4)
    for left, right in separation_pairs:
        solver.add(trace_states[left] != trace_states[right])

    # State names are arbitrary, so fix the candidate initial state to 0.
    solver.add(trace_states[0] == 0)

    if candidate_labeling not in ("predecessor", "bfs"):
        raise ValueError(f"unsupported candidate_labeling: {candidate_labeling}")
    if candidate_labeling == "bfs":
        # Every root-reachable deterministic machine has a relabeling in
        # first-discovery BFS order (process state rows and 0,1 edges).
        # Every state s is discovered before its row is read. Each next
        # transition target can introduce at most the next unused label.
        # This canonical representative removes state-label permutations;
        # reverse reachability to the root still needs backward ranks below.
        maximum_seen = [
            Int(f"maximum_seen_{tag}_{i}") for i in range(2 * k + 1)
        ]
        solver.add(maximum_seen[0] == 0)
        for state in range(k):
            solver.add(maximum_seen[2 * state] >= state)
            for a in range(2):
                index = 2 * state + a
                target_state = Select(delta, index)
                solver.add(target_state <= maximum_seen[index] + 1)
                solver.add(maximum_seen[index + 1] ==
                           If(target_state > maximum_seen[index],
                              target_state, maximum_seen[index]))
        solver.add(maximum_seen[2 * k] == k - 1)

    # Every state can also reach 0: a strictly decreasing rank certifies a
    # return path. Predecessor mode uses a lower-index spanning arborescence
    # for reachability from 0; BFS mode proves this in canonical row order.
    backward_rank = [Int(f"backward_rank_{tag}_{s}") for s in range(k)]
    for s in range(k):
        solver.add(backward_rank[s] >= 0, backward_rank[s] < k)
        if s == 0:
            solver.add(backward_rank[s] == 0)
            continue
        incoming = [
            Select(delta, 2 * p + a) == s
            for p in range(s)
            for a in range(2)
        ]
        outgoing = [
            And(
                Select(delta, 2 * s + a) == t,
                backward_rank[t] < backward_rank[s],
            )
            for a in range(2)
            for t in range(k)
        ]
        if candidate_labeling == "predecessor":
            solver.add(Or(incoming))
        solver.add(backward_rank[s] > 0, Or(outgoing))

    target_delta = K(IntSort(), 0)
    target_output = K(IntSort(), 0)
    for state in range(target_n):
        for a in range(2):
            index = 2 * state + a
            target_delta = Store(target_delta, index, target_transitions[state][a])
            target_output = Store(target_output, index, target_outputs[state][a])

    # A product of N target states and k candidate states has N*k pairs. If
    # future behavior differs, a distinguishing word exists within this bound.
    future_length = target_n * k
    candidate_future = [
        Int(f"candidate_future_{tag}_{i}") for i in range(future_length + 1)
    ]
    target_future = [
        Int(f"target_future_{tag}_{i}") for i in range(future_length + 1)
    ]
    future_inputs = [Int(f"future_input_{tag}_{i}") for i in range(future_length)]
    solver.add(candidate_future[0] == trace_states[-1])
    solver.add(target_future[0] == target_post)
    mismatches = []
    for i in range(future_length):
        solver.add(candidate_future[i] >= 0, candidate_future[i] < k)
        solver.add(target_future[i] >= 0, target_future[i] < target_n)
        solver.add(future_inputs[i] >= 0, future_inputs[i] < 2)
        candidate_index = 2 * candidate_future[i] + future_inputs[i]
        target_index = 2 * target_future[i] + future_inputs[i]
        mismatches.append(
            Select(output, candidate_index) != Select(target_output, target_index)
        )
        solver.add(
            candidate_future[i + 1] == Select(delta, candidate_index)
        )
        solver.add(
            target_future[i + 1] == Select(target_delta, target_index)
        )
    solver.add(Or(mismatches))

    checked = solver.check()
    if checked == unknown:
        return "unknown", {
            "reason": solver.reason_unknown(),
            "trace_separation_constraints": len(separation_pairs),
        }
    if checked != sat:
        return "unsat", {
            "trace_separation_constraints": len(separation_pairs),
        }

    model = solver.model()
    raw_candidate_transitions = [
        [
            model.eval(Select(delta, 2 * state + a)).as_long()
            for a in range(2)
        ]
        for state in range(k)
    ]
    raw_candidate_outputs = [
        [
            model.eval(Select(output, 2 * state + a)).as_long()
            for a in range(2)
        ]
        for state in range(k)
    ]
    raw_candidate_initial = model.eval(trace_states[0]).as_long()
    raw_candidate_post = model.eval(trace_states[-1]).as_long()

    raw_matched, raw_replayed_post = replay_trace(
        raw_candidate_transitions,
        raw_candidate_outputs,
        raw_candidate_initial,
        trace,
    )
    if not raw_matched or raw_replayed_post != raw_candidate_post:
        raise AssertionError("SAT model does not reproduce the public trace")
    if not is_strongly_connected(raw_candidate_transitions):
        raise AssertionError("SAT model failed independent strong-connectivity check")

    # Behavioral quotienting preserves every trace and future output while
    # producing a minimal machine. A quotient of a strongly connected machine
    # remains strongly connected, so minimality need not burden the SMT solve.
    (
        candidate_transitions,
        candidate_outputs,
        candidate_initial,
        candidate_post,
        _partition,
    ) = minimize_mealy(
        raw_candidate_transitions,
        raw_candidate_outputs,
        raw_candidate_initial,
        raw_candidate_post,
    )
    matched, replayed_post = replay_trace(
        candidate_transitions, candidate_outputs, candidate_initial, trace
    )
    if not matched or replayed_post != candidate_post:
        raise AssertionError("minimized SAT witness does not reproduce the public trace")
    if not is_strongly_connected(candidate_transitions):
        raise AssertionError("minimized SAT witness is not strongly connected")
    if not is_minimal_mealy(candidate_transitions, candidate_outputs):
        raise AssertionError("minimized SAT witness is not minimal")

    target_matched, verified_target_post = replay_trace(
        target_transitions, target_outputs, target_initial, trace
    )
    if not target_matched or verified_target_post != target_post:
        raise AssertionError("target fixture/trace/post-state evidence is inconsistent")

    future_word = product_counterexample(
        target_transitions,
        target_outputs,
        candidate_transitions,
        candidate_outputs,
        target_post,
        candidate_post,
    )
    if future_word is None:
        raise AssertionError("SAT witness has no independently verified future difference")

    target_state = target_post
    candidate_state = candidate_post
    target_future_outputs = []
    candidate_future_outputs = []
    for letter in future_word:
        a = int(letter)
        target_future_outputs.append(str(target_outputs[target_state][a]))
        candidate_future_outputs.append(str(candidate_outputs[candidate_state][a]))
        target_state = target_transitions[target_state][a]
        candidate_state = candidate_transitions[candidate_state][a]

    return "sat", {
        "witness_source": "z3_candidate_machine",
        "candidate_state_count": len(candidate_transitions),
        "solver_model_state_count": k,
        "trace_separation_constraints": len(separation_pairs),
        "candidate_initial_state": candidate_initial,
        "candidate_post_trace_state": candidate_post,
        "candidate_transitions": candidate_transitions,
        "candidate_outputs": candidate_outputs,
        "future_counterexample": future_word,
        "target_future_outputs": target_future_outputs,
        "candidate_future_outputs": candidate_future_outputs,
        "candidate_trace_verified": True,
        "candidate_minimal_verified": True,
        "candidate_strongly_connected_verified": True,
        "target_trace_verified": True,
        "target_post_trace_state_verified": True,
    }


def audit_row(row, timeout_ms: int, candidate_labeling: str = "predecessor"):
    if row.get("status") != "completed":
        return {"status": "skipped", "reason": "learner row did not complete"}
    if "fixture_table" not in row or "observed_trace" not in row:
        return {"status": "skipped", "reason": "raw evaluator fixture/trace not present"}

    started = time.perf_counter()
    target_n = int(row["state_count"])
    fixture = row["fixture_table"]
    target_transitions = [[int(x) for x in values] for values in fixture["transitions"]]
    target_outputs = [[int(x) for x in values] for values in fixture["outputs"]]
    if len(target_transitions) != target_n or len(target_outputs) != target_n:
        raise AssertionError("target fixture size does not match the declared state count")
    if not is_strongly_connected(target_transitions) or not is_minimal_mealy(target_transitions, target_outputs):
        raise AssertionError("target fixture is not minimal and strongly connected")
    target_matched, target_post = replay_trace(
        target_transitions,
        target_outputs,
        int(fixture["initial_state"]),
        row["observed_trace"],
    )
    if not target_matched or target_post != int(row["target_post_trace_state"]):
        raise AssertionError("target fixture does not reproduce its recorded trace/post-state")

    alternate_start = target_alternate_start_witness(
        target_transitions,
        target_outputs,
        int(fixture["initial_state"]),
        target_post,
        row["observed_trace"],
    )
    if alternate_start is not None:
        return {
            "status": "sat",
            "fixture_digest": row.get("fixture_digest"),
            "trace_digest": row.get("trace_digest"),
            "target_state_count": target_n,
            "target_class_verified": True,
            "candidate_size_search": {
                "method": "same target machine, alternate trace-consistent initial state"
            },
            "elapsed_seconds": round(time.perf_counter() - started, 4),
            "witness": alternate_start,
        }

    unsat_sizes = []
    unknown_sizes = []
    for candidate_size in range(1, target_n + 1):
        status, detail = solve_for_size(row, candidate_size, timeout_ms, candidate_labeling)
        if status == "sat":
            return {
                "status": "sat",
                "fixture_digest": row.get("fixture_digest"),
                "trace_digest": row.get("trace_digest"),
                "target_state_count": target_n,
                "target_class_verified": True,
                "candidate_size_search": {
                    "unsat_sizes_before_witness": unsat_sizes,
                    "unknown_sizes_before_witness": unknown_sizes,
                },
                "elapsed_seconds": round(time.perf_counter() - started, 4),
                "witness": detail,
            }
        if status == "unknown":
            unknown_sizes.append({"state_count": candidate_size, **detail})
        else:
            unsat_sizes.append(candidate_size)

    final_status = "unknown" if unknown_sizes else "unsat"
    return {
        "status": final_status,
        "fixture_digest": row.get("fixture_digest"),
        "trace_digest": row.get("trace_digest"),
        "target_state_count": target_n,
        "target_class_verified": True,
        "candidate_size_search": {
            "unsat_sizes": unsat_sizes,
            "unknown_sizes": unknown_sizes,
        },
        "elapsed_seconds": round(time.perf_counter() - started, 4),
        "interpretation": (
            "At least one candidate size timed out; no global bounded conclusion."
            if unknown_sizes
            else (
                "No minimal strongly connected binary Mealy machine with 1..N "
                "states reproduces this trace and differs in future behavior."
            )
        ),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--max-cases", type=int, default=10)
    parser.add_argument("--timeout-ms", type=int, default=5000)
    parser.add_argument("--candidate-labeling", choices=("predecessor", "bfs"),
                        default="predecessor",
                        help="Root-reachable model label symmetry (experimental bfs canonicalization)")
    args = parser.parse_args()
    if args.max_cases < 1 or args.timeout_ms < 1:
        raise SystemExit("--max-cases and --timeout-ms must be positive")

    source = json.loads(Path(args.input).read_text(encoding="utf-8"))
    completed = [row for row in source.get("results", []) if row.get("status") == "completed"]
    preferred = [
        row for row in completed
        if row.get("trace_matching_initial_candidates", 0) > 1
        or row.get("false_future_convergence")
    ]
    if not preferred:
        preferred = completed
    preferred.sort(
        key=lambda row: (
            not (
                row.get("trace_matching_initial_candidates", 0) > 1
                or row.get("false_future_convergence")
            ),
            -int(row.get("state_count", 0)),
            int(row.get("seed", 0)),
        )
    )
    selected = preferred[: args.max_cases]

    started = time.perf_counter()
    cases = []
    for row in selected:
        cases.append({
            "state_count": row.get("state_count"),
            "seed": row.get("seed"),
            "candidate_hypothesis_starts": row.get("trace_matching_initial_candidates"),
            "hW_future_clone_success": row.get("future_clone_success"),
            "audit": audit_row(row, args.timeout_ms, args.candidate_labeling),
        })

    counts = {
        status: sum(case["audit"]["status"] == status for case in cases)
        for status in ("sat", "unsat", "unknown", "skipped")
    }
    output = {
        "experiment": "bounded-exact-minimal-strongly-connected-mealy-version-space",
        "z3_version": z3.get_full_version(),
        "scope": {
            "alphabet": ["0", "1"],
            "outputs": ["0", "1"],
            "candidate_state_counts": "1..target_state_count inclusive",
            "candidate_class": "complete deterministic minimal strongly connected Mealy machines",
            "candidate_labeling": args.candidate_labeling,
            "observation": "the public one-shot input/output trace only",
            "target_state_count": "hidden from learner; used only as evaluator upper bound",
            "target_fixture": "held-out evaluator data; never passed to hW",
            "future_difference": "exact product BFS witness from post-trace states",
            "meaning": "SAT is a constructive full-version-space ambiguity witness; UNSAT is exact only within the stated finite class and bound; UNKNOWN is inconclusive",
        },
        "selected_cases": len(cases),
        "summary": counts,
        "elapsed_seconds": round(time.perf_counter() - started, 4),
        "cases": cases,
    }
    Path(args.output).write_text(
        json.dumps(output, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print("VERSION_SPACE_AUDIT_SUMMARY " + json.dumps({
        "z3_version": output["z3_version"],
        "selected_cases": output["selected_cases"],
        **counts,
        "elapsed_seconds": output["elapsed_seconds"],
        "cases": [
            {
                "state_count": case["state_count"],
                "seed": case["seed"],
                "status": case["audit"]["status"],
                "candidate_state_count": case["audit"].get("witness", {}).get("candidate_state_count"),
                "future_counterexample": case["audit"].get("witness", {}).get("future_counterexample"),
                "witness": case["audit"].get("witness"),
                "elapsed_seconds": case["audit"].get("elapsed_seconds"),
            }
            for case in cases
        ],
    }, sort_keys=True))


if __name__ == "__main__":
    main()
