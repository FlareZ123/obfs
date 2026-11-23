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

The clean-basis single-gate corollary is a strict special case of the repository's already established rank-one perturbation theorem in results/rank-one-nonlinear-perturbation-inversion.md. That stronger result proves the same n+3 query bound for any affine-plus-rank-one Boolean scalar permutation, including rank-deficient observed interpolants. The narrower clean-anchor argument here provides a transparent explanation of the selected fast portfolio route; it is **not an independent new security theorem**.

The source-private 27-bit rare prefix has support density exactly 2^-27 in source coordinates. Its deterministic sample test is consistent with the clean-base lemma, but no independently uniform random sampling or theoretical clean-basis probability estimate is inferred from the eight seeded cases.

### Reproduction and scope

~~~powershell
node --test test/affine-flag-portfolio.test.js
npm run typecheck
npm run typecheck:external
~~~

Source-only attack implementation: sims/affine-flag-portfolio.js. Source-private extra 32-bit Feistel fixture: sims/affine-flag-oracle-fixtures.js. Strict type inputs: jsconfig.external.json. The original exact learned-flag test and the earlier source-pinned report remain unmodified.

The result combines two previous attack methods under a specified forward-oracle interface. It makes no claim of full offline function cloning, anti-tamper bypass, static source extraction, runtime overhead compliance, or a meaningful defender advantage over an equal-trust ordinary service. No obfuscated distribution was produced in this extension. It remains intermediate attack-method research, and the project's strong-protection release is **RELEASE-BLOCKED**.


## Exhaustive exact-greedy flag census at four bits

