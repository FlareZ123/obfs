# Sampled affine differential flags: conditional inversion and 32-bit counterexamples

**Author:** Agent 2. **Date:** 23 November 2026. **Classification:** intermediate chosen-query attack research and finite experimental evidence. **Release decision:** RELEASE-BLOCKED. Do not promote the tested source-specific results to a general obfuscation-resistance theorem.

## Problem and controlled threat model

The public interface is a forward numeric oracle F: GF(2)^n -> GF(2)^n with a chosen-input query budget. The original input s and hidden compatible permutation P and invertible affine maps are withheld from the attacker implementation. The defender source generator creates a source of the form:

    F(x) = a XOR Lout(P(Lin(x) XOR b)).

The input and output linear maps are independently invertible binary matrices. A compatible triangular bijection P satisfies P_j(z) = z_j XOR g_j(z_0,...,z_(j-1)), with arbitrary Boolean g_j. Every such map is a permutation, even for nonlinear and high-degree gates.

The attack implementation in sims/affine-flag-oracle-attacker.js receives only a callback F, public width, sample count and a separate sampling seed. Its oracle code imports no source-private generator or hidden audit state. The controlled generator in sims/affine-flag-oracle-fixtures.js exports private-source audit details for independent testing only. Both modules and the tests are CommonJS with strict JSDoc, and the entire experiment is available in a single runnable test file.

Unlimited legitimate chosen-oracle calls are allowed by the project's stated SCO attacker model. This experiment requires a selected numeric forward oracle and does not establish a generic attack on arbitrary JavaScript, arbitrary authenticated services, or every compatible bijection.

## Conditional exact-inversion theorem

For each stage k, suppose an attacker has found an input subspace U_k of dimension n-k and an output mask w_k such that, for every x in GF(2)^n and every h in U_k,

    <w_k, F(x XOR h) XOR F(x)> = l_k(h)

for some nonzero GF(2)-linear form l_k on U_k. Set U_0=GF(2)^n, choose a direction d_k in U_k with l_k(d_k)=1, and define U_(k+1)=ker(l_k) within U_k. Repeat for n stages.

**Claim under these global premises:** Any published target y in the range of F is invertible with at most n+1 additional forward oracle evaluations after learning the flag. In particular n=32 requires at most 33 candidate evaluations, with caching reducing distinct calls.

**Proof:** Start from x=0. At stage k compare the kth scalar output <w_k,F(x)> with <w_k,y>. If they differ, replace x with x XOR d_k. The stage-k scalar switches because its derivative along d_k is 1 and independent of x. Every earlier mask w_i remains unchanged, since d_k belongs to U_k, which is a subspace of ker(l_i) for all i<k. Thus the first k+1 output scalar equations match after stage k. The w_k are linearly independent: any combination of previous masks has derivative zero on U_k, whereas w_k has a nonzero derivative on U_k. After n stages all n independent output functionals match, so F(x)=y. If F is a permutation, that x is the unique preimage. One equality check at the end catches any sampled false premise. QED.

**Existence for the stated family:** Take U_k to be the inverse image under Lin of the source-coordinate span of bits k through n-1, and w_k to be the kth row of Lout inverse (in the correct dual orientation). For a change in U_k, the lowest k triangular input bits do not change, so g_k does not change. The kth output-coordinate derivative equals the kth input-coordinate change, independently of x. Therefore a global flag of the required form exists for every correctly instantiated two-sided affine-wrapped compatible permutation. Its existence does not supply the unknown hidden basis or an efficient discovery algorithm.

This is a simple conditional algebraic argument, not evidence that a finite sampling procedure certifies the premise in 32-bit black-box access.

## Sampled chosen-query construction

Starting with the public standard input basis U_0, the implemented heuristic builds an output-difference span at each stage from 16 deterministic sample points x and every current basis direction h. For each sampled pair it adds:

    (F(x XOR h) XOR F(x)) XOR (F(h) XOR F(0))

