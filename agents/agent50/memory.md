# Agent 50 current invocation — 2026-11-22

- Mode selection: actual uniform RNG draw returned **4**, selecting normal research mode.
- Claimed existing Agent 50 through a verified main-branch lease update at `2026-11-22T03:52:30.712Z`, run ID `agent50-20261122T0352Z-obfs5-algebra`. The lease is immutable; the measured 70-minute release threshold is `2026-11-22T05:02:30.712Z`. Do not refresh it. After each checkpoint compare this timestamp with an actual runtime clock; if below 70 minutes, continue. On release, push all useful state first and delete the lease only in the final repository mutation.
- Read the repository README and current `results/README.md`: primary release remains **RELEASE-BLOCKED**. The Critic's 21 Nov and 22 Nov broadcasts require decision-grade matched security/performance evidence, no more unsupported candidate proliferation, truthful PR integration ownership, and a shared public-callable source compatibility contract. Do not create per-commit workflows.
- Current research focus: attack-side, conditional degree-five Boolean-function oracle reconstruction in `sims/rankfive-top-quintic-functional-clone-peer.js`, already enrolled in `.github/workflows/manual-low-rank-target-inversion.yml` and `jsconfig.affine-low-rank-peer.json`. The source class is fixed vector-valued Boolean functions of degree <=5 whose fifth-derivative joint radical has codimension <=6. Do not describe this as a generic JavaScript/SCO attack or as a novel theorem without prior-art review.
- Agent 41's review `communications/agent50/20261122T0139Z_agent41_quintic-promise-boundary.md` is correct as a boundary warning: the five-anchor signature-span overflow check is sufficient under the promise but is not a general promise verifier. Its rank-seven two-monomial example has joint radical {0}, yet forced anchors e0..e4 yield signature rank 5 and a wrong clone at input 124. I independently reproduced the fifth-derivative signatures and joint radical by exhaustive 7-bit Python evaluation: signatures e0..e4 are the five unit vectors, e5/e6 are zero, and only x=0 is in the joint radical; source(124)=2 while the proposed clone predicts 0.
- In this checkpoint, updated the peer script to label the overflow check accurately and add a paired silent-mismatch fixture that independently enumerates the joint radical. The fixture is deliberately outside the theorem promise; it must not be presented as a theorem counterexample. The existing rank-seven overflow case remains a separate detected-control example.
- Verified arithmetic independently: witness probability p5=9765/32768; (1-p5)^66=7.212402164281535e-11; n=32 distinct-query cap 41,449 + 31*66 + 30*32 = 44,455; unrestricted degree-five ANF interpolation needs 242,825 values. These are chosen-oracle query counts, not runtime/compute guarantees. The probability bound requires independent uniform witness tuples and a fixed oracle.
- Existing manual workflow already includes the quintic script; do not add another workflow. A focused validation dispatch should use `manual-low-rank-target-inversion.yml` only after the code checkpoint. The full workflow is large and shared CI is constrained; inspect active runs first and dispatch once.
- Other reviewed requests: Agent 8's explicit all-r>=3 extremal residual family is a useful deterministic maximal-nullity stress fixture distinct from the random-subspace permutation lower-bound family; it is not a new inversion theorem. Agent 13's fs-import yield diagnostics are valid but any source-observer refinement should wait for the common cross-pass callable-source contract and integration owner requested by Critic 03:46 UTC.
- Agent 50 reviewed Agent 8's extremal residual family and sent `communications/agent8/20261122T0359Z_agent50_extremal-profile-review.md`; it is a useful deterministic maximal-nullity stress fixture distinct from the random-permutation query-hard family, not a new theorem. Agent 50 reviewed Agent 13's fs observer yield and sent `communications/agent13/20261122T0358Z_agent50_fs-observer-yield-review.md`; import capability is not itself proof of source reads, but a safe path-sensitive gate needs closed-world alias/read analysis and must wait for the Critic's shared callable-source contract and integration owner. Agent 50 answered Agent 15's offline envelope question in `communications/agent15/20261122T0405Z_agent50_offline-envelope-review.md`: the bridge already solves [M|W], with exact candidate exponent kappa=n+dim(W)-rank([M|W])=nu_M+dim(W intersect im(M)), and no post-training oracle calls. Initial prior-art scan found established higher-order derivative, vectorial ANF, multilinear-form/tensor-rank, and polynomial-rank literature; exact algorithm novelty remains unassessed. Relevant sources are Carlet's monograph, Duan et al. 2014, Bhrushundi et al. 2020, and Lampert–Ziegler 2024; see the new report for links.
- Critic 0346Z cross-pass source-contract coordination: after sending Agent 6 an initial owner proposal, I read Agent 39's 0404Z acceptance and explicitly withdrew the conflicting owner suggestion in communications/agent39/20261122T0413Z_agent50_callable-contract-owner-alignment.md and communications/agent6/20261122T0413Z_agent50_callable-owner-correction.md. Agent 39 is the owner of record; I am an independent behavioral/source-semantics reviewer, not the compiler integration owner. The shared contract should preserve exact intrinsic Function.prototype.toString.call for exported/re-exported callables and callable members under 1:1 semantics, including nested source spans and captured binding/property dependencies. Local Node 22.16.0 checks show Proxy/bind wrappers expose native-code text and new wrappers expose wrapper source, not original source. See communications/agent6/20261122T0412Z_agent50_callable-source-closure-note.md.
- Independent offline-envelope validation: a separate Python reference checked 100 random width-4 and 200 random width-5 degree-two vector maps over every target (8,000 target envelopes total). Every consistent envelope had exactly 2^(n+dim(W)-rank([M|B_W])) candidates and contained every true preimage; inconsistent envelopes were empty. See communications/agent15/20261122T0415Z_agent50_envelope-independent-check.md.
- New information-theoretic lower bound added to the quintic report: the promised class includes every n-bit-output degree<=4 function (T5=0), of which there are 2^(nL) for L=sum_{j=0}^4 C(n,j). A q-query adaptive transcript tree has at most 2^(nq) leaves, so any randomized learner with worst-case success >2^-n needs q>=L. At n=32, L=41,449; the previous 44,455 upper bound was 3,006 queries (7.25%) above this floor. This is query-count near-optimality only, not a runtime claim.
- Proof audit correction: the earlier report wording for the six-dimensional quotient incorrectly said that every basis contraction vanished when S_a(x)=0; the anchor contraction is the nonzero witness. Correct proof: all five basis coefficients involving x vanish, while the sole remaining coefficient on the anchor 5-tuple is the witness, so the alternating form's radical is exactly span{x}. In the five-dimensional quotient, if x=sum c_i a_i, component i of S_a(x) is c_i times the nonzero witness. The report now states these two cases correctly; CI code is unchanged, but this is a mathematical proof correction.
- Six-cube probability proof detail: for any nonzero scalar fifth-form, its radical contains the joint radical R (hence codimension<=6); a nonzero alternating 5-form on a space of dimension<=6 has radical codimension exactly5. Therefore its scalar quotient is five-dimensional, and six independent uniform direction samples project to six uniform vectors whose full-row-rank probability is p6=615195/1048576.
- Validated witness-search optimization: the six-cube strategy uses p6=615195/1048576 and 27 trials (miss4.3580153939e-11), each costing at most63 queries; n=32 cap is 44,110 = 41,449 + 1,701 + 960. This saves345 queries versus 5-tuple trials and narrows the gap to the 41,449 lower bound to 6.42%. Final run44984558684 passed both OSes. No further basis-extension micro-optimization implemented; its additional ~150-180 query savings is not worth current complexity.
- Important scope clarification added to the quintic report: the codimension<=6 promise constrains only the degree-five homogeneous component; it does not imply the full function factors through <=6 variables. Arbitrary degree<=4 terms may depend on all n inputs and are recovered independently from weight<=4 queries. Do not overstate the theorem as a full-function low-variable promise.
- Prior-art scan expanded to include combinatorial polarization in characteristic two (Drapal-Vojtechovsky 2009), finite-field black-box reconstruction of restricted depth-three circuits (Sinha 2020/2021), ROF black-box equivalence under larger-characteristic assumptions (Thankey-Gupta-Saha 2022), and polynomial-summation query lower bounds (Juma et al. 2009). These are adjacent, not direct proofs of this exact algorithm; novelty remains unresolved. The updated report records the field restrictions and scope.
- Current checkpoint update timestamp: 2026-11-22T04:30:14.544Z
- Validation: final six-cube witness-search implementation passed existing manual workflow 44984558684 at `64932e0c8d80783f2bd366559defe60b5efa331d` on Ubuntu and Windows, including all 53 regression/type-safety steps and strict JSDoc. Six random directions query one 64-point cube (at most63 new values) and all six five-subset derivatives are computed from it. p6=615195/1048576≈0.5866956711; 27 trials give miss probability4.3580153939e-11. Final output: 48 finite cases / 5,760 exhaustive outputs (27 top-rank-5, 9 top-rank-6, 12 degree-four fallbacks); 8 width-32 cases / 1,024 heldouts; max observed 43,150 queries under cap44,110; max top coefficients123,109; rank-seven overflow rejected; silent rank-seven control codim7/signature-rank5/source(124)=2/clone(124)=0. Previous five-tuple version passed run44983197425 at 44,455 cap. The six-cube optimization is now validated; see updated intermediate report and run44984558684.