**Executable source:** 46f2d4810e4fe10ceee6339dac5149568d178efc, [fully green Ubuntu/Windows focused workflow 45089806133](https://github.com/FlareZ123/obfs/actions/runs/45089806133), including strict project and external JSDoc. This report appendix is a separate provenance unit following the source-pinned test. Its report-only commit changes no executable code.

An independent exact-truth-table program, sims/compatible-derivative-greedy-exhaustive.js, enumerates all possible width-four bitwise compatible triangular permutations, not sampled instances of a pseudorandom mixer. There are precisely 2^(1+2+4+8) = **32,768** distinct four-bit sources, because output bit j can use an arbitrary Boolean gate on the j lower input bits, requiring 2^j gate truth bits. Each generated source's complete 16-element map is separately checked to be a bijection.

For each source, the checker builds the full truth vector of every one of the 15 nonzero output scalar masks. It independently tests whether each scalar derivative D_h(w.F)(x) is **globally constant** for all 16 x and all 16 directions h, and records the exact derivative-one set. It begins with the entire input-direction vector space represented as a 16-bit membership set.

Crucially the recursive checker uses a stronger success condition than finding one working flag: **every** globally valid scalar w with a nonzero derivative l on the current subspace U must lead to a kernel U'={h in U: l(h)=0} where the same property holds for **every** subsequent valid choice. Each recursion step verifies that U' has exactly half the elements of U. Visited subspaces are memoized, but the checker does not prune adverse choices or consult the separate sampled attacker implementation. Success requires that no permitted globally exact choice at any reachable stage becomes a dead end.

**Observed full census result:**

    EXACT_GREEDY_FLAG_CENSUS {
      "triangularSources":32768,
      "allChoicesComplete":32768,
      "permutationFailures":0,
      "negativeControls":64,
      "negativeRefusals":64,
      "triangularScalarFunctions":279,
      "distinctScalarTruthFunctions":1192,
      "rootCandidates":180224
    }

Every one of the 32,768 width-four compatible permutations permits completion from *every* globally exact legitimate greedy derivative choice at *every* stage. There were **180,224** eligible first-step scalar masks across the 32,768 sources, an average of 5.5 eligible first choices per source. The 279 distinct scalar truth vectors from the triangular family are the zero vector plus all functions whose highest nonzero coordinate appears with unit coefficient: 2 + 4 + 16 + 256 = 278. The total 1,192 truth vectors includes the unrelated permutation control population.

For a nonvacuous negative, the checker also applies the same all-choices criterion to 64 deterministic shuffled full permutations of 16 inputs. All **64/64** are rejected. An arbitrary permutation is not required to admit an affine output derivative quotient; therefore this negative demonstrates the checker is not programmed to return success for every bijection.

### Affine-wrapper invariance of the finite census

The exact all-choices property is invariant under invertible affine input and output changes. For F'=Bout ◦ F ◦ Ain and any input difference h, the derivative transforms as D_h F'(x) = Lout (D_(Lin h) F(Ain x)), with affine offsets canceling. Input subspaces are mapped bijectively by Lin and nonzero output scalar masks by the invertible dual map Lout transpose. The property that a scalar derivative is globally constant, its nonzero linear form, the corresponding kernel, and all subsequent valid mask choices therefore correspond one-to-one across the conjugated source. Thus the **width-four exhaustive property also holds for every two-sided invertible affine wrapping of those same 32,768 triangular maps**, as a mathematical consequence of the enumerated property, without enumerating each affine wrapper separately.

This invariance is about the **exact global derivative criterion**, not about which derivative masks will be selected under finite pseudorandom samples. Affine wrapping can change the query distribution and the probability that a sampled learner mistakes a nonconstant derivative for a constant one.

### Reproduction, novelty and open problem

~~~powershell
node --test test/compatible-derivative-greedy-exhaustive.test.js
npm run typecheck
npm run typecheck:external
~~~

The new self-contained checker, independent single-file Node test and strict typed file entries are in sims/compatible-derivative-greedy-exhaustive.js, test/compatible-derivative-greedy-exhaustive.test.js and jsconfig.external.json. The mathematical tool is exact enumeration of scalar Boolean-function linear structures, a standard concept in cryptanalysis, for example [Musukwa et al., A Note on Vectorial Boolean Functions as Embeddings (2024)](https://boolean.w.uib.no/files/2024/09/4_musukwa.pdf). This report does not claim novelty for that terminology or known basic derivative-subspace facts.

**Update:** The exact-greedy extension question is resolved by the general constructive theorem below. The width-four census remains an independent exhaustive check of the theorem's input/output scalar and kernel semantics. What remains unresolved is a polynomial-query method for **discovering** genuinely globally valid masks from black-box samples. The already documented sparse 32-bit failure under 16 samples per stage remains a decisive counterexample to that extrapolation. No claim about strong client-only or server-only obfuscation resistance follows. The strong-protection project release remains **RELEASE-BLOCKED**.


## General greedy extension theorem, any bit width

**Analytic derivation on 23 November 2026; independent review requested.** This resolves the tentative arbitrary-width exact-greedy conjecture following the four-bit census, without assuming any source distribution, finite sampling success, or bound on black-box training queries.

### Theorem: every nonzero input subspace admits a nonzero globally constant scalar derivative

Let n>=1, work over GF(2)^n, let P be any compatible triangular permutation with components

    P_j(z) = z_j XOR g_j(z_0,...,z_(j-1)),  j=0,...,n-1,

where the g_j are arbitrary Boolean functions. Let A and B be invertible n-by-n binary matrices, a and b arbitrary offsets, and define F(x)=a XOR B P(Ax XOR b). Let U be **any** nonzero input linear subspace of GF(2)^n, even one constructed by earlier arbitrary scalar-kernel choices.

Then there exists a nonzero output scalar mask w and a nonzero linear functional l on U such that

    <w, F(x XOR h) XOR F(x)> = l(h)

for **every** x in GF(2)^n and h in U.

**Proof:** V=A U is a nonzero linear input subspace. Choose the smallest source-coordinate index j for which some v in V has v_j=1. By minimality, every v in V has v_0=...=v_(j-1)=0. Let the output mask w be the dual of source-coordinate j under the outer linear wrapper: w transpose=e_j transpose B inverse. Then w applied to the output difference removes B and a. For any x and h in U, put z=Ax XOR b and v=Ah in V. The strict-lower-bit arguments of g_j are identical at z and z XOR v because v_<j=0. Therefore

    <w, F(x XOR h) XOR F(x)>
      = P_j(z XOR v) XOR P_j(z)
      = v_j
      = (Ah)_j.

This quantity is independent of x and is a nonzero linear form on U, since j was chosen to occur in some v in V. QED.

### Corollary: arbitrary globally valid greedy choices never lead to a dead end

Suppose a black-box learner has selected any globally legitimate scalar derivative mask w_k on a current nonzero subspace U_k, with nonzero measured linear form l_k, and shrinks to U_(k+1)=ker(l_k) within U_k. The new subspace has dimension one smaller. If it is nonzero, apply the theorem above to U_(k+1) to obtain another valid mask and direction. This works **regardless of which valid mask was selected at earlier stages**. After n steps the subspace is zero, so a complete derivative flag always exists from any globally valid greedy path.

Every mask selected at a new stage is automatically independent of all previous masks. Their scalar derivatives vanish on the current U by the previous kernel definitions, whereas the newly chosen mask has a nonzero derivative there. The earlier conditional exact-inversion theorem therefore supplies an exact target preimage after at most n+1 further forward evaluations **if** the global masks have actually been found.

The proof is unchanged by two-sided invertible affine wrappers, which are included explicitly. It uses only the source triangular component law and the minimum active source-coordinate argument. It makes no assertion that the attacker knows A, B, j, or w, and no assertion that polynomially many sampled probes can identify a true mask under adversarial sparse gates.

### Relation to computation and existing work

The source-pinned [four-bit exhaustive census 45089806133](https://github.com/FlareZ123/obfs/actions/runs/45089806133) independently verifies all choices across all 32,768 width-four triangular maps, with 180,224 eligible root masks and 64/64 unrelated negative controls.

**Stronger arbitrary-subspace cross-check:** A separate exact-source refinement at 26ce52d46d18b696ae05df200a7ac54e55ffc5ca, [focused test 45090237138](https://github.com/FlareZ123/obfs/actions/runs/45090237138), constructs all 67 distinct linear subspaces of GF(2)^4 from independent generator closure. For every one of the 32,768 triangular source permutations, it checks the theorem's existence claim for **all 66 nonzero input subspaces**, regardless of whether the subspace lies on a greedy path. This is **2,162,688** exhaustive source/subspace witness checks, **zero failures**. Source-affine invariance gives the corresponding wrapped four-bit result. The computational census remains a finite independent check of the already proved any-width structural lemma. The theorem supplies the missing arbitrary-width reasoning that the finite census alone could not provide. Exact second-difference sample tests do not provide a certificate of global derivative constancy at width 32; the 8/8 false-learned sparse-gate cases remain a valid warning against treating empirical flags as proven ones.

The basic concept of a Boolean scalar linear structure is standard in the Boolean-function literature. The contribution here is the explicit constructive **subspace-independent existence and arbitrary-greedy-extendability statement for this two-sided affine-compatible family**. Its relationship to existing equivalent formulations and its external novelty have not been independently reviewed. It is a structural observation relevant to falsifying claimed hardness of this candidate class, not a practical polynomial-query oracle attack and not a release claim.

**Next unresolved problem:** Find a reliable public-oracle method to identify *globally valid* masks (or prove a query lower bound) under arbitrary compatible gates, including rare prefix gates intentionally absent from finite calibration samples. The source-separated portfolio attacks some dense and sparse controlled populations but has no universal completeness guarantee. The primary strong-protection release remains **RELEASE-BLOCKED**.


## Mixed dense-plus-rare gate stress: falsified attack-failure hypothesis

**Executable source:** 258128619e2a093b712ab26e7c61b5d3570b232e, [focused Ubuntu/Windows validation 45090722958](https://github.com/FlareZ123/obfs/actions/runs/45090722958) with strict project and external JSDoc. The preceding hypothesis-driven source pins [45090523208](https://github.com/FlareZ123/obfs/actions/runs/45090523208) and [45090595460](https://github.com/FlareZ123/obfs/actions/runs/45090595460) **failed their test assertion** because the predicted portfolio refusal boundary did not exist in this selected corpus. The failures were informative negative experimental outcomes, not compiler regressions. The revised source measures the observed result explicitly without changing the attacker.

### The adverse hypothesis and controlled source

A natural attempt to defeat both attack routes is to compose dense nonlinear triangular gates, which defeated the four-basis reanchor policy, with one additional extremely sparse gate on a high output bit, which defeated the standalone learner in a mostly affine source. The source-private fixture makeMixedRareDenseOracle in sims/affine-flag-oracle-fixtures.js implements precisely that:

1. Start from one of eight previously tested 32-bit dense compatible triangular permutations with independently generated invertible affine input and output maps.
2. XOR an additional source-coordinate bit-27 output gate when the **27 lower source input bits** equal a private 27-bit prefix. The resulting map is still a compatible triangular bijection, since bit 27 is changed only as a function of strictly lower bits.
3. Independently select two exact source inputs: a **rare target** inside that gate support, and a **matched ordinary control** differing in the lowest source input bit, outside the support. Fixture assertions verify that the rare result differs from the unchanged dense baseline and that the ordinary result equals the baseline. These baseline and secret source details never enter the attacker callback.
4. Try the existing fast reanchor plus sampled-flag portfolio, exactly as in the earlier mixed-population attack, using only selected forward oracle calls.

The initial hypothesis predicted that a dense background would block quick reanchoring, while the additional rare bit would escape sampled flag training and cause target refusal. The test deliberately asserted at least six rare refusals. The full Ubuntu and Windows runs **rejected that hypothesis**, and the later diagnostic revealed why: the attacker succeeded via the differential-flag route on **every** rare and control target.

### Exact observed outputs

    AFFINE_FLAG_MIXED_ROBUSTNESS {
      "sources":8,
      "rareRefused":0,
      "rareRecovered":8,
      "controlRecovered":8,
      "controlRefused":0,
      "chosenQueries":149805,
      "maxQueries":9431,
      "gatePrefixBits":27
    }

Every one of the sixteen output records used the sampled-flag route after the fast reanchor route failed its four bases. All **16/16** exact secret preimages passed direct source-private equality tests. The combined count **149,805** is the sum of distinct source-specific oracle calls for rare and ordinary targets, each invocation using its own shared two-route cache; maximum per invocation was 9,431. The rarity is an exact support density of 2^-27 in source coordinates, not a claim about sampled Cryptographic PRF behavior.

**Interpretation and limitation:** The general derivative theorem explains why a legitimate hidden flag remains globally correct regardless of arbitrary strictly lower-bit gates. Once the current input subspace has zero variation in the lower source bits of an output component, a gate depending only on those bits cancels in all directional derivatives. The selected dense baseline evidently provided enough differentiation for the sampled learner to find useful valid masks despite not necessarily seeing the rare prefix in calibration. This is a plausible structural explanation, not an independently verified claim that every learned mask in these eight instances was globally valid. The exact target checks show that the returned preimages are correct.

The result does not establish that all mixed rare/dense arrangements will succeed, nor does it falsify the earlier **8/8** standalone learner failures on the separate sparse sources. It prevents a misleading claim of defense robustness based on simply superposing one rare high-bit gate on this particular dense source family. It supplies no full source reconstruction, no generic black-box inversion proof, no protected-artifact benchmark and no obfuscation-security advantage. The project remains **RELEASE-BLOCKED**.
