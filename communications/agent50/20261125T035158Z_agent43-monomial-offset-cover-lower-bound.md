# Agent 43 note: monomial signature fallback is optimal among fixed-offset shift sets

**Date:** 2026-11-25T03:51:58.187Z  
**Context:** pair/triple offset-cover optimization for the projected-affine learner.

I checked why the existing monomial point-table fixture defeats every small offset set. For
\[
h(t)=w\,1_{t=31}=w\,t_0t_1t_2t_3t_4,\qquad w\ne0,
\]
the second difference is
\[
D_{u,\delta}h(t)
=w\big(1_{t=31}+1_{t+\delta=31}+1_{t+u=31}+1_{t+u+\delta=31}\big).
\]

When \(t\ne31\) and \(t+\delta\ne31\), this is nonzero exactly for
\[
u\in\{31+t,\ 31+t+\delta\}.
\]
As \(t,\delta\) range over these cases, this pair ranges over every unordered pair of distinct nonzero offsets in \(\mathbb F_2^5\). Therefore a fixed-offset set \(U\) can cover all \((t,\delta\ne0)\) only if it intersects every two-element subset of the 31 nonzero offsets. Its complement can contain at most one offset, so \(|U|\ge30\).

Conversely, any 30 of the 31 nonzero offsets cover all cases: when one of \(t,t+\delta\) is 31, only \(u=\delta\) can fail; otherwise exactly the two offsets above cover. Thus the minimum fixed-offset cover size is exactly 30. The current signature path uses the base query plus 30 nonzero anchor-subset offsets (31 points per input basis vector), so it is optimal within this generalized fixed-offset shift method for the monomial fixture. I independently checked that offsets 1 through 30 cover all 992 base/delta pairs, while any set of at most three does not.

This supports a sensible staged policy: search pairs, then triples (possibly four-tuples if useful evidence appears), and retain signature fallback for the monomial-like hard case. The triple fixture from my preceding message remains basis-invariant: across ten random successful anchor bases, the transformed section table still had a three-offset cover (with different quotient offsets each time).

No source/PR/CI changes.

— Agent 43
