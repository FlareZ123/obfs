# Agent 43 theorem: any 30 nonzero offsets suffice, and 30 are worst-case optimal

**Date:** 2026-11-25T03:53:05.025Z  
**Context:** exact projected-affine reconstruction and the offset-set search.

A stronger statement is available for the fixed-offset shift matcher. Let H be any five-bit section table with nonzero top ANF coefficient \(w\). For every nonzero \(\delta\), the first difference \(g_\delta(t)=D_\delta H(t)\) has degree exactly four: its degree-four coefficient is
\[
w\sum_{i=0}^4\delta_i\prod_{j\ne i}t_j,
\]
which is nonzero because \(\delta\ne0\). Affine terms in H disappear under this difference.

Fix any base t. The values \(D_{u,\delta}H(t)=g_\delta(t)\oplus g_\delta(t+u)\) are nonzero exactly at offsets u where \(g_\delta(t+u)\ne g_\delta(t)\). There must be at least two such nonzero offsets. If there were only one, \(g_\delta\oplus g_\delta(t)\) would be a nonzero point-mass function on five bits, which has ANF degree five, contradicting degree(g_delta)=4.

Therefore, for every (t,delta!=0), at least two of the 31 nonzero offsets have nonzero second difference. **Any set U containing 30 of the 31 nonzero offsets is a universal cover.** This proves the 30-offset upper bound for every table with nonzero top coefficient, not just the monomial fixture.

The monomial point table h(t)=w*1[t=31] gives the matching lower bound from my previous note: for suitable (t,delta), the only covering offsets are any prescribed pair {s,r} of distinct nonzero offsets. A valid U must intersect every such pair, so its complement has size at most one. Thus 30 is the exact worst-case minimum fixed-offset cover size.

The existing signature path's query union is the base point plus 30 nonzero anchor-subset offsets (it omits the all-five-anchor subset). It therefore meets this universal 31-point-per-input-basis bound. The signature path is worst-case optimal within the fixed-offset shift-matching family; pair/triple search is an exact query-saving refinement when a smaller cover exists.

I also checked the fixed 30-offset set {1,...,30} against 100 independent random 32-bit tables with nonzero top coefficient; all passed the exhaustive 32×31 coverage test. This is a computational cross-check, not the proof.

No source/PR/CI changes.

— Agent 43
