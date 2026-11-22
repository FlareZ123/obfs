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
This promise constrains only the degree-five homogeneous component. It does **not** imply that the full function factors through a six-dimensional quotient: arbitrary lower-degree terms may depend on all n input coordinates. Those lower-degree terms are recovered separately from the Hamming-weight-at-most-four queries. If \(T_5\ne0\), the quotient \(V/R\) therefore has dimension five or six; if \(T_5=0\), the source has degree at most four. The promise is external: the learner's observed signature-span test is **not** a complete verifier of it.

The proof below is stated for vector-valued outputs; the current Node implementation is restricted to n-bit outputs represented as unsigned 32-bit integers. It is not a generic JavaScript source-recovery result.

## Conditional query bound

Let
\[
p_6=\prod_{i=0}^{4}(1-2^{i-6})
=\frac{615195}{1048576}\approx0.5866956711.
\]
A nonzero scalar component of \(T_5\), under the codimension-at-most-six promise, has a five-dimensional quotient by its radical: its radical contains the joint radical \(R\), so its codimension is at most six, while a nonzero alternating five-form on a space of dimension at most six has radical codimension exactly five. Six independently uniform random directions project to six independent uniform vectors in that quotient. They span it with probability at least \(p_6\); when they do, at least one of their six five-element subsets is a basis and yields a nonzero vector-valued fifth-derivative witness. The six directions need not be linearly independent in the original input space.

With independent trials and failure target \(\delta\), define
\[
t=\left\lceil\frac{\log\delta}{\log(1-p_6)}\right\rceil.
\]
For \(\delta=10^{-10}\), \(t=27\), and
\[
(1-p_6)^{27}\approx4.3580153939\times10^{-11};
\quad
(1-p_6)^{26}\approx1.0544325546\times10^{-10}.
\]

A conservative distinct-oracle-query bound is
\[
Q(n,\delta)\le
\sum_{j=0}^{4}\binom nj+63t+30n.
\]

The terms are:
- \(\sum_{j=0}^{4}\binom nj\) low-Hamming-weight queries, which recover all degree-at-most-four ANF coefficients by Boolean Möbius inversion;
- at most 63 new values per witness trial: query the full six-direction cube of 64 subset sums once, with \(F(0)\) already cached. All six five-subset derivatives are then computed from these same cached values;
- at most 30 new values per standard basis vector for its five anchor-signature contractions: their union contains at most 31 points and the empty-subset point is the already queried basis vector.

At n=32 and \(\delta=10^{-10}\):
\[
Q\le41,449+63(27)+30(32)=44,110.
\]
Unrestricted degree-five ANF interpolation requires
\[
\sum_{j=0}^{5}\binom{32}{j}=242,825
\]
chosen inputs. The generic baseline is about 5.505 times the conditional learner's query cap; equivalently, the learner uses about 18.17% as many queries (an 81.83% reduction). These are **oracle-query counts**, not a CPU-time ratio or proof of the 2.5× target-runtime budget.

### Information-theoretic query lower bound

The promised class contains every vector-valued degree-at-most-four map, since \(T_5=0\) gives joint-radical codimension zero. Let
\[
L(n)=\sum_{j=0}^{4}\binom nj.
\]
There are \(2^{nL(n)}\) such n-bit-output functions: each of the \(L(n)\) ANF coefficients in each of the n output coordinates is independent. A deterministic adaptive learner making q queries has at most \(2^{nq}\) possible transcripts, because each answer contains n bits; it can reconstruct at most one function per transcript. For a randomized learner, fixing its random seed gives the same bound, so its average success fraction over this subclass is at most \(2^{n(q-L(n))}\). Consequently, any learner with worst-case success probability greater than \(2^{-n}\) must make at least \(L(n)\) queries.

At n=32, this lower bound is 41,449 queries. The 44,110-query upper bound is therefore only 2,661 queries, or about 6.42%, above this information-theoretic floor. This is a near-optimality statement in **oracle-query count** for the promised class; it says nothing about CPU time, memory, target runtime, or the 2.5× constraint.

## Reconstruction argument

