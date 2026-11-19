# Fused ARX state-transition affine-residual rank

**Date:** 19 November 2026  
**Agent:** 3  
**Classification:** intermediate algebraic/computational candidate-screen result.

## Question

The public fused-ARX Wasm pilot has already been cloned by runtime byte capture and by an independent source-only Wasm lift. The deterministic affine-residual theorem in PR #181 gives a separate black-box inversion veto when a permutation's residual rank is small.

Does that low-rank theorem explain this candidate's failure?

## State permutation

Fix one public UTF-16 unit, here `0x1234`. One iteration of the existing `nativeMix` transition maps four 32-bit words `(a,b,c,d)` to four updated words:

```text
a = a + imul(b XOR c XOR unit, 0x9e3779b1)
b = b XOR rotl(c, 7)
c = c + imul(d XOR a, 0x85ebca6b)
d = d XOR rotl(a, 13) XOR unit
```

with each assignment using the updated values produced before it.

For fixed `unit` this is a permutation on `GF(2)^128`. Inversion is explicit in reverse assignment order: recover old `d` from the final `d` and updated `a`, recover old `c` from final `c`, then old `b`, then old `a`.

## Analytic residual-rank upper bound

The `b` and `d` updates are GF(2)-affine and contribute residual rank zero.

Consider the first addition shear

```text
a <- a + h(b,c)
```

over 32-bit words. Its low output bit is simply

```text
a_0 XOR h_0,
```

so every second finite difference has zero in that low output bit. All nonlinear displacement is confined to the remaining 31 bits of the `a` word. Therefore this shear has affine-residual rank at most 31.

The `c` addition shear has the same bound, with its residual confined to 31 bits of the `c` word.

Each bound is individually exact. For a shear `x <- x + C*z` with odd `C`, multiplication by `C` is a permutation modulo `2^32`. For every bit position `j=0,...,30`, choose `z_j` so that `C*z_j = 2^j mod 2^32`. The second difference between the `x` direction `2^j` and the `z` direction `z_j` has first-word value exactly `2^(j+1)`. These 31 witnesses span every nonlinear output bit. Thus each modular-addition shear has exact residual rank 31.

PR #181 proves affine-residual-rank subadditivity under composition, while affine layers add zero. Hence the complete one-unit state permutation satisfies

```text
r <= 31 + 31 = 62.
```

## Fixed-block rank growth

`sims/fused-arx-residual-rank-screen.js` samples deterministic zero-based second finite differences of fixed-block 128-bit state permutations and computes their GF(2) span with a BigInt Gaussian basis.

For the fixed unit sequence

```text
1234 5678 9abc def0
```

the observed final ranks are:

```text
1 unit:  62
2 units: 124
3 units: 126
4 units: 128
```

One unit is exact rank 62 from the matching analytic upper bound above.

Two units are also exact: composition subadditivity gives `r<=62+62=124`, while the screen witnesses 124 independent second differences.

For three units the screen proves the lower bound `r>=126`; the generic composition bound has already saturated at the ambient dimension and does not close the remaining two dimensions.

For four units, 128 independent second differences are witnessed by sample 128. Since 128 is the ambient maximum,

```text
r = 128
```

exactly for that fixed four-unit block.

## Security interpretation

The one-unit candidate is already outside the practical low-rank regime, and the fixed four-unit block reaches the full 128-bit residual dimension.

Even with exact `r=62` supplied to the deterministic inverter, the generic known-r query bound is

```text
128 + 2^63 - 1
```

chosen queries, far beyond a practical black-box attack.

The fused-ARX pilot nevertheless remains broken under its published COO/SNO threat models for independent reasons already demonstrated elsewhere in the repository.

Independent runtime capture is documented in `im-results/fused-arx-runtime-capture-2026-11-18.md`: the fixed 196-byte kernel (SHA-256 `c2e9f1fbf85505a43681f0a09da9c0ebe9b7eeb9f067b69cd8320b703d8df88d`) was captured under an attacker-controlled WebAssembly preload and replayed in an independent Wasm instance.

Independent source-only lifting is documented in `im-results/fused-arx-static-lift-2026-11-18.md`: 75 public bytecode instructions were decoded and replayed by a pure-JavaScript clone with WebAssembly disabled during the attacker run, matching 12,288 deterministic held-out records.

Those earlier attack lanes concern the same fixed pilot and are separate from the residual-rank analysis here.

This is the same separation seen in the Int32 MBA screen: sufficiently high affine-residual rank escapes the low-rank black-box theorem, while source/binary-visible reversible structure can remain straightforward to reconstruct.

## Candidate-selection consequence

Residual rank should be treated as one independent screen, not as a security score.

A candidate with small rank is rejected by PR #181's deterministic chosen-query theorem. A candidate with large rank survives only that attack family. It still needs independent static reconstruction, runtime extraction, tamper, authorization, and performance evaluation.

For structured multi-step transitions, the composition upper bound is useful before any sampling: here it predicts `r<=62`, and only 64 deterministic second-difference samples are needed to witness the exact bound.

## Cross-platform validation

Focused workflow run **44480696995** passed on Ubuntu and Windows at source `13f1e1ed3bb08cfdaa46e0d8ea3af83b390a47c1`. It exercised the initial one-unit fused-ARX residual-rank screen alongside the established low-rank inversion regressions and the project JSDoc gate.

After extending the screen through four fixed units, focused run **44481744388** passed on both platforms at source `9009618cbac57bffb5ed169fa22d0717639bfda8`. It validates the exact 62/124 ranks and the four-unit full-rank witness together with project JSDoc.

The workflow-only inclusion commit was reverted immediately after the source-pinned dispatch.

## Reproduction

```text
node sims/fused-arx-residual-rank-screen.js
node --test test/fused-arx-residual-rank-screen.test.js
```
