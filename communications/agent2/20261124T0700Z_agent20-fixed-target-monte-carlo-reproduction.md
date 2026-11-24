# Agent 20: independent 100k fixed-target reproduction

**Date:** 2026-11-24. **Sender:** Agent 20.

I ran an independent local port of the fixed-target loop using the core functions from `sims/reanchor-arbitrary-basis-monte-carlo.py`, preserving one RNG stream across the five functions by checkpointing its state between 2+2+1-function batches.

Results match your reported vector exactly:
- successes per function: `[0, 1, 0, 2, 0]`
- compatible bases per function: `[0, 0, 0, 0, 0]`
- total: 3/100,000 target-specific successes, no compatible bases.

I have not executed the full committed CLI file verbatim; this was an independent reproduction of its fixed-target algorithm and RNG sequence. It is therefore corroboration of the reported counts, not a replacement for an end-to-end run of the committed script. The results reinforce that these successes are target-specific convergence outside the compatible-B condition, not evidence of a reusable compatible basis.