After finding anchors \(a_1,\ldots,a_5\) with
\(T_5(a_1,\ldots,a_5)\ne0\), their classes are independent modulo \(R\). Define the five-coordinate signature
\[
S_a(x)=
\bigl(T_5(x,a_1,\ldots,\widehat{a_j},\ldots,a_5)\bigr)_{j=1}^{5}.
\]
Under the promise, \(\ker S_a=R\):
- in a five-dimensional quotient, the anchors form a basis. Write x = sum_i c_i a_i. Signature component i is c_i times the nonzero witness T_5(a_1,...,a_5), because every term with a repeated anchor vanishes by alternation. Thus S_a(x)=0 iff every c_i is zero, i.e. x is zero in the quotient;
- in a six-dimensional quotient, if x lies in the anchor span, the same component calculation as in the five-dimensional case forces x=0 in the quotient. If x lies outside the anchor span then (a_1,...,a_5,x) is a basis. If S_a(x)=0, all five basis coefficients on subsets containing x vanish; the only remaining coefficient is the nonzero witness on (a_1,...,a_5). Each scalar component of the vector-valued form is therefore either zero or supported only on the anchor hyperplane, whose radical is the line spanned by x. Hence x lies in every scalar radical and therefore in the joint radical.

Thus the signature span has dimension five or six. The learner starts with the five anchor signatures and, if needed, adds one independent observed signature as a sixth pivot. The corresponding Gram values give the coefficients of the alternating five-form on a five- or six-element quotient basis. Determinants of the coordinate minors then recover every value
\(T_5(e_{i_1},\ldots,e_{i_5})\), which is exactly the degree-five ANF coefficient for that five-element support. The degree-at-most-four coefficients were already recovered from inputs of Hamming weight at most four. Together these determine the complete function.

If no witness is found in the trial cap, the learner returns the degree-four fallback. Under the promised nonzero-\(T_5\) case, the probability that this fallback is wrong is bounded by \(\delta\); when \(T_5=0\), it is exact.

## Implementation and reproducibility

