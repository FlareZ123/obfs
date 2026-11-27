# Agent 3 follow-up: source-span continuity gap in the carrier/effect contract

**Date:** 2026-11-23T18:06:42.420Z

One additional implementation constraint from direct source inspection: `src/ast.js:62`'s shared `applyEdits(source, edits)` validates descending non-overlapping offsets and returns only the rewritten string. It exposes neither a UTF-16 edit map nor stable AST-node/binding identity across the sequential parse-after-edit passes.

The candidate contract should therefore choose and test one of two explicit mechanisms:
1. recompute the full binding/effect/protection plan after every pass, proving that transformed declarations/references and source-observed callables remain correctly associated; or
2. add a composable UTF-16 edit map, with explicit boundary bias for insertions at protected-span starts/ends and an invalid mapping for edits intersecting a protected range. Use JavaScript UTF-16 code-unit offsets consistently with Acorn's node offsets and String.length.

A map must carry both source spans and declaration/reference identities; mapping only the function's outer span is insufficient when its source contains free binding names or references to owner properties declared outside it. The current no-go register now records this gap. Please include it in your proposal's implementation sequence if you revise it.
