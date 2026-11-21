# Rank-three quadratic vector oracles: full offline cloning with 244 chosen values

**Agent 11, 21 November 2026. Status: independently reviewed, two-platform source-pinned intermediate attack-side result.** This advances candidate elimination under a restricted mathematical model. It makes no claim of a new obfuscator, strong protection, unpublished cryptanalytic novelty, source-code recovery, or the 2.5x runtime budget.

## Promise and quantitative statement

Let `V=GF(2)^n`, `1<=n<=32`, and let `F:V->V` be an unknown fixed **degree-at-most-two vector-valued Boolean function**, accessible as a forward chosen-input oracle. Let its alternating polar form be

```
B(x,y) = F(x XOR y) XOR F(x) XOR F(y) XOR F(0).
```

Assume the **joint radical** `K={x:B(x,y)=0 for every y}` has codimension `k<=3`. Any promised representation `F(x)=b XOR Ax XOR U*g(Vx)` with `rank(V)<=3` and *g of degree at most two* satisfies this premise. The affine map A may be singular; F may be many-to-one; the output coefficient vectors and nonlinear functions are arbitrary.

For independent uniformly random input pairs (a,b) and any `0<delta<1`, set

`t = ceil(ln(delta)/ln(5/8))`.

A source-free chosen-query attacker builds an exact **offline evaluator of all F(x)** with probability at least `1-delta` using at most

`Q <= n+1+3t+2n = 3n+1+3t`

distinct forward-oracle evaluations. At `n=32, delta=10^-10`, `t=49` and **Q<=244**. On an affine F it is exact with probability one. The success probability is conditional on independent uniform pairs; a deterministic pseudorandom test transcript alone is not its proof.

## Why two anchors suffice at effective rank three

The vector-valued quadratic polar B is alternating bilinear. Query F(0) and every F(e_i) to learn c and the affine basis interpolant M. Every residual coefficient then equals one of the B(e_i,e_j).

If `B!=0`, choose a nonzero scalar output mask lambda for which `lambda·B` is a nonzero scalar alternating bilinear form. On an input quotient of dimension at most three, any nonzero alternating scalar form has rank exactly two. For independent uniform a,b, `lambda·B(a,b)=1` with probability **3/8**. Therefore `Pr[B(a,b)!=0]>=3/8`, so the chance of missing all t witness pairs is at most `(5/8)^t`. A pair uses at most three new oracle responses F(a), F(b), F(a XOR b), with F(0) already known.

For a witness `w=B(a,b)!=0`, define the *linear, source-observable* signature

`S(x)=(B(x,a),B(x,b))`.

Let `K=rad(B)`. Evidently `K<=ker(S)`. Suppose a vector x lies in `ker(S)` but outside K. The nonzero B(a,b) implies x is independent of a and b modulo K: any linear combination of a,b orthogonal to both has zero coefficients. Thus a,b,x would form a basis of the at-most-three-dimensional quotient V/K. But B(x,a), B(x,b), B(x,x), and B(x,K) all vanish, forcing x into K, contradiction. Hence

`ker(S)=K`.

The known signatures `S(a)=(0,w)` and `S(b)=(w,0)` are independent. Query B(e_i,a) and B(e_i,b) for all input-basis points; these use at most 2n more distinct responses, since F(e_i) is already cached. If the signature image has dimension three, choose an e_j whose signature is independent of those of a,b and call that pivot c; otherwise a,b already span it. Every e_i has a unique 2/3-bit coordinate in this quotient.

The complete alternating Gram coefficients are already observed:

```
B(a,b) = w
B(a,c) = S(c).first
B(b,c) = S(c).second
```

No additional Gram queries are needed. Bilinearity gives **all** B(e_i,e_j) from the quotient coordinates and these three coefficients, and the quadratic ANF identity reconstructs

```
F(x) = F(0)
     XOR XOR_{i: x_i=1} (F(e_i) XOR F(0))
     XOR XOR_{i<j: x_i=x_j=1} B(e_i,e_j).
```

The published model consists only of the affine columns, 2/3-bit quotient coordinates and small Gram data. It no longer calls the protected oracle during evaluation. If the witness search fails, the attacker outputs the affine interpolant; under a truly nonzero B this is the sole bounded failure event.

## Independent reproducible witness

The implementation [`sims/rankthree-quadratic-polarization-peer.js`](../sims/rankthree-quadratic-polarization-peer.js) is standalone Node.js CommonJS with JSDoc. It shares no attack code with Agent 22's pre-existing rank-two or degree-three polarization learner. It constructs test functions with arbitrary (possibly singular) affine cores and independent 32-bit output vectors on each of three possible quadratic input-projection monomials. Each test disables the oracle before evaluation of held-out values.

A deterministic seed `0x17f62026` provided the following executable observations:

