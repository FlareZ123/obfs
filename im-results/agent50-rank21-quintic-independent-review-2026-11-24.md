# Independent review: rank-21 quintic graph versus low-rank inversion

**Reviewer:** Agent 50. **Date:** 2026-11-24. **Classification:** independent source algebra and low-rank receipt reproduction; graph receipts checked against source instrumentation and CI, not independently reimplemented.

## Verdict

The rank-21 source construction is valid. I independently verified 21 independent nonlinear output directions, exact degree five, a 32-dimensional affine part, and joint top-derivative radical codimension seven. I also independently reproduced all eight first-batch low-rank inversion receipts, including every public secret, target, nullity, sample count, orbit length and total query count.

For the first wrapper / first sample stream, the graph method uses 219,173 oracle calls and the rank-21 low-rank method uses 8,240,277: **37.597x fewer calls for the graph method** on that selected batch. This is a valid regime-specific comparison. It does not establish a universal winner, and it is not a runtime benchmark.

The expanded test now covers two wrappers, two sample streams and eight targets (32 matched cases). Focused workflow 45339444109 passed on Ubuntu and Windows at branch commit 8f200164c327f5fc94f434791940c7c72dc85075. The report's detailed 37.597x table remains the first eight-target / first-wrapper / first-sample batch; it should not be presented as the aggregate 32-case ratio.

## Source construction and algebra

The core map has identity coordinates except output bits 7 through 27. For each such bit i,

\[
P_i(x)=x_i\oplus m_i(x_0,\ldots,x_6)\oplus q_i(x_0,\ldots,x_{i-1}),
\]

where:

- the 21 top monomials m_i are exactly the 21 distinct degree-five monomials on all five-element subsets of seven low input bits;
- each q_i is the XOR of five deterministic monomials of degree two through four for the fixed seed 0x5eed21;
- output bits 28 through 31 remain identity.

The source is triangular with diagonal one: output coordinate i depends only on input coordinates at most i and contains x_i with coefficient one. It is therefore a permutation by sequential inversion. The lower-degree q_i terms cannot cancel or duplicate a degree-five leading monomial.

My independent verifier, sims/agent50-rank21-quintic-independent-check.js (commit 6bc898cfffc2a4afb9288245ca0fc130e2b6d186), confirms:

| Property | Independent result |
|---|---:|
| Distinct degree-five top masks | 21 |
| Union of top-mask supports | 0x7f |
| Lower-degree terms per nonlinear output | 5 each |
| Restricted nonlinear displacement rank on 128 low-seven inputs | 21 |
| Rank of wrapped affine part A0 | 32 |
| Rank of wrapped nonlinear output directions W | 21 |
| Joint fifth-derivative radical in seven-bit core | {0} |
| Joint radical codimension in core | 7 |

The radical check is exhaustive: all 128 core vectors were tested against all 35 standard-basis four-tuples in the fifth-difference contraction. The 21 five-subsets cover all seven coordinates, so the joint radical is zero. The 25 identity-extension coordinates are common radical directions; the 32-bit joint-radical codimension remains seven. Invertible affine input/output wrappers preserve the rank and radical codimension.

This independently confirms that the source lies outside the rank-six learner's codim(R)<=6 promise. It does not imply that degree five alone bounds nonlinear output rank; the rank-21 value comes from the explicit construction.

## Independent low-rank receipt reproduction

I reconstructed the exact first wrapper and sample stream and independently ported the Las Vegas low-rank inversion steps. Every target was recovered and forward-verified. All eight interpolants had nullity one and used two sample calls. The 33 interpolation calls plus two samples plus orbit calls give the exact receipt totals.

| Target index | Public secret | Public target | Orbit calls | Low-rank calls |
|---:|---:|---:|---:|---:|
| 0 | 0x52c24772 | 0x461bb823 | 121,581 | 121,616 |
| 1 | 0xdcc55f44 | 0x3c8a8c58 | 2,082,189 | 2,082,224 |
| 2 | 0xa58a6017 | 0x8279d961 | 1,771,687 | 1,771,722 |
| 3 | 0x25f36e7f | 0x4d01e661 | 198,184 | 198,219 |
| 4 | 0xffed8e00 | 0x2a73a8e6 | 959,378 | 959,413 |
| 5 | 0x32b8446b | 0x16354d16 | 1,343,226 | 1,343,261 |
| 6 | 0x47996934 | 0x6a3c9d19 | 214,261 | 214,296 |
| 7 | 0xdf8401f6 | 0x2b67a353 | 1,549,491 | 1,549,526 |
| **Total** | **8/8** | — | **8,239,997** | **8,240,277** |

The 280-call difference is exactly 35 fixed calls per target: 33 affine interpolation queries and two successful completion samples.

## Matched graph comparison

Agent 2's source-pinned report records these graph query counts for the same first wrapper/sample batch:

| Target index | Graph calls | Low-rank calls |
|---:|---:|---:|
| 0 | 27,417 | 121,616 |
| 1 | 27,382 | 2,082,224 |
| 2 | 27,414 | 1,771,722 |
| 3 | 27,381 | 198,219 |
| 4 | 27,387 | 959,413 |
| 5 | 27,386 | 1,343,261 |
| 6 | 27,407 | 214,296 |
| 7 | 27,399 | 1,549,526 |
| **Total** | **219,173** | **8,240,277** |

The graph algorithm's query wrapper increments its counter at each oracle call, including relation discovery and verification. I inspected that instrumentation and the focused test's assertions. I did not independently reimplement the graph algorithm; the graph-side counts remain the source-pinned test receipts. The independent Node verifier independently reproduces the low-rank side and the source algebra.

## Expanded sweep and API scope

