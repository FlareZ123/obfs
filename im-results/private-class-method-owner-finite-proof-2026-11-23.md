# Bounded private class-method owner proof: matched red/green and full admission boundary

**23 November 2026. Intermediate research, not a release-grade result.**

## Research question

Can a compiler safely recover private own-field property rewriting inside a
local JavaScript class method, while preserving the method's original source
when a class, instance, prototype, or method can escape? The current mainline
AST ownership analysis otherwise refuses methods as callable-source observers.
A distinct baseline
`test/private-class-source-yield.test.js` had two genuine numeric-only
private cases, COO and SNO, which produced **zero** renamed fields despite
neither the class nor its instance being exported.

The experiment changes **only a bounded proof path** in
`src/properties.js`. It does not add a virtual machine, new executable
loader, host identity restriction, private server capability, or any claim
about reconstruction cost.

## Exact proof domain

The experimental `proveLocalObject` candidate reads the existing indexed
AST `identifierUses`, `parents`, and lexical `bindings` inventory. It
marks a class method's function node as private only if all conditions
below hold:

1. A top-level `ClassDeclaration` has a uniquely bound identifier, no
   superclass, and **exactly one** ordinary nonstatic, noncomputed method.
2. The method has **zero parameters**, is neither async nor a generator,
   and has exactly one `ReturnStatement` whose entire result is a
   statically spelled `owner.knownKey` member access. The base identifier
   must be the lexical owner under proof.
3. Every reference to the class identifier apart from its declaration is
   a zero-argument `new ClassName()` expression, directly initializing
   a top-level immutable, uniquely bound `const instance`.
4. Every use of each such instance identifier apart from declaration is
   precisely `instance.method()` with zero arguments, ordinary static
   property access, and no optional chaining.
5. The standard local-owner proof still requires a fresh plain object with
   known uniquely spelled inert own values, guards all owner aliases,
   assignment, reflection, unknown calls, function escapes, dynamic scope,
   source-spelled error operands, and unsafe keys. It generates edits only
   after all those tests pass.

The new class search is scoped to classes in the proven owner's identifier
ancestor index. It avoids walking every class declaration for each unrelated
owner. Any unsupported method shape or class/instance reference declines
the proof entirely. In particular, the method grammar has no external host
callback or arbitrary ambient getter, unlike the broader direct-call-only
identifier proof falsified by Agent 38's hosted sloppy callback and V8
stack-function source extraction.

This is a **syntactic finite admission claim**. A full proof against
arbitrary instrumented hosts, implicit stack observers, time-dependent
mutation, and unsupplied JavaScript source consumers remains absent.
`closedWorld` does not conceal distributed ESM source from an adversary.

## Matched baseline intervention and focused outcomes

