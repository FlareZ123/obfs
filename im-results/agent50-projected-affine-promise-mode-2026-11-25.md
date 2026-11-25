# Exact projected-affine promise mode for rank-five SCO oracle reconstruction

**Status:** intermediate research; implementation and focused CI validation passed. This is an attacker-side query-complexity result, not an obfuscator security improvement and not an established academic result.

## Scope and promise

The experiment targets the exact source family

```
F(x) = A(x) XOR b XOR h(Px)
```

over `GF(2)^32 -> GF(2)^32`, where:

- `A` is a linear map;
- `b` is a constant offset;
- `P: GF(2)^32 -> GF(2)^5` has rank five;
- `h: GF(2)^5 -> GF(2)^32` is a 32-entry table whose degree-five ANF coefficient is nonzero.

This is a stronger promise than “arbitrary fixed degree-at-most-five oracle with a codimension-five fifth-derivative radical.” The new mode is explicitly named `assume-projected-affine`; it must not be used silently for arbitrary or higher-rank oracles.

The frozen HTTP source is pinned by SHA-256 `2b6a7b2cb348cd716e636e8e2da0817d4721a95f98bd45bbd90ffd8a5b366a9d`. The source-promise checker reports mask rank 5 and table top coefficient `0xb1f2257d`.

## Exactness argument

Let T_F(v1,...,v5) = D^5 F(v1,...,v5).

For the promised source:

```
T_F(v1,...,v5) = c * det(Pv1,...,Pv5)
c = XOR over t in GF(2)^5 of h(t), with c != 0
```

A nonzero fifth-derivative witness (a1,...,a5) therefore gives five vectors Pa_i that form a basis of the quotient. Let q(x) be the exact coordinate vector of Px in this basis, and define:

```
s(t) = XOR_i (t_i * a_i)
H(t) = F(s(t))
```

Then P(s(q(x))) = Px, so:

```
H(q(x)) = A(s(q(x))) XOR b XOR h(Px)
```

For each standard basis vector e_j, define C(e_j) = F(e_j) XOR H(q(e_j)). The b and h(Pe_j) terms cancel:

```
C(e_j) = A(e_j XOR s(q(e_j)))
C(x)   = A(x XOR s(q(x)))
```

Because A and q are linear, the basis-fitted correction extends linearly. Consequently:

```
G(x) = H(q(x)) XOR C(x) = F(x)
```

for every input. This is exact reconstruction under the stated promise; it does not depend on a statistical postfit acceptance event.

The implementation recovers q by either:
- the three-probe fixed-pair shift matcher, when the section-table separation check passes; or
- the fifth-derivative signature path otherwise.

The fixed-pair path is exact for the projected-affine promise. The signature path directly recovers quotient coordinates from fifth-derivative contractions. The code retains the exact interpolation fallback for exceptional witness/coordinate failures.

## Implementation

Branch: `agent50/rankfive-top-quintic-http-20261124`

Current branch head at this report: `61dd5dbe11aa7ff7ba3e17b5b003e507464cb460`.

Changes:
- Added the opt-in `assume-projected-affine` mode to `sims/rankfive-top-derivative-projected-affine-hybrid-peer.js`.
- Added explicit diagnostics: `promiseAssumed`, `verificationMode`, zero verifier samples, and null (not zero) statistical false-acceptance bound.
- Added `verificationAttempted` so pre-verifier fallbacks report `verificationPassed: null` and `falseAcceptanceBound: null`; actual verifier-mismatch fallbacks report an attempted check and the configured delta.
- Preserved the default `verify-degree-five` mode and its 726 independent uniform verifier samples.
- Updated the worker and HTTP adapter so promise mode requests no verifier tape and emits no candidate-ready/release event.
- Added regression fixtures for both shift and signature paths; the verifier callback throws if invoked.
- Added a 1,000-replicate deterministic query simulation for the strict-promise mode.

The ordinary verified mode remains the correct default for arbitrary degree-five sources. Its Reed–Muller postfit false-acceptance bound is `(31/32)^726 = 9.765746877444843e-11` for a fixed degree-at-most-five oracle.

## Query bounds

For the seven-direction restart witness search:
- 18 trials;
- per-trial witness probability: `0.7307504117488861`;
- probability of missing all 18 trials: `5.530837017611736e-11`;
- worst-case witness-search query cap: 1,657. The ten tested faces cover 93 distinct subset masks; zero is present in every trial, so the first trial costs at most 93 new oracle points and each later trial at most 92: `93 + 17*92 = 1,657`.

Additional coordinate recovery:
- fixed-pair shift path: at most 96 probes, giving a fast-path cap of **1,753**;
- derivative-signature path: at most 992 probes, giving a fast-path cap of **2,649**.

These are oracle-query caps, not CPU-runtime measurements. The 2.5× compute-time condition has not been evaluated by these experiments.

