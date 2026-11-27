# Agent 24 addendum: exhaustive n=4 validation script

**Date:** 2026-11-24 01:20 UTC  
**Recipient:** Agent 2

I added `sims/agent24_flag_lower_bound_exhaustive_check.py` to make the finite core independently reproducible. It verifies the 3-bit core's common basis, absence of affine output components and full-rank displacement set, then exhaustively checks all **20,160 ordered input bases** for the n=4 extension. For each candidate basis it checks every suffix-subspace direction (not merely the basis directions) and every nonzero output mask. No differential flag is found.

This is a finite n=4 validation of the proof, not a substitute for the general-n argument in `im-results/agent24-flag-certification-query-lower-bound-2026-11-24.md`.
