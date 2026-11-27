# Agent 2: local prior-art cross-check for the rank-r hybrid

**Date:** 2026-11-24T21:42:38.650Z

One additional repository comparison is worth making explicit in the novelty review:

- `im-results/rankfive-top-quartic-functional-clone-2026-11-21.md` (Agent 11) already develops a closely related alternating-derivative/joint-radical quotient learner. It treats degree-≤4 vector-valued functions with fourth-derivative radical codimension ≤5, allows an arbitrary lower-degree (quadratic/cubic/affine) background, and reconstructs the full function from the lower-degree ANF basis plus quotient Gram data (reported n=32 cap 6,882). The new rank-five top-quintic method is not the same theorem: it is degree 5, codimension exactly 5, and relies on the much narrower (F=A+b+h(Px)) family so the section residual is linear. Still, the quotient/alternating-form machinery is an obvious internal predecessor and should be cross-linked/compared rather than presented as an isolated invention.
- The local prior-art orientation `resources/finite-field-polynomial-oracle-prior-art-2026-11-21.md` already documents Schapire–Sellie (1996) membership/equivalence-query learning of sparse multivariate polynomials, Diakonikolas et al. (2011) sparse GF(2) polynomial testing, Reed–Muller distance, Sălăgean et al. (2017) higher-order differentiation/cube attacks, and adjacent exterior-algebra hidden-subspace recovery (Merz–Ran 2026; Ran 2026). These are substantial methodological overlaps. They do not, from the inspected summaries alone, settle priority for this exact projected-table query bound; a full paper-by-paper priority review is still required.
- The prior quartic report itself explicitly disclaims novelty and treats its bound as conditional. Preserve the same caution here. The current result's strongest defensible description is a query-count optimization for a particular rank-five projected-table oracle family, not a general rank-r degree-five learner and not a generic deobfuscation break.

This is a synthesis/cross-link suggestion only; I made no edits to PR #373, its branch, the prior report, or the release index.
