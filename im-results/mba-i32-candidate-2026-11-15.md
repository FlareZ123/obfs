# Seeded mixed Boolean-arithmetic prototype for typed Int32 kernels

**Agent 17, 2026-11-15. Status:** experimental compiler and intermediate observations. This is not an established obfuscation-security result and is not included in the COO/SNO/SCO production pipeline.

## Candidate and reproducible sample

`workplace/mba-i32-lower.js` adds `mixInt32Functions(source,{sourceType,seed,names,maxRewrites})`. It selects explicit top-level function declarations returning one pure bitwise-rooted expression whose leaves are named formal arguments and bounded integer constants. It replaces up to 16 nonoverlapping leaf-level binary operators, selected using deterministic SHA-256 rankings, with seeded mixed Boolean-arithmetic (MBA) identities.

Supported replacements include several variants of addition, subtraction, XOR, AND, and OR over the ring of integers modulo `2^32`. The rewritten program stays ordinary JavaScript and has no interpreter dispatch or new runtime dependencies. The algebraic identities are public and the seed and mask are not secrets.

The checked-in `samples/mba-i32-before.cjs` and `samples/mba-i32-after.cjs` contain a **real generated pair**, using seed `agent17-mba-sample-v1`, function `digest`, and `maxRewrites:2`. A regression regenerates the output and compares the bytes exactly.

**Safety precondition:** every argument to a selected function must be a primitive signed Int32 Number, and the semantic observation must be at a bitwise-rooted result. The AST grammar ensures that repeated formal-parameter reads have no getter/call effects. It cannot prove caller input types or rule out external `Function#toString` observers; such functions require explicit human opt-in. Whole-source direct source observation and dynamic `eval` are declined. Branches, property reads, calls, BigInt inputs, value conversions, floating-point generality, and multi-statement bodies are excluded. A string counterexample is deliberately present: `('1'+'2')|0` yields 12, while an MBA addition may yield 3.

## Local reproducible evaluation

Command: `node --test test/mba-i32-lowering.test.js`. On Node.js v22.16.0 Linux, seven tests passed locally. Eight source expressions across 12 seeds each generated **96 candidate variants** with **134,016 deterministic primitive-Int32 input comparisons** (196 boundary pairs and 1,200 pseudo-random pairs per variant), in addition to named ESM export probes, refusal cases, cross-seed checks, and the pinned sample round-trip. This finite test suite supports the tested behavior, without implying a general JavaScript equivalence theorem.

The performance harness `node sims/mba-i32-profile.js` alternates 15 hot-loop measurements after eight warmups, each timing 300,000 repeated calls on the same original or transformed source. Two local Linux runs measured:

| Rewrites | Run A ratio | Run B ratio | Observed within 2.5×? |
|---:|---:|---:|---|
| 1 | 1.064× | 1.024× | Yes, for this kernel |
| 2 | 1.089× | 1.044× | Yes, for this kernel |

These are illustrative steady-state measurements on the local runtime with separate V8 realms. Compiler time, browser startup, remote invocation latency, and broader workloads were not measured. The result does not establish a universal compute ceiling. Cross-platform GitHub Actions validation must be reported separately with its exact commit.

## Independent threat-dimension assessment

- **Static deobfuscation:** MBA introduces expression diversity and increases Boolean/arithmetic structure. No independent source-only simplifier has yet been defeated. Public identities make deterministic algebraic deobfuscation plausible, and the generated sample is directly readable.
- **Dynamic analysis and runtime extraction:** the entire transformed JavaScript is distributed, so a debugger can trace it and an attacker can execute or copy it. No runtime anti-instrumentation is present.
- **Tampering and integrity:** the generated code has no cryptographic integrity check, and a full-control adversary can replace it.
- **Unauthorized execution:** this expression pass adds no environment authorization. Existing SCO/SNO/COO boundaries remain unchanged.
- **Compatibility/performance:** primitive signed Int32, pure-expression tests pass locally. A real string-coercion counterexample proves that a general opt-in without typed-contract enforcement would be unsound. Only this kernel's local hot ratio was sampled.



## Cross-platform pinned gate

The extended manual VM research workflow [run 43720483855](https://github.com/FlareZ123/obfs/actions/runs/43720483855), pinned to `23444cd280273a6b941e1a349dbe5b23b31d068f`, **passed** on both Ubuntu and Windows Node.js 22. It includes the MBA differential tests, exact before/after sample regeneration after normalizing Git CRLF seed input, strict core JSDoc check, the prior VM comparator, and the paired MBA benchmark. Per-run medians:

| OS | One MBA replacement | Two MBA replacements | Verified scope |
|---|---:|---:|---|
| Ubuntu | 0.9990× | 1.0524× | 300,000-call hot kernel, 15 alternating trials |
| Windows | 0.9992× | 1.0525× | Same selected kernel, warmup and trials |

The fixed source hash is canonicalized for CRLF versus LF for seed selection only; emitted code keeps the source's original line endings. This resolves the earlier Windows generated-sample mismatch seen in full [run 43719732026](https://github.com/FlareZ123/obfs/actions/runs/43719732026). That earlier full run also caught an unrelated external JSDoc nullability failure in `test/sco-real-example.test.js`, reported to Agent 30. It should not be called a passing full-snapshot release.

## A source-only attack that defeats the entire candidate family

`sims/mba-static-normalize.js` is a separate attacker that receives only the emitted JavaScript source. It recognizes fifteen public algebraic identity shapes through Acorn AST unification of two repeated primitive leaves and an optional unknown numeric mask. It neither reads the obfuscator implementation nor needs its seed. The test `test/mba-static-recovery.test.js` uses **225 independently seeded generated versions** of nine input functions and verifies that every one of their **325 replaced operators** is reduced to a native operator, with 250 held-out input comparisons for each candidate, plus a 2,000-input check against the checked-in generated sample. The attacker refused tested getter/call shapes.

On local Linux Node.js 22, three attacker tests passed. This is a **negative static-resistance result**: a straightforward structural normalizer removes all current MBA syntax in a finite tested corpus. It does not recover arbitrary original formatting, solve a semantic equivalence proof, or cover other obfuscation families. Until independently defeated on held-out transformations, MBA must be treated as syntax diversity with favorable tested cost, not a substantive security advance. The attack and the sample stay checked in as future negative controls.

## Decision and next work

Retain as a **research-only candidate** to test whether direct MBA circuits offer a better cost/security frontier than the documented postfix VM, which was much slower on small hot numeric kernels. Prioritize a seed-independent source-only algebraic normalizer and an independent attack-cost measurement. Only consider integrating this into the public CLI with enforceable trusted type proofs, external-observer controls, held-out real-program tests, and Node/Chromium performance under the 2.5× requirement. No security advantage is claimed from seeded public constants alone.

See `im-results/expr-vm-cost-2026-11-15.md` and `im-results/vm-pure-immediate-2026-11-15.md` for earlier experimental VM and static-recovery comparisons.
