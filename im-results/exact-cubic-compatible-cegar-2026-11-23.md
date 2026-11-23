# Exact cubic ANF clone and globally certified compatible-triangular inversion

**Status:** Intermediate research; conditional mathematical result and experimentally validated implementation. The focused two-OS test and strict typechecks passed at an exact source pin; independent peer review and full-main integration remain open. No promotion or release claim.  
**Author:** Agent 2, 23 November 2026.  
**Files:** sims/exact-cubic-compatible-cegar.js and test/exact-cubic-compatible-cegar.test.js.

## Source and oracle model

The defender publishes a forward selected 32-bit function, and the attacker may ask chosen-input queries. Assume the *true source* is of the form

\[
F(x)=a\oplus B\,P(Ax\oplus b),\qquad
P_j(z)=z_j\oplus g_j(z_0,\ldots,z_{j-1}),
\]

where the binary matrices \(A,B\) are invertible, and the vector-valued Boolean map \(F\) has total algebraic degree **at most three** over GF(2). The gates \(g_j\) may contain every lower-prefix linear, quadratic, and cubic monomial, not merely a product of three linear forms. The attacker receives no matrices or private gate parameters. The degree/triangular facts are **promises about the source family**, not claims that 5,489 oracle calls can certify these facts for an unknown general service.

The generic low-weight ANF learner already in sims/bounded-degree-oracle-functional-clone.js reconstructs every coefficient of a degree-at-most-three vector-valued map from exactly

\[
Q(32,3)=\binom{32}{0}+\binom{32}{1}+\binom{32}{2}+\binom{32}{3}
=1+32+496+4960=\mathbf{5,489}
\]

distinct forward queries. The resulting clone is correct on the entire \(2^{32}\) input domain by the algebraic degree promise. All subsequent inversion uses the clone coefficients locally. This claim alone does not imply efficient inversion of arbitrary cubic permutations.

## Exact cubic derivative certification

Define the output-valued second difference

\[
Z(x,v)=F(x\oplus v)\oplus F(x)\oplus F(v)\oplus F(0).
\]

For a cubic vector-valued Boolean polynomial, fixing a direction \(v\) leaves a polynomial in \(x\) of degree at most two and with zero constant term:

\[
Z(x,v)=\bigoplus_i x_i L_i(v)
\oplus\bigoplus_{i<j}x_i x_j Q_{ij}(v).
\]

Here each vector coefficient \(L_i(v)\) has degree at most two in \(v\), while each \(Q_{ij}(v)\) is linear in \(v\). The cubic contractor derives the following **exact** values directly from the public ANF coefficients:

- For a quadratic source monomial \(c_{ij}x_ix_j\), its contribution to \(L_i(v)\) is \(c_{ij}v_j\) and to \(L_j(v)\) is \(c_{ij}v_i\).
- For a cubic source monomial \(c_{ijk}x_ix_jx_k\), its contribution to \(L_i(v)\) is \(c_{ijk}v_jv_k\), and analogously for \(L_j,L_k\); its contribution to \(Q_{ij}(v)\) is \(c_{ijk}v_k\), and analogously for the other two pairs.

Let \(U\) be the current input direction subspace, with basis \(u_1,\ldots,u_k\), and write \(v=\oplus_p t_p u_p\). Every possible defect vector \(Z(x,v)\) is in the span of the finite mixed ANF coefficient set

\[
\left\{L_i(u_p),\quad Q_{ij}(u_p),\quad
L_i(u_p\oplus u_q)\oplus L_i(u_p)\oplus L_i(u_q):
i<j,\ p<q\right\}.
\]

Conversely each member of this coefficient set is an XOR of values of the exact defect polynomial over selected \((x,t)\) assignments, by Boolean Möbius inversion. Hence their spans are **equal**: this is an exact global certificate, not a random sample.

At dimension \(k\), the set contains

\[
\left(32+\binom{32}{2}\right)k+32\binom{k}{2}
\]

coefficient vectors, requiring \(k+\binom{k}{2}\) ANF contractions (some vector coefficients may be zero). Across all 32 greedy stages, the implementation produces exactly **453,376** coefficient-vector entries and **5,984** contractions. These are local calculations after the 5,489 forward training queries.

The orthogonal complement of the exact defect span contains precisely those output scalar masks whose first derivative is constant at *every basepoint*, for *every direction in U*. This replaces the quadratic bilinear certificate of sims/exact-quadratic-compatible-cegar.js with an exact mixed-cubic certificate.

## Why greedy inversion completes for this source family

