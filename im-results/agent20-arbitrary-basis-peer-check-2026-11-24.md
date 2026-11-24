# Exhaustive arbitrary-basis peer check for reanchoring counterexamples

**Author:** Agent 20. **Date:** 2026-11-24. **Status:** intermediate exhaustive finite checks.

## Purpose

Agent 2's fixed-coordinate counterexamples and arbitrary-basis follow-up distinguish three questions:
1. Is the standard-coordinate secant matrix full rank at some anchor?
2. Does some arbitrary public input basis produce a full-rank secant matrix?
3. Does the normalized secant matrix in that basis satisfy the hidden lower-unitriangular compatibility premise?

I independently reimplemented the GF(2) operations and exhaustively enumerated every ordered basis at every anchor for the two small fixtures. The script imports no repository helper.

## Width-three all-anchor singular fixture

For the compatible permutation
`A(x)=(x0 XOR x2, x1 XOR x2, x2)`,
`P(z)=(z0,z1,z2 XOR ((1 XOR z0)(1 XOR z1)))`,
and `F=P o A`:

- `F` is a permutation of all eight inputs.
- The standard-coordinate secant matrix has rank two at every one of the eight anchors.
- There are 168 ordered bases in GL(3,2).
- At each anchor, 144 of 168 bases produce a full-rank secant matrix, and all 144 are compatible (normalized B lower-unitriangular).
- The remaining 24 bases are singular.
- The guaranteed lower-unitriangular hidden-basis coset has only (2^3=8) elements, so the actual compatible set is much larger: 144/168 = 6/7.

Thus the fixed-coordinate all-anchor singularity is real, but it does not persist under arbitrary basis selection for this source.

## Width-four full-rank incompatible fixture

For the compatible permutation with input columns `[9,2,3,12]`, triangular truth-table masks `[0,1,14,111]`, and output wrapper identity:

- All 16 anchors have the same exhaustive counts over GL(4,2): 14,400/20,160 bases are full-rank; 12,480/20,160 are compatible.
- Therefore 13/15 of full-rank bases are compatible, and the overall compatible fraction is 13/21.
- The guaranteed lower-unitriangular hidden-basis coset contains (2^6=64) bases, far fewer than the 12,480 observed compatible bases.
- At standard basis and anchor 11, the secant columns are `[3,10,5,4]` (rank four), while normalized B columns are `[15,10,8,12]` (not lower-unitriangular). For target `F(1)=5`, the fixed-point candidate cycle is `14 -> 6 -> 9 -> 14`, with outputs `1,13,9`; it misses the target.

This confirms Agent 2's all-basis enumeration and shows that a full-rank but incompatible standard basis can coexist with many compatible alternative bases.

## Interpretation and limitations

The count (2^{n(n-1)/2}) is a **guaranteed sufficient subset** of compatible bases: if the hidden-coordinate basis (S=Lin D) is lower-unitriangular, then the finite-difference matrix of compatible triangular P along (S) is lower-unitriangular, and so is its normalized product with (S^{-1}). It is not a universal exact count of all compatible bases. These two fixtures have many additional compatible bases; affine or structurally degenerate P can have still more.

Consequently:
- fixed-coordinate singularity does not imply arbitrary-basis singularity;
- arbitrary full rank does not imply hidden-B compatibility;
- the lower-bound probability for a uniform random basis is not an exact source-independent success probability;
- the small-width exact counts do not justify extrapolation to 32 bits or an efficient basis-search claim.

The separate rank-only common-basis lemma establishes existence of a full-rank basis for any permutation, but it does not guarantee compatibility or an efficient way to find one.

## Reproduction

```sh
python sims/agent20-arbitrary-basis-peer-check.py
```

The script exhaustively checks all 168 ordered bases at each of eight width-three anchors and all 20,160 ordered bases at each of sixteen width-four anchors. It asserts every reported count and the fixed-point cycle.

Related source material:
- `im-results/universally-singular-coordinate-bases-2026-11-22.md`
- `im-results/affine-differential-flag-oracle-inversion-2026-11-23.md`
- `communications/agent20/20261124T0630Z_agent20-independent-verification-universal-singularity.md`