---

## 2026-11-21 18:58 UTC: full-rank quadratic inversion and *complete functional cloning* through degree four

- Agent 3 independently checked the minimum-affine-baseline/residual-rank theorem and affine-coordinate invariance, with a separate 3-/4-bit exact matrix search: `communications/agent50/20261121T1841Z_agent3_minrank-affine-translation-peer.md`. We credited this peer validation in `im-results/affine-residual-minimal-rank-characterization-2026-11-21.md`. Direct external terminology from Mariot–Manzoni 2022 is linear components space (LCS); `r_F=n-dim LCS` is known, novelty unresolved, keep intermediate.
- New **input-side** attack `sims/quadratic-radical-target-inversion.js` for degree<=2 Boolean permutations: public polar B(u,v)=F0^Fu^Fv^F(u^v) bilinear, compute common radical U dimension n-d from 1+n+C(n,2) calls, then F restricted to each U coset affine; invert by solving affine output image and enumerating <=2^d input quotient cosets. Direct-oracle implementation initially bounded 1+n+C(n,2)+(n-d)+2^d+1, but **this is NOT the optimal LIVE query bound** due full quadratic interpolation (next bullet). Agent3 independently peer-checked proof and corrected bound in `communications/agent50/20261121T1851Z_agent3_quadratic-radical-oracle-tightening.md`; original report prominently corrected. Extensive `sims/quadratic-radical-peer-check.js` covers all 322,560 three-bit permutation targets, 1,600 four-bit targets, 80 hidden 32-bit rank24/d8 targets (552..770 direct calls) and **40 hidden full-output-rank32/d9** 32-bit targets (553..1013 direct calls). `GF(2^9)` cube z^3 +23 independent quadratic high masks yields rank32 and d9 under independent affine wrappers. [run 44937259726](https://github.com/FlareZ123/obfs/actions/runs/44937259726) both OS success. Report `im-results/quadratic-input-radical-target-inversion-2026-11-21.md`. Critical bound: 529 **LIVE** queries, then offline <=2^d coset search from full ANF.
- More important, **any global degree<=2 n32 stateless function is EXACTLY FUNCTIONALLY CLONABLE from 529 chosen public zero/basis/pair input-output evaluations** (classical ANF). `sims/quadratic-oracle-functional-clone.js` serializes full vector output coefficient arrays. `sims/quadratic-functional-clone-peer-check.js` checks all 322,560 width3 outputs from 40,320 7-call models, **16,384/16,384 held-out outputs** from 16 independently wrapped 32-bit rank24 or **maximal rank32** functions after server access disabled at 529 calls/function, plus **128/128 offline model-only inverse targets**. Explicit nonquadratic transposition matches all 37 low-weight training answers yet differs 2/256, highlighting global premise. [run 44937676585](https://github.com/FlareZ123/obfs/actions/runs/44937676585) Ubuntu/Windows, JSDoc green. Report `im-results/quadratic-functional-cloning-529-queries-2026-11-21.md`.
- General bounded-degree ANF theorem: **Q(n,t)=sum_{k=0}^t C(n,k)** chosen low-Hamming-weight queries exactly determines ANY global degree<=t Boolean vector function. For n32: Q2=529, Q3=5489, Q4=41449, Q5=242825. Implemented `sims/bounded-degree-oracle-functional-clone.js` (CJS, JSDoc, no 2^32 table, sparse Boolean Möbius inversion) and separately generated `sims/bounded-degree-functional-clone-peer-check.js`. 2 hidden affine-wrapped cubic (degree3) 32-bit max residual rank32 functions cloned with 5489 calls each, 512/512 heldouts; 2 quartic (degree4) fullrank cloned with 41449 each, 256/256 heldouts, server disabled. n8 quartic false-promise transposition agrees on all 163 training inputs but differs 2/256. **run 44937930776** at `4d558f83cf811c7510abb1d989ab97b28d3e2b2e` Ubuntu/Windows all green including strict typecheck and prior suites. Report `im-results/bounded-degree-functional-cloning-2026-11-21.md`.
- Added **matching information-theoretic Q lower bound in unrestricted degree<=t function family**: Q independent Boolean monomial coefficients; q<Q oracle observations give evaluation matrix rank<=q; nonzero kernel polynomial masks zero transcript, so no deterministic universal exact clone. Under uniform independent coefficient prior and m output bits, conditional exact-clone success<=2^(-m(Q-q)). This does NOT imply same lower bound for permutation-only or source-aware narrower family. Explicit low-weight mask omitted monomial collision and 128 adaptive random n5/t2 q15 evaluation-matrix nullspace witness tests added to bounded-degree peer checker; source-pinned two-OS CI run `44938296452` queued at checkpoint, verify outcome before claiming green. Report updated with careful restrictions.
- Matched 1100-query experiment `sims/quadratic-radical-public-residual-cap.js`: 24/24 direct quadratic radical successes (total 16007 distinct queries, max770), vs **0/24** of the older generic public residual inverter under same 1100-live-call cap (all cap exhaust), [run 44937077964](https://github.com/FlareZ123/obfs/actions/runs/44937077964) both OS green. *Not* universally apples-to-apples: degree2 promise given to new method, old theorem still works beyond query cap. This comparison is superseded for LIVE calls by full 529-query ANF clone.
- Communications: broadcasts `communications/broadcast/20261121T184820Z_agent50_quadratic-input-radical-counterexample.md` and critical corrected `communications/broadcast/20261121T1854Z_agent50_quadratic-529-query-functional-clone.md`; replied to Agent3 `communications/agent3/20261121T1856Z_agent50_529-call-clone-and-bounded-degree.md`.
- Only mathematically justified rejection criteria; **not academic novelty** (Boolean ANF, polarization, linear kernel, LCS established), and **not** generic JS/SCO account-isolation/security release. Full three-mode release still **RELEASE-BLOCKED**. Continue examining adversarial cases/whole-code semantics only with grounded tests; avoid output-rank-as-positive-security claims.
- Immutable Agent50 lease start `2026-11-21T18:06:30.074Z`, normal invocation only self-exit on measured checkpoint age >=70 minutes **after 2026-11-21T19:16:30.074Z**. Once threshold: final memory state commit/push, verify, delete `agents/agent50/.lease.json` as **last repository mutation**, verify deletion push; do not refresh.

## 2026-11-21 18:34 UTC: prior theorem reconciliation, comparative CI, intrinsic rank characterization

- After reviewing Agent3's messages from 19 Nov, discovered **prior same-family theorem** `im-results/public-affine-residual-rank-target-inversion-2026-11-19.md` and a deterministic variant `communications/agent50/2026-11-19T070723Z_agent3_public-deterministic-lowrank.md`. The earlier rank-r inversion feasibility result subsumes Agent39's hidden `A+Wg` case. Updated my independent peer report with honest priority and messaged Agent39 (message at `communications/agent39/20261121T182010Z_agent50_prior-public-residual-theorem.md`). New randomized quotient completion may improve expected query constants, not novel inversion capability.
- Committed 32-bit matched comparison `sims/affine-low-rank-method-comparison.js`: 12 oracles × 8 targets × 8 arms = **768** exact recoveries per method on both Ubuntu/Windows, source pin `9c15d8b4505528c22a10fd829a9a80d71476e10b`, [run 44935175190](https://github.com/FlareZ123/obfs/actions/runs/44935175190) green. Randomized verifier 54,484 total distinct chosen inputs vs older public residual 56,479 for same 768 targets (-3.532%). Rank8 arms showed ~4.5%-7.9% savings; some rank1 and singular rank3 cases were modestly worse. Exact arm table and limitations in `im-results/affine-low-rank-method-comparison-2026-11-21.md`; Agent39 notified.
- Strict JSDoc gate initially revealed malformed `@param`, unrecognized doc block and untyped numeric differences in older `sims/public-affine-residual-target-inverter32.js`. Fixed *comments/annotations only*, commit `5457a4c50050037f4ee961e6a90c460c73ea478c`. Subsequently entire manual theorem suite passes both OS and expanded strict checker.
- Derived `r_F=dim span(F(0)^F(u)^F(v)^F(u^v))` for a permutation equals **minimum output residual subspace dimension** over every invertible affine baseline. Proof uses output-rank lower bound from affine-additivity defects and full-rank completion of public basis interpolant using `imM+R_F=V`. `r_F` invariant under affine input/output wrappers. Dual characterization: exactly `n-r_F` independent scalar output masks yield affine Boolean components.
- Independent `sims/affine-residual-minimal-rank-peer.js` exhaustively verified 40,320 width3 permutations, rank distribution 1344/9408/18816/10752, all 40,320 parallelogram identities and affine-coordinate invariances, 128 samples with independent brute over all 168 `GL(3,2)` matrices, all eight output masks for every permutation. CI [44935344156](https://github.com/FlareZ123/obfs/actions/runs/44935344156) green for original identity; later mask checks green in [44935708586](https://github.com/FlareZ123/obfs/actions/runs/44935708586). Intermediate synthesis `im-results/affine-residual-minimal-rank-characterization-2026-11-21.md` explicitly no academic novelty claim.
- Added exact finite-query counterexample: identity vs unqueried transposition, rank0 vs rank1, identical q-query transcript for any q<=2^n-2 with n>=3; 246 lengths q9..254 of eight-bit domain independently checked, [run 44935602589](https://github.com/FlareZ123/obfs/actions/runs/44935602589) green. Low sampled rank cannot certify globally small rank. For n32 q33, random hidden pair detection ~1.536682242390952e-8.
- Added high-rank yet easy inversion control: `F(x)=Math.imul(x,0x9e3779b1)>>>0` has **exact nonlinear output rank 27**. Proof: multiplier modulo32=17 gives five affine low bits, so r<=27; 27 queries `17<<k` k=0..26 have residual `0xfceff660<<k` with distinct lowest set bit indices 5..31, so r>=27. Yet one oracle query F(1) recovers multiplier when operation family is known, Newton inversion yields all targets. Script/structural report updated, a new manual workflow pin is running for this exact witness.
- Keep candidate decision RELEASE-BLOCKED; intrinsic rank is a necessary negative screen only, high rank not a positive security guarantee. Source-aware attack and runtime/integrity evaluation remain separate.

## 2026-11-21 18:14 UTC: independent rank-r algebra, reproducible two-OS proof check

- Actual secure random draw **5**, normal mode. Claimed Agent 50 at immutable `2026-11-21T18:06:30.074Z`, run `agent50-20261121-semantic-qa-mwqpz0ze`, verified pushed claim `bd5f987aaf09f54f91b4f3338c751555768ca706`. Do not refresh lease; release only after measured 70-minute threshold `2026-11-21T19:16:30.074Z`, with lease deletion as final mutation.
- Agent39 requested independent review of arbitrary output-rank-r affine perturbation target inversion. Independently derived interpolation `M=A+WL`, uniform quotient sampling for singular `M`, construction of invertible `H`, coset-preserving `phi=H^-1(F+F(0))` and at most `2^r` forward-orbit inverse; verified expected samples `<k+1.607`, finite `<2^-t` tail. No flaw found under stated permutation and chosen-query promises. Academic novelty unresolved, as coset-cycle and generic cycle walking appear in literature.
- Locally wrote independent Python and Node verifiers (not importing submitter's implementation). New committed `sims/affine-low-rank-peer-check.js` recovered 322,560 exhaustive 3-bit targets, 4,560 hidden affine/rank-bound targets (n4,5,6,8,10), 64 forced-nullity-two targets, and 240 n32/r3 targets: **327,424 / 327,424** exact. Max observed sampling 16, orbit 27; independent seeded sampling is not uniform-bound proof.
- Added `jsconfig.affine-low-rank-peer.json` and explicit opt-in manual workflow steps. [run 44934158672](https://github.com/FlareZ123/obfs/actions/runs/44934158672) at source `f087383fdf4d4d9d7e433550632467b39b328a67` passed Ubuntu and Windows independent verifier, strict external JSDoc, existing low-rank regressions and production JSDoc. Intermediate report `im-results/affine-low-rank-agent50-independent-peer-2026-11-21.md` committed at `c378ad5677ad009e3f1b114abe910dadec2f2158`. Peer message `communications/agent39/20261121T181010Z_agent50_rankr-independent-review.md`.
- Primary obfuscation objective remains RELEASE-BLOCKED. This is narrow chosen-query negative candidate-elimination evidence and does not demonstrate source reconstruction or hostile-runtime protection. Next productive direction: challenge the rank-r result using malicious/nonuniform oracle distributions or explore a lower-bound tightness argument; avoid duplicate exhaustive proof suites without a new mathematical distinction.

## 2026-11-19 04:04 UTC: unhandled rejection boundary and low-rank quotient result

- Lease unchanged: `agent50-dac74cc3d492cf95`, claimed **2026-11-19T03:17:03.321373Z**, release threshold **2026-11-19T04:27:03.321373Z**.
- Asynchronous host source observer: Node22 default unhandled-rejection policy can turn `Promise.reject(new Error('probe'))` into an uncaught exception without any `ThrowStatement`. Reproducer keeps one private-property rewrite; safe arm prints `73\n`; failure frame shifts **184 -> 152**. Run **44455093455** full green Ubuntu/Windows + JSDoc. PR #170 merged **c11333d738bb37149696caccf80427421e5386b8**. Report `im-results/unhandled-rejection-source-boundary-2026-11-19.md`; broadcast `communications/broadcast/20261119T0401Z_agent50_unhandled-rejection-source-boundary.md`. Do not add blanket Promise veto: handler attachment is temporal and Promise is mutable/shadowable.
- New intermediate algebra: for `F(x)=c xor A(x) xor g(x)`, invertible `A`, `g(V)<=R` with `dim R=r`, basis interpolant `M` obeys `image(M-A)<=R`, all residuals `F(x) xor F(0) xor Mx` lie in `R`, `ker M <= U=A^-1R`, `rank M>=n-r`, and `M^-1(R)=U`. For target `y=F(s)`, `{x: Mx xor y xor F(0) in R}=s xor U`, exactly `2^r` candidates. If `R` is known, inversion uses at most `n+1+2^r` queries. A k-rank-one-shear affine sandwich has this form with `r<=k`.
- Pilot `sims/low-rank-shear-quotient-pilot.js`: 100 deterministic width-5 two-shear permutations, all 3,200 targets, residual containment/candidate-coset proof. Run **44455513909** green both OS + external JSDoc. Output: range dims {1:5,2:95}; interpolant ranks {3:1,4:34,5:65}; max residual values 4; max candidate count 4. PR #172 merged **cfd43d3c6ccb045055b2e08e68e9de6f951b6746**. Report `im-results/low-rank-nonlinear-quotient-structure-2026-11-19.md`. Agent2 follow-up `communications/agent2/2026-11-19T0404Z_agent50_low-rank-quotient-followup.md`.
- Open research bottleneck: recovering the full hidden nonlinear output span `R` when residual directions are sparse. The quotient result makes this the exact missing step for a conditional low-rank/multi-shear chosen-query attack. A target-specific recovery method would extend rank-one; otherwise a sparse-control lower bound should be sought.

## 2026-11-19 03:58 UTC: dynamic host boundary, string relay review, rank-one theorem review

- Immutable lease remains `agent50-dac74cc3d492cf95`, claimed **2026-11-19T03:17:03.321373Z**; release threshold **2026-11-19T04:27:03.321373Z**. Never refresh.
- Dynamic opaque-input host diagnostic boundary is now durable. `sims/host-dynamic-exception-boundary.js` keeps one real private-property rewrite. Object input succeeds with identical stdout `73\n`; null input makes the same ordinary member read escape and moves Node's default uncaught frame **175 -> 143**. Final run **44454813553** passed Ubuntu/Windows and strict JSDoc. PR #168 merged at **9d90a399639be1bb143863b14a2726646647869d**. Report: `im-results/dynamic-input-host-exception-source-boundary-2026-11-19.md`. Broadcast: `communications/broadcast/20261119T0358Z_agent50_dynamic-host-exception-boundary.md`. Treat as intermediate architectural evidence, not an impossibility theorem.
- Agent3 immutable-string re-export PR #152 default-alias adversarial review is clean. Review branch `agent50-string-reexport-adversarial-20261119`, commit `816004f6fe802b8f374b3688af5f7eebebfc6cc7` added a second-owner default alias and a default-`toString` observer negative. Full run **44453329693** passed both OSes. Direct message: `communications/agent3/2026-11-19T0346Z_agent50_string-reexport-default-review.md`. No defect found in this dimension; the string proof's ImportSpecifier-only consumer rule fails closed on default imports.
- Independently reviewed Agent2 PR #165 rank-one nonlinear perturbation inversion theorem. Algebra checked directly and exhaustive width-3 verifier `sims/compatible-rank-one-shear-exhaustive-width3.js` on branch `agent50-rank-one-theorem-review-20261119` enumerated **301,056** forms, **18,816** permutation cases, **0** hidden-direction invariance violations, **150,528/150,528** target recoveries, max **6=n+3** queries. Rank cases: 10,752 rank-2 attacks and 139,776 rank-3 attacks. Two-platform targeted run **44454756973** also reran Agent2's width-32 reproducer, all 256 targets recovered, observed max 35 queries, strict external JSDoc green. Direct message: `communications/agent2/2026-11-19T0357Z_agent50_rank-one-theorem-review.md`. No flaw found within chosen-query rank-one scope; multi-shear/higher-rank interactions remain outside theorem.
- Useful next research below cutoff: asynchronous/unhandled rejection host diagnostics are a likely second dynamic source-observer lane; keep it as architecture evidence unless a bounded sound guard with positive yield is available. Continue to distinguish compatibility repairs from actual anti-reconstruction security gains.

## 2026-11-19 03:35 UTC: reader default-relay repair and uncaught-throw source observer

- Invocation `agent50-dac74cc3d492cf95`; actual RNG draw **2** selected normal mode. Lease claimed exactly **2026-11-19T03:17:03.321373Z**. Do not refresh. Measured release threshold is **2026-11-19T04:27:03.321373Z**; after checkpoints compare against an actual runtime clock and continue below 70 minutes.
- Adversarial review requested by Agent3 found a real named-reader re-export provenance hole. A relay exporting the same proved reader as a named export and `default` let a safe named call authorize rewriting while a default-imported alias called the rewritten reader on a foreign `{secretField:99}`. Pre-fix run **44451065229** failed both OSes; Ubuntu artifact rewrote the owner/reader field to `_pb9a14d0b085b` while the foreign object retained `secretField`.
- Fix tracks `ImportDefaultSpecifier` reader aliases using public name `default` and ignores the import declaration identifier as a use site. Positive safe default relay still rewrites one field. Runs **44451401585** and **44451517830** full green Ubuntu/Windows. Namespace-import and `export * as namespace` hypotheses were falsified by existing conservative guards and retained as regressions. PR #163 merged at **1390c57649614f39d0d2dd6c085bb762227d7d58**. Evidence: `im-results/reader-reexport-default-import-provenance-2026-11-19.md`; Agent3 handoff under `communications/agent3/2026-11-19T0329Z_agent50_reader-default-relay-review.md`.
- New implicit host observer: a potentially uncaught explicit `throw` lets Node's default diagnostic print transformed source bytes, caret and stack column without any `.stack` read. Isolated red commit `8a4520e9701a6b0fd17a5c163ce4574c333196e3`, run **44452082652**, failed both OSes; property shortening moved throw frame **126 -> 94**. A first exploratory probe was confounded by the existing Error-argument coercion guard and correctly discarded as evidence.
- Repair in `src/ast.js`: for each `ThrowStatement`, walk ancestors outward. A syntactic containing `try` block with a handler locally contains it; crossing a function boundary first, or reaching Program without such a catch, marks source observed. This preserves exact source for host-visible explicit throws while retaining rewrite yield for locally caught throws. Green run **44452305440** passed Ubuntu/Windows plus strict project/external JSDoc. PR #164 merged at **459c7190ce36cb158fc183cc8f28d00253d25416**. Evidence: `im-results/uncaught-explicit-throw-source-observer-2026-11-19.md`; broadcast `communications/broadcast/20261119T0335Z_agent50_uncaught-throw-source-observer.md`.
- Scope remains bounded. The explicit-throw guard does **not** prove completeness for arbitrary implicit runtime exceptions, opaque host observers, or general JS equivalence. The overall obfuscator remains release-blocked for the strong security objective.
- Productive next work below lease cutoff: audit implicit runtime exceptions that automatically escape to the host without existing source-observer syntax; preserve positive transform controls and avoid blanket source vetoes where local containment can be proved.

## 2026-11-17 21:46 UTC: exact imported primitive reader positive restored

- Invocation `agent50-56aa522f539c2d92` secure RNG **9** normal mode; claimed `agents/agent50/.lease.json` at **2026-11-17T21:24:11.435418Z**, successful commit `dff3cc6`. **Do not refresh**. 70-minute release threshold is **2026-11-17T22:34:11.435418Z**. After each checkpoint compare against real clock and continue if less than 70 minutes.
- Read Critic 19:46 stopline and Agent29 historical bisect; imported reader three-module exact fixture first-bad `729143ea` from old Agent50 console function-name safeguard. Our fix is closed ESM direct-reader immutable primitive value provenance, not a reversal of valid logger source-observation checks.
- Added `src/direct-reader-primitives.js`, `test/direct-reader-primitive-proof.test.js`, workflow `.github/workflows/manual-direct-reader-primitive.yml`. Integrated into `src/cross-properties.js` primitive collection and cross-graph observer, `src/properties.js::proveLocalObject` importer observer with optional `importedPrimitives` argument. The positive is one private field in each COO/SCO/SNO actual ESM subprocess, native/emitted stdout `23 23\n` equal; eight hostile negatives return zero fields. The bounded proof requires ESM-only closed acyclic exact imports, uniquely bound imports, immutable primitive-literal owned key, direct pure exported reader, only whitelisted calls, no mutation/reflection/dynamic loaders/escapes. Host monkeypatching and outside-closed-world dynamic imports are outside its guarantee.
- Two incomplete code pins `568e370...` and `2bc6c016...` ran targeted Windows/Ubuntu Actions **red**, four expected-one-field subtests actual zero. This established multiple independent missed admission paths. **Third pinned integrated SHA `0cc94cbc0b8c6881026a5fe190ebe666248323b5` GREEN** [run 44182314712](https://github.com/FlareZ123/obfs/actions/runs/44182314712): 68/68 focused tests per OS plus both strict compiler and external JSDoc. Reporter `im-results/direct-reader-primitive-provenance-2026-11-17.md`, broadcast `communications/broadcast/2026-11-17T2145Z_agent50_reader-primitive-yield-green.md`; direct messages to Agent29 and Agent3.
- **Other three full-main failures remain unaddressed**. Agent29 memory pin: six-module owner/normalized/token private-record positives first-bad at `1c504ad1`, Agent3 JSON.parse implicit ToString source guard on opaque mutable `process.argv[2]`. Preserve valid source safety; coordinate positive replacement or explicit host primitive contract. Main full-suite integration and independent attacker/2.5x budget decisions remain pending. Do not promote bounded compiler correctness as general 1:1 JS equivalence or confidentiality.
- Immediate next: monitor Agent29/Agent3 for response, examine original six-module positives versus realistic argv contract; produce separately validated positive rather than inventing static host proof. Run targeted or one pinned full gate only when branch settles. Continue normal research until actual lease-age >=70 min; at threshold cleanup + push memory, delete lease **as last mutation**, verify.

## 2026-11-17 ~14:27 UTC: equal-width source-coordinate feasibility

- Published native experiment `sims/source-coordinate-fixed-width-probe.js`
  with SHA-256-derived **equal-length** private property replacement and
  shorter-letter negative control. Exact-VM-coordinate outputs stayed
  equivalent under `console.trace()`, printed `new Error()`, and
  `node:util.getCallSites()` while shortened source diverged. Full focused
  CI and JSDoc **passed**:
  [run 44102821721](https://github.com/FlareZ123/obfs/actions/runs/44102821721)
  at pinned commit `16a21975d5ab6ac1614317770e7ca98b98b896c6`.
- Critical counterexample (native local): equal-width replacement does
  **not** preserve `Function.prototype.toString` output when the
  changed property occurs inside the returned function body. No
  source-sensitive compiler implementation of equal-width renaming has
  been written. This is a **hypothesis for future positive yield** under
  a source-coordinate-only proof, not an established code-obfuscation
  technique.
- Report `im-results/fixed-width-source-coordinate-proposal-2026-11-17.md`
  includes both evidence and hazards; broadcast
  `communications/broadcast/2026-11-17T1426Z_agent50_fixed-width-coordinate-observer-proposal.md`
  requests independent test of a sound implementation.
- Latest native warning alias run `44102110246` confirmed green at
  `e6536e5c7283a4d54c3fba55021d20103e09724c`; report updated.
- Relevant future engineering directions: classify coordinate-only vs
  exact-native-source observers, prove private-field ownership and
  collision-safe fixed-width substitution across files, test V8/Chromium
  frame and custom formatter compatibility, measure **real protected-work
  yield**, runtime within 2.5x, and adversarial reconstruction cost.
  Beware that a single unknown external observer requires conservative
  source-byte fallback. Source-observer guards do not themselves provide
  static secrecy or tamper resistance.
- User task is broad; do not claim the overall obfuscator solved. Main
  repository state is pushed through GitHub file API. Once actual clock
  reaches `2026-11-17T14:34:16.321770Z`, finish remaining cleanup,
  verify committed files, then delete identity lease as the LAST GitHub
  mutation and verify remote deletion.


## 2026-11-17 14:22 UTC checkpoint: three-mode coverage and warning observer green

- Native warning observer: Node `--trace-warnings` plus
  `process.emitWarning('literal')` reveals caller column although the source
  never reads `.stack`. Manual property-name shortening changed VM source
  column `91 -> 53` with identical successful execution. Official Node v22
  docs corroborate generated warning Error and trace flag.
- Guard in `src/ast.js` handles global `process.emitWarning`, local
  extracted function, bound aliases, and direct `.call/.apply` wrappers.
  `test/node-process-warning-source-observation.test.js` verifies native
  unsafe red control and exact emitted-code fallback across SCO/COO/SNO.
  **Pinned green**: [run 44102110246](https://github.com/FlareZ123/obfs/actions/runs/44102110246)
  at `e6536e5c7283a4d54c3fba55021d20103e09724c`, including both
  JSDoc steps. Report:
  `im-results/node-process-warning-source-observation-2026-11-17.md`.
- Cross-mode and interfile proof:
  `test/implicit-source-mode-matrix.test.js` preserves exact source for
  SCO/COO/SNO trace observers and a two-module ESM imported-function
  observer, yet still transforms a primitive logger ESM graph. It executes
  original and emitted ESM module pairs as independent actual Node processes,
  writing each fixture atomically/locked via `src/atomic.js`.
  **Pinned green**: [run 44100838029](https://github.com/FlareZ123/obfs/actions/runs/44100838029)
  at `5e40b2c11438cebce06ebb49ae62563a566aac6d`.
- Deterministic `test/implicit-source-mode-fuzz.test.js`: 12 seeded private
  property names × 14 observable syntaxes × three modes = **504/504**
  source-preserving cases, plus **36/36** positive primitive-logger
  transformed-work cases. **Pinned green**:
  [run 44101222550](https://github.com/FlareZ123/obfs/actions/runs/44101222550)
  at `8fee855c71a7a4a183bad9231a6e7055ce29a56a`, including JSDoc.
  Report: `im-results/implicit-source-three-mode-matrix-2026-11-17.md`.
- Full consolidated source-observer focused suite on Node 22 and strict JSDoc:
  [run 44102110246](https://github.com/FlareZ123/obfs/actions/runs/44102110246)
  **green**. The library remains a largely source-reconstructible compiler;
  this work improves native host behavior preservation while refusing to
  obfuscate observable code. Never interpret counters as anti-reconstruction
  success or general equivalence proofs.
- The exact source-pinned branches and CI runs are on the repo. All commits
  have `Agent 50:` prefix. No work from other identities was overwritten.
- **Lease claim remains `2026-11-17T13:24:16.321770Z`**, release only
  after measured `2026-11-17T14:34:16.321770Z`; commit final memory/docs
  before deleting `.lease.json` as final mutation and verifying push.
  Remaining unknown source-observer classes: opaque host logger calls,
  monkeypatched console/process, arbitrary reflection of methods, general
  Error escapes and runtime-generated caller instrumentation. Preserve as
  hypotheses unless reproducing and testing.


## 2026-11-17 14:03 UTC checkpoint: pinned console green, expanded Node util guard

- Fixed console differential harness: original/emitted execute() calls from
  different test-file lines appeared in the same Error stack despite identical
  VM code. Filter only VM source-frame lines before exact console output
  comparison; preserve the native "unsafe replacement" red controls.
- **Pinned focused green**: [run 44096939351](https://github.com/FlareZ123/obfs/actions/runs/44096939351),
  SHA `f468a8ef36494a02eee1db6f0f71b017c678279a`, console ten tests and
  both strict JSDoc steps passed on Ubuntu Node 22.
- Added Node built-in `util.inspect/format/formatWithOptions` may-flow guards
  and native CJS/ESM direct/detached aliases, including `getCallSites` and
  historical `getCallSite`. Native one-line VM `util.inspect(new Error)`
  frame changed `:1:110 -> :1:82` when an earlier private property name
  shortened; native `getCallSites(1)[0].columnNumber` changed `145 -> 89`.
  `util.inspect(fn)` exposes function names. Do not claim general host
  compatibility; proof is syntactic and deliberately incomplete.
- Tests: `test/node-util-format-source-observation.test.js` nine cases
  including direct manually shortened source red controls and primitive
  `util.inspect(42)` positive property-rename control. Expanded console tests
  to thirteen cases, including native stack and function-name red controls.
  Two-stage targeted combined CI queued: `44097808187` at `70fbf4e...`
  (ten+six tests), then latest `44098899794` at `0d44ee12aea760d9e666364ee04add2e5883a390`
  (thirteen+nine tests). All running or queued at this checkpoint; verify
  actual result and adjust.
- Report files: `im-results/implicit-console-stack-observation-2026-11-17.md`,
  `im-results/node-util-implicit-source-observation-2026-11-17.md`.
- Manual focused workflow source:
  `.github/workflows/manual-implicit-console-source.yml`; no automatic
  push trigger to reduce redundant run/queue churn. Exact source pins are
  stable branches `agent50/implicit-console-source-20261117`,
  `agent50/node-util-console-observation-20261117`, and
  `agent50/implicit-source-red-controls-20261117`.
- **Current incarnation lease still** `2026-11-17T13:24:16.321770Z`.
  At >= `2026-11-17T14:34:16.321770Z` measured clock, finish cleanup,
  push all useful work, then delete lease as final GitHub mutation and verify.
  Continue research below 70 minutes.


# Agent 50 current incarnation: 2026-11-17 implicit console observers

- **Current lease:** `agents/agent50/.lease.json` run
  `agent50-20261117-1668abb81939f2e3`, claimed exactly
  `2026-11-17T13:24:16.321770Z`. Release threshold is
  `2026-11-17T14:34:16.321770Z`; check actual runtime clock at every
  checkpoint. The **older 2026-11-15 claim timestamps below are historical**.
- Normal research mode selected by actual RNG draw **2**.
- Node v22.16.0 native semantic counterexample: manual shortening of a
  private property preserving returned 73 changes `console.trace()`
  frame from `:1:100` to `:1:48` and logged `Error` frame
  from `:1:106` to `:1:54`. No syntactic `.stack` read.
  Native `console.log(fn)` likewise changes printed function name when
  lexically renamed.
- Added conservative implicit console observer guards to `src/ast.js`:
  Node console trace, built-in Error graphs, aliases/literal containers, and
  function-valued arguments. Added ten native-versus-compiler-emitted SNO
  tests with a positive primitive-logging rename control in
  `test/implicit-console-stack-source.test.js`.
- Report: `im-results/implicit-console-stack-observation-2026-11-17.md`.
  Targeted workflow `.github/workflows/manual-implicit-console-source.yml`
  triggered on precise test-file changes, plus strict JSDoc.
  Runs `44094229530` (eight-test base at `77a997a...`) and
  `44095675245` (ten-test extension at `517c38b...`) were **queued**
  when last checked. Do not claim green before checking actual CI.
- Communicated source-coordinate result to Agent 16 in
  `communications/agent16/2026-11-17T1340Z_agent50_implicit-stack-logger-repro.md`.
- Limitations: static recognition intentionally incomplete for
  process warnings, thrown/returned errors visible to opaque consumers,
  generic object aliases, detached console methods, custom Error subclasses,
  computed dynamic method names, hostile console mutation. Those remain
  separate semantic proof problems, not validated output equivalence.
- Important next actions: check targeted CI/strict JSDoc; fix actual failures
  promptly and reproduce with a positive protected-work control; update
  intermediate report with exact CI SHA/results; inspect regression impact
  before broadening guards; preserve honest coverage limits and avoid
  unnecessary broad matrix dispatches.

---

# Agent 50 persistent research continuity

Claimed `2026-11-15T12:37:46Z` as run `f08751f491b4f863` after actual random draw **5**, normal research mode. Original immutable lease is `agents/agent50/.lease.json`; never refresh it. Measured 70-minute release threshold: **2026-11-15T13:47:46Z**. At or after that threshold, update memory/push useful work, remove lease in the final commit, and verify. Commits must prefix `Agent 50:`; no per-commit CI.

## Completed source-location compatibility work

- Reproduced native Node 22 `Error.stack` source location change from `entry.cjs:1:72` to `entry.cjs:1:59` after a simple identifier-length substitution.
- Extended `src/ast.js` shared source observer to disable source rewriting when syntactic `.stack`, `.captureStackTrace`, `.prepareStackTrace`, `.stackTraceLimit`, stack destructuring or direct `Reflect.get` / property-descriptor reads expose source coordinates. This is deliberately conservative, with many dynamic-indirection gaps.
- Added `test/error-stack-observation.test.js` with native-vs-transformed exact frame comparisons in a fixed VM filename, cross-file observer refusal, and a positive no-observer transform control. Added `im-results/stack-observer-2026-11-15.md` with evidence and limitations.
- Initial manual full run [43715351761](https://github.com/FlareZ123/obfs/actions/runs/43715351761) passed Linux/Windows at pinned SHA `9815cee01b93d1fca1dc9f0070b63b61a2819d93` (first five cases).
- Expanded run [43715589463](https://github.com/FlareZ123/obfs/actions/runs/43715589463) FAILED with missing-argument `staticString(undefined)` in new direct Reflect call detection. Agent 16 independently fixed this by adding `node.arguments.length>1` (commit `09e00e51894b`). Later full run [43715781459](https://github.com/FlareZ123/obfs/actions/runs/43715781459) PASSED at `9ce3535250a320228b62a1784cfb7e9f943166e0`, covering the expanded cases. Update report with both failures and green result.
- Node documentation: https://nodejs.org/download/release/latest-jod/docs/api/errors.html

## Shared state and constraints

- Main has a conservative Acorn AST compiler for COO/SCO/SNO, a separate TypeScript checker candidate, and SCO server-private RPC. Current `results/README.md` explicitly denies established peer-review-level obfuscation-security gains. Static normalizer recovers all tested hashed property names; source-private SCO oracles can be learned on finite or low-dimensional domains.
- Critic broadcast `0d50a0c...` requests immutable release SHAs, attacker-plus-performance evidence and reduced full-CI churn. Re-read it when extending architecture.
- Local shell has Node 22, but no GitHub network DNS; use GitHub connector for repository changes, Actions manual workflows for integration tests.
- In-progress research idea: independent SCO 128-bit input/256-bit random HMAC-key PRF experiment showing limited offline table attack fails on held-out inputs, while comparing native local execution with authenticated loopback RPC for coarse-grained protected work. Explicitly distinguish bounded oracle evidence from cryptographic proof and full 2.5x browser/WAN guarantee. Existing `sims/sco-oracle-exhaustion.js` demonstrates the opposite for a 256-input finite HMAC domain, so a large-domain positive counterpoint may guide architecture.


## SCO key-entropy and hot-RPC paired research (13:05 UTC)

- Added `sims/sco-high-entropy-prf.js` and `sims/sco-key-search.js` plus manual `.github/workflows/manual-sco-oracle.yml` gate steps and `jsconfig.sco-oracles.json` strict JSDoc membership.
- High-entropy experiment runs actual SCO public ESM facade with random server-only 256-bit HMAC key, 128-bit input space and 15,000 iterations per call. Memorization-only attacker queried 12 inputs and matched 0/24 disjoint held-outs. In focused green Linux/Windows [run 43716510228](https://github.com/FlareZ123/obfs/actions/runs/43716510228), pinned SHA `5adf943d28489e1053112e63effbdd58df7c6947`, local/RPC loopback ratios were 0.96064x Linux and 1.02812x Windows, meeting 2.5x for this coarse workload. First experiment [run 43716361071](https://github.com/FlareZ123/obfs/actions/runs/43716361071) executed behavior successfully but failed JSDoc due Promise callback typing, fixed in subsequent commit.
- Key-search control runs genuine authorized SCO facade for independent 16-bit and 256-bit keys, using one chosen response and 65,536 offline 2-byte candidate HMAC keys per service. It recovered one unique weak key and reproduced all 32 later inputs while finding 0 candidates from the 256-bit random key in that dictionary. Tiny one-round HMAC RPC/local cost was 216.17x Linux and 187.28x Windows, violating 2.5x. Focused run [43716941756](https://github.com/FlareZ123/obfs/actions/runs/43716941756) passed Linux/Windows and strict JSDoc at SHA `23164dbb80b3d22abad3277313b07c611c92c7a1`.
- Reports: `im-results/sco-high-entropy-prf-2026-11-15.md`, `im-results/sco-key-entropy-2026-11-15.md`. Sent broadcast `communications/broadcast/2026-11-15T130550Z_agent50_sco-entropy-granularity-pair.md` requesting adaptive attack critique and emphasizing bounded evidence.
- Interpretation: trusted-server omission of key/source, sufficiently high key entropy, and coarse work granularity are separate necessary design considerations. One-round HTTP RPC is empirically impossible for current 2.5x on tested loopback; bulk compute meets on pinned sample. A legitimate user may still relay live arbitrary queries; table misses do not establish crypto resistance. Never promote to academic `results/` on these observations alone.

## Additional next-step ideas

- Test exact-function-source compatibility at **opaque external function escape boundaries**. Current observer is syntactic and handles only source-reading code in the input group; an opaque external `window.inspect(foo)` might call `foo.toString()` or `Error.stack` and see renamed source, despite no local observer. Need a closed-world/observable API contract rather than silently assuming opaque call purity; verify with differential regression before code edits.
- Consider adaptive key attacks or independent cryptanalysis on server-private keyed operations, with explicit query/compute budgets.
- If the broader suite changes on main, pin verification to exact commit, do not infer from previously green runs. Do not run full CI for isolated low-value variants.


## 13:36 UTC: production-facing real SCO artifact and explicit threat boundaries

- Built runnable and committed `examples/sco-private/`: `before-private.mjs` with env-injected 256-bit key + Node crypto 15,000 HMAC rounds; byte-exact compiler-generated `after-public.mjs`; `build-sample.cjs` deterministic generator/check; `server.cjs` authenticated localhost public ESM/RPC endpoint using real `createScoHandler` and server-private ESM import; example README and root README link. Added `.gitattributes` for cross-platform LF generated artifact.
- `test/sco-real-example.test.js` verifies native-vs-actual-served proxy results, full service calls, withheld secret, forbidden source retrieval and unauthenticated 403, all with fresh random key. Added manual SCO oracle CI and `jsconfig.external.json` strict JSDoc membership for example and test.
- Initial run `43719158729` failed because Windows checked out LF artifact as CRLF and test assumed on-wire SCO response equals untransformed builder facade. Fixed snapshot with `.gitattributes`, updated test to import actual served second-pass-obfuscated module from atomic temp file.
- **Pinned full focused green Linux/Windows [run 43719354840](https://github.com/FlareZ123/obfs/actions/runs/43719354840)** at commit `6572d764cb212c3ab50fdf084df7046ab9aac4f3`, all workflow steps including exact sample check, live RPC equality, JSDoc typecheck succeeded.
- Source code `src/sco.js` documented `allowedHosts` as attacker-forgeable HTTP Host routing filter, not authorization. New `test/sco-host-header-spoof.test.js` demonstrates 200 with forged host alone, 403 without separate read/RPC authorization. Cross-platform green `43718121748` at `735eb3bde8806e706c48368d6ebe7d96e4b87f96`.
- `sims/external-function-source-contract.js` proves opaque external bridge may reveal exact `Function.prototype.toString` or stack locations while AST contains no local observer; same for separately imported ESM exported function, under native execution. Cross-platform green falsification `43717875329` at `e064f1fc8d0355d93228d506888542f6572388d8`. `im-results/opaque-external-source-contract-2026-11-15.md` documents evidence. Corrected `im-results/stack-observer-2026-11-15.md` with expanded green.
- Read [maintainer directive](../../communications/broadcast/2026-11-15T1240Z_maintainer_advanced-obfuscation-directive.md) calling for advanced real before/after samples. Sent response `communications/broadcast/2026-11-15T133550Z_agent50_real-sco-before-after-example.md`; sent Agent16 `communications/agent16/2026-11-15T133500Z_agent50_opaque-stack-observer-followup.md`.
- Limitations: Node/browser ESM facade can be inspected and used online; server-side private implementation cannot be retrieved from client under trusted-server model, but the cryptographic service is an oracle for authorized clients. Basic auth localhost-only, lack of production network/TLS/browser performance measured. COO/SNO strong full-control obfuscation remains unproven.
- Next: Consider real headless Chrome with Basic auth; local /usr/bin/chromium hangs when launched under container mock HTTP, so do not claim verified browser demonstration. Existing `.github/workflows/manual-browser.yml` has Chrome, could test remote but avoid expensive risky CI unless robust. Existing `manual-sco-oracle.yml` verifies Node live ESM, not Chromium.
- Actual lease claim remains `2026-11-15T12:37:46Z`; **release at measured >=13:47:46Z** only, deleting lease after all other state pushed. Commit title prefix Agent 50. Do not release before cutoff.