Implementation:
- \`sims/rankfive-top-quintic-functional-clone-peer.js\`
- strict JSDoc project \`jsconfig.affine-low-rank-peer.json\`
- existing workflow \`.github/workflows/manual-low-rank-target-inversion.yml\`

No new workflow was added. The final six-cube implementation passed the full existing manual low-rank workflow on both Ubuntu and Windows, including strict JSDoc, at source pin \`64932e0c8d80783f2bd366559defe60b5efa331d\`: [run 44984558684](https://github.com/FlareZ123/obfs/actions/runs/44984558684). The preceding five-tuple version also passed in run 44983197425; the six-cube run is the current validated implementation.

The deterministic peer corpus reported:
- 48 finite sources at widths 5–8; all 5,760 truth-table outputs matched;
- 27 rank-five and 9 rank-six top-tensor cases, plus 12 exact degree-four fallbacks;
- 8 width-32 sources and 1,024 held-out evaluations;
- maximum observed width-32 query count 43,150, below the conservative 44,110 cap;
- maximum reconstructed top-coefficient count 123,109;
- six-cube trial cap 27.

The width-32 maximum observed query count is from degree-four fallback cases that exhaust all 27 six-cube trials but do not require the extra signature queries. The 44,110 expression remains the conservative upper bound for a promised source whose witness arrives on the final trial and whose signatures require all 30n new values.

A first CI attempt exposed a strict-JSDoc literal-narrowing error in the boundary fixture; it was corrected by computing the mismatch boolean before asserting the two exact values. A subsequent green run exposed a latent n=5 test-generator issue: masking after \`draw() || 1\` could erase the intended nonzero top coefficient. The generator now masks before the nonzero fallback, and finite tests assert that active top terms produce the expected degree and quotient rank. The final source-pinned six-cube run above passed with the corrected 27/9/12 case counts and 44,110 query ceiling.

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

The ingredients are established subjects, not inventions of this implementation:
- Claude Carlet, *Boolean Functions for Cryptography and Coding Theory*, covers vectorial Boolean ANF and higher-order derivatives ([monograph](https://www.math.univ-paris13.fr/~carlet/book-fcts-Bool-vect-crypt-codes.pdf)).
- Drápal and Vojtěchovský, “Symmetric Multilinear Forms and Polarization of Polynomials,” *Linear Algebra and its Applications* 431 (2009), 998–1012 ([DOI 10.1016/j.laa.2009.03.052](https://doi.org/10.1016/j.laa.2009.03.052)), develop combinatorial polarization applicable even when the relevant factorial is not invertible in the field. This is directly adjacent to using finite differences/polarization in characteristic two.
- Duan, Lai, Yang, Sun, and Zhu, “Distinguishing Properties and Applications of Higher Order Derivatives of Boolean Functions,” *Information Sciences* 271 (2014), 224–235 ([DOI 10.1016/j.ins.2014.02.108](https://doi.org/10.1016/j.ins.2014.02.108)), study higher-order derivative degree reduction and fast-point subspaces.
- Sinha, “Efficient Reconstruction of Depth Three Circuits with Top Fan-In Two,” ECCC TR20-125 (2020; revision 2021) ([report](https://eccc.weizmann.ac.il/report/2020/125/)), gives randomized black-box reconstruction over finite fields for a restricted \(\Sigma\Pi\Sigma(2)\) circuit class whose rank is the span dimension of affine factors. This is relevant finite-field reconstruction precedent, but its circuit promise is different from the joint-radical promise here.
- Peleg, Shpilka, and Volk, “Tensor Reconstruction Beyond Constant Rank,” ECCC TR22-125 (2022; revision 29 July 2026) ([report](https://eccc.weizmann.ac.il/report/2022/125/)), give black-box reconstruction algorithms for multilinear and set-multilinear depth-three circuit subclasses and tensor-rank/decomposition results beyond constant rank. This is a close tensor-reconstruction precedent, but the abstract does not state the same vector-valued alternating-five-form joint-radical promise used here.
- Thankey, Gupta, and Saha, “Equivalence Test for Read-Once Arithmetic Formulas,” ECCC TR22-099 (2022) ([report](https://eccc.weizmann.ac.il/report/2022/099/download/)), study black-box polynomial equivalence and essential variables for read-once formulas. Their stated field assumptions are characteristic zero or sufficiently large (at least \(n^2\) in the main theorem), so this is not a direct characteristic-two result.
- Bhrushundi, Harsha, Hatami, Kopparty, and Kumar, “On Multilinear Forms: Bias, Correlation, and Tensor Rank,” APPROX/RANDOM 2020 ([DOI 10.4230/LIPIcs.APPROX/RANDOM.2020.29](https://doi.org/10.4230/LIPIcs.APPROX/RANDOM.2020.29)), study multilinear forms and tensor-rank/bias relations over \(\mathbb F_2\).
- Lampert and Ziegler, “Relative Rank and Regularization,” *Forum of Mathematics, Sigma* 12 (2024), e29 ([DOI 10.1017/fms.2024.15](https://doi.org/10.1017/fms.2024.15)), develop polynomial-rank and bias notions over finite fields.
- Juma, Kabanets, Rackoff, and Shpilka, “The Black-Box Query Complexity of Polynomial Summation,” *Computational Complexity* 18 (2009), 59–79 ([author page](https://www.cs.sfu.ca/~kabanets/Research/polysum.html)), prove query lower bounds for polynomial summation even for low per-variable degree. This is a different task from function reconstruction, but it is a useful warning that low degree alone does not imply low query complexity.

The joint-radical codimension is closely related to the essential-variable dimension of the top homogeneous component, while the finite-difference tensor is a combinatorial polarization of that component. The sources above establish substantial surrounding theory and black-box reconstruction precedents; none of the cited abstracts directly gives this exact combination of a vector-valued Boolean top-derivative joint-radical promise, five-anchor quotient signatures, and the stated query bound. This was still a targeted scan, not a systematic novelty review. No originality claim is made; systematic search and independent proof review are required before academic promotion.

## Limitations and decision relevance

- The theorem is conditional on a global degree-five promise and a joint-radical codimension bound. Neither is certified by a sparse oracle transcript.
- The current implementation is an integer-vector test harness, not a JavaScript parser, source-to-source transform, SCO HTTP service, COO bundle, or SNO runtime.
- It does not demonstrate URL/domain locking, anti-debugging resistance, integrity protection, resistance to runtime extraction, or an equal-trust security improvement over ordinary minification.
- The query bound does not measure the protected program's runtime, attacker CPU cost, memory, or the 2.5× runtime constraint.
- It does not justify promoting this candidate family or changing the project's **RELEASE-BLOCKED** decision.

Keep this as intermediate attack-side evidence. Its useful role is to veto or characterize narrow algebraic candidate families, not to imply that the obfuscator is stronger.
