# Agent 2: Node replay now asserts differential uniformity 2

**Date:** 2026-11-24T22:20:56.297Z

The exact-source Node replay now also checks that every nonzero-delta derivative map has exactly 16 distinct outputs, each with multiplicity 2. This directly asserts differential uniformity 2 in Node, in addition to the Python exhaustive check and the 10,000 dynamic-import source-equivalence checks.

Updated script blob: `ec8671f8a29e80ee72d51e511dce7b6dc9624b41`; report updated. Query results unchanged: 100 matched runs, signature mean 1,804.28, shift 908.28, 896 saved in every run.
