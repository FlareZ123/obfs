# Runtime extraction defeats a public dense linear sandwich around a Rivest polynomial

**Date:** 18 November 2026. **Agent:** 2. **Classification:** intermediate adversarial result for a concrete JavaScript implementation. This closes the two-sided black-box gap only when the public artifact exposes an interceptable polynomial intrinsic or an equivalent instrumentation point.

## Candidate

The synthetic public artifact computes

```text
F(x) = L_out(P(L_in(x)))
predicate(x) = F(x) === F(c)
```

where both `L_in` and `L_out` are independent dense invertible 32x32 GF(2) maps and `P` is a randomized degree-7 Rivest-family permutation polynomial.

The emitted JavaScript implements both dense linear maps with ordinary bitwise operations and the polynomial with exact `Math.imul` Horner steps. The polynomial call style varies among direct `Math.imul`, a local alias, and destructuring from `Math`.

The attacker receives only the public JavaScript source.

## Attack

The attacker uses the COO/SNO full-control runtime assumptions rather than treating the artifact as a sealed black box.

First, it patches only the final public equality so the predicate returns the composed uint32 value instead of a Boolean. The published equality target is read from that same expression.

Before evaluating the modified module, the attacker supplies an instrumented `Math` object whose `imul` records its second argument. This interception occurs before the module captures any direct, aliased, or destructured `imul` reference.

Every Horner multiply uses the same second argument: `L_in(x)`. One execution therefore reveals the hidden polynomial input for the chosen public input `x`.

The attacker evaluates zero and the 32 public basis vectors. Those observations recover the entire unknown `L_in` matrix as image columns. Gaussian elimination gives `L_in^-1`.

The remaining map can then be queried as

```text
G(z) = F(L_in^-1(z)) = L_out(P(z)).
```

This is exactly the independently validated one-sided compatible-permutation theorem. Its transformed congruence subspaces recover the hidden polynomial input corresponding to the published target. Applying `L_in^-1` yields the original secret `c`.

The attack never parses either dense matrix and never reads the polynomial coefficients or generator seed.

## Reproducible evidence

Implementation: `sims/sandwich-imul-runtime-extraction.js`, commit `d1187cff1e6918c0fe27f97b41637bb6f7aeaa0c`.

Local runtime: Node `v22.16.0`.

One deterministic run exercised **192** randomized candidates across the three `imul` reference styles:

- **192/192 exact secret recoveries**;
- **73-88** distinct composed-map evaluations per sample, median **80**;
- median local attack time **0.628 ms**;
- generated public artifact size **2,227-2,299 bytes**;
- **15,346** total distinct composed-map evaluations across the matrix.

The final recovered input is verified against the published target through the instrumented artifact.

## Threat-model implication

The unrestricted sandwich remained open as a *sealed black-box theorem*. That distinction does not protect this concrete COO/SNO JavaScript implementation. The stated threat models give the attacker the distributed files, arbitrary runtime instrumentation, and code modification. An interceptable arithmetic boundary exposes the inner coordinate system and reduces the construction to the already-broken one-sided case.

Caching `Math.imul` in a local variable does not help when the attacker controls the runtime before module initialization. The tested local alias and destructuring variants were both intercepted.

## Scope

This result is implementation-specific. It does not prove that every JavaScript realization of `L_out(P(L_in(x)))` exposes the same hook. A candidate could replace `Math.imul` with another arithmetic implementation, inline or virtualize the polynomial, move it into WebAssembly, or otherwise remove this exact interception point.

Those changes move the burden to a new artifact-level experiment. Under COO/SNO, source rewriting, debugging, loader hooks, WebAssembly inspection, and memory instrumentation remain available to the attacker, so hiding this one intrinsic is not itself evidence of strong protection.

The full Wang et al. construction remains unavailable in this investigation and is not claimed to match this synthetic candidate.
