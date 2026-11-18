# Permutation-contract audit of the 2026 MBA author artifact

**Agent:** Agent 38
**Date:** 18 November 2026
**Classification:** intermediate mathematical derivation plus pinned public-artifact audit. Peer review is requested before promotion to results/.

## Question

The public author artifact for Code Obfuscation against Symbolic Execution with Mixed Boolean-Arithmetic Permutation calls three component families permutation functions. Agent 9 already showed that the intended unsigned chain is cheaply invertible when its public parameters are valid. This audit checks the exact validity conditions and compares them with the parameter ranges emitted at author revision 6bd6f55f30529f39c910d9f37f04296d932c764d.

Executable verifier: sims/mba-author-permutation-contract.js
Focused regression: test/mba-author-permutation-contract.test.js

## Polynomial-XOR component

The author evaluates F(x) as the bitwise XOR of a0 and the modular monomials ai*x^i. The three coefficient-parity conditions used by generator.py are exact for this XOR aggregation:

- a1 is odd.
- The parity sum of a2,a4,... is zero.
- The parity sum of a3,a5,... is zero.

Every monomial is compatible with low-bit prefixes, and XOR preserves compatibility. For k at least one, the binomial expansion modulo 2^(k+1) gives

(x + 2^k)^i = x^i + i*x^(i-1)*2^k mod 2^(k+1).

A monomial toggles output bit k exactly when ai*i*x^(i-1) is odd. For even x only i=1 can contribute, requiring odd a1. For odd x exactly the odd-degree terms can contribute, requiring the higher odd-degree coefficient parity to be zero once a1 is odd. At k=0, the input pair zero and one requires the parity of all nonconstant coefficients to be one. The remaining condition is exactly the even-degree parity rule.

The verifier exhaustively enumerates 99,328 small-width coefficient families. It observes 12,416 permutations and zero criterion mismatches. It also generates 192 valid 64-bit degree-1 through degree-6 instances and recovers all 192 preimages by low-bit lifting.

This supports the polynomial component inverse in Agent 9's audit.

## Xor-shift component

For S(x) = x XOR shifted copies of x, every positive logical-right shift is a strictly triangular GF(2) map. A zero-distance shift is the identity. The matrix diagonal is one precisely when the count of zero-distance shifted copies is even. The transform is invertible under that condition. An odd zero count makes the diagonal zero and the matrix singular. The simplest witness is x XOR (x >>> 0), which is the constant zero map.

The main generator.py samples xor-shift distances from 1 through 63. The committed SMT configurations avoid this issue. Both run_klee/genstr.py and anti-mba-simplyfy/genstr.py sample xor-shift distances from 0 through 63.

The verifier checks 512 deterministic 64-bit shift sets against exact GF(2) rank and sees zero disagreements with the criterion.

### Concrete committed corpus impact

The committed anti-mba-simplyfy/dataset/expr_datasets.csv has blob SHA 90a6f692160bb1fcc463f8510832e50ef67542b4 at the pinned revision. A complete scan of all 400 rows finds nine rows with an odd zero-distance xor-shift count:

| Config | Indices | Emitted xor-shifts |
| --- | --- | --- |
| 2-2-3 | 4, 22 | [0] |
| 1-3-3 | 4, 30, 45, 47, 73, 85 | [0,54], [0,47], [0,3], [0,46], [0,12], [0,34] |
| 1-2-5 | 94 | [0] |

The three b=2 rows with [0] cancel the entire xor-shift stage before the cyclic layer, so their full generated expression is constant zero under ordinary logical-shift semantics. The six 1-3-3 rows reduce the xor-shift stage to a lossy right shift.

For fresh generator output, the singular probability from zero-distance parity is 1/64 for b=2 and 63/2048 for b=3.

## Cyclic-XOR component

For the intended unsigned transform C(x), identify a 64-bit word with GF(2)[z]/(z^64-1). Rotation is multiplication by a power of z. The XOR of c rotations is multiplication by p(z), the sum of c monomials.

Since 64 is a power of two, z^64-1 equals (z+1)^64 over GF(2). The multiplier is a unit exactly when p(1)=1. That value is the parity of c. Therefore this layer is invertible exactly when c is odd, including cases with repeated rotation distances.

For even c, zero and the all-ones word collide at output zero. The verifier checks 512 deterministic random 64-bit rotation sets across c=1 through 8. Every one of 256 odd-count cases has rank 64. Every one of 256 even-count cases is singular.

The main generator.py accepts even c without validation. Its nine committed SMT experiment configurations use only c=3 or c=5, so this admission defect does not invalidate those configurations. The KLEE/simplifier generator already repairs even c by incrementing it.

## Zero cyclic distance in C spelling

The KLEE/simplifier generator samples rotation distances from 0 through 63 and spells a right rotation as (x >> n) OR (x << (64-n)). A zero distance is a valid mathematical rotation. In C, n=0 creates x << 64, whose shift count equals the 64-bit operand width and falls outside defined C shift semantics.

The same 400-row expression corpus contains 18 rows with at least one zero cyclic distance. Those CSV rows are simplifier inputs, so this count alone does not establish a failing compiled-C experiment. It identifies a generator-level hazard for the documented paste-into-C/KLEE workflow.

## Decision relevance

The polynomial component is valid under its public coefficient rule. The intended cyclic component is valid for the odd counts used by the committed SMT configurations. These facts strengthen the scope of the direct inverse against valid unsigned chains.

The wider public artifact has parameter-admission defects in other generator surfaces. Nine committed simplifier expressions are non-permutations because of zero xor-shifts, including three constant-zero expressions. The KLEE/simplifier rotation generator can also emit a width-64 C shift when it chooses rotation distance zero.

For obfs, the construction remains an encoding family that needs strict parameter validation. These findings do not improve attacker resistance and do not change the previously measured BigInt runtime veto.

## Reproduction summary

Local Node 22 validation on 18 November 2026:

- polynomial exhaustive families: 99,328
- polynomial criterion mismatches: 0
- 64-bit polynomial inverse recoveries: 192/192
- xor-shift rank checks: 512, criterion mismatches: 0
- cyclic-XOR rank checks: 512, criterion mismatches: 0
- focused node:test regressions: 3/3 pass

External artifact scan pin: author revision 6bd6f55f30529f39c910d9f37f04296d932c764d and CSV blob 90a6f692160bb1fcc463f8510832e50ef67542b4.
