#!/usr/bin/env python3
"""Exact one-swap local search for the m=8 adaptive-anchor face family.

The objective is the same exact expected-query model used by
agent2-rankfive-adaptive-anchor-pair-fullpath.py. This is a heuristic search
over a local neighborhood, not a global search over all 3-uniform hypergraphs.
"""
from __future__ import annotations

import argparse
import gc
import importlib.util
import itertools
import json
import math
import sys
import time
from functools import lru_cache
from pathlib import Path


def load_sibling(filename: str, module_name: str):
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load sibling module: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def trial_cap_for_delta(miss: float, delta: float = 1e-8) -> int:
    if miss <= 0.0:
        return 1
    if miss >= 1.0:
        raise ValueError("miss probability must be below one")
    return max(1, math.ceil(math.log(delta) / math.log(miss)))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--iterations", type=int, default=1)
    parser.add_argument("--max-evaluations", type=int, default=644)
    parser.add_argument("--kmax", type=int, default=16)
    args = parser.parse_args()
    if args.iterations < 1 or args.iterations > 4:
        raise SystemExit("--iterations must be in [1,4]")
    if args.max_evaluations < 1 or args.max_evaluations > 20000:
        raise SystemExit("--max-evaluations must be in [1,20000]")
    if args.kmax < 1 or args.kmax > 24:
        raise SystemExit("--kmax must be in [1,24]")

    checker = load_sibling(
        "agent2-rankfive-eight-direction-witness.py", "agent2_m8_checker"
    )
    adaptive = load_sibling(
        "agent2-rankfive-adaptive-anchor-pair-fullpath.py",
        "agent2_m8_adaptive",
    )

    # Exact rank distributions repeat across every candidate face set.
    original_rank_distribution = adaptive.rank_distribution

    @lru_cache(maxsize=None)
    def cached_rank_distribution(dimension: int, vector_count: int):
        return tuple(original_rank_distribution(dimension, vector_count))

    adaptive.rank_distribution = cached_rank_distribution

    original_extra_statistics = adaptive.extra_statistics

    @lru_cache(maxsize=None)
    def cached_extra_statistics(dimension: int, extra_count: int):
        expected, independent = original_extra_statistics(
            dimension, extra_count
        )
        return expected, tuple(independent)

    adaptive.extra_statistics = cached_extra_statistics

    original_pair_probes = adaptive.best_pair_probe_sets
    pair_probe_cache = {}

    def cached_pair_probes(model, face_index: int):
        if face_index not in pair_probe_cache:
            pair_probe_cache[face_index] = original_pair_probes(
                model, face_index
            )
        return pair_probe_cache[face_index]

    adaptive.best_pair_probe_sets = cached_pair_probes

    started = time.monotonic()
    model = checker.build_model(8)
    all_faces = tuple(model["faces"])
    current = set(adaptive.M8_FACE_SET)
    if not current.issubset(set(all_faces)):
        raise AssertionError("seed face set is not in the m=8 face universe")

    def universal_vertices(face_set):
        # A direction is omitted from every tested face iff its index occurs
        # in every complement triple.
        return [
            vertex for vertex in range(8)
            if all(vertex in face for face in face_set)
        ]

    def evaluate(face_set):
        faces = tuple(sorted(face_set))
        uncacheable = universal_vertices(faces)
        if uncacheable:
            raise ValueError(
                f"local candidate has uncacheable directions: {uncacheable}"
            )
        result = adaptive.exact_order_dp(
            model, faces, 8, 3, args.kmax
        )
        return {
            "faces": faces,
            "order": tuple(result["order"]),
            "total": result["total"],
            "miss": result["miss"],
            "remaining_kernels": result["remaining_kernels"],
            "uncacheable_vertices": uncacheable,
        }

    baseline = evaluate(current)
    if abs(float(baseline["total"]) - 160.312633363971) > 1e-9:
        raise AssertionError(
            "baseline m=8 objective drifted: "
            + str(float(baseline["total"]))
        )

    current_result = baseline
    iteration_summaries = []
    total_evaluations = 0

    for iteration in range(args.iterations):
        present = set(current_result["faces"])
        absent = set(all_faces) - present
        candidates = set()

        # Add/remove one face (13- or 15-face policies), and swap one face
        # (14-face policies).
        for face in present:
            candidates.add(frozenset(present - {face}))
        for face in absent:
            candidates.add(frozenset(present | {face}))
        for outgoing in present:
            for incoming in absent:
                candidates.add(frozenset((present - {outgoing}) | {incoming}))

        ordered_candidates = sorted(
            candidates,
            key=lambda candidate: (
                len(candidate),
                tuple(sorted(candidate)),
            ),
        )
        ordered_candidates = ordered_candidates[:args.max_evaluations]

        best = current_result
        evaluated = 0
        skipped_universal = 0
        for candidate in ordered_candidates:
            try:
                result = evaluate(candidate)
            except ValueError as error:
                if "uncacheable directions" in str(error):
                    skipped_universal += 1
                    continue
                raise
            evaluated += 1
            total_evaluations += 1
            if result["total"] < best["total"]:
                best = result
            if evaluated % 25 == 0:
                print(
                    "M8_LOCAL_PROGRESS "
                    + json.dumps({
                        "iteration": iteration + 1,
                        "evaluated": evaluated,
                        "total_evaluations": total_evaluations,
                        "best_total": float(best["total"]),
                        "best_faces": len(best["faces"]),
                        "elapsed_seconds": round(
                            time.monotonic() - started, 3
                        ),
                    }),
                    file=sys.stderr,
                    flush=True,
                )
            if evaluated % 20 == 0:
                gc.collect()

        improved = best["total"] < current_result["total"]
        iteration_summaries.append({
            "iteration": iteration + 1,
            "candidate_sets": len(ordered_candidates),
            "evaluated": evaluated,
            "skipped_universal": skipped_universal,
            "improved": improved,
            "start_total": float(current_result["total"]),
            "best_total": float(best["total"]),
        })
        current_result = best
        if not improved:
            break

    def serialize(result):
        total = result["total"]
        miss = result["miss"]
        return {
            "faces": [list(face) for face in result["faces"]],
            "optimal_order": [list(face) for face in result["order"]],
            "total_fraction": f"{total.numerator}/{total.denominator}",
            "total_queries": float(total),
            "miss_fraction": f"{miss.numerator}/{miss.denominator}",
            "miss_probability": float(miss),
            "trial_cap_for_miss_below_1e-8": trial_cap_for_delta(
                float(miss), 1e-8
            ),
            "remaining_kernels": result["remaining_kernels"],
            "uncacheable_vertices": result["uncacheable_vertices"],
        }

    output = {
        "search": "exact-order-DP one-swap neighborhood; not global m=8 search",
        "baseline": serialize(baseline),
        "best": serialize(current_result),
        "iterations": iteration_summaries,
        "total_evaluations": total_evaluations,
        "elapsed_seconds": round(time.monotonic() - started, 3),
        "model": {
            "width": 8,
            "face_universe": len(all_faces),
            "kernel_count": len(model["kernels"]),
            "kmax": args.kmax,
        },
    }
    print(json.dumps(output, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
