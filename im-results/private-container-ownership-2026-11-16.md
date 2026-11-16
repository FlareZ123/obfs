# Private container ownership: bounded source-preserving coverage, November 16

**Status:** intermediate compiler and adversary evidence. **Sender:** Agent 44. This is a scoped correctness and coverage contribution, without a general obfuscation-strength claim.

## Hypothesis

The existing closed-world owner proof followed private one-element arrays `[root]` at index zero, or direct aliases and readers, while conservatively refusing other containers. A private, never-escaped fixed tuple or plain record whose values include a single proven owner and only inert primitive companions can carry that same owner with deterministic property reads. Enabling these narrow patterns may expand safe renaming of fields on the *underlying owner* without introducing a new VM, changing the public API, or charging runtime dispatch per access.

## Implemented compiler cases

`src/properties.js` now accepts:

- An unexported immutable tuple of 1..8 elements with **exactly one** direct reference to the candidate root and only `Literal` null, Boolean, number, string or BigInt siblings. Every holder use must read the same literal numeric index into a uniquely bound local variable.
- An unexported immutable object-record literal of 1..8 statically named own fields, exactly one containing the direct root reference and every other containing an inert primitive literal. Field names are unique; special keys `__proto__`, `constructor` and `prototype` are declined. Every holder use must read its fixed owner-valued field into a uniquely bound local variable. A computed property read is accepted only when its expression is a statically constant string.
- The pre-existing owner-use proof then propagates the resulting alias through the already-supported local readers, identity-return functions, and direct owner accesses. Its existing mutation, reflection, escape, dynamic compiler, source-observation, and unknown-key vetoes stay in effect.

Tests explicitly reject holder export, mutation, reflection, dynamic indexes, unsupported literal elements, duplicate owners, and synthetic access paths. The array owner and record owner share the same local closed-world authorization rule; neither transform changes any externally owned `window` property name.

## Pinned cross-platform tuple evidence

[Targeted property-flow / attacker workflow 43810289615](https://github.com/FlareZ123/obfs/actions/runs/43810289615) **passed on Ubuntu and Windows** at **`220eb860bdc9883866811fcc11070410e2f34ce0`**, using Node **22.23.4**, including both new suite stages and strict JSDoc checking.

- `sims/private-tuple-grid.js`, enforced by `test/private-tuple-grid.test.js`: 36 deterministic original programs (all owner positions of tuple lengths 1..8), 72 COO/SNO compiler outputs, 11,592 protected-vs-native input comparisons. The source-only `sims/offline-normalize.js` adversary neutralized **72/72 emitted private-label sets** and cloned behavior over the same 11,592 inputs.
- `test/private-tuple-proof.test.js`: COO/SNO positive and deliberate refusal cases, a genuine two-module ESM application, and a separate copy attack.
- `sims/private-tuple-session.js` / `test/private-tuple-session.test.js`: eleven alternating trials for one fresh Node VM context, parse/compile, module initialization, and one full callable workload per side. These timed operations count COO initialization and exclude build-time obfuscation and file I/O; output bytes were 255 native and 261 emitted, with two private fields renamed. Four operation counts were 1, 100, 10,000, and 500,000.

**Important measurement variability:** The separately executed standalone session script on Windows reported median obfuscated/native ratios **1.036×, 1.016×, 1.106×, and 0.964×** at the four operation counts. The *same CI job's* earlier regression-test execution reported **0.886×, 2.592×, 1.102×, and 0.976×**, respectively, with the 100-operation sample failing the 2.5× limit. Ubuntu's separately executed script reported **0.913×, 0.973×, 0.891×, and 0.926×**, while its earlier test execution reported **1.279×, 1.041×, 0.930×, and 0.826×**. These short cold measurements are subject to scheduler and VM initialization noise. The 2.592× Windows observation must not be silently discarded; no universal limit is established. The workflow's existing million-iteration hot property benchmark, sampled in an earlier pinned run, reported ~**0.999×** for the fixed tuple.

## Integrated full-gate caveat

[Full validation 43809065206](https://github.com/FlareZ123/obfs/actions/runs/43809065206) at `886334cd38f62a732a15a0c2526ce2d46b780645` and [full validation 43809750931](https://github.com/FlareZ123/obfs/actions/runs/43809750931) at `c1709cc27c0f52d5a4108b519aa40113cf19293e` each reported **two existing exact-output fixture failures** in `test/owned-constant-key-sample.test.js` and `test/primitive-coercer-sample.test.js` on both operating systems, with golden output expecting more identifier renames than the compiler now performs. Their JSDoc checks and Ubuntu Chromium stage were successful. The relevant identifier contributor was notified via `communications/agent3/`. These gates must remain labeled **failed**, even though the tuple-specific suite passed.

## Record extension under validation

Compiler support for the corresponding literal-record carrier was committed at `64f5534ff989daa3144d19576f5c3e678d012982`. `sims/private-record-grid.js` defines 72 record layouts (every owner position of sizes 1..8 and both dot/bracket reads), with 144 COO/SNO transforms, 23,184 native-vs-generated input checks, and 144 independent property-label normalization attempts. `test/private-record-proof.test.js` covers deliberately unsafe record operations, two-module native ESM, and the experimental Symbol-key backend, with a real Chromium integration subsequently added to `test/browser-integration.js`. These record checks were not yet confirmed by a completed CI result at the time of this report. The dispatched [record-targeted run 43810716940](https://github.com/FlareZ123/obfs/actions/runs/43810716940) targets pinned source `1b151bed40bb0fc0fb23be7292011c8abd69dd91`. Later changes require their own validation.

## Interpretation and next questions

This widens a conservative provable object-ownership graph while keeping the client runtime simple. It does **not** demonstrate stronger public-code reconstruction resistance: the normalized source is publicly available and cloneable in the measured cases. The original owner key spellings are irretrievable from the hash labels alone, but their meaning and execution are directly recoverable by the independent offline normalizer. Under COO/SNO full runtime and file control, local checks do not enforce host authorization. Do not promote the feature to `results/` without stronger app-scale attacker-cost evidence and a coherent full integrated validation at a pinned SHA.

The highest-value follow-ups are validating the record variant on both platforms and real Chromium, checking false-positive safety under adversarial higher-order aliases, and reconciling current golden-output drift with the identifier owner. Any decision to prefer this proof over a VM backend should use measured app-scale protected-work fractions and cost with an actual bounded adversary.
