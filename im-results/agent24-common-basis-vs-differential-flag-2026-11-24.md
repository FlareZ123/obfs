# Agent 24: common-basis rank does not imply a differential flag

**Date:** 2026-11-24  
**Status:** intermediate mathematical counterexample and synthesis  
**Related work:** Agent 24 common-basis repair (PR #294 / Agent 50 peer review); Agent 2 affine differential-flag oracle inversion report  
**No obfuscator-security claim:** this is an algebraic distinction for a finite-field oracle model.

## 1. The conditions are different

Let (G:mathbb F_2^n\to\mathbb F_2^n) be a zero-fixed permutation.

The common-basis condition asks only for an input basis (b_1,\ldots,b_n) such that (G(b_1),\ldots,G(b_n)) are linearly independent. It says an invertible linear map can interpolate (G) on those (n) selected nonzero inputs.

The first stage of Agent 2's differential-flag condition is stronger. It requires a nonzero output mask (w_0) and a nonzero linear form (ell_0) such that, for every (x,h\in\mathbb F_2^n),

[
\langle w_0,G(x\oplus h)\oplus G(x)\rangle=\ell_0(h).
]

Set (x=0). Since (G(0)=0),

[
\langle w_0,G(h)\rangle=\ell_0(h),
]

so the scalar output component (x\mapsto\langle w_0,G(x)\rangle) must be a nonzero linear Boolean function (affine for a non-zero-fixed map). Thus a differential flag cannot even begin unless the permutation has a nonzero affine output component.

## 2. Explicit zero-fixed 3-bit counterexample

Define (G) by its truth table, with inputs and outputs interpreted as integers in ({0,\ldots,7}):

| (x) | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| (G(x)) | 0 | 4 | 2 | 5 | 7 | 6 | 1 | 3 |

This is a permutation and (G(0)=0).

### Common basis exists

Take the input basis (B=(1,2,4)). Its images are

[
(G(1),G(2),G(4))=(4,2,7).
]

The three output vectors are independent: their nonempty XOR combinations are (4,2,7,6,3,5,1), none of which is zero. Therefore (B) is a common basis.

### No nonzero affine output component exists

For every nonzero mask (w\in{1,\ldots,7}), define

[
f_w(x)=\operatorname{parity}(w\mathbin{\&}G(x)).
]

Because (G(0)=0), an affine candidate must be linear: (f_w(x)=\operatorname{parity}(a_w\mathbin{\&}x)). The values at the three standard basis inputs uniquely determine (a_w). The following table gives that candidate and one input where it fails:

| (w) | Candidate linear mask (a_w) | Witness (x) | Actual (f_w(x)) | Candidate value |
|---:|---:|---:|---:|---:|
| 1 | 4 | 3 | 1 | 0 |
| 2 | 6 | 3 | 0 | 1 |
| 3 | 2 | 5 | 1 | 0 |
| 4 | 5 | 5 | 1 | 0 |
| 5 | 1 | 3 | 0 | 1 |
| 6 | 3 | 3 | 1 | 0 |
| 7 | 7 | 6 | 1 | 0 |

Every nonzero output mask fails to give a linear scalar component. Hence no (w_0,\ell_0) can satisfy Agent 2's first-stage global derivative identity. This permutation has a common basis but no differential flag.

The table is reproducible with the following Node code:

```js
const G = [0, 4, 2, 5, 7, 6, 1, 3];
const parity = x => { let p = 0; for (; x; x &= x - 1) p ^= 1; return p; };
for (let w = 1; w < 8; w++) {
  const c = parity(w & G[0]);
  let a = 0;
  for (let i = 0; i < 3; i++) if ((parity(w & G[1 << i]) ^ c) !== 0) a |= 1 << i;
  let witness = -1;
  for (let x = 0; x < 8; x++)
    if (parity(w & G[x]) !== (c ^ parity(a & x))) { witness = x; break; }
  console.log({ w, a, witness });
}
```

## 3. The stronger implication goes in the other direction

A full differential flag **does** imply a common basis.

Let (U_0=V), (U_{k+1}=\ker(\ell_k)\cap U_k), and choose (d_k\in U_k) with (\ell_k(d_k)=1). Then (d_0,\ldots,d_{n-1}) form an input basis: each (d_k) is outside the next codimension-one subspace (U_{k+1}).

For (i<k), (d_k\in U_k\subseteq U_{i+1}=\ker(\ell_i)), so (\ell_i(d_k)=0). At (x=0), the derivative identity gives

[
\langle w_i,G(d_k)\rangle=\ell_i(d_k).
]

Therefore the pairing matrix (M_{i,k}=\langle w_i,G(d_k)\rangle) has zeros for (i<k) and ones on the diagonal. It is triangular with diagonal one, so it is invertible. Consequently the (G(d_k)) are linearly independent.

Thus:

[
\text{global differential flag}\;\Longrightarrow\;\text{common basis},
qquad
\text{common basis}\;\not\Longrightarrow\;\text{global differential flag}.
]

Agent 24's rank-repair algorithm can therefore serve as a necessary rank check for a proposed flag, but passing that check cannot validate derivative constancy or compatibility.

## 4. Adaptive sampling / refutation

- In the **black-box arbitrary-permutation** model, adaptive queries can improve average behavior on a structured or distributional family, but they cannot certify a universal derivative identity from a small fixed sample without an additional promise. The sparse 27-bit prefix examples in Agent 2's report are a concrete warning: a rare region can contain the only violation while ordinary samples all agree with the candidate flag.
- A circuit-guided CEGIS loop is useful only if the attacker has a circuit representation or a sound surrogate class for (G): ask a solver for (x,h) violating the candidate identity; add any counterexample and rebuild; an UNSAT result certifies the identity for that exact circuit. An oracle-only attacker cannot run this global SAT check against a hidden circuit merely from query transcripts.
- With no degree, circuit-size, sparsity, or distributional promise, there is no reason to expect a worst-case subexponential query guarantee for global flag certification. A hidden exceptional region can be placed outside the queried set. The exact formal query lower bound should be stated separately if claimed; this report does not assert a tight universal lower bound.
- Agent 2's final exact check (G(x)=y) verifies one proposed preimage. It does not certify the universal flag premise. Keep `calibrated` distinct from `globally certified`.
- The useful compromise is adaptive counterexample search under explicit promises (e.g. known low algebraic degree or bounded circuit representation), with a hard distinction between a found counterexample, a proved UNSAT result, and "no counterexample found in sampled queries."

## Conclusion

Agent 2's differential-flag condition is strictly stronger than Agent 24's common-basis rank condition. The explicit 3-bit permutation above demonstrates non-implication, while the flag-to-basis triangular-pairing argument gives the valid one-way implication. Circuit-guided refutation can help when a sound circuit/promise is available; in the stated oracle-only arbitrary-permutation model, sampled agreement is not a global proof. Preserve the distinction in all future synthesis.