The latest focused test covers 2 affine wrappers × 2 sample seeds × 8 targets = 32 matched cases. It verifies exact preimages for both methods, checks the low-rank rank/nullity/sample/orbit bounds, and asserts the aggregate graph query count is lower than the aggregate low-rank count. Run 45339444109 passed on both Ubuntu and Windows at source commit 8f200164c327f5fc94f434791940c7c72dc85075.

I independently extended the verifier to reproduce all 32 low-rank runs. It matches the aggregate **32,341,215** low-rank calls, with per-target range **4,011–2,082,224**, sample count range 1–2, orbit range 3,977–2,082,189, and nullity one in all cases. The expanded CI run reports **876,925** graph calls, per-target range **27,377–27,450**. The aggregate ratio is therefore **36.880x** in favor of graph inversion. At least one low-rank run (4,011 calls) is cheaper than every graph run; graph is not uniformly better per target.

The detailed **37.597x** ratio in the first table is specifically the first eight-target / first-wrapper / first-sample batch. It must not be confused with the aggregate 32-case ratio **36.880x**. The independent verifier now covers both the first-batch receipts and the 32-case low-rank sweep (latest commit 3d148a9f6407f357ae481d5d8196ae606f86cd17).

The low-rank comparison is the Las Vegas API with explicit rankBound=21 and maxRankBound=21. The default maximum remains 16; the higher cap is opt-in. The deterministic low-rank API remains separately capped at 16. The rank-21 experiment uses a deterministic sample callback with a 96-sample cap; the first batch needs two samples per target. These are attacker-side oracle-query counts, not obfuscator CPU runtime.

## Shared-cache graph follow-up

Agent 2 added a separate shared-cache follow-up (run 45340510713, both platforms passing, source commit 6637571566d115bc70b3eaf6da8671c81c03b709). It runs one fixed graph seed per wrapper/sample batch and shares a Map-backed oracle-result cache across all eight targets. The test separately records total graph query-wrapper calls and unique cache inputs.

| Batch | Graph calls (including cache hits) | Graph unique inputs | Cache reuse | Largest low-rank orbit | Low-rank lower-bound / graph unique |
|---|---:|---:|---:|---:|---:|
| Wrapper 0 / sample 0 | 219,162 | 130,032 | 89,130 | 2,082,189 | 16.01x |
| Wrapper 0 / sample 1 | 219,121 | 129,829 | 89,292 | 2,048,076 | 15.78x |
| Wrapper 1 / sample 0 | 219,225 | 129,196 | 90,029 | 2,064,800 | 15.98x |
| Wrapper 1 / sample 1 | 219,291 | 129,123 | 90,168 | 2,074,107 | 16.06x |

I independently reproduced the four largest low-rank orbit lengths from the 32-case sweep and added assertions for them to sims/agent50-rank21-quintic-independent-check.js (latest commit 0b2ae4c942e8d03db98c007270276e93f3b530ea). Each orbit returns to its starting state only after L distinct queried inputs, so even a perfect cross-target low-rank cache cannot use fewer than L unique inputs for that batch. This lower bound deliberately excludes affine setup and sample queries, making the comparison conservative for low-rank. It is specific to the fixed completion sample seeds (the sampler is reset and replays the same sequence for each target) and this implementation, not a lower bound for every possible low-rank algorithm or sample choice.

The graph test's Map is shared across eight targets within each batch, not across sample batches. Its cache wrapper counts every invocation separately from unique raw-oracle inputs; the test asserts the total wrapper calls match the graph's reported calls and unique inputs equal Map size. Thus the graph side is an exact shared-cache count, while the low-rank side is a conservative single-orbit lower bound. The four batches show at least 15.78x fewer unique inputs for graph under this fixed schedule. The graph is not uniformly cheaper for every individual target: the 32-case low-rank minimum is 4,011 calls, below the graph per-target range 27,377–27,450.

This follow-up materially strengthens the aggregate comparison and addresses the earlier amortization mismatch. It still does not measure cross-sample graph-cache reuse (which may reduce graph unique inputs further), nor the union of all low-rank target orbits (which may increase low-rank unique inputs). Both are left unmeasured; the stated lower bound does not assume any cross-target orbit disjointness.

## Fairness and limitations

The comparison is fairly scoped as a matched case study: both algorithms receive the same forward oracle and target, both return an exact preimage, and both have their results checked by the forward oracle. They are given different explicit structural promises:

- graph inversion exploits the affine-flag structure of the triangular source;
- low-rank inversion is given the nonlinear output-displacement upper bound 21.

Both algorithms use fixed seeds in the test, and their reported counts include oracle calls made during their respective discovery/sampling and verification phases. The low-rank method is Las Vegas with bounded sampling; the graph method uses a seeded randomized affine-graph search with delta=1e-8. The 32-case sweep reduces dependence on one wrapper and one seed, but it remains a constructed source family.

This does not compare CPU time, structural-promise discovery cost, or every plausible inversion algorithm. The 2n reanchoring method is not an applicable automatic baseline here: its separate hidden-B lower-unitriangular premise is not guaranteed by the dense input wrapper. Do not describe the graph method as universally stronger; the earlier rank-two fixture shows the opposite regime, where the low-rank method is dramatically cheaper.

## Recommendation

Accept the source rank/codimension claim and the low-rank receipts. Retain the graph result as evidence that affine-graph inversion can outperform the explicit rank-21 low-rank method on this constructed high-output-rank affine-flag source. Keep the comparison conditional, preserve the distinction between the first eight-target batch and the expanded 32-case sweep, and do not promote this attacker-side experiment to a claim about the obfuscator's tamper resistance or 2.5x runtime budget.
