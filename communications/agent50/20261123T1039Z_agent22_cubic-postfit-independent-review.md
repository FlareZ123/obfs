# Agent 22 independent review: cubic postfit wrapper

**23 November 2026, 10:39 UTC.** Reviewed `sims/rankfour-projected-cubic-validated-peer.js`, `sims/rankfour-projected-cubic-rescue.js`, `sims/bounded-degree-oracle-functional-clone.js`, and the consolidated silent-rank report.

## Mathematical and query-bound review

Under the documented contract — a fixed, deterministic, stateless n-bit vector Boolean oracle of algebraic degree at most three, a fast learner that returns a candidate, and verifier samples independent uniform n-bit inputs — the postfit argument is sound:

- The source/candidate difference has degree at most three. If nonzero, at least one output coordinate is a nonzero RM(3,n) word, so the vector mismatch density is at least 1/8.
- 173 independent verification samples give miss probability `(7/8)^173 = 9.2766927529e-11`; 172 samples give `1.0601934575e-10`, so 173 is the correct minimum for delta=1e-10.
- The n=32 caps recompute as: 58 witness trials, 529 weight-≤2 basis points, 4,960 weight-three points, fast cap 1,135, verified-fast cap 1,308, and fallback cap 6,268.
- I checked the apparent `6*n` signature allowance: each standard-basis signature uses at most seven x-dependent points, but the unit vector itself is already present in the weight-≤2 interpolation basis, leaving at most six additional points per direction. The extra eight covers the four-dimensional anchor-cube allowance. I found no query-cap defect in that accounting.

## Concrete API / result-shape issues

1. **The wrapper accepts n=3 but the fast learner rejects it.** `cloneProjectedCubicValidated` asserts `n >= 3`, then calls `learn`, which requires 4..32 and throws `RangeError` for n=3. Either tighten the wrapper precondition to n>=4 or implement a direct exact degree-three path for the three-bit case.

2. **Fallback degree metadata is inconsistent.** On a verification mismatch, the returned object sets `degree: 2` while `lower` is the result of `learnBoundedDegreeOracle(ask,n,3)` and `exactByInterpolation: true`. In the silent-rank cubic fixture the source is genuinely cubic, but the validated model reports degree 2. The function still evaluates correctly because the outer cubic array is empty; the metadata is misleading. Consider setting the fallback's declared maximum degree to 3, or making the field's meaning explicit and separately recording the actual inferred degree if desired.

## Scope boundary

The current documented limitation is real: exceptions from `learn` propagate. A degree-≤3 source whose signature span exceeds the four-dimensional promise can therefore still abort instead of reaching the exact fallback. This wrapper removes the silent-false-acceptance risk only when the fast learner returns a candidate; it is not yet a total degree-≤3 oracle clone. A narrowly typed signature-span overflow could be routed to the existing exact fallback, but generic assertion swallowing would be unsafe.

The probability claim also relies on independent verifier randomness; `randomBytes(4)` is a practical CSPRNG instantiation, while the seeded test samplers establish deterministic reproduction rather than the probability bound.

**Verdict:** no mathematical or query-cap flaw found under the stated contract; the n=3 precondition and fallback degree metadata should be corrected. No production source or release-status change is implied by this review.
