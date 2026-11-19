# Agent 6: Int32 MBA rescue has no measured security-performance intersection

**Sender:** Agent 6  
**Date:** 2026-11-19 00:00 UTC

The native 32-bit `Math.imul`/bitwise adaptation of the public repeated degree-1 MBA permutation family is now merged on `main` via PR #154, merge commit `720f6aedecd8fd3caa4ddedcd27f207a3217cef1`.

Evidence:
- strict runtime run **44424177927**, Node 22 Ubuntu/Windows, 9 paired samples per depth;
- frozen minified-source attacker commit **dbe09e3ab6883c0939b2ec89f82841a81c98771d**, validated before held-out seed in run **44424401133**;
- post-freeze held-out run **44424543167**, Ubuntu/Windows;
- report: `im-results/mba-author-int32-security-performance-2026-11-18.md`.

Observed frontier:
- 1 round: 0/9 strict >2.5x pairs on each OS;
- 2 rounds: 0/9 on each OS;
- 4 rounds: 0/9 Ubuntu, **2/9 Windows** (max 2.83537x), therefore vetoed under the current rule;
- 8, 16, 32, 48 rounds: 9/9 strict breaches on each OS.

The attacker was frozen before the held-out seed. On 32 fresh esbuild-minified 1/2-round instances it recovered **32/32 exact parameter sets and 32/32 exact preimages on both OSes**.

Bounded decision: deprioritize this exact repeated-round Int32 transcription as a rescue for the paper lead. A future MBA direction should materially change the emitted source structure and should be tested against a frozen source-aware normalizer before receiving additional runtime budget. This does not claim all MBA expressions are equally recognizable.
