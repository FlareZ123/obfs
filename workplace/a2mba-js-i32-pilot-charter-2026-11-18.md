# Portable i32 A²-MBA context-trap pilot charter

**Agent:** Agent 38  
**Date:** 18 November 2026  
**Status:** preregistration before implementation or measurement.

## Candidate source and scope

The research question is whether the architecture-independent arithmetic part of the 2026 A²-MBA line has a useful JavaScript Int32 operating point under this repository's strict 2.5x compute ceiling.

The public paper is *Unifying Mixed Boolean-Arithmetic Obfuscation by Architectural and Anti-Generalization Hardening*, Computers & Security 167 (2026), article 104866, DOI 10.1016/j.cose.2026.104866.

For executable formulas, this pilot pins the independent third-party LLVM 21 implementation `xqzme69/A2MBA-LLVM` at commit `f22cafe972989f868b2898ac4839df27fb74fc61`. Its `docs/PAPER_MAPPING.md` maps `applyContextTrap()` to the paper's context-trap and fallacious-generalization equations. Its `docs/PAPER_DEVIATIONS.md` states that the later nonlinear modular envelope is project-specific and was absent from the described authors' prototype.

The x86 flag-dependent AAMBA primitives are outside this pilot because ordinary browser/Node JavaScript has no direct carry/status-flag execution primitive. The self-contained fixed-width Context Trap is the portable lane.

## Arms

All arithmetic is signed JavaScript Int32 with explicit wraparound. Multiplication uses `Math.imul`.

1. **Native:** a small signed-Int32 arithmetic operation.
2. **Context trap:** compute the native operation, pass the result through one of the six self-contained Context Trap reconstruction variants from the pinned implementation, and return the reconstructed Int32.
3. **Context trap plus nonlinear envelope:** apply the same reconstruction, derive an input-dependent odd key, compute its modular inverse at runtime with the pinned implementation's Newton-style circuit, and multiply through key/inverse.

The third arm tests a stronger contemporary implementation shape. It is not attributed to the paper authors.

## Correctness gate

Before timing, require exact signed-Int32 equality for all six reconstruction variants across deterministic edge cases and at least 100,000 generated input pairs. Require `Math.imul(key,inverse) === 1` for every tested nonlinear-envelope key. Any mismatch rejects that arm.

## Performance gate

Run nine alternating native/candidate hot-loop pairs per candidate on Node 22 Ubuntu and Windows. Every arm executes the same stateful loop and checksum so work cannot be discarded.

Report every paired candidate/native CPU-time ratio. Under the repository's release rule, **any observed strict ratio above 2.5x is a veto for that tested hot workload**, regardless of median.

The first pass is intentionally a hot repeated-use test. It does not establish cold-start or browser admission.

## Security stopline

No resilience claim follows from opaque-looking arithmetic. If an arm passes the runtime gate, the next step must freeze the emitted/public expression and challenge it with a source-aware normalizer plus an ordinary-minified equal-trust control before any compiler integration.

If the nonlinear-envelope arm violates 2.5x, do not spend time scaling it into the compiler. If Context Trap alone passes, retain it only as a candidate for a later comparative attacker test. A deceptive result from one external simplifier is insufficient.

## Evidence classification

All observations belong in `im-results/` or `workplace/`. The experiment cannot establish source secrecy, tamper resistance, environment authorization, or a universal performance bound.
