# Rank-two input projection: independent nonbijective oracle theorem and exhaustive peer check

**Agent 22, 21 November 2026. Intermediate attack-side result.**
This independently reviews and tightens [Agent 15's nonbijective rank-bounded image-membership theorem](low-rank-nonbijective-projection-inversion-2026-11-21.md). Academic novelty remains unverified. It is an attacker-side selected-family result, not an obfuscator release.

## Statement

Let an unknown fixed forward-query oracle have the representation

\[
F(x)=b\oplus Ax\oplus Ug(Vx),\quad x\in\mathbb F_2^n,
\]

where A is invertible, the input map V has rank at most **two**, the output map U has rank at most r, and g is otherwise arbitrary. Injectivity is not required. From n+1 basis queries compute c=F(0), M(e_i)=F(e_i) XOR c, and the public affine residual

\[
R(x)=F(x)\oplus c\oplus Mx.
\]

**The image span W of R has dimension at most one.** If W is nonzero, an independent uniformly random input reveals a nonzero R with probability at least 1/4. Therefore

\[
q=\left\lceil\frac{\ln\delta}{\ln(3/4)}\right\rceil
\]

independent uniformly random forward queries recover the complete W with probability at least 1-delta. Conditional on that single completion event, for every target y the affine candidate set

\[
C_y=\{x:y\oplus c\oplus Mx\in W\}
\]

contains all preimages and has at most 2^r elements. Exhaustively checking C_y yields a verified preimage or correctly proves that y is outside the image. Distinct oracle evaluations for one target are at most n+1+q+2^r, allowing overlaps. This is a probabilistic complete-span guarantee, not a universal worst-case query limit without randomness.

For input and output rank bounds both equal to two, the original general projected-model bound required q=23 at delta=0.01; this exact refinement uses **17**. At delta=10^-10 it improves q=97 to **81**. For n=32 and r=2, the latter gives at most **118** oracle evaluations.

## Proof, including singular and noninjective cases

Two linear projected coordinates z1(x),z2(x) express the arbitrary vector function in its unique Boolean algebraic normal form:

\[
Ug(z_1,z_2)=d\oplus a z_1\oplus e z_2\oplus w z_1 z_2.
\]

Subtracting the public affine interpolation removes the affine part and yields

\[
R(x)=w\,h(x),\qquad
h(x)=z_1(x)z_2(x)\oplus
\bigoplus_i x_i z_1(e_i)z_2(e_i).
\]

Thus every residual is zero or w. If V has rank below two, the complete composed function is affine and W=0. Otherwise independent input-basis columns for V give h(e_i XOR e_j)=1 for some i,j. If w is nonzero, W is exactly the one-dimensional span of w.

Let L(x) be the linear correction term in h. If L is nonzero on the kernel of V, h is balanced on every projection fiber. Otherwise L factors through V; as a function of two uniform projected bits h is a quadratic z1 z2 plus linear terms, with truth-table weight either one or three. Hence the nonzero residual probability is 1/4, 1/2 or 3/4. If W=0, the span is already complete. For nonzero W, the q-sample miss probability is at most (3/4)^q.

For any x,x' in C_y, M(x XOR x') is in W, which is contained in im(U). The linear difference M-A also maps into im(U), so A(x XOR x') is in im(U). Since A is invertible, C_y is contained in one coset of A^-1(im(U)), with at most 2^r elements. Every true preimage lies in C_y by definition of W. No bijection is needed.

The factor (3/4)^q is **sharp even for a noninjective oracle**. Take A=I and F(x)=x XOR e1*x1*x2 with V projecting onto x1 and x2. Its residual is e1*x1*x2, which is nonzero for exactly one quarter of uniform inputs. The oracle is noninjective when x2=1. Thus q=16 misses the one-percent guarantee in the worst case, while q=17 satisfies it.

## Exhaustive independently authored witness

[CommonJS/JSDoc proof witness](../sims/low-rank-nonbijective-peer-width3.js) enumerates every width-three representation formed by all 168 invertible three-bit linear A, all seven rank-two output U planes, all seven independent rank-two input V rowspaces, and all 256 arbitrary two-bit-input/two-bit-output g tables, fixing b=0 without loss of generality. These are **2,107,392 parameter representations**, some of which encode the same function.

For every representation, it evaluates the complete eight-input truth table, derives M and W, and classifies all eight targets against the true image and its affine envelope. Its independent scalar-functional support check and exact iid finite-sampling failure calculation validate the intermediate probabilistic premise.

| Quantity | Observed |
| --- | ---: |
| Representations | 2,107,392 |
| Noninjective representations | 1,768,704 |
| Singular affine interpolants | 1,220,352 |
| Nonzero residual spans | 1,580,544 |
| Reachable targets checked | 12,004,608 |
| Unreachable targets checked | 4,854,528 |
| Maximum candidate count | 4 |
| Wrong classifications or assertion failures | 0 |
| Nonzero residual-functional observations | 6,322,176 |
| Minimum nonzero functional support among eight inputs | 2 |
| Worst exact probability of incomplete W, q=16 | 0.010022595757618546 |
| Worst exact probability of incomplete W, q=17 | 0.00751694681821391 |
| Worst exact probability of incomplete W, q=23 | 0.0013378550367377784 |

Every observed W had rank at most one. The exact worst-case probabilities equal (3/4)^q for these q values. The test computes the independent-uniform failure law directly from the eight-element residual histogram and the proper subspaces of W. It includes a rank-two inclusion-exclusion calculation as a potential falsifier.

The initial computational witness was committed at [8aa491e](https://github.com/FlareZ123/obfs/commit/8aa491eede21f0a8b4561feffe0170fc8735c241). The first integrated [Linux/Windows run 44956396637](https://github.com/FlareZ123/obfs/actions/runs/44956396637) passed computation but identified an absent union JSDoc type for a witness object. The corrected source [0d259d1](https://github.com/FlareZ123/obfs/commit/0d259d16572546a589c2a5081341dbb52ed84a8c) then passed the entire existing Ubuntu/Windows research workflow in [run 44956549468](https://github.com/FlareZ123/obfs/actions/runs/44956549468).

The later exact-tail measurement and rank-one assertion were implemented at [82a1e65](https://github.com/FlareZ123/obfs/commit/82a1e6544894eb94c070d742e5f70a2333f76ffc), [c744500](https://github.com/FlareZ123/obfs/commit/c744500c881355b5d9e3075ab29a9e3c7f676f6b) and [bb1d6b8](https://github.com/FlareZ123/obfs/commit/bb1d6b82fa9c8bd2abf53b612c0d7d50faf23a7f). This latest code passed local Node 22.16.0 exhaustive execution. Its source-coincident CI status is separate from the earlier green workflow. The witness now participates in the existing [manual low-rank workflow](../.github/workflows/manual-low-rank-target-inversion.yml) and [strict peer JSDoc project](../jsconfig.affine-low-rank-peer.json), without a new workflow family.

## Threat-model boundary

The improvement depends on the **input-projection rank-two promise**. Low output displacement rank alone does not ensure it: rare, high-input-degree nonlinear events defeat this sampling bound, as shown by the out-of-promise counterexample in Agent 15's report. The theorem attacks chosen-oracle image membership and supplies no source-code secrecy, unauthorized SCO account access, hostile-runtime integrity, or 2.5x compute proof. The overall primary strong-obfuscation release decision remains **RELEASE-BLOCKED**.


## Independent 32-bit noninjective oracle regression

An independent, forward-oracle-only [32-bit reference/test](../sims/low-rank-nonbijective-ranktwo-32.js)
tests the improved q=81 training bound at delta=10^-10 on **96** distinct
affine-wrapped noninjective functions. The original private generator applies
invertible 32-bit linear input and output wrappers and undisclosed XOR offsets
around a known-to-the-verifier function with output low bits
(x0*x1,0). It therefore has a fixed unreachable output bit under the
private output unwrapping, an arbitrary hidden invertible affine core and a
rank-two input projection with output displacement rank at most two. The
attacker receives only a forward oracle and the rank promises; it does
not receive the wrappers, offsets, canonical output bit or target preimages.

The solver independently derives F(0), all 32 basis columns, at most 81
sampled residuals, then solves its own GF(2) linear equations for each target
over a 32-bit rank-deficient matrix, enumerating and checking every candidate.
Its JSDoc CommonJS implementation uses BigInt equation masks to avoid
JavaScript signed-bit overflow in elimination. The independently held-out
verifier checks 8 genuine preimages and 8 deliberately unreachable targets
per instance. In one fixed-seed **local Node 22.16** run:

- All **768** reachable targets returned a preimage with the correct forward
  output, and all **768** provably unreachable targets were rejected.
- All **96** cases genuinely had a singular public interpolant.
- At most **four** affine-envelope candidates and **four** additional
  oracle queries per target were needed; preparation used at most
  **114** distinct oracle queries, for **118** total per target.
- There were zero failed executable assertions.

The fixed xorshift trial transcript is reproducible numerical evidence, not
an empirical certification of the uniform-random sampling failure bound.
That probability follows independently from the preceding proof. The
generator itself knows the private wrappers for constructing inaccessible
targets, while the attack object never receives those parameters.

The new test was appended to the **existing** low-rank Ubuntu/Windows manual
workflow and strict peer JSDoc project in
[commit 150a867](https://github.com/FlareZ123/obfs/commit/150a86717285585402f3553ebe11358714e700e4).
The first post-addition full [run 44957313436](https://github.com/FlareZ123/obfs/actions/runs/44957313436)
is blocked earlier by a concurrent syntax error in Agent 15's existing
simulator (unexpected token near line 666); the 32-bit peer step has not
yet executed in that run. Agent 15 has been notified through the repository
mailbox. Do not mark the 32-bit source as two-platform green until it actually
executes and passes there.
