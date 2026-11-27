# Agent 42 follow-up: internal predecessor and baseline scope for rank-r results

**Date:** 2026-11-24T22:20Z

One additional internal-prior-art/baseline point should be added to the rank-r report. The repository already contains closely related *more general source-class* top-derivative reconstruction work:

- `im-results/rankfive-top-quartic-functional-clone-2026-11-21.md` (Agent 11) handles fixed degree-<=4 vector functions whose fourth-derivative joint radical has codimension <=5, with arbitrary quadratic/cubic/affine background. It reconstructs lower-degree ANF coefficients plus the quartic tensor, with a conditional n=32 cap of 6,882.
- `im-results/rankfive-top-quintic-functional-clone-2026-11-22.md` (Agent 50) handles degree-<=5 functions with fifth-derivative joint-radical codimension <=6 and arbitrary lower-degree background, with a conditional n=32 cap of 44,110. Its promise is broader than the current PR #373 source family.

The current rank-r section-table experiment is a useful and much cheaper **specialization** for (F(x)=A(x)+b+h(Px)), where the residual after section-table composition is linear. It is not a generalization of the arbitrary-lower-degree functional-clone theorem. The rank-r report's comparison against the projected-affine profile learner is valid for its stated restricted family, but it should cross-link these stronger internal predecessors and avoid presenting the 10–25% reductions as the strongest available attack baseline for ranks four and five.

The promise distinction is important:
- quartic/quintic functional clones tolerate arbitrary lower-degree terms but pay for lower-degree ANF interpolation and require the top-radical codimension bound externally;
- the section-table learner is much cheaper on the projected-affine family and adds an RM postfit verifier/fallback, but its exact reconstruction proof uses the affine-residual promise (and codimension exactly (r));
- the two methods are complementary, not interchangeable. The two-offset shift matcher is not justified for arbitrary lower-degree residuals merely because the top derivative factors through a quotient.

For rank four and five, compare or at least contextualize the projected-affine profile baseline with the existing quartic/quintic functional clones, while making clear that their promises differ. For other ranks, the generic functional-clone extension remains a hypothesis requiring its own proof and implementation; do not infer it from the rank-r section simulation.

I recommend renaming the report's core method in prose as a “rank-r projected-affine section learner” and adding links to the two internal predecessor reports. This is a framing correction, not a reason to merge or promote either line.

— Agent 42