to a binary row-echelon matrix. Any mask in the orthogonal complement appears to have derivative constant in x for the sampled directions. The attack chooses a candidate mask whose measured derivative along at least one basis direction is 1, records that pivot direction, and forms the new input-subspace basis by XOR-eliminating the measured derivative.

This reduces the input subspace dimension by one per stage. It needs no original source, no matrices and no saved secret. It uses explicit bounded caches and returns an unverified result if the final exact F(x)=y check fails. A returned status of "calibrated" means a sampled flag was constructed, **not** that a global derivative identity was proved.

If every sampled candidate also obeys the global condition above, the conditional theorem applies. A finite sample alone never establishes that implication, and exact verification of one target cannot validate a universal flag.

## Source-pinned results

**Exact executable source:** 2b637b67cbc56c578797b245f61567f2741301d8. The focused two-OS gate [45088770620](https://github.com/FlareZ123/obfs/actions/runs/45088770620) completed green on Ubuntu and Windows with Node 22.23.4, the full new test and both project/external strict JSDoc checks. Earlier source-specific gates [45088497727](https://github.com/FlareZ123/obfs/actions/runs/45088497727) and [45088623283](https://github.com/FlareZ123/obfs/actions/runs/45088623283) were also green before the final matched comparator.

| Fixed experiment | Exact outcome | Scope |
| --- | --- | --- |
| All-source global derivative checks at widths 3, 5, 7 | 12/12 sampled flags pass 16,448 exhaustively evaluated direction/input equations | Synthetic private generators, all input points and surviving basis directions |
| Exhaustive target inversion at widths 3, 5, 7 | 672/672 exact preimages | Every possible target for the 12 generated source permutations |
| Dense, two-sided affine-wrapped width-32 sources | 20/20 successfully calibrated, 1,280/1,280 independently selected exact target preimages | Fixed deterministic 32-bit mixer family and 64 held-out target inputs per source |
| Dense 32-bit learning query counts | 184,228 unique training queries total, maximum 9,236 per source, average 9,211.4 | Source-known number of distinct forward calls, excluding separate source-side target production |
| Dense 32-bit online inversion | 17,165 additional distinct queries across 1,280 targets, average 13.41015625 | At most 33 additional queries per target by construction |
| Matched earlier four-basis reanchoring policy | 0/12 exact inversions on 12 of the same dense sources; new method 12/12 | Earlier implementation permits four bases and at most 260 chosen queries, so budgets differ |
| Sparse 32-bit compatible source with secret 27-bit gate prefix | 8/8 bounded sampled flags had false positive "calibrated" status and failed exact chosen-target verification | Source targets selected on a prefix support of density 2^-27; no preimage falsely accepted |
| Separate sparse width-11 source | 24/24 sampled finite-query calibration attempts failed on a selected rare target | Negative counterexample for a different sparse permutation and output bit swap |
| Random shuffled width-8 permutation control | 6/6 rejected at a stage lacking the necessary sampled nonzero affine quotient | Not a compatible-permutation source; detects false overgeneralization |

Dense source gates are generated as low-input-bit hash-mixer Boolean functions with different seeded keys at each bit, and then enclosed by independently generated invertible binary affine maps. The hash mixer is a reproducible synthetic workload, not a cryptographic PRF or a claimed statistically uniform random Boolean function. Both the source constructor and sampler use deterministic xorshift replay seeds; the finite counts give no independent-distribution success probability or worst-case oracle complexity.

The sparse 32-bit gate flips bit 27 only when the first 27 source-coordinate bits equal a hidden prefix, then applies secret affine input/output wrappers. The source generator chooses the secret inside the sparse gate support. The new attacker correctly checks the final returned candidate against the actual oracle and refuses all eight incorrect answers. Eight selected seed instances demonstrate that 16 samples per stage can miss important source behavior at the **same 32-bit width** as the positive result.

The prior four-basis algorithm is the repository's invertByReanchoring implementation in sims/random-affine-anchor-compatible-inversion.js. Its 0/12 on this dense family is a narrow *source-and-budget-specific* contrast. It does not imply that all reanchoring or all alternative oracles fail; the high-query flag method is tested under a larger budget.

## Reproduction

From a checkout of the pinned source with declared dependencies installed:

~~~powershell
node --test test/affine-flag-oracle-attack.test.js
npm run typecheck
npm run typecheck:external
~~~

The same one-test source is dispatched in the repository's existing manual-validation.yml focused workflow as focused_test=test/affine-flag-oracle-attack.test.js, independently on Ubuntu and Windows. The test logs emit AFFINE_FLAG_EXHAUSTIVE, AFFINE_FLAG_32BIT, AFFINE_FLAG_REANCHOR_COMPARISON, AFFINE_FLAG_RARE_32BIT, and AFFINE_FLAG_NEGATIVE JSON summaries.

The attack, fixture, and test are in sims/affine-flag-oracle-attacker.js, sims/affine-flag-oracle-fixtures.js, and test/affine-flag-oracle-attack.test.js. The first two are listed with the test in jsconfig.external.json for strict source type validation. Reproduce from the exact executable commit above; this report-only commit changes no executable code.

## Relationship to existing research and limits

Agent 20's conditional compatible-interpolant attack in im-results/reanchored-compatible-affine-basis-inversion-2026-11-22.md uses at most 65 queries *when the observed interpolant happens to lie in a hidden compatible coset*. Agent 24's common-basis repair, independently reviewed by Agent 50, finds full-rank input/output differences with expected O(n) queries but does not certify the hidden-compatible condition. This method instead samples a **sequence of scalar derivative forms on shrinking input subspaces**, with a different and substantially larger chosen-query budget. Its dense-source fixed-corpus comparison is complementary to those results.

Independent review remains open for the formal conditional proof, whether arbitrary two-sided compatible permutations permit efficient *reliable* black-box flag discovery, and whether a stronger adversarial sampler can falsify the current 32-bit dense-source hit rate. The sparse counterexamples prove that this particular fixed-size sampler has no universal success guarantee. They do not prove a general worst-case lower bound for inversion or show a new defender advantage over an equally private conventional service.

The tested primitive is a selected numeric permutation oracle. No actual obfuscated JavaScript artifact was produced in this experiment; no static code reconstruction, browser instrumentation, environment admission, tamper resistance, or protected-runtime 2.5x computation was evaluated here. Its relevance is as an attack-method and candidate-falsification input, not as a release-capable obfuscation technique. Preserve the project's strong-protection **RELEASE-BLOCKED** decision.


## Complementary exact-verifying attack portfolio (same-source extension)

**Exact executable extension source:** b02c799c521de9cc20df6f3f6def673e7df75450, [green Ubuntu and Windows manual-validation workflow 45089223740](https://github.com/FlareZ123/obfs/actions/runs/45089223740), including the focused portfolio test and both strict JSDoc projects. This extension is deliberately merged into the same intermediate report because it **reconciles the sparse failure boundary** rather than establishing a competing security claim. Its report-only commit does not change the executable pin.

The additional attacker in sims/affine-flag-portfolio.js tries the existing at-most-four-basis reanchored exact-target inverter **first**, then trains the sampled differential flag only if all four reanchors fail. It shares a single public chosen-oracle cache across both methods. It never returns an unverified preimage: the earlier algorithm verifies each candidate, the new one verifies the final flag-derived candidate, and the wrapper independently checks any successful reanchored result. An unsuccessful result is an explicit refused response. The defender's source generators remain imported only by the tests.

### Complementary 32-bit results

The paired test test/affine-flag-portfolio.test.js uses the same 20 dense hidden-affine sources and eight sparse secret-prefix sources from the earlier evidence. Each source is tested on one selected target, with independent exact secret checks and a source-separated chosen-query boundary.

| Selected population | Exact target results | Successful route |
| --- | --- | --- |
| 20 seeded dense two-sided affine compatible sources | **20/20** verified | Sampled differential flag after reanchoring fails four bases (20/20) |
| Eight sparse 32-bit compatible sources with hidden 27-bit prefix gate | **8/8** verified | Existing fast reanchoring, before any flag calibration |
| Four unrelated seeded six-round Feistel 32-bit bijections | **0** claimed inversions, **4/4** explicit refusals | Neither route declares a false positive |

The first two populations jointly yielded **28/28** exact selected-target recoveries using **187,560** distinct chosen-oracle calls across independent sources, with a per-source maximum of **9,434**. These costs include the failed fast method before dense flag training, plus any successful fast method. Neither result implies universal attack success or a hard query limit for untested distributions. The Feistel fixture is a synthetic reversible block permutation, not a cryptographic-security claim.

**Interpretation:** The earlier eight sparse cases falsify the *standalone bounded flag learner*, while the cheaper canonical reanchor rescues the exact same rare selected targets. It would be incorrect to infer that a rare compatible gate is hard to invert merely because one sampled attack misses it. Conversely the four-basis reanchor loses against all 20 dense sources in this selected corpus, where the sampled differential route succeeds. The two routes address different source geometry; the combined finite result is stronger than either alone on the selected union.

### Exact single-coordinate sparse-gate corollary

The fast sparse outcome also has a transparent conditional explanation. Let P(z)=z XOR e_j*G(z_0,...,z_(j-1)), where G is any Boolean gate, and let A=Lout Lin. Assume a public interpolation anchor r and each of its n coordinate neighbors have G=0 in hidden source coordinates. Then their oracle differences give **exactly** the clean matrix A. The attacker can invert the observed n×n binary matrix using these n+1 oracle values.

For any target y=F(s), define x_0=r XOR A^-1(y XOR F(r)). If G(s)=0, x_0=s and the first exact check succeeds. If G(s)=1, x_0=s XOR d where d=Lin^-1(e_j), because the target differs from the ordinary affine output by w=Lout(e_j). The lower j source bits are unchanged by d, hence G(x_0)=1. Therefore F(x_0)=y XOR w. One fixed-point correction x_1=x_0 XOR A^-1(y XOR F(x_0))=x_0 XOR d=s, which passes the next exact check.

**Conditional bound:** One clean interpolation basis and at most two target checks suffice, at most n+3 distinct chosen-oracle calls (35 at n=32). This proof holds for any single-coordinate triangular gate G, with arbitrary hidden invertible affine wrappers, provided the chosen anchor's n+1 probes all avoid the gate. It does **not** establish that an attacker can efficiently find such a clean basis on every arbitrary gate, especially dense or deliberately anchor-poisoned instances.

The source-private 27-bit rare prefix has support density exactly 2^-27 in source coordinates. Its deterministic sample test is consistent with the clean-base lemma, but no independently uniform random sampling or theoretical clean-basis probability estimate is inferred from the eight seeded cases.

### Reproduction and scope

~~~powershell
node --test test/affine-flag-portfolio.test.js
npm run typecheck
npm run typecheck:external
~~~

Source-only attack implementation: sims/affine-flag-portfolio.js. Source-private extra 32-bit Feistel fixture: sims/affine-flag-oracle-fixtures.js. Strict type inputs: jsconfig.external.json. The original exact learned-flag test and the earlier source-pinned report remain unmodified.

The result combines two previous attack methods under a specified forward-oracle interface. It makes no claim of full offline function cloning, anti-tamper bypass, static source extraction, runtime overhead compliance, or a meaningful defender advantage over an equal-trust ordinary service. No obfuscated distribution was produced in this extension. It remains intermediate attack-method research, and the project's strong-protection release is **RELEASE-BLOCKED**.
