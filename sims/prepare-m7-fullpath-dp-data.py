#!/usr/bin/env python3
"""Prepare exact m=7 full-path DP inputs.

Requires NetworkX for graph_atlas_g(), which supplies one representative of
each unlabeled simple graph on seven vertices. The generated files are consumed
by agent2-rankfive-m7-fullpath-face-order-dp.cpp.
"""
from __future__ import annotations

import importlib.util
import json
from collections import Counter
from pathlib import Path

import networkx as nx


def load_checker():
    path = Path(__file__).with_name("agent2-rankfive-eight-direction-witness.py")
    spec = importlib.util.spec_from_file_location("agent2_m7_checker", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    checker = load_checker()
    model = checker.build_model(7)
    faces = list(model["faces"])
    face_index = {face: i for i, face in enumerate(faces)}
    kernel_count = len(model["kernels"])
    graph_masks = []

    for graph in nx.graph_atlas_g():
        if graph.number_of_nodes() != 7:
            continue
        graph = nx.convert_node_labels_to_integers(graph, ordering="sorted")
        mask = 0
        for u, v in graph.edges():
            edge = tuple(sorted((u, v)))
            mask |= 1 << face_index[edge]
        graph_masks.append(mask)

    graph_masks = sorted(set(graph_masks))
    edge_histogram = Counter(mask.bit_count() for mask in graph_masks)
    expected_histogram = {
        0: 1, 1: 1, 2: 2, 3: 5, 4: 10, 5: 21, 6: 41,
        7: 65, 8: 97, 9: 131, 10: 148, 11: 148, 12: 131,
        13: 97, 14: 65, 15: 41, 16: 21, 17: 10, 18: 5,
        19: 2, 20: 1, 21: 1,
    }
    if len(graph_masks) != 1044 or dict(edge_histogram) != expected_histogram:
        raise AssertionError("graph atlas representatives/histogram mismatch")

    fail_patterns = []
    for kernel_index in range(kernel_count):
        pattern = 0
        for face_index_value, fail_mask in enumerate(model["fail_masks"]):
            if (fail_mask >> kernel_index) & 1:
                pattern |= 1 << face_index_value
        fail_patterns.append(pattern)

    output_dir = Path(__file__).resolve().parent / "data" / "m7-fullpath"
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "m7_graph_masks.txt").write_text(
        "".join(f"{mask}\n" for mask in graph_masks)
    )
    (output_dir / "m7_kernel_fail_patterns.txt").write_text(
        "".join(f"{pattern}\n" for pattern in fail_patterns)
    )
    with (output_dir / "m7_cover_masks.txt").open("w") as stream:
        for cover in model["cover_masks"]:
            low = cover & ((1 << 64) - 1)
            high = cover >> 64
            stream.write(f"{low} {high}\n")

    manifest = {
        "networkx_version": nx.__version__,
        "graph_representatives": len(graph_masks),
        "edge_count_histogram": dict(sorted(edge_histogram.items())),
        "kernel_count": kernel_count,
        "face_count": len(faces),
        "rank5_probability": {
            "numerator": model["rank_probability"].numerator,
            "denominator": model["rank_probability"].denominator,
        },
        "face_order": [list(face) for face in faces],
        "graph_masks_sha256": __import__("hashlib").sha256(
            (output_dir / "m7_graph_masks.txt").read_bytes()
        ).hexdigest(),
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({
        "output_dir": str(output_dir),
        "manifest": manifest,
    }, indent=2))


if __name__ == "__main__":
    main()