The general global-derivative flag theorem is already recorded in im-results/affine-differential-flag-oracle-inversion-2026-11-23.md, with exhaustive 4-bit support in sims/compatible-derivative-greedy-exhaustive.js. It supplies a nonzero globally constant scalar derivative for every nonzero input subspace \(U\): choose the least source-coordinate bit \(j\) varying on \(AU\), and the output mask \(m^TB=e_j^T\). Then

\[
m^T(F(x\oplus h)\oplus F(x))=(Ah)_j
\]

for all \(x\) and \(h\in U\), which is nonzero for some \(h\).

The greedy algorithm maintains the invariant \(F(U)\oplus F(0)=V\), with \(V\) a linear output subspace and \(\dim U=\dim V\). The exact defect-annihilator basis includes a mask with nonzero restriction to \(V\); selecting an independent restriction cannot discard all such masks. Any accepted mask defines a nonzero linear form on \(U\); splitting its kernel reduces \(\dim U\) and \(\dim V\) by one while preserving the invariant. By induction, **every valid greedy choice completes** after 32 stages. The stored input toggles reconstruct the unique preimage of every target using only the local model.

This is a composition of an existing flag-existence lemma and an explicit cubic exact-certification construction. It applies to the promised affine-triangular degree-at-most-three class, **not** arbitrary degree-three permutations.

## Test design and falsification boundary

The independent test generator constructs arbitrary lower-prefix pairwise and triple ANF gates with dense invertible affine input/output wrappers and independent offsets. It compares the computed contraction with the source oracle's raw second differences at held-out points, compares the full clone on unqueried points, and checks exact target preimages. The inversion implementation does not import or inspect the test generator's private gates.

A source-proven fourth-degree triangular negative control flips a high output bit when four specified low input bits are simultaneously one. Every queried input of Hamming weight at most three sees identity, so the cubic learner obtains an **incorrect identity clone**. This witnesses that neither the source degree nor its correctness can be inferred from this restricted 5,489-query transcript. There is no universal query bound for unsupported source families in this record.

The result is an attacker-side candidate-elimination method under authorized chosen-query access. It does not recover original source bytes, bypass credentials, measure defender runtime against 2.5×, prove a generalized SCO protocol weakness, or establish any positive obfuscation security guarantee. An equally private conventional HTTP service exposing the same numeric oracle would leak the same chosen-input information.

## Source-pinned focused validation

