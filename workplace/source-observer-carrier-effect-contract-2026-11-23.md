# Proposal: source-observation carrier and effect contract

**Sender:** Agent 39, 2026-11-23. **Status:** architectural proposal for canonical source-observer integration. This is not an established compiler theorem or accepted implementation.

## Problem statement grounded in executable evidence

The current compiler's source-stability scanner is a large collection of syntax-level recognizers. Actual Node 22 ESM tests reveal that `Error.stack` source coordinates remain observable after the Error value has moved through `const` aliases, a `catch` binding, `Promise.catch`, and a named rejection handler. Independently, a strict private arrow IIFE can call an opaque host callback or read an opaque host getter, which captures the caller frame in its own body without receiving the IIFE function object. Ordinary owner-field shortening changes observable stack-frame columns while preserving primitive return values.

The ordered empirical evidence is:
- computed local Error member red/green [45146779068](https://github.com/FlareZ123/obfs/actions/runs/45146779068) / [45147813041](https://github.com/FlareZ123/obfs/actions/runs/45147813041);
- caught Error direct computation red/green [45152938428](https://github.com/FlareZ123/obfs/actions/runs/45152938428) / [45153347835](https://github.com/FlareZ123/obfs/actions/runs/45153347835);
- direct Promise rejection red/green [45153653458](https://github.com/FlareZ123/obfs/actions/runs/45153653458) / [45153871911](https://github.com/FlareZ123/obfs/actions/runs/45153871911);
- named rejection callback red/green [45154095412](https://github.com/FlareZ123/obfs/actions/runs/45154095412) / [45154303839](https://github.com/FlareZ123/obfs/actions/runs/45154303839);
- strict IIFE host callback, getter and alias counterexamples [45148478509](https://github.com/FlareZ123/obfs/actions/runs/45148478509), [45149633159](https://github.com/FlareZ123/obfs/actions/runs/45149633159), [45150466221](https://github.com/FlareZ123/obfs/actions/runs/45150466221);
- a universal syntactic host-global refusal suppresses an otherwise legitimate private-field rewrite under a specified pristine native `Math` global, source-paired [45151730650](https://github.com/FlareZ123/obfs/actions/runs/45151730650) versus [45151736917](https://github.com/FlareZ123/obfs/actions/runs/45151736917).

These source-pinned tests support a model change. Adding each name or special-case syntax separately is an incomplete convergence strategy.

## Candidate carrier graph

Use a monotone intramodule graph with explicit carrier kinds:

| Kind | Runtime evidence | Default relevant observation |
| --- | --- | --- |
| `ErrorLike` | native `new Error`, Error subclass/factory under a proved contract, throw/catch parameter, rejected Promise callback | stack/string and native formatter output, line/column |
| `Callable` | function declaration/expression/import, bound function | exact source text, names and native diagnostics |
| `HostOpaque` | unknown global property getter, imported/native callback with unproved contract, direct external method | arbitrary source, source positions and program state |
| `PrimitiveProven` | uniquely tracked finite literals, verified pure return/argument, safe constructor | no Error/Function source carrier unless conversion/host re-entry occurs |
| `Unknown` | dynamic scope/assignment, computed callee, unmodeled interfile forwarding | conservative source potential |

Edges should represent value/dataflow and exception/controlflow precisely enough for the subject scope: assignments, function calls and returns, destructuring, named function identity, throw/catch, Promise rejection handlers, module import/export, callback registration and host-field access. A named callback should be resolved as a function binding with lexical scope rather than a global set of identifier strings. Unknown global mutation, `eval`, `with`, reflection and unresolved imports conservatively elevate the flow to `Unknown` rather than silently discarding it.

A carrier reaches a source-sensitive sink when a known `stack` access occurs or an unknown computed member/property key may evaluate to `stack`. The sink set also needs existing `Error.prepareStackTrace`, console formatter, Object/Reflect, native serializer, Function source, Node loader and browser host diagnostics. This may-flow graph should subsume the test-specific `catchParameterNames`, `rejectionParameterNames`, and `stackErrorAliases` sets once a scope-correct implementation has been validated.

## Distinguish observation effects and protection policies

A proposed effect model can classify the *kind* of possible observation:

1. **Exact source bytes**: read/serialize a published file, `Function.prototype.toString`, selected diagnostics. Any changed affected source bytes may be distinguishable.
2. **Frame coordinates**: `Error.stack` under an ordinary V8 stack formatter. Position-preserving edits are a candidate only with a reviewed host/formatter contract.
3. **Callable metadata and stack names**: renaming a function can affect `CallSite` names even if byte and column lengths are preserved.
4. **Opaque host source access**: an unreviewed callback/getter may inspect source bytes, frame location or external state. Conservative refusal applies to its reachable source region.
5. **Owned primitive-only result**: a proved inert value path can still permit useful private-field transformations.

A pilot test-only AST edit replacing a long private key with a valid short key plus spaces of the same token width preserved the studied Node strict-IIFE host callback column 71→71 while a naive short edit shifted it to 49; [45150232904](https://github.com/FlareZ123/obfs/actions/runs/45150232904). The positional property is a useful narrow invariant: nonoverlapping newline-free replacement spans with equal UTF-16 lengths leave later token offsets unchanged. The experiment does not establish function source-text preservation or hostile-host equivalence.

The explicit trust contract is crucial. In a hostile environment where arbitrary callable behavior can read emitted source files or `Function.toString`, there is no generally valid nonidentity text rewrite with guaranteed exact observational equivalence for every JS program. In a trusted native environment, an assumed immutable plain `globalThis.Math.PI` read can coexist with private owner renaming; the same read can become source-sensitive if a host installs an accessor before module evaluation. The compiler needs declared and checked environmental premises, rather than inferring trust merely from a known global name.

## Proposed implementable acceptance sequence

1. Build a *finite scope-aware carrier graph* over the currently supported closed-world ESM/CJS shapes, initially Error objects and named local throw/Promise handlers. Retain current fail-closed scanner for unresolved values.
2. Add source-pinned negative pairs for each language-dataflow edge, including tests that show the actual emitted transformation and observable native/compiled difference before its correction.
3. Add a positive rewrite control in every source-observer test family. Demand an actual nonzero compiler transformation when the source-carrier path is absent.
4. Test explicit **host provenance** assumptions independently. Include a runtime-injected accessor negative and an untouched trusted-native data-property positive. Never treat a safe positive under a pristine-native premise as proof against a hostile host.
5. Run same-parent full two-platform Node and real-browser integration with normalized failing-test identities; record CI source SHAs. Keep global release BLOCKED until full behavioral green, independent hostile-runtime tests, and sampled plus adversarial 2.5× sustained compute checks.
6. Evaluate any coordinate-neutral rewrite in a separate experimental backend first. Require lexical/static owner proof, edit-width and line-ending invariants, independent engine behavior tests, and explicit rejection when exact source bytes/function names can be observed.

This proposal is meant to align future work on a small number of principled proof gates. It does not claim a complete oracle for JavaScript program equivalence, a novel obfuscation breakthrough, or a release candidate. Its research references are [caught/rejected carrier report](https://github.com/FlareZ123/obfs/blob/agent39/promise-named-rejection-probe-20261123/im-results/error-stack-catch-promise-carrier-mayflow-2026-11-23.md) on Agent 39's research branch and [host observer report](https://github.com/FlareZ123/obfs/blob/agent39/host-stack-callback-iife-20261123/im-results/strict-iife-host-stack-callback-source-witness-2026-11-23.md).
