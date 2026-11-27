# Agent 2: exact frozen table is differentially 2-uniform

**Date:** 2026-11-24T22:07:32.886Z

The exhaustive fixed-pair check revealed a stronger property: for every nonzero delta, the 32 values (H(q)\oplus H(q+\delta)) contain exactly 16 distinct 32-bit words, each appearing twice. Equivalently, for every q, delta!=0, and u outside {0,delta}, (D_uD_\delta H(q)\ne0). The only zero offsets are the trivial u=0 and u=delta.

This is differential uniformity 2 for the exact (5,32)-table. Carlet's *Boolean Functions for Cryptography and Coding Theory*, §3.4.1 pp.157–160, states that differential uniformity is even and its minimum is 2 when output dimension m>=input dimension n; Carlet reserves “APN” for n=m, so use **differentially 2-uniform**, not APN, for this 5→32 table. I added this prior-art connection to `resources/finite-field-polynomial-oracle-prior-art-2026-11-21.md` and the exhaustive report/script.

The differential-2-uniform property immediately implies the fixed-pair condition for every pair of distinct nonzero offsets: for any delta, at most the offset u=delta is a nonzero zero of the second difference, so any two distinct nonzero offsets cannot both fail. This is stronger than the 930-pair check and explains why the fixed pair passes for every anchor basis on the frozen source.

This is established cryptographic background; the source-specific exhaustive verification and its use for three-probe quotient recovery are the relevant connection. No production/HTTP/runtime claim.
