# Affine-conjugated odometer: exact n-query recovery of the hidden linear map

**Classification:** intermediate negative design result. This is a counterexample to using high algebraic degree and a hidden linear conjugator as a stand-alone SCO protection layer. It is not a generic attack on arbitrary high-degree permutations.

## Construction

Let A be any invertible n-by-n matrix over GF(2), and let T(z)=z+1 mod 2^n be the n-bit modular incrementer. Define the permutation

    F(x) = A^-1(T(Ax)).

T is a single cycle of length 2^n. Its output bit i is z_i XOR the carry into bit i; for i>=1 that carry is the product of the lower i bits. Hence the vectorial algebraic degree of T is n-1. Invertible affine input/output transformations preserve vectorial algebraic degree, so F also has degree n-1. The construction is therefore high-degree for large n, despite being a simple conjugate of a known permutation.

## Chosen-query attack

The attacker knows the incrementer core T but not A. Set x_0=0. For k=0,...,n-1, make one forward query and update:

    y_k = F(x_k)
    x_(k+1) = x_k XOR y_k

Claim, by induction:

    x_k = A^-1(2^k - 1)
    y_k = A^-1(2^k)

The base case is x_0=0. If x_k=A^-1(2^k-1), then Ax_k=2^k-1, so

    y_k = A^-1((2^k - 1) + 1) = A^-1(2^k).

Then x_(k+1)=x_k XOR y_k=A^-1((2^k-1) XOR 2^k)=A^-1(2^(k+1)-1). Thus each oracle response y_k is exactly column k of A^-1.

After n chosen queries, the attacker has the complete inverse matrix A^-1. Gaussian elimination recovers A. For any target t, compute

    x = A^-1((A t - 1) mod 2^n).

This is its exact preimage. The attack uses n oracle queries total, followed by polynomial-time GF(2) matrix operations. The recovered matrix can be reused for every subsequent target.

## Reproducible implementation and checks

- Implementation: sims/affine-conjugated-odometer-oracle-attack.js
- Test: test/affine-conjugated-odometer-oracle-attack.test.js
- Both are included in jsconfig.external.json for strict external JSDoc validation.
- Local Node tests recovered the exact inverse matrix for **24 independently generated matrices** at widths 8, 16, 32, 64, 128, and 256, using exactly n queries in every case.
- The same runs checked **440 additional targets** (20 per matrix through width64; 10 per matrix at widths128 and256); every target was inverted exactly.
- An exhaustive width-eight ANF audit confirmed degree seven after random invertible linear conjugation. The width-eight permutation was also checked to form one cycle of all 256 states.
- The matrix generator is deterministic test scaffolding based on invertible row operations; the attack proof does not depend on the matrix distribution and holds for every invertible A.

The focused two-platform manual validation completed successfully: workflow run 45123351781 at source commit ec0c2e74badbce1b4a9eee37cc9ff833ea034c4c passed on Ubuntu and Windows, including the focused tests and strict project/external JSDoc checks.

## Security interpretation and limitations

This construction is **not** a viable defense against a chosen-query attacker who knows the incrementer core. The high degree does not help because the carry recurrence exposes the conjugator adaptively. It is also not evidence that arbitrary high-degree affine-conjugated triangular maps can be recovered in n queries.

The attack specifically assumes:
1. the same linear A is used on input and its inverse on output;
2. the hidden core is modular increment by one;
3. the attacker can make chosen forward queries.

It does not directly cover independent input/output affine maps, an additional affine translation, or an unknown triangular core. Those variants require separate analysis. No runtime-overhead benchmark was performed, and no claim is made about the 2.5x budget.

**Disposition:** retain as a negative design result in im-results. Do not promote it as a cryptographic result or infer that all high-degree transformations are weak. Its practical value is to eliminate this particularly tempting but trivially recoverable conjugacy pattern from SCO candidate designs.
