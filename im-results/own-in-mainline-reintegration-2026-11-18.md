# Reintegration of proven private own-key membership on current compiler

**Agent 1, 18 November 2026 UTC. Intermediate compiler semantics and
coverage evidence, not an obfuscation secrecy claim.**

## Integration target and provenance

The prior proof and original red/green evidence are on [draft PR #59](https://github.com/FlareZ123/obfs/pull/59), while an independent
16-case adversarial challenge was added on [review PR #71](https://github.com/FlareZ123/obfs/pull/71). Both were produced on an older
compiler snapshot and could not merge cleanly onto moving `main`. This
reintegrated branch was created from the then-current mainline on
18 November 2026, then applied only the proof and editing changes to
`src/properties.js`, `src/cross-properties.js`, and
`src/symbol-properties.js`. It copies the original differential tests,
Chromium integration, hot-path profile and source-only reconstruction attacker,
plus the separate Agent 2 adversarial suite.

## Claim and conservative admission

The emitted property name and the literal left operand of
`"secret" in owner` are changed together only if the compiler proves that
`secret` was an initial own key of a private ordinary object, and every
relevant receiver use has a consistent rewrite. The existing ownership
proof refuses unproved aliases/escapes, reflection, mutation that would
expose a prototype key, arbitrary left-hand expressions, unknown or inherited
keys, hostile-shaped external callees, and source observation. The in-operator
is preserved at its original location, retaining JavaScript operand order,
TDZ behavior, and native boolean computation. The experimental Symbol-key
backend instead substitutes the exact private Symbol identity on both
the field and membership expression.

This is a bounded syntactic ownership proof. The compiler may decline
otherwise-safe programs. It makes no general guarantee against dynamic
code generation, attacker-modified runtimes, or arbitrary reflection.

## Independent verification on a newer compiler snapshot

The [manually dispatched two-platform gate 44209883613](https://github.com/FlareZ123/obfs/actions/runs/44209883613)
**passed** at exact executable SHA
`feb430d24c478f4a79e25d101e8db12e3fdf0b5c`:

- Ubuntu Node.js 22: own-key differential tests and Agent 2's independent
  adversarial suite, existing Symbol baseline, hot-loop profile,
  published-source-only recovery check, native Chromium ESM integration,
  strict primary and external JSDoc all passed.
- Windows Node.js 22: the same Node behavior, attacker, profile and
  strict JSDoc checks passed; Chromium steps were OS-gated to Ubuntu.

This demonstrates finite tested semantics for the reintegrated implementation.
The source-only attack explicitly reconstructs the renamed key and reproduces
the selected outputs. The prior branch's measured hot-loop
~0.990–1.030× ratios do not transfer as a new pinned numeric claim to this
source without fresh raw timing review; the current gate merely asserts its
profile's declared bounded behavior. Neither result establishes universal
2.5× compliance, hostile-runtime resistance or secrecy.

## Release decision and next checks

Retain this work in the semantics/reliability lane. Before claiming mainline
integration, reconcile competing source changes once, run a single complete
immutable-head cross-platform and real-browser suite, and confirm that
unrelated positive private-property rewrite controls still actually transform.
Do not conflate this tested coverage increase with the existing cross-mode
`RELEASE-BLOCKED` security verdict.
