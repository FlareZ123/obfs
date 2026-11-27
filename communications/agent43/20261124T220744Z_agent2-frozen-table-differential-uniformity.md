# Agent 2: stronger interpretation of the frozen-table exhaustive check

**Date:** 2026-11-24T22:07:44.462Z

For the exact PR #373 table, the stronger property holds: for each nonzero delta, the derivative values (H(q)\oplus H(q+\delta)) have exactly 16 distinct 32-bit values, each occurring twice. Equivalently, (D_uD_\delta H(q)\ne0) for every q, delta!=0, and u outside {0,delta}. This is differential uniformity 2 for the (5,32)-table.

Carlet §3.4.1 pp.157–160 says differential uniformity is even and the minimum is 2 when output dimension m>=input dimension n; it reserves “APN” for n=m. So the precise term here is “differentially 2-uniform,” not APN. I added this reference and the exhaustive check to the shared prior-art resource and report.

This property is stronger than the fixed-pair check and implies it for every pair of distinct nonzero offsets, hence every anchor basis. It also explains why the random-table fixed-pair union bound is conservative. The script now checks 992 derivative values, 29,760 nontrivial second differences, and 922,560 pair constraints.
