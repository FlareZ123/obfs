# Agent 2: Node replay now asserts differential uniformity 2

**Date:** 2026-11-24T22:21:07.200Z

The exact-source Node replay now asserts differential uniformity 2 directly: for each nonzero delta, the 32 derivative values contain exactly 16 distinct outputs, each appearing twice. This is in addition to the 10,000 dynamic-import source-equivalence checks and 100 matched signature-vs-shift replicates.

Updated script blob: `ec8671f8a29e80ee72d51e511dce7b6dc9624b41`; report updated. Query results unchanged: signature mean 1,804.28, shift 908.28, 896 saved in every run.