## Reproduction and evidence

### Peer workflow

Run: [45544565765](https://github.com/FlareZ123/obfs/actions/runs/45544565765)  
Conclusion: success on Ubuntu and Windows.

The peer output recorded:
- 2 positive promise-mode fixtures;
- 512 exhaustive 8-bit truth-table comparisons;
- one fixed-pair shift case and one derivative-signature case;
- zero verifier callback calls and zero candidate-ready calls;
- both positive fixtures exactly matched all 256 inputs;
- a deliberate out-of-promise silent-rank-seven misuse produced 4 mismatches across 128 inputs with no verifier;
- a sharper rank-five lower-degree residual case passed the fixed-pair predicate, misidentified the fifth coordinate as 3, and produced 112 mismatches across 256 inputs in no-verifier mode;
- the default verified mode caught both invalid-promise cases and returned exact interpolation fallbacks on every input;
- a no-witness promise-mode run exhausted all 18 trials/126 direction draws, requested no verifier or candidate-ready event, and returned an exact 256-point interpolation fallback.

These tests pin the promise boundary. The same workflow retained the lower-degree residual, degree-four, and rank-six fallback controls.

### Deterministic query simulation

The peer workflow ran 1,000 deterministic SHA-256-counter-tape trials against the frozen source:
- mean queries: **181.861**;
- median: 152;
- p90: 266;
- p95: 312;
- maximum: 542;
- mean witness trials: 1.388;
- fallbacks: 0;
- independent holdout evaluations: 64,000 (64 per trial);
- query cap: 1,753;
- verifier samples: 0.

These tapes make the simulation reproducible but do not prove independent cryptographic sampling. The result is a descriptive simulation, not an independence proof.

### Live SCO HTTP experiment

Run: [45543743069](https://github.com/FlareZ123/obfs/actions/runs/45543743069)  
Conclusion: success on Ubuntu and Windows.

Ten CSPRNG-tape HTTP replicates:
- baseline mean: 2,043.5 queries;
- promise-mode hybrid mean: 239.8 queries;
- hybrid median: 178;
- hybrid minimum/maximum: 144/726;
- hybrid p10/p90/p95: 144/274/274;
- all runs used the fixed-pair shift path;
- no verifier tape was requested or released.

This is a ten-run descriptive integration check, not a stable estimate of the long-run expected query count. The larger maximum reflects the restart tail; the 1,000-replicate deterministic simulation is the more informative query-distribution check, but it is not evidence of independent cryptographic sampling. The 1,000-run deterministic simulation is the larger descriptive query-count check.


## Independent review and deferred directions

Agents 42 and 43 independently reviewed the exact projected-affine identity and agreed that the no-verifier mode is sound only under the explicit `F=A+b+h(Px)` promise. The peer suite now includes the requested no-witness fallback test and a stronger rank-five lower-degree-residual counterexample: the top fifth-derivative form remains rank five, the fixed-pair shift predicate passes, but a quadratic term outside the quotient makes the no-verifier model wrong. The default 726-sample verifier detects the mismatch and falls back exactly.

Agent 43 also outlined a separate, unimplemented `rank-five-top-form + signature-only + RM(4,32)` verification mode. Under a trusted codimension-five top-form promise and exact signature recovery, the residual would have degree at most four, for which 357 uniform samples give a false-acceptance bound below 1e-10. This cannot use the shift path: a lower-degree residual outside the quotient can create a false shift coordinate. This is a future research direction, not part of this implementation. Searching all offset pairs/triples before signature fallback is also deferred; it overlaps earlier Agent 2 greedy-offset-cover work and should not be duplicated without integrating that evidence. Agent 2's separate eight-direction candidate was also reviewed: its exact RREF/kernel enumeration has the expected Gaussian-binomial counts (2,667 two-subspaces of GF(2)^7 and 97,155 three-subspaces of GF(2)^8), but its expected witness-query gain over seven directions is only about 0.254 queries, while the witness cap rises by 52 and the face-evaluation count increases. It was not integrated; the full cross-trial collision correction was not independently rederived.

## Limitations and disposition

1. **Promise dependence:** outside `F=A+b+h(Px)`, the no-verifier mode has no statistical false-acceptance guarantee. The mode is opt-in precisely to make that assumption visible.
2. **No CPU result:** fewer oracle calls do not establish a runtime speedup or the 2.5× compute budget.
3. **No matched conventional/minified control:** this is a black-box reconstruction experiment for a specific deterministic oracle family. It does not establish incremental security or insecurity relative to an ordinary minified implementation.
4. **No product security improvement:** this makes an attacker-side SCO oracle clone more query-efficient. It does not strengthen COO, SNO, or SCO protections.
5. **Novelty is unresolved:** related Boolean-function reconstruction and oracle-learning literature still needs a full prior-art review.

Keep this material in `im-results/`. Do not promote it to `results/`, change the authoritative release decision, or merge PR #373 on this evidence alone. PR #373 remains draft/research-only.


## Independent cross-language replay

Agent 43 added a standard-library-only Python replay at
`sims/agent43-rankfive-promise-query-replay.py`. It independently reconstructs the emitted ESM source string and checks the pinned SHA-256, rank-five mask matrix, and nonzero table top coefficient. It then replays the 1,000 deterministic SHA-256 counter-tape witness trials and the 64 holdouts per replicate using an independent Python implementation of the oracle and shift learner.

The replay matched the JavaScript simulation's promise-mode query statistics exactly:
- mean: 181.861 queries;
- median: 152;
- p90: 266;
- p95: 312;
- maximum: 542;
- mean witness trials: 1.388;
- fallbacks: 0;
- holdout evaluations: 64,000.

It also reports p10 = 128. This is an independent implementation cross-check, but it uses the same deterministic SHA-256 counter-tape construction; it is not an independent random sample or a cryptographic independence claim. It reproduces only the promised hybrid arm, not the generic baseline arm.

Run with:
```sh
python3 sims/agent43-rankfive-promise-query-replay.py
```


The replay also checks the deterministic query-cap derivation. The ten selected five-faces of seven witness directions cover 93 distinct subset patterns per trial, including the empty subset. The empty input is shared by all trials, so 18 trials require at most \(1+18(93-1)=1,657\) witness queries. The shift stage adds at most \(32\times3=96\), giving the HTTP fast-path cap of 1,753. Direction dependencies or cross-trial collisions can only reduce the actual unique-query count.


## Adaptive shift lower bound for the monomial point table

The 30-offset lower bound also holds when the next offset may depend on earlier responses, for the single-coordinate shift-matching problem. Let \(H(t)=w\,1_{t=31}\), \(w\ne0\), and suppose the learner's normalized shift queries keep the affine correction invariant: for an unknown quotient coordinate \(q\), a nonzero offset \(u\) returns
\[
Y(u)=H(q\oplus u)\oplus H(q).
\]

There are 32 possible coordinates. The candidate \(q=31\) returns \(w\) for every nonzero offset. Each other candidate has the form \(q=31\oplus\delta\), \(\delta\ne0\), and returns \(w\) exactly when \(u=\delta\), returning zero for all other offsets.

Follow the adaptive decision-tree path on which every response is zero. After \(k\) distinct nonzero offsets have been queried, the candidates \(q=31\) and \(q=31\oplus u_i\) for the queried offsets are eliminated; exactly \(31-k\) candidates remain. For \(k\le29\), at least two candidates are indistinguishable, so certainty is impossible. At \(k=30\), one candidate remains. Thus 30 offset probes, in addition to the known base response, are worst-case necessary even for adaptive offset selection in this single-coordinate model.

This is not a lower bound on the total multi-coordinate query count: probes and cached points may be reused across different input-basis coordinates. It also relies on the normalized shift model in which the affine correction is invariant under the matched shift; it does not cover arbitrary oracle queries or arbitrary source families.


## Anchor-extended input basis: remove known coordinate probes

The five successful witness anchors are already linearly independent. They are also the first five vectors of a full input basis after extending them with \(n-5\) complement vectors. Since the section table has queried every \(F(s(t))\), each anchor satisfies \(q(a_i)=e_i\) and \(C(a_i)=F(a_i)\oplus H(e_i)=0\). No separate coordinate or correction probes are needed for those five basis vectors.

Recover coordinates and corrections only for the \(n-5=27\) complement vectors, then express arbitrary inputs in the anchor-extended basis. This reduces the shift stage from 96 to 81 probes and the signature stage from 992 to 837 probes. The corresponding conservative caps are:
- no-verifier shift: \(1,657+81=1,738\);
- verified shift: \(1,657+81+726=2,464\);
- no-verifier signature: \(1,657+837=2,494\);
- verified signature: \(1,657+837+726=3,220\).

Agent 43 extended the independent Python replay to run both the original standard-basis model and this anchor-extended model on the same 1,000 deterministic witness tapes. Every replicate saved exactly 15 unique queries in the shift mode, with unchanged witness trials and 64 holdouts per replicate. The anchor-extended statistics were mean 166.861, median 137, p90 251, p95 297, maximum 527, mean witness trials 1.388, and zero fallbacks (64,000 holdouts). This is a deterministic cross-language replay, not an independent random sample or a runtime benchmark.

The updated replay is \`sims/agent43-rankfive-promise-query-replay.py\` (commit \`c1c6a11a5ecfb8759c36f155b6f98c961b8be65a\`). The anchor extension applies to both shift and signature coordinate recovery; its input-basis solve cost has not been benchmarked. It is a more material query reduction than the m=8 face-order gain, but should still be evaluated for runtime before claiming an end-to-end performance improvement.
