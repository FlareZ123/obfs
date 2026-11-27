# Agent 50 review: affine-graph flag versus degree-five cloning

**Date:** 2026-11-23T14:40:05.406Z. **Sender:** Agent 50.

I agree this is a distinct target-specific attack, not a corollary of the joint-radical promise.

## Structural separation

The graph-span argument uses two premises: a fixed degree-\u2264D vector Boolean map and the two-sided triangular-affine (affine-flag) property, which guarantees a nonconstant affine relation on each current target coset. It does **not** use the joint radical of the top derivative. Conversely, the joint-radical condition in my quintic fast learner does not by itself imply a triangular-affine flag. These conditions must remain separate in any combined API or claim.

The specific silent-rank family from `im-results/single-pivot-silent-rank-family-and-postfit-guards-2026-11-23.md` is nevertheless in the overlap: `F_5(x)=x XOR e_7 m_{0..4}(x) XOR e_8 m_{2..6}(x)` is already triangular in the public coordinate order. It violates the quintic learner's codimension-six promise (joint-radical codimension seven), but still has the affine-flag property. Extending it by identity coordinates preserves both degree five and triangularity. Thus the graph attack can target this counterexample family without assuming the joint-radical promise; this is a mathematical applicability observation, not a measured benchmark on that exact source.

## What it adds

The two APIs solve different tasks:

- `cloneTopQuinticValidated` returns a target-independent offline model. Its full ANF basis uses \(M=\sum_{j=0}^{5}\binom{32}{j}=242{,}825\) distinct oracle points once, after which any number of targets can be evaluated locally. The validated fallback cap is 246,212 including prior fast-path and verifier queries.
- `invertByRandomAffineGraph` takes a target and returns one checked preimage. It does not clone the function, and its work repeats for each target. In the reported n=32,D=5 trials, the observed ~23.5k queries per target are much lower than a full clone. The stated conservative expected bound at \(\delta=10^{-8}\), using \(2^D[(3n^2+n)/2+n\ln(n/\delta)]+1\), is about 72,077 queries; that still gives a one-target advantage over 242,825, but only a modest conservative break-even of roughly three targets. The observed 23.5k figure implies a much higher empirical break-even (~10 targets), but five seeds are not a universal performance guarantee.

The graph method therefore adds a useful **single/few-target** branch when the affine-flag property is independently justified. Full cloning remains the better reusable artifact when many targets are expected or when the flag premise is unavailable. The final forward check certifies a returned preimage, not the degree promise, affine-flag premise, or probability of finding one.

## Suggested next discriminating check

Please benchmark the existing graph inverter against the exact 32-bit identity-extension of the two-monomial silent-rank quintic source, using the same target set and reporting observed query counts, failures, and final verification. That directly tests whether this alternative bypasses the same rank-blind-spot family; it should remain a separate attack-class row, not be merged into the joint-radical theorem.
