# Rank-six fifth-derivative quotient reconstruction: full degree-five oracle clone

**Agent 50, 22 November 2026. Status: intermediate attack-side result; not a security claim and not eligible for \`results/\`.**

## Scope and promise

The implementation studies fixed vector-valued Boolean maps
\[
F:\mathbb F_2^n\to\mathbb F_2^n,\qquad 5\le n\le32,
\]
with global algebraic degree at most five. Let
\[
T_5(v_1,\ldots,v_5)
=\bigoplus_{S\subseteq\{1,\ldots,5\}}
 F\!\left(\bigoplus_{i\in S}v_i\right)
\]
be the fifth finite-difference tensor at zero. It is alternating and multilinear. Its **joint radical** is
\[
R=\{v:T_5(v,w_2,w_3,w_4,w_5)=0
       \text{ for every }w_2,w_3,w_4,w_5\}.
\]

The conditional source-class promise is
\[
\operatorname{codim}(R)\le6.
\]
If \(T_5\ne0\), the quotient \(V/R\) therefore has dimension five or six. If \(T_5=0\), the source has degree at most four. The promise is external: the learner's observed signature-span test is **not** a complete verifier of it.

The proof below is stated for vector-valued outputs; the current Node implementation is restricted to n-bit outputs represented as unsigned 32-bit integers. It is not a generic JavaScript source-recovery result.

## Conditional query bound

Let
\[
p_5=\prod_{i=0}^{4}(1-2^{i-5})
=\frac{9765}{32768}\approx0.2980041504.
\]
A nonzero scalar component of \(T_5\), under the codimension-at-most-six promise, factors through a five-dimensional quotient. A uniformly random five-tuple gives a nonzero witness whenever its projection is a basis of that quotient, which occurs with probability at least \(p_5\). With independent uniform trials, the miss probability after 66 trials is
\[
(1-p_5)^{66}\approx7.2124021643\times10^{-11}.
\]

For failure target \(\delta\), define
\[
t=\left\lceil\frac{\log\delta}{\log(1-p_5)}\right\rceil.
\]
A conservative distinct-oracle-query bound is
\[
Q(n,\delta)\le
\sum_{j=0}^{4}\binom nj+31t+30n.
\]

The terms are:
- \(\sum_{j=0}^{4}\binom nj\) low-Hamming-weight queries, which recover all degree-at-most-four ANF coefficients by Boolean Möbius inversion;
- at most 31 new values per fifth-derivative witness trial, since the 32-point derivative cube includes \(F(0)\), already queried;
- at most 30 new values per basis vector for its five anchor-signature contractions: their union contains at most 31 points and the empty-subset point is the already queried basis vector.

At n=32 and \(\delta=10^{-10}\):
\[
Q\le41,449+31(66)+30(32)=44,455.
\]
Unrestricted degree-five ANF interpolation requires
\[
\sum_{j=0}^{5}\binom{32}{j}=242,825
\]
chosen inputs. The conditional learner therefore uses at most about 5.46 times fewer chosen queries than generic degree-five interpolation. These are **oracle-query counts**, not a CPU-time ratio or proof of the 2.5× target-runtime budget.

## Reconstruction argument

After finding anchors \(a_1,\ldots,a_5\) with
\(T_5(a_1,\ldots,a_5)\ne0\), their classes are independent modulo \(R\). Define the five-coordinate signature
\[
S_a(x)=
\bigl(T_5(x,a_1,\ldots,\widehat{a_j},\ldots,a_5)\bigr)_{j=1}^{5}.
\]
Under the promise, \(\ker S_a=R\):
- in a five-dimensional quotient, the anchors form a basis and the five contractions detect every nonzero class;
- in a six-dimensional quotient, the anchors plus at most one additional class form a basis. If all five contractions vanish, contractions involving the additional class repeat the first argument and vanish by alternation, so every basis contraction vanishes and the class lies in the joint radical.

Thus the signature span has dimension five or six. The learner starts with the five anchor signatures and, if needed, adds one independent observed signature as a sixth pivot. The corresponding Gram values give the coefficients of the alternating five-form on a five- or six-element quotient basis. Determinants of the coordinate minors then recover every value
\(T_5(e_{i_1},\ldots,e_{i_5})\), which is exactly the degree-five ANF coefficient for that five-element support. The degree-at-most-four coefficients were already recovered from inputs of Hamming weight at most four. Together these determine the complete function.

If no witness is found in the trial cap, the learner returns the degree-four fallback. Under the promised nonzero-\(T_5\) case, the probability that this fallback is wrong is bounded by \(\delta\); when \(T_5=0\), it is exact.

## Implementation and reproducibility

Implementation:
- \`sims/rankfive-top-quintic-functional-clone-peer.js\`
- strict JSDoc project \`jsconfig.affine-low-rank-peer.json\`
- existing workflow \`.github/workflows/manual-low-rank-target-inversion.yml\`

No new workflow was added. The source-pinned run [44983197425](https://github.com/FlareZ123/obfs/actions/runs/44983197425), commit \`30e794cd427248d667bdfa7869e0bc28062d0ef9\`, passed on both Ubuntu and Windows, including the full manual low-rank suite and strict JSDoc.

The deterministic peer corpus reported:
- 48 finite sources at widths 5–8; all 5,760 truth-table outputs matched;
- 27 rank-five and 9 rank-six top-tensor cases, plus 12 exact degree-four fallbacks;
- 8 width-32 sources and 1,024 held-out evaluations;
- maximum observed width-32 query count 43,495, below the conservative 44,455 cap;
- maximum reconstructed top-coefficient count 123,109;
- trial cap 66.

The width-32 maximum observed query count includes degree-four fallback cases that exhaust all 66 witness trials but do not require the extra signature queries. The 44,455 expression remains the conservative upper bound for a promised source whose witness arrives on the final trial and whose signatures require all 30n new values.

A first CI attempt exposed a strict-JSDoc literal-narrowing error in the new boundary fixture; it was corrected by computing the mismatch boolean before asserting the two exact values. A subsequent green run exposed a latent n=5 test-generator issue: masking after \`draw() || 1\` could erase the intended nonzero top coefficient. The generator now masks before the nonzero fallback, and finite tests assert that active top terms produce the expected degree and quotient rank. The final source-pinned run above passed with the corrected 27/9/12 case counts.

## Paired rank-seven boundary controls

The script deliberately contains two different out-of-promise controls.

**Detected overflow.** The existing 7-input control has 21 independent top-degree output coefficients. Its observed fifth-derivative signature span exceeds six, so the implementation rejects it. The output records \`width=7\`, \`topCoefficients=21\`, \`outputRank=21\`, \`rejected=true\`.

**Silent promise violation.** The paired two-monomial source is
\[
F(x)=
\mathbf 1_{\{x_0x_1x_2x_3x_4=1\}}
\oplus
2\,\mathbf 1_{\{x_2x_3x_4x_5x_6=1\}}.
\]
Its two scalar fifth-forms have radicals
\(\operatorname{span}(e_5,e_6)\) and
\(\operatorname{span}(e_0,e_1)\), respectively, so their joint radical is \(\{0\}\) and the true codimension is seven. Forced anchors \(e_0,\ldots,e_4\) yield a nonzero witness in the first output coordinate. The five signatures of \(e_0,\ldots,e_4\) are the five unit vectors, while the signatures of \(e_5,e_6\) are zero. Thus the learner observes signature rank five, accepts the apparent rank-five model, and reconstructs only the first monomial. At input 124, the source returns 2 while the clone returns 0.

The Node fixture independently verifies the joint radical by testing all 128 vectors against all 35 standard-basis four-tuples; only zero is radical. The source/clone mismatch and the detected-overflow control both passed in the final Ubuntu/Windows run.

This is **not a counterexample to the conditional theorem**. It proves that signature-span overflow is a one-way fail-closed diagnostic: overflow is rejected, but non-overflow does not certify the source promise. A caller must obtain the source-class promise independently. Finite random held-out checks cannot certify arbitrary functions against sparse off-sample changes.

Agent 41's independent boundary analysis is preserved at
\`im-results/agent41-top-quintic-promise-boundary-2026-11-22.md\`;
the reproduction and CI result were sent in
\`communications/agent41/20261122T0408Z_agent50_quintic-boundary-ci-green.md\`.

## Related prior art and novelty status

The algebraic ingredients are established subjects, not inventions of this implementation:
- Claude Carlet, *Boolean Functions for Cryptography and Coding Theory*, covers vectorial Boolean ANF and higher-order derivatives ([monograph](https://www.math.univ-paris13.fr/~carlet/book-fcts-Bool-vect-crypt-codes.pdf)).
- Duan, Lai, Yang, Sun, and Zhu, “Distinguishing Properties and Applications of Higher Order Derivatives of Boolean Functions,” *Information Sciences* 271 (2014), 224–235 ([DOI 10.1016/j.ins.2014.02.108](https://doi.org/10.1016/j.ins.2014.02.108)), studies higher-order derivative degree reduction and the subspace of fast points.
- Bhrushundi, Harsha, Hatami, Kopparty, and Kumar, “On Multilinear Forms: Bias, Correlation, and Tensor Rank,” APPROX/RANDOM 2020 ([DOI 10.4230/LIPIcs.APPROX/RANDOM.2020.29](https://doi.org/10.4230/LIPIcs.APPROX/RANDOM.2020.29)), studies multilinear forms and tensor-rank/bias relations over \(\mathbb F_2\).
- Lampert and Ziegler, “Relative Rank and Regularization,” *Forum of Mathematics, Sigma* 12 (2024), e29 ([DOI 10.1017/fms.2024.15](https://doi.org/10.1017/fms.2024.15)), develops polynomial rank and bias notions over finite fields.

This was an initial targeted prior-art scan, not a systematic novelty review. The exact combination of a low joint-radical promise, five-anchor quotient signatures, and the stated black-box query bound was not established by these sources, but no originality claim is made. A systematic search and independent proof review are required before academic promotion.

## Limitations and decision relevance

- The theorem is conditional on a global degree-five promise and a joint-radical codimension bound. Neither is certified by a sparse oracle transcript.
- The current implementation is an integer-vector test harness, not a JavaScript parser, source-to-source transform, SCO HTTP service, COO bundle, or SNO runtime.
- It does not demonstrate URL/domain locking, anti-debugging resistance, integrity protection, resistance to runtime extraction, or an equal-trust security improvement over ordinary minification.
- The query bound does not measure the protected program's runtime, attacker CPU cost, memory, or the 2.5× runtime constraint.
- It does not justify promoting this candidate family or changing the project's **RELEASE-BLOCKED** decision.

Keep this as intermediate attack-side evidence. Its useful role is to veto or characterize narrow algebraic candidate families, not to imply that the obfuscator is stronger.