The current test and its strict JSDoc annotations passed [manual-validation run 45253457506](https://github.com/FlareZ123/obfs/actions/runs/45253457506) on Ubuntu and Windows, with immutable source SHA \`b0a99ff3e15f94c9129c5b79c8daa7bc197fd94c\`. The focused workflow executed the two named tests and project/external strict JSDoc on both platforms; it **did not run the full mainline suite**.

Across three independently seeded 32-bit two-sided affine-wrapped full cubic triangular sources, the deterministic regression made 5,489 training calls per source, checked 72 separate direct-vs-contracted second differences, 120 held-out clone evaluations and 48 exact target inversions, with zero mismatches. It also checked the exact 5,984-contraction and 453,376-coefficient-vector counts per instance. The fourth-degree sparse-gate negative control passed: a cubic degree learner reproduced training values but disagreed on an unqueried input. These are reproducible finite engineering checks, not a statistical worst-case security bound.

## Equal-model competing inversion profile

**Prior art boundary:** This work must be compared against the *existing* exact symbolic coefficient-transport method at \`sims/bounded-degree-symbolic-affine-inverse.js\`, which already inverts affine-wrapped compatible-triangular polynomial maps up to degree four from the same \(\sum_{j\le d}\binom n j\) chosen queries, including the cubic case. The cubic contractor is an independently implemented target-**independent** flag-precomputation alternative, **not** the first 5,489-query inversion result. The older symbolic implementation recomputes target-conditioned coefficient restrictions for each inversion; the new method spends upfront computation so later arbitrary targets reuse the same masks.

The controlled \`test/exact-cubic-vs-symbolic-profile.test.js\` constructs three independent *genuine cubic* two-sided affine-triangular permutations. For each fixed 5,489-query learned ANF model, both independent inversion implementations receive exactly the same 24 target outputs. Both invert all 72 targets exactly, without extra source-oracle calls. After two warmups, five preparation samples and five alternating-order 24-target batches are run, recording within-run wall-clock medians. No timing threshold determines whether the test passes.

The [successful two-platform focused and strict-JSDoc workflow 45254485416](https://github.com/FlareZ123/obfs/actions/runs/45254485416) at immutable \`48636007ebce444ee6efa091152a7a51ae4e21b3\` logged the following observed ranges over the three independent seed instances:

| Runner | Exact cubic flag preparation | Existing symbolic: 24 targets | Flag reuse: 24 targets | Preparation + reuse: 24 targets | Amortized break-even |
| --- | ---: | ---: | ---: | ---: | ---: |
| Ubuntu Node 22 | 243.41–245.59 ms | 404.76–428.48 ms | 71.95–75.21 ms | 315.35–320.80 ms | 17–18 targets |
| Windows Node 22 | 281.68–288.84 ms | 456.77–507.36 ms | 111.69–122.19 ms | 398.20–403.87 ms | 18–21 targets |

All six compared cases have 4,960 nonzero cubic ANF coefficient masks (dense under these seed/mixer choices), identical 5,489 initial remote-query budgets, correct 24/24 targets, and 5,984 local cubic contractions for the flag-precomputation arm. The reported break-even is a derived per-target estimate \(\lceil t_{\mathrm{prep}}/(t_{\mathrm{sym}}/24-t_{\mathrm{reuse}}/24)\rceil\) using the sampled medians, not a measured immutable per-target crossover.

In this finite workload, the reusable global flag reduces *additional* local compute for many target inversions, but it pays a material setup cost. The symbolic inverter is the appropriate pre-existing reference, not an arbitrary slower CEGAR with repeated server requests. These are single-run warmed wall-clock samples, not repeated-process CPU distributions or product runtime overhead; no universal performance advantage, security gain, or defender 2.5× compute compliance follows. Both attacks rely on the same strong low-degree and triangular source promises and produce the same legitimate chosen-query information advantage against an exposed service.

## Live authenticated SCO versus equal-trust conventional HTTP

The final two-platform [focused run 45254778057](https://github.com/FlareZ123/obfs/actions/runs/45254778057) passed at immutable main source \`bcf1b031f9b753deff6dc69164027b8f04b23d59\`, including the named live HTTP regression and strict project/external JSDoc on Ubuntu and Windows. The test is \`test/sco-triangular-cubic-exact-cegar.test.js\` and its executable implementation is \`sims/sco-triangular-cubic-exact-cegar.js\`.

The source-private module is a degree-three upgrade of the existing serialized quadratic triangular fixture: it retains hidden affine input/output matrices and per-coordinate lower-prefix masks while introducing one triple product of independent linear forms per coordinate. The compiler creates a public facade through \`partitionScoAsyncModule\`; the privately imported original ESM export stays on the trusted server. The attacker receives only the actual served facade bytes to extract its hashed method route, its own legitimate credential, and the localhost endpoint.

A matched ordinary Node HTTP service uses **the same private ESM function, selected route ID, authentication header, one-uint32-argument policy, JSON result envelope, and error statuses**. Both services return 403 to an unauthenticated RPC. The attacker makes exactly the same 5,489 authenticated low-weight queries to each, reconstructs identical ANF coefficients and verifies SHA-256-equivalent query transcripts. No unauthorized access or private-source-parameter recovery is asserted.

The actual single-case outputs on both platforms were:

| Property | SCO private RPC | Matched conventional private RPC |
| --- | ---: | ---: |
| Legitimate chosen requests | 5,489 | 5,489 |
| Private executions counted by server | 5,489 | 5,489 |
| Unauthenticated selected RPC response | 403 | 403 |
| Fitting transcript digest | identical | identical |
| Actual nonzero degree-three coefficient masks | 4,960 | 4,960 |
| Server contact after fitted transcript | 0 | 0 |

After **both** servers close, the independent offline quadratic/cubic coefficient evaluator predicted **256/256** held-out source outputs and the cubic exact flag found **16/16** selected preimages; no further server requests occurred. The distributed public facade did not contain the serialized private fixture marker names. The report does not assert that those labels prove source secrecy against stronger server attacks; in the stated SCO model the attacker cannot read the trusted server's files, and these checks only verify this constructed admission boundary.

This is a **negative selection result for the low-degree source family** and demonstrates **zero observed incremental functional-oracle protection over an equally trusted conventional service** for this specific interface. It does not defeat authentication, generalize to arbitrary authenticated JavaScript, prove that 5,489 chosen calls are always permitted by every API, or establish any 2.5× compute property. It is not an independent proof of source-disclosure resistance.

## Reproduce

From a checkout of the source with declared dependencies:

    node --test test/exact-cubic-compatible-cegar.test.js
    npm run typecheck:external

For a full source-pinned receipt, use the existing manual-validation focused workflow with focused_test=test/exact-cubic-compatible-cegar.test.js on both Ubuntu and Windows. Only the focused test and strict typechecks run under that input; it is **not** a full regression-suite acceptance gate.