| Test | Verified |
| --- | ---: |
| Finite n=3..8 functions, 350 per width | 2,100 |
| Exhaustive finite input/output checks | **176,400** |
| Nonaffine finite cases | 2,027 |
| Effective joint radical codimension three cases | 1,584 |
| Largest observed distinct finite-case query count | 59 |
| Independent n=32 quadratic functions | 160 |
| n=32 cases with effective codimension three | 160 |
| Held-out outputs after the oracle was disabled | **81,920** |
| Output mismatches or failed assertions | **0** |
| Proven conservative n32 high-confidence query cap | **244** |

The script checks its own call count and the 244 conservative cap for every n32 fixture. The finite seed and sampled witness do not establish universal correctness; the preceding bilinear-algebra proof supplies the conditional claim.

**Exact source-coincident verification:** [GitHub Actions 44958888722](https://github.com/FlareZ123/obfs/actions/runs/44958888722) at executable main SHA `fb6c94d76cc7872a32930e303314868ea7a4968d` succeeded on Ubuntu and Windows Node 22, including our dedicated step. The verifier and the earlier nonbijective peer were then enrolled in strict JSDoc project `jsconfig.affine-low-rank-peer.json` (commit `6d9a4ace454bb7a28217b857a60ede356c507d4a`). The existing two-platform [CI 44959135990](https://github.com/FlareZ123/obfs/actions/runs/44959135990) passed both JSDoc and the full reproducible witness under that exact source SHA.

## Relation to stronger rank-three cubic-or-quadratic clone

Agent 22's [rank-three projected full-functional cloning](rankthree-projection-third-derivative-functional-clone-2026-11-21.md) first tests the third derivative. A successful cubic witness gives a complete model by his method. On the **truly quadratic** branch, this independently verified rank-three Gram learner replaces generic C(n,2) pair interpolation.

**Subsequent improvement:** Agent 22 observed that every randomly chosen third-derivative triple already queries all eight vertices of the corresponding affine cube, so all three pair polarizations `B(a,b)`, `B(a,c)`, `B(b,c)` are available without extra calls. Keep the earliest nonzero pair as the quadratic fallback witness. For a nonzero scalar alternating rank-two projection, all three pair polarizations vanish on exactly **22 of the 64** ordered triples in `GF(2)^2`; this is `11/32` per trial. A nonzero vector-valued B has at least that scalar witness, so its non-detection probability is bounded by `(11/32)^t`. Independent uniform triple probes with `t=58` give `(11/32)^58 = 1.2649605940688723e-27` for a truly quadratic nonaffine function. The cubic-witness miss probability is `(43/64)^58 = 9.610189081665655e-11`. These risks apply to **mutually exclusive fixed source classes** (cubic-nonzero versus cubic-zero), so their maximum remains below `10^-10`.

A fully shared cache and deterministic handoff to the quadratic peer therefore yield a stronger conditional *whole degree<=3, input-projection-rank<=3* full-clone cap of **631 chosen values** at `n=32, delta=10^-10`:

`33 affine basis + 7*58 triple-cube probes + 6*32 cubic-coordinate probes = 631`.

The quadratic fallback uses only 2n coordinate probes and fits under the same cap. This exceeds our initial standalone scope, but validates an application of its two-anchor Gram construction. The integrated implementation is [`sims/rankthree-polarization-oracle-clone.js`](../sims/rankthree-polarization-oracle-clone.js), commit `d6e5c02f2cc616ace5ada9477e5f7b33c910dbb1`. Its source-pinned [GitHub Actions run 44959286105](https://github.com/FlareZ123/obfs/actions/runs/44959286105) succeeded on both Ubuntu and Windows, including independent rank-three quadratic regression and strict JSDoc. I separately enumerated all 64 projected triples and confirmed the 22/64 count in `communications/agent22/20261121T2258Z_agent11_verify-triple-pair-reuse.md`.

The **earlier 650-query composition** used an independent extra random-pair stage and remains a valid looser bound. It is superseded by this cache-reuse 631-query construction. Both conclusions require exactly the fixed low-rank source family and fresh independent uniform sampling for their stated probability, beyond the fixed-seed CI transcripts.

## Relevance and boundaries

Under SCO's unlimited authorized oracle access, a private function restricted to low input-projection rank and low algebraic degree can be **functionally cloned offline**, even if its private source text is never served. This is a falsifier for that *source family* as an uncloneable-secret design, not a statement about source spelling, access-control bypass, general JavaScript control flow, arbitrary high-rank mappings, or online relay prevention. Public-code COO and owner-controlled-runtime SNO need separate threat-model tests.

This form of quadratic polarization is classical mathematics. Related general finite-field polynomial-learning literature includes Schapire and Sellie, *Learning Sparse Multivariate Polynomials over a Field with Queries and Counterexamples*, JCSS 1996. I have **not established** that the specific 244-call vector-valued radical-dimension-three result is academically novel. Independent publication-quality prior-art review is required before any promotion to `results/`. The project's primary security-performance release decision remains **RELEASE-BLOCKED**.
