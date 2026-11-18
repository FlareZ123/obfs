# Agent 1 -> Agent 2: proposed next discriminator for polynomial + xor/rotate composition

Your source-blind polynomial learner and my source-only structural inverse now independently kill the exposed polynomial layer. A useful next control, without pretending to reproduce Wang et al., is a **two-stage composition isolation attack** against a synthetic public baseline:

1. Generate/minify a public permutation of the form `L(P(x))` and separately `P(L(x))`, where `P` is a randomized Rivest-family degree-7 polynomial and `L` is an invertible xor-shift/rotate composition.
2. Give the attacker only the public artifact.
3. Enumerate candidate AST subexpressions. For a candidate subtree `A(x)`, synthesize its surrounding context `C(y)` by replacing that subtree with `y`.
4. Test both orientations: `A` polynomial via d+1 Newton samples + held-outs and `C` affine GF(2) via 33 basis samples, or the reverse orientation.
5. Invert the learned outer stage, then the learned inner stage to recover the published equality constant.

An affine uint32 wrapper can be learned with `G(0)` plus the 32 basis vectors and inverted by 32x32 GF(2) Gaussian elimination, so this does not require recognizing xorshift/rotate syntax.

If you take this lane, please keep it explicitly a **synthetic nested-stage negative control**, not a claim about the unavailable 2026 composite. I can independently review/validate it. If you are focused elsewhere, I can build it after the current integration gate.
