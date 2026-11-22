# Universally singular affine coordinate interpolants for invertible triangular oracles

**Agent:** 2. **Date:** 2026-11-22. **Status:** Self-contained counterexample plus independent exhaustive width-three census; intermediate proof pending a second researcher's review. **Threat-model scope:** Chosen-query target inversion; no statement about generic source reconstruction or security of an obfuscator.

## Question

The conditional reanchored attack in [Agent 20's report](reanchored-compatible-affine-basis-inversion-2026-11-22.md) constructs a finite-difference matrix from the external coordinate basis:

```text
M_r(e_i) = F(r XOR e_i) XOR F(r).
```

If its source-coordinate normalization is an invertible compatible linear map, one target may be inverted with at most `2n+1` source-independent verification queries. Could this condition always be satisfied by *some* anchor `r` for an arbitrary invertible double-affine-wrapped compatible permutation?

**Answer: no.** There is a reversible triangular oracle for every bit width `n >= 3` for which **every** such `M_r` is singular, irrespective of the anchor. Any strategy that only varies the anchor and insists on invertible coordinate interpolants cannot use this theorem on the example, even with exhaustive anchor search.

## Explicit construction and algebraic proof

Work over GF(2), with bits indexed least-significant first. Define the invertible linear input map `A`, affecting only the first three coordinates:

```text
z0 = x0 XOR x2
z1 = x1 XOR x2
z2 = x2
zi = xi  (i >= 3).
```

Its inverse is itself. Define the bijective compatible (triangular) permutation `P` by

```text
P(z)0 = z0
P(z)1 = z1
P(z)2 = z2 XOR ((1 XOR z0) AND (1 XOR z1))
P(z)i = zi (i >= 3).
```

The controlled toggle depends only on the lower two bits, hence `P` is also an involution. Thus `F=P∘A` is a bijection of the full `n`-bit domain and fits the two-sided-affine oracle class with `L_out=I`, `L_in=A`, and zero translations. Its inverse is `A∘P`.

Expanding the third output bit as a polynomial over GF(2) gives

```text
F0(x) = x0 XOR x2
F1(x) = x1 XOR x2
F2(x) = 1 XOR x0 XOR x1 XOR (x0 AND x1)
             XOR (x0 AND x2) XOR (x1 AND x2).
```

For any anchor `r`, let `Δ_i F(r)=F(r XOR e_i) XOR F(r)`. Its first three output components are

```text
             first bit    second bit    third bit
Δ_0 F(r)        1             0        1 XOR r1 XOR r2
Δ_1 F(r)        0             1        1 XOR r0 XOR r2
Δ_2 F(r)        1             1        r0 XOR r1
```

Therefore `Δ_0 F(r) XOR Δ_1 F(r) XOR Δ_2 F(r)=0` identically: each term cancels twice. Higher output coordinates are zero for these three differences. **Columns 0, 1, and 2 of every `M_r` are dependent.** Thus `rank(M_r) <= n-1` for every `r` and `n >= 3`, even though `F` is a permutation. At `n=3` each matrix has rank exactly 2, confirmed exhaustively at all eight anchors.

This is a counterexample to a *hypothetical unconditional anchor-existence assumption*. It does not falsify Agent 20's correctly conditional theorem. A different oracle solver may recover the preimage easily; this construction is explicitly reversible when known.

## Exhaustive width-three census

The accompanying deterministic CJS reproducer enumerates all **168** invertible 3×3 input linear maps and all **128** three-bit compatible permutations (one constant low-bit toggle, two Boolean values for bit 1, and four for bit 2). For each of the **21,504** source pairs, it directly computes `M_r` at all eight anchors and checks invertibility plus the hidden source-coordinate compatibility criterion.

The exact classification is:

| Classification | Source pairs | Anchor results |
| --- | ---: | ---: |
| Compatible invertible at all eight anchors | 19,968 | 159,744 |
| No qualifying anchor; interpolant singular at all eight | 1,536 | 12,288 |
| Mixed qualifying/nonqualifying anchors | **0** | **0** |
| **Total** | **21,504** | **172,032** |

There is a compact independent count of the 1,536 universal failures. Every three-bit compatible permutation has a top-bit Boolean term `α·z0z1`, with `α∈{0,1}`. If `α=0`, the permutation is affine and the interpolant is always valid. Exactly **64** of the 128 compatible permutations have `α=1`.

Write the independent rows of the input mixing matrix `A` as `a0,a1,a2`. The nonlinear interpolation difference perturbs its top row by `d=a0 AND a1` (bitwise AND). Anchor dependence only adds linear combinations of the first two rows, which cannot change determinant. Let `v` be the unique nonzero bit vector orthogonal to `a0,a1`; by invertibility, `a2·v=1`. The determinant flips to zero precisely when `d·v=1`. Among the 42 ordered independent pairs `(a0,a1)`, this happens for exactly the six ordered pairings among `011, 101, 110`. For each such pair there are four admissible `a2`, hence **24** bad invertible matrices, giving **64 × 24 = 1,536** singular sources. This also explains the observed all-or-none anchor classification at width three.

## Complementary four-bit witness: invertible M can still be incompatible

A separate complete-width-four oracle `F=P∘A` has invertible linear input column vectors `A(e_i)=[9,2,3,12]`, and compatible output `P` given by independent lower-prefix truth-table masks `h_0=0`, `h_1=1`, `h_2=14`, `h_3=111` (bit `j` toggles if the bit indexed by its lower-`j)-bit prefix in `h_j` is set). Each map is a permutation of sixteen values.

The executable exhaustive audit finds **eight** singular external-coordinate bases and **eight** full-rank bases, with **zero** anchors whose normalized `B_r=M_r A^{-1}` is compatible. In particular, the ordinary measured matrix at anchor `r=11` has columns `[3,10,5,4]`, so it has full rank, while its hidden normalized columns are `[15,10,8,12]`, which violate lower-unitriangular compatibility.

For the published target `y=F(1)=5`, starting from the reanchored `x_0=r⊕M_r^{-1}(y⊕F(r))`, the proposed conditional fixed-point correction instead cycles:

```text
x_0=14 -> x_1=6 -> x_2=9 -> x_3=14 -> ...
```

None of the three distinct visited inputs maps to the target. Thus **merely checking that `M_r` is nonsingular does not certify convergence**, even for an invertible four-bit wrapped compatible oracle. This is consistent with the original theorem, which requires source-coordinate compatibility in addition to invertibility. It does not show that a different anchor or attack algorithm is incapable of finding the preimage; here no anchor passes the stated theorem premise, but some anchors succeed accidentally without it.

The exact fixture and exhaustive sixteen-anchor audit live in `sims/reanchor-incompatible-four-bit-cycle.js` and `test/reanchor-incompatible-four-bit-cycle.test.js`.

[**Focused two-platform run 45019761577**](https://github.com/FlareZ123/obfs/actions/runs/45019761577) at exact executable source `15abb640eebc0710264313d216b1d487980ae3c9` **passed** Node 22 Ubuntu/Windows for the three four-bit tests and both strict JSDoc gates. This pin predates the accompanying documentation-only edit.

## Reproducibility

- `sims/reanchor-all-anchor-singular.js`: explicit reversible oracle, all-eight-anchor proof checks, width-32 embedding, full width-three census, and stable count assertions. Its standalone invocation prints the count vector.
- `test/reanchor-all-anchor-singular.test.js`: four independent `node:test` assertions on both involutions, every three-bit anchor, 32-bit integration, and the exhaustive census. External dependency-free, CommonJS/JSDoc.
- The output bits and matrix dependence were also checked in a separate Python GF(2) enumerator before the Node implementation. That independent code counted exactly 19,968 all-valid source pairs and 1,536 no-valid pairs, with all 12,288 invalid anchor matrices singular.

[**Focused two-platform run 45019289608**](https://github.com/FlareZ123/obfs/actions/runs/45019289608) at exact source `dc0ab8bdcaffb509e939e8b26b7aea8d731e4650` **passed** on Node 22 Ubuntu and Windows, including all four theorem tests, strict project JSDoc and external JSDoc. This pin predates the document-only report addition and covers the executable simulation and test bytes.



## Interpretation and limits

The construction identifies a **boundary of an attack method**, not a defender's new security advantage. It says nothing about the complexity of inverting general two-sided affine compatible permutations or the ability to clone an ordinary protected program. It does not improve strong confidentiality, authorized-environment enforcement, or the strict 2.5× runtime requirement. The project's primary release decision remains **RELEASE-BLOCKED**.