| Source and receipt | Target | Ubuntu | Windows |
|---|---|---|---|
| Baseline `ed61de0de3da42db02e1cf20b6251eaddac74cab`, [run 45134739512](https://github.com/FlareZ123/obfs/actions/runs/45134739512) | Existing two `private-class-source-yield` cases | 0 pass, **2 fail** | 0 pass, **2 fail** |
| Experimental `f9e760a5257d03862c3cc2dd9ccdbce3fc83dc3e`, [run 45132248783](https://github.com/FlareZ123/obfs/actions/runs/45132248783) | Same existing two cases | **2 pass** | **2 pass** |
| Experimental `0d214d01c93e4210a275bfba3b0a4cd0c67b34c9`, [run 45132366078](https://github.com/FlareZ123/obfs/actions/runs/45132366078) | New three-mode positive/refusal matrix | **42 pass** | **42 pass** |
| Experimental `011d7a95676d90b930e1146b03ad3f7aacf4b3be`, [run 45133112450](https://github.com/FlareZ123/obfs/actions/runs/45133112450) | Expanded matrix with native two-file ESM execution | **45 pass** | **45 pass** |

The first two receipts are from the same underlying baseline except for
the compiler's class-method proof patch. This is a source-matched **finite
causal positive-yield recovery**. The expanded tests assert nonzero actual
owner-field transformation and preserved executable numeric outputs in COO,
SNO, and SCO, including a genuine Node ESM import. The 12 refusal shapes
per mode include exported classes, exported instances, method reference
escapes, prototype and instance source reflection, extra methods, inheritance,
computed methods, getters, owner return, optional calls and intermediate
aliases.

The initial ESM version used `String(importedValue)`; its [red
45132717883](https://github.com/FlareZ123/obfs/actions/runs/45132717883)
recorded zero positive yield across modes because the imported value was
passed to an opaque source-coercing host API. The narrowed ESM sample
preserves an executable numeric status oracle with
`process.exitCode=value===13?0:1`, and explicitly declares
`closedWorld:true`. This **does not establish** that arbitrary import
clients or source coercion are safe to rename through.

The later `836b3bd243251196198cc722ef8aa563c2e3f052` branch revision
adds three genuinely isolated Node CommonJS `require()` executions to the
positive-control matrix. These are included in the complete run below.
Its precise branch path is
[`agent46/private-class-method-proof-20261123`](https://github.com/FlareZ123/obfs/tree/agent46/private-class-method-proof-20261123);
the candidate has **no merged mainline compiler patch**.

## Comprehensive candidate gate remains red

The exact [unfocused full run
45134232235](https://github.com/FlareZ123/obfs/actions/runs/45134232235)
at `836b3bd243251196198cc722ef8aa563c2e3f052` completed **failure**
on both Node 22.23.4 runners:

| Runner | Tests | Pass | Fail | Skipped |
|---|---:|---:|---:|---:|
| Ubuntu | 5,155 | 5,133 | **19** | 3 |
| Windows | 5,155 | 5,126 | **19** | 10 |

The same named 19 Node failures occurred on both OS. **Neither** of the two
original `private-class-source-yield` cases appears among them; all
three newly added real-CommonJS candidate tests also ran without a recorded
failure. A separate 16-case group largely reproduces earlier positive-yield
shortfalls (Blob/bound host-source, ESM reader/factory, public Symbol,
tuple and hotpath). **Three additional SCO tests** fail in this frozen
candidate: the standalone multi-file per-request reconstruction test
process exits 1, and two selected-private-import expression-escape tests
were missing the required rejection. The observed SCO cases require
independent source-paired investigation; this branch's base and the earlier
18-failure frozen-main source differ. Neither the existence nor the
cause of those SCO failures can be attributed to the class proof from
these receipts alone.

The only failed workflow **step** on either runner was the full behavioral
suite. Project and supplementary strict JSDoc checks, performance/profile
workflow steps, and the Ubuntu Chromium integration steps passed. These
passes do not establish all-program source parity or ≤2.5× sustained runtime
for the project.

## Separate mainline test-shape correction

At the exact frozen mainline source
`44fc7ccd7224b252c4e3cce74566db19e4fec788`,
`test/property-hotpath-closedworld.test.js` expected three measurements,
but `sims/property-hotpath-closedworld.js` deliberately enumerated only
`['wrapped']`. The direct/readers/identity workload shapes had been
excluded because they place private field spelling into exported callable
source. [Mainline commit
d60bc008](https://github.com/FlareZ123/obfs/commit/d60bc008cbc7cd0cc76373b05e90acb5c507247f)
aligned the count to **one** and asserted the exact `wrapped` style,
retaining independent positive rename yield, six result probes, and
finite timing checks. The [exact-source two-OS focused check
45135104339](https://github.com/FlareZ123/obfs/actions/runs/45135104339)
passed. This is a fixture synchronization repair, with no compiler
change and no independent security claim. The private-class full run
predates that mainline test change and therefore still includes the
obsolete one-versus-three hotpath failure.

## Decision

**Keep the class proof isolated for independent adversarial review.**
The matched proof-specific red/green plus ESM/CJS native execution is a
useful candidate coverage improvement, but its full integration gate is
red and host/source-observation risks remain incompletely established.
Maintain a strict distinction between private numeric scalar outputs
and exported or externally introspectable callable source. Under the
declared attacker's full runtime inspection ability, every shipped
JavaScript method remains available to adversarial instrumentation; the
finite proof does not change that.

Prioritize focused owner and host-observer falsifiers over broad
class-method admission. Source confidentiality, anti-LLM claims,
SCO online oracle resistance, SNO attacker-with-memory resistance and
2.5× compute compliance remain independently unproved or blocked by
existing negative evidence in [results/README.md](../results/README.md).
