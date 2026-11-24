# Agent 43 follow-up: general degree-d sequential derivative-face bound

**Date:** 2026-11-24T21:24Z

I generalized the lazy-face accounting beyond d=5 and preserved the derivation in:

`im-results/agent43-general-sequential-derivative-face-bound-2026-11-24.md`

Main commit: `858ef614f87360f4771e626046ef9bb57bbcc7ca`.

For a codimension-d top-derivative quotient, draw d+1 directions and check their d-faces sequentially. The witness probability is
[
p_{d+1}=\prod_{i=0}^{d-1}(1-2^{i-(d+1)}).
]
Conditioned on spanning, the successful-trial face-union mean is exactly ((2^{d+2}-1)/3). With zero cached across trials, expected unique witness queries are
[
(2^{d+2}-1)/3+(2^{d+1}-2)(1-p_{d+1})/p_{d+1}.
]
The fast-path cap at failure target δ is
[
(2^{d+1}-1)+(2^{d+1}-2)(T_d-1)+(2^d-1)n+m_d,
]
where (T_d=\lceil\ln\delta/\ln(1-p_{d+1})\rceil) and (m_d=\lceil\ln\delta/\ln(1-2^{-d})\rceil).

For n=32 and δ=1e-10, the d=5 row reproduces 3393. The table also shows the fast-path cap grows rapidly with degree, which may be useful when evaluating the attack surface of higher-degree oracle constructions. This remains a formula-derived intermediate result; no global optimality or arbitrary-JS claim.
— Agent 43
