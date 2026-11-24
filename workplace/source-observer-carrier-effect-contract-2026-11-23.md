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

Use a monotone intramodule **value-carrier** graph with explicit abstract kinds:

| Value kind | Runtime evidence | Possible observation |
| --- | --- | --- |
| `ErrorLike` | native `new Error`, proved Error factory/subclass, bound caught/rejected Error | stack/string formatting and native frame coordinates |
| `Callable` | function declaration/expression/import, bound function | exact source text, callable metadata and native diagnostics |
| `HostOpaque` | imported callback, native/host callable or property accessor without a proved behavior contract | arbitrary source, source positions and mutable program state |
| `PrimitiveProven` | uniquely tracked finite literal, proved primitive return/argument | no native Error or callable carrier unless user-defined conversion/host re-entry occurs |
| `PlainRecordProven` | exact locally allocated record, proved unescaped own fields and stable prototype | own-field values with effects of actual accessors/dispatch separately checked |
| `Unknown` | dynamic scope/assignment, computed callee, unmodeled interfile forwarding | conservative potential source observation |

A **`FrameContext` is an activation-state node**, outside this value lattice. Each active caller/callee has a `functionSpan`, a distinct `callSiteSpan`, callable binding identity, strictness and a declared host contract. A reverse observation edge from a callback/getter to its active frame can produce `FramePosition`, `CallableMetadata` or `ExactSource` without flowing any JavaScript value representing the original callable. A source/owner rewrite decision must account for both the value graph and these activation edges. `HostOpaque` in the table means an unproved *value/capability*; the corresponding observation effect is called `UnknownHostEffect`.

Edges should represent value/dataflow and exception/controlflow precisely enough for the subject scope: assignments, function calls and returns, destructuring, named function identity, throw/catch, Promise rejection handlers, module import/export, callback registration and host-field access. A named callback should be resolved as a function binding with lexical scope rather than a global set of identifier strings. Unknown global mutation, `eval`, `with`, reflection and unresolved imports conservatively elevate the flow to `Unknown` rather than silently discarding it.

A carrier reaches a source-sensitive sink when a known `stack` access occurs or an unknown computed member/property key may evaluate to `stack`. The sink set also needs existing `Error.prepareStackTrace`, console formatter, Object/Reflect, native serializer, Function source, Node loader and browser host diagnostics. This may-flow graph should subsume the test-specific `catchParameterNames`, `rejectionParameterNames`, and `stackErrorAliases` sets once a scope-correct implementation has been validated.

## Dynamic-frame edges and binding-sensitive admission

A value-flow graph cannot, by itself, prove source privacy of a function that invokes an externally controlled callback. Add a *reverse stack-observation edge* from any executed host callback or accessor to the active caller frame, even when the function is never passed, returned, or stored. The analysis should carry the lexical function binding, source span, strictness, and an explicit host-effect contract. The edge is relevant to V8 `Error.stack` / `Error.prepareStackTrace` CallSite exposure and, with different strictness constraints, legacy caller introspection. These mechanisms are not equivalent to ordinary `ErrorLike` values thrown by application code. Node's [Error documentation](https://nodejs.org/api/errors.html#class-error) describes the stack-trace behavior. This refines the prior carrier proposal using Agent 12's independent [dynamic-frame review](../communications/agent39/20261123T104455Z_agent12-dynamic-frame-carrier-gap.md) and the already source-pinned strict-IIFE host witnesses above.

**Independent local Node 22.16.0 control, 23 November:** the [standalone executable control](../sims/dynamic-frame-source-control.js) runs the same single-line `evaluate` function through `node:vm` under filename `dynamic-frame-source-control.js`, once with a record property called `longPrivatePropertyName` and once with consistently shortened `x`. The function reads the property and passes **only the resulting number 73** to an external `hostSpy`. `hostSpy` captures `new Error().stack` and selects the `at evaluate` frame. Observed return values are **73 / 73** in both function modes while frame locations are **1:77 / 1:55** for sloppy execution and **1:91 / 1:69** for an explicit strict-function directive. Both pairs shift by 22 columns, matching the property-length reduction. This proves a source-coordinate observation channel for that local V8 runtime; it is **not** a compiler differential, browser result, or general cross-runtime guarantee. Existing compiler differential tests provide the distinct transformation witness.

**Supplementary Node/V8 structured-CallSite control:** the same executable also constructs a separate same-realm callback that temporarily installs `Error.prepareStackTrace` and queries the active `evaluate` CallSite. With a sloppy evaluated function, `CallSite.getFunction()` exposes its callable object, so `Function.prototype.toString` reveals the original or shortened function source. With an explicit strict-function directive, `getFunction()` returns `undefined` in this local test, while `getFunctionName()` still reports `evaluate` and `getColumnNumber()` still shifts **77→55** or **91→69** respectively. A strict-frame restriction on *callable object exposure* therefore does not eliminate the separately observed *source-coordinate* effect. The [V8 stack-trace API documentation](https://v8.dev/docs/stack-trace-api) independently describes both `CallSite.getColumnNumber()` and the `getFunction()` / `getThis()` restrictions for strict frames and frames below them. The numerical offsets are local Node 22.16.0 observations; other hosts, formatters and readers require separate evidence.

For a scope-aware carrier prototype, preserve `binding identity + abstract value provenance`, never merely identifier spelling. Required positive-yield controls include a caught primitive (`throw 1`), a rejected primitive (`Promise.reject(1)`), a rejected plain `{stack:'ordinary'}` record, and an unrelated function parameter shadowing a genuine Error catch variable. On such proven non-Error paths, unrelated private-owner property renaming must remain nonzero. Separate negative controls must preserve `Error.stack` coordinates through a genuine caught/rejected Error and preserve host-observed caller frames across callbacks, getters, and aliases. If a carrier or callback's provenance cannot be established, mark it `Unknown` and decline the affected rewrite. These tests address the name-wide false-positive review supplied by [Agent 1](../communications/agent39/20261123T1055Z_agent1-catch-rejection-carrier-precision-review.md).

Carry separate effect bits `ExactSource`, `SourceBytes`, `FramePosition`, `CallableMetadata`, and `UnknownHostEffect`, joining independent effects without assuming one subsumes another. A width-preserving rewrite may satisfy a narrowly proven frame-position contract, yet still violate source-text or callable metadata parity. Do not infer an unmodified host from a recognized global identifier. This is a research admission policy for the canonical Agent 3 integration, not an assertion that the current scanner has these graph semantics or a new strong-obfuscation result.

## Exact-source coercion sinks

The same `ExactSource` effect can arise from different **proven conversion sinks**. A callable flowing to `Array.prototype.join` element conversion, an ordinary `String(callable)` path, a template substitution, a `Storage.setItem` DOMString argument or `Window.name` Web IDL setter can yield its exact source text when the actual dispatch invokes native function stringification. Each site needs separate receiver/prototype/argument-position proof. A locally proved own `toString` or `Symbol.toPrimitive` can return stable text without invoking native `Function.prototype.toString`; a patched builtin or unknown host getter instead yields `UnknownHostEffect` until the specific execution contract is established. This effect model unifies Agent 12's [browser Web IDL observations](../communications/agent39/20261123T112038Z_agent12-webidl-string-coercion-effect.md) and Agent 47's [Array coercion review](../communications/agent39/20261123T114155_agent47-unify-tostring-source-effect.md) without equating the different host capabilities.

For a source-span selective transformation, compute *which callable or owner* can reach a particular source effect. Refusal should be confined to its proved affected closure where possible, with an independent positive protected-field rewrite elsewhere in the graph. Assumptions about immutable native conversion methods and host prototypes are deployment contracts and must be checked against the target runtime.

## Distinguish observation effects and protection policies

A proposed effect model can classify the *kind* of possible observation:

1. **ExactSource**: `Function.prototype.toString` and selected diagnostics expose callable source text; protect the exact observed callable span.
2. **SourceBytes**: read/serialize a published file, loader response, DOM/HTML mirror or SRI-pinned asset; protect the entire source unit only when reader provenance proves it is observable.
3. **FramePosition**: `Error.stack` under an ordinary V8 stack formatter. Position-preserving edits are a candidate only with a reviewed host/formatter contract.
4. **CallableMetadata**: renaming a function can affect `CallSite` names, `name`, `length` and identity-bearing descriptors even if byte and column lengths are preserved.
5. **UnknownHostEffect**: an unreviewed callback/getter may inspect source, frame location or external state. This is an epistemic fallback, not a positive effect bit; conservative refusal applies to its reachable source region.
6. **Owned primitive-only result**: a proved inert value path can still permit useful private-field transformations.

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


## Agent 3 integration addendum (24 November): primitive dispatch and active-caller effects

**Status:** refinement of this proposal using the 24 November current-main witnesses. This is an architecture constraint, not an accepted compiler implementation or academic result.

### A primitive value is not a trusted property-dispatch path

Keep `PrimitiveProven` as a value fact. Do not use it as evidence that a property Get, iterator lookup or method dispatch is effect-free. Under the repository's COO/SCO/SNO hostile-runtime assumptions, a host can install getters and methods on primitive prototypes before module evaluation.

Current-main `src/ast.js` demonstrates the conflation:

- `isFunctionValue` (315–334) does not model a primitive receiver's property result as a host-supplied callable.
- `mayBeMemberMethod` (1683–1685) returns false for a definitely primitive receiver; the object/array destructuring observer gate (2867–2874) therefore skips primitive receiver patterns.
- The primitive `.toString` / `.toSource` / `.toLocaleString` guard (2960–2962) excludes definitely primitive receivers.
- `isDefinitelyPrimitive` proves a value category; it does not prove that prototype accessors, iterators or methods are pristine.

Add distinct host-dispatch events:

| Event | Runtime operation | Required effect/provenance |
| --- | --- | --- |
| `PrimitiveGet` | `primitive[key]`, including a direct member read | `UnknownHostEffect` unless an explicit trusted-intrinsics contract proves the lookup |
| `PrimitiveObjectPatternGet` | object destructuring after `ToObject` | accessor-capable Get plus callable-result flow |
| `PrimitiveIterator` | array destructuring, spread or iteration over a primitive | `GetIterator` / `@@iterator` / `next` dispatch and resulting values |
| `PrimitiveMethodDispatch` | `.toString`, `.toLocaleString` and other prototype method calls | receiver/prototype/method identity and possible host callback |
| `UnknownHostCall` | an unproved host/global/imported call | `UnknownHostEffect` on the active frame, plus any returned-value provenance |

The effect is attached to the original operation even when its result is discarded. If the Get returns a callable, separately propagate that callable capability through declarations, aliases, assignments, local call/return edges, object fields and ESM identity edges. Do not globally taint arithmetic or all primitive values; Agent 11's corrected arithmetic control demonstrates nonzero unrelated property yield.

### Active-frame observation is not callable escape

The current-main `privateFunctionNodes` proof in `src/properties.js` (blob `bda3c6097e2679f59bd003fa0aed3e0291d4ba4c`, lines 678–730) admits a function whose in-file uses are direct, non-optional call-callee references. This proves a limited heap/value non-escape property. It does not prove that the active function is unobservable: an unknown synchronous host callback can capture `arguments.callee.caller` and read the caller's source while the helper is active, without ever receiving the helper object.

Agent 3 reproduced this on a test-only branch based on current main `2562cdfc18abfb00e4a6ad48d1f61a219d0b6f8d`: [run 45300109076](https://github.com/FlareZ123/obfs/actions/runs/45300109076) is 3/3 red on both operating systems across the COO/SNO/SCO core-API labels. The runtime value remains 43, but the external callback observes renamed owner keys in the captured helper source. See [the reproducible report](../im-results/agent3-current-main-active-caller-witness-2026-11-24.md). This confirms the need for a reverse `DynamicFrame` edge from an unknown callback/getter callsite to every active caller frame it can inspect.

Agent 9's 12/12 two-platform ambient-call prototype is a useful precision donor: it propagates unknown host-call effects through local call edges, distinguishes invoked from uninvoked nested functions, and preserves pure-helper yield. It remains property-pass-only. The source-observer plan should consume this as an effect producer, not copy its boolean veto as a separate pass-local authority.

### Shared plan fields and transformation contract

The canonical plan should expose at least the following. The v2 JSDoc schema supersedes the earlier typedef block; it is the single authoritative proposed contract. It resolves the review's duplicate dispatch type, missing value-flow graph, unqualified call-target summary, disconnected source mirrors and mode/trust ambiguity.

```js
/**
 * Runtime partitions are mode-specific. Build-time artifacts are not runtime
 * source units and must not be represented as a third execution partition.
 *
 * @typedef {'coo'|'sco'|'sno'} ObfuscationMode
 * @typedef {'server'|'client'} RuntimeExecutionPartition
 * @typedef {RuntimeExecutionPartition} ExecutionPartition
 * @typedef {'attacker-controlled'|'obfuscator-controlled'|'declared-trusted'|'unknown'} RuntimeControl
 *
 * @typedef {Object} ThreatModelRef
 * @property {string} threatModelId
 * @property {ObfuscationMode} mode
 * @property {RuntimeExecutionPartition} executionPartition
 * @property {RuntimeControl} runtimeControl
 * @property {string} assumptionsVersion
 * @property {string|null} trustEvidenceId
 *
 * @typedef {Object} SourceUnitRef
 * @property {string} sourceUnitId - runtime module/script instance, not a path alone
 * @property {ObfuscationMode} mode
 * @property {RuntimeExecutionPartition} executionPartition
 * @property {string} sourceGeneration - exact bytes plus parser version/options
 * @property {string|null} resolvedURL
 * @property {string|null} resolutionContextId
 * @property {string|null} realmGroupId - shared classic-script global environment
 * @property {'module'|'script'|'commonjs'|'unknown'} sourceType
 * @property {number|null} executionOrder
 * @property {ThreatModelRefKey} threatModelRefId
 * @property {HostContractRefKey|null} runtimeContractId
 * @property {string|null} requestVariantGeneration - SCO response-specific generation
 * @property {string|null} buildArtifactId - provenance only; not a runtime partition
 *
 * @typedef {Object} BindingRef
 * @property {SourceUnitRefKey} sourceUnitRef
 * @property {number} localBindingId - unique only inside one parsed Program
 *
 * @typedef {Object} RealmBindingRef
 * @property {string} realmGroupId
 * @property {SourceUnitRefKey} declarationSourceUnitRef
 * @property {number} declarationLocalBindingId
 *
 * @typedef {BindingRef|RealmBindingRef} BindingIdentity
 *
 * @typedef {Object} DefinitionRef
 * @property {string} definitionId
 * @property {BindingIdentityRefKey} bindingRef
 * @property {SourceSpanId} definitionSpanId
 * @property {'function-declaration'|'var-initializer'|'lexical-initializer'|'assignment'|'parameter'|'import'|'catch-binding'|'destructuring'|'unknown'} kind
 * @property {number} sourceOrder
 * @property {string} controlFlowPointId - includes hoisting and CFG reaching-definition state
 * @property {ReadonlyArray<string>} branchGuardIds
 *
 * @typedef {Object} CallableDefinitionRef
 * @property {string} callableDefinitionId
 * @property {SourceUnitRefKey} sourceUnitRef
 * @property {SourceSpanId} sourceSpanId
 * @property {DefinitionRefKey|null} lexicalDefinitionRef
 * @property {DefinitionRefKey|null} ownerDefinitionRef
 * @property {PropertyKeyIdentityRefKey|null} propertyKeyIdentity
 * @property {ValueRefKey|null} homeObjectValueRef - [[HomeObject]] identity for object/class methods
 * @property {boolean} usesThis
 * @property {boolean} usesSuper
 * @property {'function-declaration'|'function-expression'|'object-method'|'object-accessor'|'class-method'|'class-accessor'|'class-constructor'|'class-field'|'anonymous-expression'|'imported-callable'|'unknown'} kind
 *
 * @typedef {Object} ActivationRef
 * @property {string} activationId
 * @property {'function'|'script-or-module'|'class-static-block'|'eval'} kind
 * @property {SourceUnitRefKey} sourceUnitRef
 * @property {SourceSpanId} activationSpanId
 * @property {CallableDefinitionRefKey|null} callableDefinitionRef
 * @property {'strict'|'sloppy'|'unknown'} strictness
 *
 * @typedef {Object} HostContractRef
 * @property {string} hostContractId
 * @property {ObfuscationMode} mode
 * @property {RuntimeExecutionPartition} executionPartition
 * @property {ThreatModelRefKey} threatModelRefId
 * @property {string} runtimeFamily
 * @property {string} runtimeVersion
 * @property {string|null} realmId
 * @property {string|null} intrinsicSnapshotId
 * @property {string|null} loaderPreloadContractId
 * @property {string|null} deploymentManifestId
 * @property {string|null} pristineIntrinsicsPremise - explicit and auditable, never inferred from spelling
 * @property {string} contractVersion
 *
 * @typedef {string} BindingRefKey
 * @typedef {string} RealmBindingRefKey
 * @typedef {BindingRefKey|RealmBindingRefKey} BindingIdentityRefKey
 * @typedef {string} DefinitionRefKey
 * @typedef {string} CallableDefinitionRefKey
 * @typedef {string} ActivationRefKey
 * @typedef {string} SourceSpanId - source-unit/generation-qualified UTF-16 span
 * @typedef {string} HostEffectId
 *
 * @typedef {Object} SourceSpanRef
 * @property {SourceSpanId} spanId
 * @property {SourceUnitRefKey} sourceUnitRef
 * @property {string} sourceGeneration
 * @property {number} startOffset - UTF-16 code-unit offset
 * @property {number} endOffset - UTF-16 code-unit offset
 * @property {'utf16-code-unit'} coordinateUnit
 * @property {string|null} astNodeType
 * @typedef {string} HostContractRefKey
 * @typedef {string} ThreatModelRefKey
 * @typedef {string} SourceUnitRefKey
 * @typedef {string} ModuleResolutionEdgeKey
 * @typedef {string} SourceDeliveryEdgeKey
 * @typedef {string} SourceMirrorRefKey
 * @typedef {string} SourceMirrorReadEdgeKey
 * @typedef {string} WellKnownSymbolRefKey
 * @typedef {string} PropertyKeyIdentityRefKey
 * @typedef {string} ReceiverRefKey
 * @typedef {string} ValueRefKey
 * @typedef {string} ValueFlowEdgeKey
 * @typedef {string} CallSiteRefKey
 *
 * @typedef {Object} ModuleResolutionEdge
 * @property {string} importOccurrenceId
 * @property {SourceUnitRefKey} importerSourceUnitRef
 * @property {SourceSpanId} importSiteSpanId
 * @property {string} specifier
 * @property {SourceUnitRefKey|null} targetSourceUnitRef
 * @property {string} resolutionContextId
 * @property {string|null} resolvedURL
 * @property {'resolved'|'external'|'unknown'|'rejected'} resolutionStatus
 *
 * @typedef {Object} SourceDeliveryEdge
 * @property {string} deliveryId
 * @property {SourceUnitRefKey} serverSourceUnitRef
 * @property {SourceUnitRefKey} clientSourceUnitRef
 * @property {string} requestIdentity
 * @property {string} responseIdentity
 * @property {string} requestVariantGeneration
 * @property {string|null} sourceBytesDigest
 * @property {'module'|'asset'|'integrity-token'|'other'} deliveryKind
 *
 * @typedef {'eligible'|'ineligible'|'unknown'} ScoPartitionEligibilityStatus
 * @typedef {'no-client-source-observer'|'client-host-held-source-observer'|'unknown-client-observer-reachability'|'unsupported-cross-partition-value-flow'} ScoPartitionEligibilityReason
 * @typedef {Object} ScoPartitionEligibility
 * @property {CallableDefinitionRefKey} callableRef
 * @property {SourceUnitRefKey} sourceUnitRef
 * @property {string} sourceGeneration
 * @property {ScoPartitionEligibilityStatus} status
 * @property {ScoPartitionEligibilityReason} reason
 * @property {ReadonlyArray<HostEffectId>} blockingHostEffectIds
 * @property {ReadonlyArray<ValueRefKey>} clientObservedValueRefs
 * @property {ReadonlyArray<SourceDeliveryEdgeKey>} sourceDeliveryEdgeRefs
 * @property {HostContractRefKey|null} clientHostContractRef
 * @property {boolean} strictSourceSemantics
 *
 * @typedef {'native-global'|'native-property'|'alias'|'proxy'|'userland'|'unknown'} ReceiverProvenance
 * @typedef {'native-inherited'|'native-accessor'|'captured-native'|'own-data'|'own-accessor'|'prototype-patched'|'proxy-forwarded-native'|'userland'|'unknown'} ReceiverLookupRoute
 * @typedef {ReceiverLookupRoute} DispatchProvenance - compatibility alias for lookup route only
 * @typedef {'local-definition'|'verified-native-intrinsic'|'host-overridden'|'unknown-or-mutable'} EffectiveDispatchStatus
 *
 * @typedef {Object} EffectiveOperationRef
 * @property {'local-callable'|'verified-host-intrinsic'|'host-override'|'unknown'} kind
 * @property {CallableDefinitionRefKey|null} callableDefinitionRef
 * @property {string|null} hostIntrinsicId
 * @property {CallableDefinitionRefKey|null} overrideCallableDefinitionRef
 * @property {HostContractRefKey|null} hostContractRef
 *
 * @typedef {Object} ReceiverRef
 * @property {ReceiverRefKey} receiverRef
 * @property {BindingIdentityRefKey|null} originBindingRef
 * @property {string|null} hostInterfaceIdentity
 * @property {string|null} realmId
 * @property {ReceiverProvenance} provenance
 * @property {ReceiverRefKey|null} aliasOf
 * @property {ReceiverRefKey|null} proxyTarget
 *
 * @typedef {'Primitive'|'Callable'|'ErrorLike'|'PlainRecord'|'HostObject'|'PathLike'|'IteratorLike'|'PromiseLike'|'Unknown'} ValueCategory
 * @typedef {ValueCategory} ValueKind - compatibility alias; not a complete value fact
 * @typedef {'proven'|'may'|'unknown'} ValueProofStatus
 * @typedef {'HostHeldCallable'|'HostHeldObject'|'Escaped'|'SourceObservable'|'CallableMetadataObservable'|'SameSourcePath'|'UnknownPath'} ValueCapability
 *
 * @typedef {Object} WellKnownSymbolRef
 * @property {WellKnownSymbolRefKey} symbolRef
 * @property {string} symbolIdentityDomainId - ECMAScript agent well-known-symbol domain, not realm ID
 * @property {'toPrimitive'|'iterator'|'asyncIterator'|'hasInstance'|'toStringTag'|'species'|'isConcatSpreadable'|'match'|'matchAll'|'replace'|'search'|'split'|'unscopables'|'dispose'|'asyncDispose'|'other'} wellKnownName
 * @property {string} symbolValueIdentity - exact symbol value identity used as the property key
 * @property {string|null} sourceRealmId - provenance only; well-known identity is agent-scoped
 * @property {'intrinsic-property'|'immutable-alias'|'userland-wrapper'|'unknown'} provenance
 * @property {ValueProofStatus} proofStatus
 * @property {HostContractRefKey|null} hostContractRef
 *
 * @typedef {Object} PathProvenanceRef
 * @property {'same-source-url'|'other-source-url'|'filesystem-path'|'module-url'|'unknown'} kind
 * @property {SourceUnitRefKey|null} sourceUnitRef
 * @property {string|null} resolvedURL
 * @property {string|null} resolutionContextId
 * @property {HostContractRefKey|null} hostContractRef
 * @property {ValueProofStatus} proofStatus
 *
 * @typedef {'static-string'|'number-to-string'|'well-known-symbol'|'unique-symbol'|'unknown'} PropertyKeyIdentityKind
 * @typedef {Object} PropertyKeyIdentityRef
 * @property {PropertyKeyIdentityRefKey} identityRef
 * @property {PropertyKeyIdentityKind} kind
 * @property {ValueRefKey|null} sourceValueRef - value of the computed-key expression before ToPropertyKey
 * @property {SourceSpanId} useSiteSpanId
 * @property {string} controlFlowPointId - use-site reaching-definition point, not declaration-wide alias state
 * @property {ReadonlyArray<DefinitionRefKey>} reachingDefinitionRefs
 * @property {ReadonlyArray<string>} branchGuardIds
 * @property {string|null} stringValue - canonical property key string for string/number cases
 * @property {number|null} numericValue
 * @property {WellKnownSymbolRefKey|null} wellKnownSymbolRef
 * @property {string|null} symbolIdentityDomainId
 * @property {string|null} symbolValueIdentity
 * @property {ValueProofStatus} proofStatus
 * @property {HostContractRefKey|null} hostContractRef
 *
 * @typedef {Object} ValueRef
 * @property {ValueRefKey} valueRef
 * @property {SourceUnitRefKey} sourceUnitRef
 * @property {SourceSpanId|null} originSpanId
 * @property {DefinitionRefKey|null} originDefinitionRef
 *
 * @typedef {Object} ValueFact
 * @property {ReadonlyArray<ValueCategory>} categoryPossibilities - product/join, not one exclusive tag
 * @property {ValueProofStatus} proofStatus
 * @property {ReadonlyArray<DefinitionRefKey>} originDefinitionRefs
 * @property {ReadonlyArray<CallableDefinitionRefKey>} callableDefinitionRefs - exact callable identities when category includes Callable
 * @property {ReadonlyArray<WellKnownSymbolRefKey>} wellKnownSymbolRefs - exact well-known symbol values carried by this value
 * @property {ReadonlyArray<PropertyKeyIdentityRefKey>} propertyKeyIdentityRefs
 * @property {ReadonlyArray<SourceUnitRefKey>} originSourceUnitRefs
 * @property {ReadonlyArray<PathProvenanceRef>} pathProvenance - distinct from ordinary ValueCategory
 * @property {ReadonlyArray<ValueCapability>} capabilities
 *
 * @typedef {'assignment'|'alias'|'phi'|'actual-to-formal'|'return-to-call-result'|'field-write'|'field-read'|'reflect-get'|'descriptor-value'|'reflect-set'|'descriptor-write'|'destructuring'|'import'|'export'|'throw-catch'|'promise-fulfillment'|'promise-rejection'|'iterator-yield'|'coercion-result'|'host-argument'|'host-return'|'closure-capture'} ValueFlowEdgeKind
 *
 * @typedef {Object} ValueFlowEdge
 * @property {ValueFlowEdgeKey} edgeId
 * @property {ValueRefKey} fromValueRef
 * @property {ValueRefKey} toValueRef
 * @property {ValueFlowEdgeKind} kind
 * @property {SourceSpanId} sourceSpanId
 * @property {CallSiteRefKey|null} callSiteRef
 * @property {string|null} controlFlowPointId
 * @property {ReadonlyArray<string>} branchGuardIds
 * @property {CallableDefinitionRefKey|null} targetCallableDefinitionRef - target-specific actual/formal or return edge
 * @property {ValueRefKey|null} ownerValueRef - object identity for field read/write/reflection edges
 * @property {ValueRefKey|null} receiverValueRef - distinct Reflect.get/Reflect.set receiver argument
 * @property {'Reflect.get'|'Reflect.set'|'Object.getOwnPropertyDescriptor'|'Object.defineProperty'|null} reflectionOperation
 * @property {number|null} argumentIndex
 * @property {PropertyKeyIdentityRefKey|null} propertyKeyIdentity
 * @property {string|null} operandPath
 *
 * @typedef {'call'|'construct'|'tag'|'optional-call'|'implicit'|'unknown'} InvocationKind
 * @typedef {'resolved'|'ambiguous'|'external'|'mutable'|'unknown'} CallTargetResolutionStatus
 *
 * @typedef {Object} CallSiteRef
 * @property {CallSiteRefKey} callSiteId
 * @property {SourceUnitRefKey} sourceUnitRef
 * @property {SourceSpanId} sourceSpanId
 * @property {ActivationRefKey|null} callerActivationRef
 * @property {InvocationKind} invocationKind
 * @property {ValueRefKey|null} calleeValueRef
 * @property {BindingIdentityRefKey|null} calleeBindingRef
 * @property {ReadonlyArray<CallableDefinitionRefKey>} targetCallableDefinitionRefs
 * @property {CallTargetResolutionStatus} targetResolutionStatus
 * @property {string|null} controlFlowPointId
 * @property {ReadonlyArray<string>} branchGuardIds
 *
 * @typedef {'get'|'set'|'has'|'deleteProperty'|'ownKeys'|'getOwnPropertyDescriptor'|'getPrototypeOf'|'defineProperty'|'setPrototypeOf'|'isExtensible'|'preventExtensions'|'apply'|'construct'} ProxyInternalMethod
 * @typedef {ProxyInternalMethod} ProxyTrapName - compatibility alias
 * @typedef {'default'|'number'|'string'|null} ConversionHint
 * @typedef {'synchronous'|'deferred'|'unknown'|null} CallbackTiming
 * @typedef {'explicit-argument'|'object-provided-method'|'internal-callback'|'unknown'|null} CallbackRole
 * @typedef {'trigger'|'observed'} HostEffectValueRole
 * @typedef {'ExactSource'|'SourceBytes'|'FramePosition'|'CallableMetadata'|'UnknownHostEffect'} ObservationEffect
 *
 * @typedef {'PrimitiveGet'|'PrimitiveObjectPatternGet'|'IteratorDispatch'|'PrimitiveMethodDispatch'|'UnknownHostCall'|'UnknownHostArgumentEscape'|'AccessorCall'|'ProxyInternalMethod'|'CustomHasInstance'|'ObjectCopyDispatch'|'WithBindingLookup'|'ToPrimitiveDispatch'|'ToPropertyKeyDispatch'|'PromiseResolveThenableGet'|'PromiseThenableJob'|'PromiseHandlerDispatch'|'IntrinsicCallbackDispatch'|'WebIDLStringConversion'|'WebIDLNamedPropertySet'|'WebIDLAttributeSet'|'DOMSourceSerialization'|'DOMSourceRead'|'FileSystemSourceRead'|'SourceMirrorRead'|'CallableMetadataRead'|'StackFrameRead'|'SRIIntegrityPin'|'BrowserImportMapResolution'} HostEffectKind
 *
 * @typedef {Object} HostEffectRecord
 * @property {HostEffectId} effectId
 * @property {HostEffectId|null} causedByEffectId
 * @property {HostEffectKind} kind
 * @property {SourceSpanId} operationSpan
 * @property {CallSiteRefKey|null} callSiteRef
 * @property {ActivationRefKey|null} callerActivationRef
 * @property {string|null} abstractOperation
 * @property {ReadonlyArray<ObservationEffect>} observationEffects - event-specific dimensions; UnknownHostEffect is fallback
 * @property {ConversionHint} conversionHint
 * @property {ProxyInternalMethod|null} proxyTrapName - required when kind is ProxyInternalMethod
 * @property {string|null} interfaceIdentity
 * @property {ReceiverRefKey|null} receiverRef
 * @property {ReceiverProvenance} receiverProvenance
 * @property {ReceiverLookupRoute} receiverLookupRoute
 * @property {EffectiveDispatchStatus} effectiveDispatchStatus
 * @property {EffectiveOperationRef|null} effectiveOperationRef
 * @property {string|null} conversionTarget
 * @property {string|null} operandRole
 * @property {number|null} argumentIndex
 * @property {string|null} operandPath
 * @property {PropertyKeyIdentityRefKey|null} propertyKeyIdentityRef
 * @property {ValueRefKey|null} resultValueRef - value produced by getter/coercion/host operation when applicable
 * @property {HostContractRefKey|null} hostContractRef
 * @property {CallbackRole} callbackRole
 * @property {CallbackTiming} callbackTiming
 *
 * @typedef {Object} HostEffectValueEdge
 * @property {HostEffectId} effectId
 * @property {HostEffectValueRole} role - trigger or actually observed value
 * @property {ValueRefKey} valueRef
 * @property {CallSiteRefKey|null} callSiteRef
 * @property {string|null} operandRole
 * @property {number|null} argumentIndex
 * @property {string|null} operandPath
 *
 * @typedef {Object} ActiveFrameEdge - reverse DynamicFrame edge, not value/heap flow
 * @property {HostEffectId} effectId
 * @property {ActivationRefKey} activationRef
 * @property {ReadonlyArray<ObservationEffect>} effects
 * @typedef {ActiveFrameEdge} DynamicFrameEdge
 *
 * @typedef {Object} SourceMirrorRef
 * @property {SourceMirrorRefKey} sourceMirrorRef
 * @property {SourceUnitRefKey} sourceUnitRef
 * @property {'inline-script-text'|'external-module-response'|'blob-module-bytes'|'function-source'|'dom-document-source'|'sri-pinned-bytes'|'loader-response'|'other'} mirrorKind
 * @property {'inline'|'external-url'|'blob-url'|'data-url'|'loader-response'|'unknown'} embeddingKind
 * @property {SourceUnitRefKey|null} embeddingSourceUnitRef
 * @property {string|null} embeddingIdentity
 * @property {string|null} readerOperation
 * @property {EffectiveOperationRef|null} readerOperationRef
 * @property {HostContractRefKey|null} hostContractRef
 * @property {CallableDefinitionRefKey|null} callableDefinitionRef - required for function-source mirrors
 * @property {SourceSpanId|null} callableSourceSpanId
 *
 * @typedef {Object} SourceMirrorReadEdge
 * @property {SourceMirrorReadEdgeKey} edgeId
 * @property {HostEffectId} effectId
 * @property {SourceMirrorRefKey} sourceMirrorRef
 * @property {SourceSpanId} readerSpanId
 * @property {SourceUnitRefKey|null} observedSourceUnitRef
 * @property {CallableDefinitionRefKey|null} observedCallableDefinitionRef
 * @property {ValueRefKey|null} observedValueRef
 * @property {ObservationEffect} observationEffect
 *
 * @typedef {Object} SourceObservationPlan
 * @property {string} planId
 * @property {string} planGeneration
 * @property {ReadonlyMap<SourceUnitRefKey, SourceUnitRef>} sourceUnits
 * @property {ReadonlyMap<SourceSpanId, SourceSpanRef>} sourceSpans
 * @property {ReadonlyMap<ThreatModelRefKey, ThreatModelRef>} threatModels
 * @property {ReadonlyMap<ModuleResolutionEdgeKey, ModuleResolutionEdge>} moduleResolutionEdges
 * @property {ReadonlyMap<SourceDeliveryEdgeKey, SourceDeliveryEdge>} sourceDeliveryEdges
 * @property {ReadonlyMap<CallableDefinitionRefKey, ScoPartitionEligibility>} scoPartitionEligibility
 * @property {ReadonlyMap<WellKnownSymbolRefKey, WellKnownSymbolRef>} wellKnownSymbols
 * @property {ReadonlyMap<PropertyKeyIdentityRefKey, PropertyKeyIdentityRef>} propertyKeyIdentities
 * @property {ReadonlyMap<BindingIdentityRefKey, BindingIdentity>} bindings
 * @property {ReadonlyMap<DefinitionRefKey, DefinitionRef>} definitions
 * @property {ReadonlyMap<CallableDefinitionRefKey, CallableDefinitionRef>} callableDefinitions
 * @property {ReadonlyMap<ActivationRefKey, ActivationRef>} activations
 * @property {ReadonlyMap<ValueRefKey, ValueRef>} values
 * @property {ReadonlyMap<ValueRefKey, ValueFact>} valueFacts
 * @property {ReadonlyMap<ValueFlowEdgeKey, ValueFlowEdge>} valueFlowEdges
 * @property {ReadonlyMap<CallSiteRefKey, CallSiteRef>} callSites
 * @property {ReadonlyMap<CallableDefinitionRefKey, ReadonlySet<CallableDefinitionRefKey>>} callTargets - derived compatibility summary only
 * @property {ReadonlyMap<SourceSpanId, ReadonlySet<CallableDefinitionRefKey>>} hostArgumentEdges - derived compatibility projection only
 * @property {ReadonlyMap<HostEffectId, HostEffectRecord>} hostEffects
 * @property {ReadonlyMap<HostEffectId, ReadonlyArray<HostEffectValueEdge>>} valueEdges
 * @property {ReadonlyMap<HostEffectId, ReadonlyArray<ActiveFrameEdge>>} activeFrameEdges
 * @property {ReadonlyMap<HostEffectId, ReadonlySet<SourceSpanId>>} effectClosures - exact affected spans for each observation effect
 * @property {ReadonlyMap<HostContractRefKey, HostContractRef>} hostContracts
 * @property {string|null} deploymentManifestId
 * @property {ReadonlyMap<SourceMirrorRefKey, SourceMirrorRef>} sourceMirrors
 * @property {ReadonlyMap<SourceMirrorReadEdgeKey, SourceMirrorReadEdge>} sourceMirrorReadEdges
 * @property {ReadonlyMap<ReceiverRefKey, ReceiverRef>} receiverRefs
 * @property {ReadonlyMap<SourceSpanId, ReadonlySet<ObservationEffect>>} effects - derived summary of event and edge observationEffects
 * @property {ReadonlyMap<SourceSpanId, ReadonlySet<SourceSpanId>>} semanticClosures
 * @property {ReadonlySet<SourceSpanId>} unsupportedSpans
 */
```

The schema separates five identities that must never be collapsed: BindingRef is lexical storage; DefinitionRef is a reaching write; ValueRef is an abstract runtime value; CallSiteRef is one invocation occurrence; HostEffectRecord is one implicit or explicit operation. SourceSpanRef is the generation-qualified UTF-16 coordinate record behind every SourceSpanId, and effectClosures maps each HostEffectId to the exact spans it protects; the span-keyed effects and semanticClosures maps are derived consumer projections. ValueFact carries the exact possible CallableDefinitionRef identities and a separate path-provenance product so source URL/path reads can distinguish same-source, other-source and unknown paths. A BindingId alone is never a graph-global identity. A function value may carry the HostHeldCallable capability while remaining a Callable category; this capability is not a mutually exclusive ValueKind. A host argument that is inspected but never invoked creates an observed-value edge and HostHeldCallable capability. A no-argument callback that inspects the active caller creates a separate ActiveFrameEdge. An unknown call's returned value is represented by ValueFlowEdge, not either of those edges.

Mode/trust defaults are fixed by the threat model: COO/client, SCO/client and SNO/server are attacker-controlled; SCO/server is obfuscator-controlled. A declared-trusted premise is admissible only when an explicit, versioned HostContractRef supports it. A known runtime family/version or unshadowed global spelling is not such proof. Build artifacts are provenance, not a third runtime execution partition.

ModuleResolutionEdge is per import occurrence; SourceDeliveryEdge represents the SCO server-to-client boundary and request-specific generation; SourceMirrorReadEdge connects an actual reader effect to the exact function/source mirror it observes. Function-source mirrors carry CallableDefinitionRef and SourceSpanId. The old callTargets, hostArgumentEdges and any source-unit adjacency map are derived compatibility projections, never the authoritative graph.

Dispatch is split into receiver origin, member lookup route and effective operation status. ReceiverLookupRoute records inherited/own/captured/proxy/userland lookup; EffectiveDispatchStatus records local, verified native, overridden or unknown behavior; EffectiveOperationRef identifies the actual local callable or versioned host intrinsic. The old DispatchProvenance name is only a compatibility alias for ReceiverLookupRoute and must not be used for effective-operation status.

A callable value escaping to a host does not imply that its owner object escaped. HostEffectValueEdge must point to the exact observed ValueRef; ValueFact distinguishes HostHeldCallable from HostHeldObject; field-read/write ValueFlowEdges retain ownerValueRef and PropertyKeyIdentityRef; CallableDefinitionRef carries [[HomeObject]] identity and usesThis/usesSuper facts. The source/metadata closure protects the method source and the property key that determines observable name/length. It must not automatically mark every sibling field on the owner object as host-held. Same-owner field renaming remains fail-closed unless [[HomeObject]], this/super, reflection, getters/setters, dynamic keys, binding and value escape are all proven safe. A separate-owner positive is not evidence that same-owner renaming is generally safe.

When the host receives an object/array value, HostHeldObject applies to that exact container value; the analyzer must traverse proven field/element/iterator containment edges to callable values reachable through the host's permitted observation operations. If the object is a Proxy, has dynamic keys, accessors with unknown effects, opaque Map/Set/collection state, spread/rest behavior or reflection that cannot be resolved, emit UnknownHostEffect and fail closed over the uncertain reachable region. Conversely, when only a method value escapes, do not mark the containing object HostHeldObject merely because a field-write edge connects them. The graph must distinguish container reachability from callable-value escape.
HostEffectRecord.observationEffects records the dimensions produced by that specific event. A function-source mirror read is SourceMirrorRead with ExactSource; filesystem, DOM, loader or SRI byte reads are SourceBytes; CallableMetadataRead is CallableMetadata; StackFrameRead is FramePosition. The plan-level effects map is only a derived span-keyed summary. UnknownHostEffect remains an explicit fallback when dispatch or observation behavior cannot be proven.

The canonical event taxonomy uses one ProxyInternalMethod event with the exact one of 13 trap names in proxyTrapName. IteratorDispatch covers iteration for all receiver categories; PrimitiveIterator is not a separate event. IntrinsicCallbackDispatch is allowed only when the effective operation is verified under the relevant HostContractRef; a host override is not a native intrinsic merely because it has the same spelling. ToPrimitive/ToPropertyKey, PromiseResolve.GetThen, deferred thenable jobs and Promise handler dispatch remain distinct operations.

ObservationEffect has four positive dimensions: ExactSource (callable source text), SourceBytes (distributed source-unit bytes/mirrors), FramePosition (observable coordinates), and CallableMetadata (name/length/identity metadata). UnknownHostEffect is an epistemic fallback, not a fifth positive observation. A proven ExactSource closure is callable-span scoped; SourceBytes closes over a source unit only when its mirror/URL provenance establishes that reader; FramePosition closes over coordinate-affecting edits; CallableMetadata closes over exposed metadata. These effects are independent.

SCO selected-server partitioning is a separate placement decision, not a source-transform effect. Compute ScoPartitionEligibility per callable over the full client module graph: a client HostHeldCallable/ExactSource observer makes the callable ineligible under strict 1:1 source semantics; unknown client observer reachability is unknown and fails closed; absence of a client source observer can leave the server-private partition eligible. The generated facade may protect private server bytes, but its Function#toString source differs from the original server callable. Do not claim both strict source parity and server-only confidentiality for that observable callable. Request-time mutation of delivered client code and selected-server partition eligibility are distinct SCO boundaries.

PropertyKeyIdentityRef is use-site-specific. The computed MemberExpression key span, sourceValueRef, controlFlowPointId, branchGuardIds and reachingDefinitionRefs must identify the value that actually reaches that exact use. Do not infer the key from a declaration's initial value or a spelling-keyed alias set. For example, after `let key = Symbol.toPrimitive; key = Symbol.for('fake'); inspect[key] = hook`, the use-site key is fake; after `let key = Symbol.toPrimitive; const captured = key; key = Symbol.for('fake'); inspect[captured] = hook`, the use-site key remains the captured well-known symbol. CallableDefinitionRef, ValueFlowEdge and HostEffectRecord must all refer to the same PropertyKeyIdentityRefKey so the own hook, computed property write and ToPrimitiveDispatch join on one identity.

Value identity and access-effect safety are separate proofs. Reading SymbolCtor.toPrimitive uses a static-string PropertyKeyIdentityRef for the property name `toPrimitive`, a field-read ValueFlowEdge and the receiver's actual lookup/effective getter. A pure getter may return the exact well-known symbol safely; a getter or Proxy trap that calls Function#toString on the eventual callable creates an independent AccessorCall/ProxyInternalMethod effect with ExactSource even though it returns the correct symbol. HostEffectRecord.resultValueRef links the getter result to the ValueFact/WellKnownSymbolRef that feeds the later computed-key identity. Provenance `userland-wrapper` never implies a pure getter. Proven builder invariant: the getter/Proxy HostEffectRecord.resultValueRef must equal the toValueRef of its corresponding ValueFlowEdge. That edge must retain the same callSiteRef, sourceSpanId, controlFlowPointId, branchGuardIds, ownerValueRef/receiverValueRef and static-string PropertyKeyIdentityRef for the accessed property. The returned ValueRef carries its ValueFact/WellKnownSymbolRef through assignment, alias, capture, actual-to-formal, field and return edges to the later use-site PropertyKeyIdentityRef.sourceValueRef, which retains its own span, CFG point, reaching definitions and guards. The getter's source-observation side effect is independent: attach its own observed-value edge and ExactSource closure (or ActiveFrameEdge where appropriate). Keep HostEffectIds distinct even when two events share one source span; join values by ValueRef identity, never by spelling or span equality.

The interprocedural acceptance pair must also pass a value named SymbolCtor as an actual argument into a factory, read SymbolCtor.toPrimitive as a property value, capture the key, write inspect[key], return inspect, and then pass the returned callable to Storage. A real Symbol argument yields the well-known hook; a fake userland object with a Symbol.for key does not. The graph must follow actual-to-formal, field-read, immutable capture, field-write, return-to-call-result and host-argument edges; the local identifier spelling SymbolCtor proves nothing. Agent 13's Node 22.16.0 Web Storage controls are semantic witnesses only, not a compiler or CI receipt. Keep the computed-key path fail-closed until this interprocedural proof is implemented and tested in the declared runtime matrix.

The root expression must resolve by BindingRef/RealmBindingRef. A free `globalThis` root requires the mode-specific HostContractRef to establish that it denotes the actual host global. A local root is neither intrinsically trusted nor automatically rejected: follow its ValueRef/DefinitionRef through property reads and wrapper/getter/Proxy effects. Admit only when the resulting key identity is the exact WellKnownSymbolRef and the access effects are safe. Any free Symbol constructor root used to produce that value likewise requires HostContractRef proof of the actual host intrinsic; a local Symbol binding is followed through its own ValueRef/DefinitionRef and may be accepted only if the resulting property read yields the exact WellKnownSymbolRef safely. A local shadow yielding a string or fake symbol is negative; a local wrapper exposing a captured actual well-known symbol can be positive.

PropertyKeyIdentityRef is a discriminated record whose fields must satisfy kind-specific invariants at plan construction; the builder must validate and reject inconsistent combinations rather than silently normalizing them. `static-string` requires canonical stringValue and null numeric/symbol fields. `number-to-string` requires numericValue plus its canonical stringValue and null symbol fields. `well-known-symbol` requires a non-null WellKnownSymbolRefKey plus matching agent domain and exact symbol value; string/numeric fields are null. `unique-symbol` requires a proven unique symbol identity/provenance and no WellKnownSymbolRef; string/numeric fields are null. `unknown` has proofStatus unknown and no trusted key identity. Each ValueFact propertyKeyIdentityRefs entry must be attached to the exact ValueRef/DefinitionRef/CFG point that produced the computed key.

A property-key identity is not a bare string or a constructor spelling. PropertyKeyIdentityRef distinguishes static strings, number-to-string keys, well-known symbols, unique symbols and unknown keys, and carries exact value/provenance. For @@toPrimitive, the proof target is the actual well-known symbol value used at the computed property access. Its identity domain is the ECMAScript agent, not an individual realm; source realm is provenance only. A cross-realm intrinsic or userland wrapper exposing the exact agent-wide well-known symbol may be proven, while a fake Symbol.for value, mutable alias, shadowed Symbol binding or unknown preload remains Unknown unless the value graph or a mode-specific HostContractRef proves the actual key.

Well-known Symbol identity is carried by the actual symbol value, not by the Symbol constructor reference or realm alone. In particular, Symbol.toPrimitive is shared across realms in one ECMAScript agent. A userland wrapper that exposes the exact well-known symbol value may be safe when its value provenance is proven; a fake Symbol.for value, local shadow, mutable alias or unknown preloader remains unknown. sourceRealmId is provenance, while symbolIdentityDomainId is the identity domain.

HostHeldCallable propagation is a monotone fixed-point over the typed value graph: seed at the exact host-controlled callsite/argument; propagate through assignment/alias/phi, object-field write/read, actual-to-formal, return-to-call-result, import/export, closure capture and only explicitly modeled spread/apply/bind edges; resolve the exact CallableDefinitionRef set; then attach ExactSource to each callable's exact source span and populate effectClosures. If an outer callable is observed, nested source text inside its Function#toString span is part of the closure. Do not create an ActiveFrameEdge unless the callback is actually invoked while that frame remains visible. Every source-mutating consumer must use the same immutable closure.

The value-flow graph must model computed member reads, Reflect.get results and Object.getOwnPropertyDescriptor(...).value as distinct field-read/reflect-get/descriptor-value edges keyed by exact receiver/owner, PropertyKeyIdentityRef, callsite and CFG point. Reflect.set/Object.defineProperty writes use corresponding typed write edges. If the receiver is an accessor or Proxy, attach the separate AccessorCall/ProxyInternalMethod HostEffectRecord and its resultValueRef; reflection is not merely a global veto and not a reason to let identifier and string consumers diverge. The reflectionOperation field is only a syntactic operation label, not proof of an intrinsic: shadowed Reflect/Object bindings, replaced methods, proxies and preload mutations must resolve through CallSiteRef, EffectiveOperationRef and mode-specific HostContractRef; otherwise retain UnknownHostEffect. The fixed-point must also include every nested source span contained by an observed outer callable; edits to a nested declaration or parameter change the outer Function#toString result even when the nested function is never invoked.

Runtime immutability is a separate implementation obligation: JSDoc ReadonlyMap/ReadonlySet and Object.freeze(Map) do not prevent Map/Set mutation. Keep backing maps/sets private behind closure or WeakMap lookup methods, expose only frozen records/arrays or immutable snapshots, and prevent input aliases or consumers from mutating plan state. Build a fresh plan for each SCO requestVariantGeneration; never share mutable backing state across concurrent requests.

This is an architecture contract, not a production implementation or accepted security theorem. The current compiler has not wired this plan into any transform consumer. The fail-closed fallback remains mandatory until a single candidate demonstrates soundness and useful per-callable yield.

The Stage 1 BindingId resolver is a tested read-only donor; its current-main focused bundle is 40 lexical fixtures / 10 groups, 150 Acorn/TypeScript comparisons, 16 native reference-role fixtures, 60 switch-scope comparisons and 12 source/closure edit controls. It has not yet been wired into production transformation passes.

A single module-graph analysis should:
1. resolve declaration/reference identities and roles;
2. propagate abstract values and callable capabilities over assignments, parameters, returns, object fields, destructuring and ESM edges;
3. record primitive Get/iterator/method events and unknown host calls;
4. propagate reverse activation effects through local calls to the active caller/ancestor;
5. compute independent source, frame, metadata and unknown-host effect bits plus the owner/provider/captured-binding semantic closure;
6. hand the immutable plan to local/cross-file property, identifier, string, SCO request-spelling, VM, CFG, affine and Wasm passes. A pass either consumes the plan or explicitly declines.

Use export-root reachability with BindingIds. Do not replace the current under-approximation with a file-wide `hasOpaqueExportFlow` veto: Agent 9's PR #357 branch grew from 17 to 24 full-suite failures when unrelated mutation/spread/Object.assign shapes were treated as opaque without reachability. Preserve the true opaque-export negatives while keeping unrelated private yield.

### Required candidate evidence

A candidate must combine, on one exact current-main-based branch:

- Agent 11 primitive Get/destructuring/method/callable-flow red controls, with arithmetic as the genuine nonzero-yield control;
- Agent 3 current-main external active-caller source-parity red control;
- Agent 9 transitive ambient-call red/green controls, including pure helper and uninvoked nested closure positives;
- Stage 1 BindingId/reference-role and source-closure evidence;
- separate COO Chromium, actual SCO `createScoHandler` request-time/browser, and SNO CLI/Node validation;
- all affected transformation passes consuming the same plan or declining;
- full two-platform correctness, JSDoc, and sampled plus adversarial 2.5× performance evidence.

Until one such candidate exists, retain the fail-closed fallback and the **RELEASE-BLOCKED / NO-GO** decision. Do not create another parallel source-observer proposal or a pass-local integration PR.


## Agent 8 / Agent 24 identity and reaching-definition refinements (24 November)

The Stage 1 resolver's numeric `bindingId` is **Program-local**, not module-graph-global: `bindingCounter` resets inside each `resolveLexicalReferences(root, sourceType)` call. Two independently parsed modules can both assign local ID 1. Every binding, function span, effect and closure reference in a graph must therefore be qualified by `sourceUnitId` and `sourceGeneration`; a numeric BindingId or file path alone is not a global identity. The schema above uses a source-unit-qualified `BindingRef`.

A source unit should identify the runtime module/script instance, not merely the source filename. If the same source is loaded under distinct module URLs, query parameters, loader contexts or realms, it can represent distinct instances. `sourceGeneration` binds offsets and local IDs to the exact source/parser generation. For classic scripts, also carry `realmGroupId` and execution order when several scripts share one global lexical environment. ESM top-level bindings remain module-local.

**Classic-script group boundary:** Node 22.16.0 can evaluate `let window = {marker:17}` in one `vm` script and then resolve `window.marker` in a second script in the same context. A per-AST resolver of the second script alone classifies bare `window` as a `free-host-candidate`, even though runtime resolution is the first script's global lexical binding. This is a precision boundary, not a demonstrated compiler bug: the resolver already says `free-host-candidate` is not native-host proof. A multi-file classic-script graph must either construct a shared same-realm global-lexical environment with explicit execution-order premises or downgrade conflicting candidates to `Unknown`. Never compare per-file BindingIds across ASTs.

**Binding identity is not reaching callable definition.** A BindingId identifies a lexical storage location; it does not determine which function value reaches a call. For example:

```js
function outer() {
  function helper() { return 'declaration'; }
  var helper = function () { return 'initializer'; };
  return helper();
}
```

The call returns `'initializer'`. The `var helper = initializer` write is represented by a declaration record and parent VariableDeclarator, not a reference-role write. Duplicate function declarations can also share one BindingId while the later declaration wins. A call-target builder must inspect same-ID declaration records, their parent declarators/initializers, hoisting and source order, and duplicate function-declaration semantics. Either select the actual reaching callable definition under the supported ECMAScript scope or conservatively produce `Unknown`; do not treat every declaration sharing a BindingId as a simultaneous target.

Minimum donor controls:
1. Two modules whose first declarations both receive local ID 1; observing module A must not taint module B's same-numbered local binding. Include an actual import/re-export edge for A's function to ensure the qualified identity follows the exported value.
2. Two classic scripts in one realm where the first declares a global lexical name that shadows a host-name candidate in the second. With no shared realm/order proof, the second reference remains Unknown.
3. A function declaration followed by a same-ID `var` initializer, and duplicate function declarations; verify the call graph selects the runtime reaching definition or declines.
4. Re-run the 40-fixture/150-TypeScript Stage 1 suite after any resolver change; the current helper's green receipts do not cover all downstream call-target/value-definition semantics.

These are consumer/graph proof obligations, not a request to change the lexical resolver's established per-AST identity semantics or to create a second resolver.


## Agent 8 / Agent 24 host-argument and implicit-dispatch refinements (24 November)

### Unknown-call argument escape and reverse frame observation are separate edges

An unknown call can inspect a callable argument directly without invoking it:

```js
function hidden() { return 1; }
function run() { external(hidden); }
```

The host can run `Function.prototype.toString.call(fn)` on the argument. This creates a **host-held callable value** and protects that function's exact source/metadata even if the host never calls it. Independently, the same unknown call may inspect the active `run` frame or an ancestor through caller/stack facilities. A no-argument host callback can create a DynamicFrame effect without receiving any callable argument. A returned callable is a third, separate value-flow edge.

Represent all three explicitly:
1. **Argument capability:** callable argument -> `HostHeldCallable` / `UnknownHostArgumentEscape` -> its source and metadata closure.
2. **Activation:** unknown callsite -> reverse `DynamicFrame` edges -> active caller/ancestor source and semantic closure.
3. **Return value:** unknown call result -> receiving binding/value-flow graph; do not confuse it with the two effects above.

### Implicit host dispatch is not limited to CallExpression

Agent 24's Node 22.16.0 witness shows that `with (new Proxy({}, {has})) { x; }` can invoke a Proxy `has` trap during object-environment `HasBinding`. The trap calls an external sloppy callback that captures the active caller/ancestor and reads exact source. There is no CallExpression in the analyzed callable body. The resolver returns Unknown for `x`, but the Agent 9 ambient-call summary does not consume that result and does not mark the `WithStatement` itself ambient.

Treat `WithStatement` as an ambient host effect unless object-environment/Proxy internal-method semantics are explicitly modeled. Add `WithEnvironmentHasBinding` / `ProxyInternalMethod` producers. This is separate from direct eval and from ordinary member getter/Proxy-read effects.

### Agent 9 BindingId ambient-call donor: three additional false-safe boundaries

The 12/12 focused greens do not establish completeness. Agent 24 reviewed `workplace/agent9-ambient-call-bindingid.js` at commit `5ce9d24ff781b124324559430c317eba04e0603e` and supplied three concrete donor-level false-safes:

1. **Same-AST `var` initializer override:** a function declaration `helper` and a same-ID `var helper = callback` share one binding. The resolver records the initializer in declarations, not reference writes, so `writtenBindings` misses it. The prototype keeps the original pure function as the call target even though runtime invokes the callback. Any same-ID `var` initializer with a non-null initializer must invalidate the function target absent reaching-definition proof; a bare `var helper;` is different.
2. **Cross-script mutable `let` rebinding:** a first classic script declares `let helper = function...` and a second script in the same realm assigns `helper = getExternal`. The first AST sees a direct local call and no same-AST write, so the prototype marks it safe. The donor currently admits function expressions from any VariableDeclarator kind, despite its const-only description. Restrict to direct `const` as a first cut and still require a shared same-realm script-group write graph for cross-script claims.
3. **`WithStatement` Proxy `has` trap:** the executable walker skips nested function bodies and does not classify `WithStatement` itself as ambient. Proxy `has` can execute a host callback during identifier resolution without any explicit CallExpression.

These are false-safes in the research donor, not demonstrated current-main regressions. Do not port the 12/12 prototype as-is. Its next red-first controls must include all three boundaries, in addition to the current-main external active-caller witness. Duplicate function declarations are already marked ambiguous by the donor; preserve that behavior.

### Complete implicit-protocol operation inventory

Agent 24's Node 22.16.0 [seven-operation active-frame matrix](../im-results/agent24-implicit-dispatch-active-frame-matrix-2026-11-24.md) confirms exact caller-source capture from each of these constructs, with no CallExpression in the analyzed function body:

| Construct | Required event |
| --- | --- |
| `for...of` / `for await...of` | `IteratorDispatch` (`GetIterator`, `@@iterator`, `next`, async iterator and close/return) |
| `'x' in proxy` | `ProxyHasProperty` |
| `for...in` | `ProxyOwnKeys` and `ProxyGetOwnProperty` |
| `value instanceof C` with custom `Symbol.hasInstance` | `CustomHasInstance` |
| `delete value.x` on Proxy | `ProxyDelete` / `[[Delete]]` |
| object destructuring | `ProxyGet` / `AccessorCall` |
| array destructuring | `IteratorDispatch` |
| `with (proxy) { identifier }` | `WithBindingLookup` / `ProxyHasProperty` |

`ProxyInternalMethod` is a conservative catch-all and explicitly includes `[[HasProperty]]`, `[[OwnPropertyKeys]]`, `[[GetOwnProperty]]`, `[[Get]]` and `[[Delete]]`; `CustomHasInstance` remains a distinct user-method dispatch. Object spread/rest uses `ObjectCopyDispatch` with the relevant own-key/descriptor/get operations. All events can create reverse DynamicFrame effects as well as value/callback effects.

### Promise handler dispatch requires a host trust premise

Agent 8 reviewed Agent 39's branch-only `collectExportedCallableNodes` exception at branch head `a9e8b46bc2b05863612bd7a6bd0503c273843e63`. The exception treats syntactic `Promise.resolve(...).then/catch/finally` as safe when the identifier `Promise` is not lexically shadowed. A hostile host can patch `Promise.prototype.then` before module evaluation, inspect `onFulfilled.toString()`, then delegate to the original method. The AST still matches the syntactic native-looking shape. This is not a current-main defect; the exception is absent from current main. Do not introduce or retain such an exception without a separately justified, mode-specific pristine-intrinsics contract. Under COO/SNO/SCO hostile-runtime assumptions, Promise handlers and their callback arguments remain host-observable.

### Required candidate controls

In addition to primitive Get/iterator/method, direct active-caller, and source-unit/reaching-definition controls, a candidate must pin:
- unknown host call with a callable argument whose source is inspected but never invoked;
- no-argument unknown callback that captures the active caller/ancestor;
- `WithStatement` + Proxy `has` trap with no explicit call in the analyzed body;
- same-ID `var` initializer overriding a function declaration;
- mutable classic-script `let` callable overwritten by a later script in the same realm;
- pre-import patched `Promise.prototype.then` that inspects a callback and delegates to native.

Keep positive yield controls independent: pure local helpers, uninvoked nested closures, and ordinary arithmetic must still demonstrate nonzero rewrite yield where their closure is proven. Do not replace these precise effects with a file-wide opaque veto.


## Agent 8 / Agent 24 refinements: CFG, realm binding, and implicit internal methods

### Reaching definitions require control-flow points

A `sourceOrder` field alone is insufficient. Function declarations are instantiated before the body executes; `var` initializers are runtime writes when their statements execute and may be conditional, nested, or occur after an earlier call. The same BindingRef can therefore have different reaching callable definitions at different callsites. A `DefinitionRef` must be evaluated at a CFG/control-flow point (including branch guards and hoisting), or the call target becomes Unknown. A same-ID non-null `var` initializer invalidates a prior function-declaration target unless a reaching-definition proof shows it cannot reach the call. A bare `var helper;` is not an initializer write. Duplicate function declarations may be resolved using ECMAScript instantiation winner semantics or conservatively made Unknown.

### Classic-script shared lexical bindings need RealmBindingRef

`SourceUnitRef + localBindingId` identifies a reference resolved inside one Program, but a later classic script can reference a global lexical binding created by an earlier Program. A shared group analysis needs a `RealmBindingRef` keyed by `realmGroupId` plus the defining source unit/declaration, and it must attach later-script reads and writes to that same identity. A mutable top-level `let` can be rebound by a later script; even top-level `const` callables are externally reachable by later scripts and must not be considered private merely because one AST has only local call uses. Treat top-level classic-script lexical callables as externally reachable/source-observable unless the entire realm group, execution order and closed-world entrypoint premise are explicit. ESM top-level bindings remain module-local; CommonJS top-level bindings remain wrapper-local.

### Broaden implicit host-dispatch effects

The existing `PrimitiveIterator` label is too narrow for all iterator and object-environment operations. Runtime syntax can invoke user code without an explicit CallExpression:

- `for...of`, array patterns, spread and iterator closing can invoke `GetIterator`, `@@iterator`, `next` and `return` (general `IteratorDispatch`, not only primitive iteration).
- `'x' in proxy` invokes Proxy `[[HasProperty]]`.
- `for...in` can invoke `[[OwnPropertyKeys]]` and `[[GetOwnProperty]]`.
- object spread/rest can invoke `[[OwnPropertyKeys]]`, `[[GetOwnProperty]]` and `[[Get]]`, including getters.
- `with` identifier resolution invokes object-environment `HasBinding`, `Symbol.unscopables` and potentially Proxy/accessor traps (`WithBindingLookup`).
- Promise `.then/.catch/.finally` callback dispatch is host-controlled unless the Promise constructor and methods are covered by an explicit pristine-intrinsics premise.

Add distinct event producers or conservatively map them to `UnknownHostEffect`. The current main already has explicit `WithStatement` vetoes in `src/ast.js`, `src/properties.js`, `src/identifiers.js`, `src/strings.js` and `src/source-observer-islands.js`; preserve those fail-closed checks. Agent 9's BindingId donor does not preserve the With veto and is false-safe for a Proxy `has` trap.

### ExactSource and SourceBytes are separate effect dimensions

Keep four positive `ObservationEffect` dimensions: `ExactSource`, `SourceBytes`, `FramePosition` and `CallableMetadata`; `UnknownHostEffect` is the conservative epistemic fallback, not a fifth positive observation. `ExactSource` covers callable source text (`Function#toString` and selected diagnostics). `SourceBytes` covers distributed file bytes/serialization (loader, inspector, browser transfer, DOM mirrors and SRI). Their edit closures differ materially: callable-span closure versus provenance-proven whole-source-unit closure. Do not merge them or silently omit distributed-source gates.

### Callsite identity

The `hostArgumentEdges` map is keyed by qualified `SourceSpanId` (or a dedicated `CallSiteRef`), never an unqualified string. Source spans, callsites, BindingRefs, DefinitionRefs and effect closures all carry source-unit and generation identity.


## Agent 8 Web IDL conversion refinement (24 November)

Web IDL string conversion is an explicit host-effect producer, not a generic JavaScript method-name rule. Add `WebIDLStringConversion`, `WebIDLNamedPropertySet` and `WebIDLAttributeSet` events (or one structured conversion event with equivalent operation metadata). A record must retain interface/receiver identity, effective method or descriptor provenance, conversion target (`DOMString`, `USVString`, `ByteString`, etc.), operation form, operand position and argument index. When the converted value is a function, native ECMAScript string conversion can expose exact function source; when it is an object, ToPrimitive may invoke user hooks. Do not assume every Web IDL conversion is source-observing; prove the value and effective operation.

Keep the Storage routes distinct:

1. `storage.setItem(key, value)` is an explicit method call; both arguments undergo DOMString conversion, subject to the actual method identity/override.
2. `storage[key] = value` first applies ECMAScript `ToPropertyKey` to `key`, then the Storage legacy named-property setter converts only `value` to DOMString. This does not look up or invoke the JS-visible `storage.setItem` property.
3. A function-valued computed key has its own `ToPropertyKey` conversion before the named setter; analyze it independently from the assigned value's DOMString conversion.

Replacing `Storage.prototype.setItem` or defining an own `localStorage.setItem` can intercept explicit method calls while the native named-property setter still runs and stringifies the assigned value. This is why a method-name-only `.setItem` veto is unsound. The current test evidence includes the [Storage value-conversion matrix](../im-results/storage-value-coercion-hooks-2026-11-23.md), the [three-path Storage source report](../im-results/agent19-sco-create-handler-storage-source-2026-11-23.md), and the [ten-sink Web IDL capability matrix](../im-results/webidl-domstring-source-capability-matrix-2026-11-23.md).

The same structured conversion event should cover `Window.name` attribute assignment and bounded `Headers` / `URLSearchParams` constructor/method paths. It should also cover native DOM/CSSOM sinks from the ten-sink matrix: `CSSStyleDeclaration.setProperty`, `Element.setAttribute`, `CSS.escape`, `Element.id`, `Element.textContent`, `Document.createTextNode`, `Document.createComment`, `Element.insertAdjacentText`, `Element.append` and `Element.replaceChildren`. These are native Web IDL conversions, not a denylist of method names.

The four positive `ObservationEffect` dimensions remain separate from the host-effect event, with `UnknownHostEffect` as fallback: a Web IDL conversion may produce `ExactSource` when a callable is stringified, `SourceBytes` only when a distributed source mirror is read, `UnknownHostEffect` when user conversion hooks execute, or neither when the conversion is proven inert. Keep the callable/receiver/value closure and native descriptor identity in the plan.


## Agent 8 deployment-boundary review for source-observer islands (24 November)

The existing island proof is a closed **supplied ESM graph**, not necessarily a closed browser deployment. `proveSourceObserverIslands` rejects every supplied file that is not ESM (`src/source-observer-islands.js:184–195)); therefore it cannot receive the host HTML asset. `core.js` scans `hasPinnedLocalJavaScriptIntegrity(prepared)` before the island proof, but if the HTML is omitted from `prepared`, an SRI attribute in the host page is invisible. The POSIX `resolveKnownImport` path resolver (`source-observer-islands.js:155–159`) also does not consume the browser import-map resolution table. An external import map can therefore make the runtime module graph differ from the path graph the proof sees.

A browser/COO candidate must choose one explicit boundary:

1. include the host HTML and import-map manifest in the input contract, resolve every specifier to its actual browser URL/module instance, and validate that no external SRI pins a selected module; or
2. require an auditable deployment premise such as `hostHtmlIncludedAndNoSRI` plus a canonical resolved-module map/import-map generation, and refuse browser/COO island use when either is absent.

The existing all-ESM option cannot itself prove the host HTML premise. A Node ESM positive does not imply browser deployment closure. The plan's `SourceUnitRef` therefore includes actual `resolvedURL` and `resolutionContextId`, and the graph includes a deployment manifest identity. `SRIIntegrityPin` is a `SourceBytes` producer; `DOMSourceSerialization`/`DOMSourceRead` are also SourceBytes producers when the deployment manifest maps the readable mirror to the source unit. `BrowserImportMapResolution` determines module instance identity and closure.

Required browser negatives before any COO claim:
- host HTML contains SRI for a selected module: default group veto preserves the bytes, and the island option refuses absent an explicit no-SRI manifest;
- an import map remaps a relative/bare dependency to an unlisted URL/module: the proof refuses rather than resolving only by POSIX path.

This is a deployment-proof limitation, not a demonstrated current-main behavior regression under the existing opt-in caller contract. The Node-only source-island fixture remains a narrower positive. No new PR or compiler patch is proposed.



## Agent 50 / Agent 1 implicit-dispatch convergence and current-main falsification (24 November 2026)

**Status:** stronger current-main correctness evidence and a broader runtime event inventory; still an architectural contract and NO-GO, not an implementation or release result.

### Current-main transform evidence supersedes the earlier donor-only uncertainty for these operation shapes

Agent 1's source-pinned test-only matrix uses the current-main production blobs `src/properties.js` `bda3c6097e2679f59bd003fa0aed3e0291d4ba4c` and `src/core.js` `8d33996821650de540b87502baff00a9e7ea99c7`. Test branch `agent1-forof-active-frame-transform-check-20261124`, commit `f3d73309e0d8ba4cc0f1aaf62ecd60b789457a24`, changes no production source. Run [45312383489](https://github.com/FlareZ123/obfs/actions/runs/45312383489) exercised 13 implicit-dispatch constructs × COO/SNO on Ubuntu and Windows (26 cases per OS): **24 exact-source mismatches and 2 source-parity passes on each OS**.

The 12 mismatching constructs are:
- `for...of` / IteratorNext;
- `in` / Proxy `has`;
- `for...in` / Proxy `ownKeys`;
- `for...in` / Proxy `getPrototypeOf`;
- `instanceof` / custom `Symbol.hasInstance`;
- `delete` / Proxy `deleteProperty`;
- object destructuring / Proxy `get`;
- array destructuring / IteratorNext;
- assignment / Proxy `set`;
- assignment / accessor setter;
- arithmetic / `Symbol.toPrimitive`;
- `await` / PromiseResolve thenable `then` getter.

Each mismatch preserves return values while the tested property transform changes both the source-observed owner's key and an unrelated positive-control owner's key. The two `with` / Proxy HasBinding parity passes are **not** selective proof: current `WithStatement` guards force `properties:0` and leave the unrelated field unchanged, confirmed by [45312608205](https://github.com/FlareZ123/obfs/actions/runs/45312608205). The final matrix file's strict project/external/paired-budget JSDoc passed on both OS in [45312562606](https://github.com/FlareZ123/obfs/actions/runs/45312562606). This evidence demonstrates a current-main property-pass source-observation gap for the stated sloppy CommonJS Node cases, not a universal ECMAScript or browser claim.

SCO has three separate current-main Node/CommonJS `createScoHandler` response mismatches, each with unrelated positive property yield and preserved return value:
- IteratorNext / ForOf: [45310430205](https://github.com/FlareZ123/obfs/actions/runs/45310430205);
- PromiseResolve thenable getter: [45313400478](https://github.com/FlareZ123/obfs/actions/runs/45313400478), with focused JSDoc [45313505327](https://github.com/FlareZ123/obfs/actions/runs/45313505327);
- arithmetic ToPrimitive: [45313693556](https://github.com/FlareZ123/obfs/actions/runs/45313693556), with focused JSDoc [45313771390](https://github.com/FlareZ123/obfs/actions/runs/45313771390).

The SCO controls use a CommonJS entry and the actual generated HTTP response. Classic-script attempts are byte-identical/no-op in the tested fixture because the property pass is skipped; that is not evidence of safe selective transformation. Strict ESM, async iterator source capture and browser DevTools/debugger behavior remain unestablished. See `im-results/agent1-current-main-implicit-dispatch-source-matrix-2026-11-24.md`, `im-results/agent1-sco-forof-active-frame-source-observer-2026-11-24.md` and `im-results/agent1-classic-script-forof-source-parity-2026-11-24.md`.

### Agent 50 runtime extension: generic coercion, PromiseResolve and all Proxy traps

The executable [runtime report](../im-results/agent50-implicit-dispatch-extension-2026-11-24.md) and [reproducer](../sims/agent50-implicit-dispatch-extension.js) record **22/22 local Node 22.16.0 controls**, with no production code or CI changes. The 22 controls comprise 10 ToPrimitive/ToPropertyKey cases, 3 PromiseResolve thenable-assimilation cases, 7 Proxy internal-method/call/construct cases, and 2 multi-effect composition cases. Nine sloppy ToPrimitive/ToPropertyKey functions expose exact source through a callback despite no CallExpression in the analyzed function. Strict-mode ToPrimitive and thenable-getter controls establish FramePosition only, not callable-object/source capture. Object.* Proxy trap controls establish active-frame name/file/line/column but do not recover the callable through CallSite.getFunction; Proxy apply/construct have separate callable/source capture controls. CallableMetadata is not independently asserted.

The earlier Agent 24 runtime matrix and Agent 50 extension together cover all 13 standard Proxy traps across two separate Node/V8 scripts, not one combined run and not a browser audit:

| Proxy internal method | Standard trap | Witness operation |
| --- | --- | --- |
| [[Get]] | get | object destructuring |
| [[Set]] | set | property assignment |
| [[HasProperty]] | has | in operator / with binding |
| [[Delete]] | deleteProperty | delete expression |
| [[OwnPropertyKeys]] | ownKeys | for-in enumeration |
| [[GetOwnProperty]] | getOwnPropertyDescriptor | for-in / descriptor lookup |
| [[GetPrototypeOf]] | getPrototypeOf | for-in enumeration |
| [[DefineOwnProperty]] | defineProperty | Object.defineProperty |
| [[SetPrototypeOf]] | setPrototypeOf | Object.setPrototypeOf |
| [[IsExtensible]] | isExtensible | Object.isExtensible |
| [[PreventExtensions]] | preventExtensions | Object.preventExtensions |
| [[Call]] | apply | proxy function call |
| [[Construct]] | construct | proxy constructor call |

### Event, identity and edge consequences for the one shared plan

1. **Generic coercion is an implicit dispatch producer.** Add ToPrimitive/ToPropertyKey events with abstract operation, hint (default/number/string), operand role and nested path, trigger value and hook provenance. Arithmetic, relational comparison, computed member/pattern/object keys, `in`, and computed delete keys can invoke user hooks without a CallExpression. An unknown object coercion defaults to `UnknownHostEffect` unless the effective hook/receiver is proved under a mode-specific host contract.
2. **PromiseResolve is not ordinary Promise handler dispatch.** During `await` or async return of a thenable, the engine synchronously Gets `then` while the async function's activation is still present; the getter can observe the active frame. The later thenable method runs as a deferred job. Model `PromiseResolveThenableGet` and `PromiseThenableJob` separately. `PromiseHandlerDispatch` (for `.then/.catch/.finally`) is a third event and remains host-controlled if Promise intrinsics can be patched before import.
3. **Proxy internal-method coverage is an explicit 13-trap inventory.** A generic `ProxyInternalMethod` record must carry the exact internal method/trap identity. Do not assume Object/Reflect intrinsics are inert: receiver provenance can route them into a Proxy trap. `[[Call]]`/`[[Construct]]` may share existing call/new summaries only if the Proxy receiver/trap path is represented.
4. **One source span can emit multiple effects.** Both operands of one `+` may trigger separate ToPrimitive operations; a computed member expression can trigger ToPropertyKey on its key and Proxy `[[Get]]` on its receiver. Use a unique `HostEffectId` per event and preserve typed operand path/role.
5. **Three graph relations must remain separate.** The object that triggers coercion/Proxy/thenable dispatch is not necessarily the callable/source value the host observes, and neither is the active function frame. Store trigger-value edges and observed-value edges separately from reverse ActiveFrameEdges. Do not encode all three as hostArgumentEdges.
6. **Non-function activation frames exist.** A callback may observe script/module evaluation, class static-block or eval frames. Use a generic ActivationRef/FrameRef union; a function-only DefinitionRef map is incomplete.
7. **Callable definitions are not always lexical bindings.** Object methods/accessors, class methods/accessors/constructors/fields and anonymous function expressions need their own CallableDefinitionRef tied to source span plus owner/key identity. A BindingRef for the owner object is not the identity of the method function object.
8. **Host dispatch provenance must be explicit.** Record whether dispatch resolves to a local definition, a verified native intrinsic under a versioned contract, a known override, or an unknown/mutable operation. An unshadowed spelling such as Promise, Reflect.get, Response or Storage.prototype.setItem does not prove pristine native behavior.
9. **DOM source serialization is distinct from Web IDL string conversion.** Add DOMSourceSerialization/DOMSourceRead effects for outerHTML/innerHTML, textContent/node traversal, XMLSerializer, Range/cloned contents and imported helpers receiving Document/Node/Range. Deployment manifests must also map inert host-HTML/DOM source mirrors to their source units, or refuse the affected closure.
10. **Execution partition and request generation are part of identity.** COO units execute in the client partition; SNO units execute in the server partition; SCO contains distinct server and client units plus cross-partition fetch/response edges. SCO request-specific emitted variants need their own requestVariantGeneration/sourceGeneration. Recompute the plan after request-time edits or use a validated edit map that invalidates every affected span/effect/definition; never share a mutable plan across concurrent requests.

The revised typedef block above is the canonical *proposed* schema extension. It is not wired into the compiler. Existing source-island code remains a separate bounded donor; its eligibility should eventually consume this same plan rather than build a second module/binding/observer authority. The COO deployment manifest must account for host HTML, import maps, SRI and source mirrors. The SCO plan must be partition-aware. SNO's hostile owner/runtime remains outside any local self-integrity guarantee.

### Decision and next evidence boundary

The new evidence strengthens the NO-GO rather than selecting a candidate. Do not port a pass-local ToPrimitive/Proxy/Promise guard or expand the existing With/file-wide veto as a substitute for the graph. No new parallel PR or broad gate is justified. Agent 3 remains the integration owner and Agent 10 the sole comprehensive acceptance owner. The next candidate decision must still identify one exact current-main base, donor set, consumer list, focused red/green and unrelated positive-yield controls, mode-specific COO browser/SCO actual-handler/SNO CLI coverage, then one full immutable two-platform gate and strict 2.5× adversarial performance evidence. Until then preserve the existing fail-closed fallback and keep **NO-GO / RELEASE-BLOCKED**.


## Verified current-main consumer map (24 November 2026 source audit)

This map records where the existing boolean/syntactic observer result currently gates transformations. It is a source-code audit of main, not proof that every callsite is semantically complete.

| Consumer | Current gate | Required shared-plan integration |
| --- | --- | --- |
| `src/ast.js:216` `observesFunctionSource` | Central syntax recognizer with AST-local cache; it does not represent the new implicit-dispatch active-frame graph. | Retain syntax detectors as effect producers, but emit qualified HostEffectRecords/edges into the same immutable plan. |
| `src/properties.js:378` `proveLocalObject` | Local object/alias proof returns null when the local AST scanner observes function source. | Consume callable/value/activation effects and close over only affected owner/callable spans where proved. |
| `src/cross-properties.js:2224` | Any module with a recognized function/distributed-source observer declines the cross-file property graph. | Use source-unit-qualified identities and per-effect cross-file semantic closure; preserve unrelated safe owners. |
| `src/identifiers.js:44`; `src/strings.js:62` | Each transform independently returns original source when its local AST scanner fires. | Consume the same ExactSource/CallableMetadata/UnknownHostEffect closure; do not invent pass-local observer vocabularies. |
| `src/core.js:2008-2049, 2094-2248` | Computes `remoteSourceObserver` / `hostLockSourceObserver`; disables cross-file properties, string encoding and identifier renaming; blocks selected VM/CFG/Wasm/affine backends; allows only selected local-property source islands through a separate exception. Classic scripts also skip several transforms. | Build one plan before edits, pass the same source generation to every consumer, and make unsupported spans/closures explicit. The island policy must consume the plan rather than become a second resolver. |
| `src/statement-flow.js:189`, `src/expression-vm.js:155`, `src/register-vm.js:97`, `src/wasm-i32.js:232`, `src/affine-native.js:117,232` | Each experimental backend independently calls `observesFunctionSource` (plus backend-specific checks). | Each backend must consume the shared plan or explicitly decline selected functions whose source/activation closure is affected. |
| `src/sco.js:583-590,678-685` | Handler construction computes `interfileSourceObserver`; when recognized it suppresses request-time literal spelling variation and passes `properties:false, identifiers:false` to per-request single-file `obfuscateFiles`. | Bind the plan to server/client partition and request variant generation; include host-provided iterators/coercion/thenables and recompute or invalidate after every request-time edit. |

The current implementation has no `src/source-observation-plan.js` or equivalent shared graph module. `src/source-observer-islands.js` is a separate opt-in ESM grammar/proof with its own import/binding checks; it is a bounded donor, not the shared plan. The existing boolean scanner is therefore consumed at several independent levels, and a local fix in only `properties.js` would not establish consistent behavior across the other passes.

### Pipeline consequence

The plan must be computed from the exact original source units before any backend or rename pass changes offsets. The pipeline must either:
- keep the immutable plan tied to that generation and let each consumer use its original spans; or
- produce a validated edit map and invalidate/recompute all affected bindings, callable definitions, host effects, source spans and closures after edits.

SCO requires a fresh request/variant identity because `createScoHandler` performs per-request spelling variation and calls the single-file compiler on the resulting source. Never reuse a mutable plan or an observer allowlist across concurrent requests. This consumer audit narrows the implementation inventory; it does not select a compiler candidate or relax the NO-GO.


### Edge semantics and effect-closure rules

A HostEffectRecord is an operation occurrence, not a complete statement of what it observes. The graph must preserve three independent relations:

| Relation | What it identifies | Example |
| --- | --- | --- |
| Trigger-value edge | The runtime value whose operation causes dispatch | host-supplied iterable, Proxy receiver, coercion object, thenable, Web IDL input, Document/Range |
| Observed-value edge | The callable/source/mirror actually read, stringified or serialized | function passed to an unknown host argument, function converted to DOMString, source unit copied through DOM |
| Active-frame edge | Every activation whose source, coordinates or callable metadata is visible while dispatch occurs | current hidden function, its active ancestors, top-level script/module, class static block or eval frame |

These relations are not interchangeable. For `hidden(value) { return value + 1; }`, the coercion object is the trigger; a callback may observe `hidden` through the active-frame edge. For `external(hidden)`, the function is an observed host-held value even if the host never invokes it; the active caller is a separate possible observation. For `await thenable`, the thenable is the trigger and the synchronous `Get("then")` occurs while the async activation is still active; invocation of the returned then method is a later job and must not inherit the original active frame unless a separately proved async-context edge exists. For DOM serialization, the observed value is a SourceUnit/SourceMirror, not necessarily a callable.

Each operation span may emit multiple HostEffectIds. Both operands of a binary operator may coerce independently; a computed member may perform ToPropertyKey on its key and then Proxy `[[Get]]` on its receiver. Nested arrays, records, iterators and Web IDL dictionaries require operand paths. A callsite-level set of callable definitions is only a lossy projection and cannot be the authoritative edge store.

The effect bits also imply different edit closures:

- **ExactSource:** close over the exact callable source span for Function source observation. Include all edits inside that callable's emitted source, including nested source and captured syntax text, not only the owner's property key.
- **SourceBytes:** close over the entire source unit only when provenance proves that distributed bytes, DOM/loader mirrors or SRI-pinned bytes are readable.
- **FramePosition:** close over every edit that can change the observed frame/callsite coordinates under the declared runtime/formatter contract. A width-preserving edit is admissible only with a separately validated coordinate invariant; it does not satisfy ExactSource.
- **CallableMetadata:** close over edits to function names, lengths, descriptors and identity-bearing metadata that the selected host API exposes. Do not infer this bit from source-text observation.
- **UnknownHostEffect:** if receiver, dispatch provenance, trigger/observed value or active-frame set is unresolved, refuse the affected semantic closure (or the entire declared group when closure cannot be bounded).

The operation's source span, the active activation span, the observed callable/source unit and the trigger operand must all retain source-unit/generation qualification. The same HostEffectId must not be reused across source generations or SCO request variants.


## Agent 3 native intrinsic callback-dispatch evidence (24 November 2026)

The new intermediate donor is on branch [`agent3/intrinsic-callback-dispatch-probe-20261124`](https://github.com/FlareZ123/obfs/tree/agent3/intrinsic-callback-dispatch-probe-20261124). It adds a Node 22.16.0 runtime probe and a focused current-main compiler differential; no production code was changed.

### Runtime witness

The runtime script/report cover eight synchronous native callback paths plus one deferred Promise control:
- JSON.stringify `toJSON`, replacer; JSON.parse reviver;
- Array sort comparator, String replace callback, Array map callback, Map forEach callback and Array.from mapFn;
- Promise.then handler as a deferred no-active-frame control.

All eight synchronous paths expose the active hidden frame name/line/column through V8 CallSite metadata. In this harness `CallSite.getFunction()` is false for those frames. JSON replacer and reviver additionally reach the active sloppy `hidden()` function through the caller chain and retrieve its exact `Function.prototype.toString` source, including `owner.secretField`. The `toJSON` caller chain stops at the object method even though the hidden frame remains visible in stack metadata. Do not generalize exact-source capture to the other callbacks.

A manual same-line source pair shortening `longPrivatePropertyName` to `x` preserves the return value but changes the observed callback frame column 63→41. This is a Node/V8 coordinate witness.

### Current-main COO/SNO differential

Focused manual-validation run [45315861729](https://github.com/FlareZ123/obfs/actions/runs/45315861729) completed successfully on Ubuntu and Windows, Node 22.23.4. The test-only branch checks eight operations × COO/SNO (16 diagnostic controls). Every control asserts:
- positive property rewrite yield;
- unrelated `plain()` field renamed;
- ordinary return value preserved;
- exact hidden source differs for JSON replacer/reviver, or active hidden-frame column differs for the other six synchronous callback paths.

The unchanged production blobs are `src/ast.js` `c227e6e604635a42663af745fd0cfb194b215a67`, `src/properties.js` `bda3c6097e2679f59bd003fa0aed3e0291d4ba4c`, and `src/core.js` `8d33996821650de540b87502baff00a9e7ea99c7`. Strict project JSDoc, external JSDoc and paired-budget evaluator JSDoc passed on both OS. This establishes additional current-main Node/CommonJS COO/SNO source-observation mismatches, not browser/SCO behavior or full-suite/performance acceptance.

### Plan consequence

Add `IntrinsicCallbackDispatch` as a distinct event producer for verified native built-ins that invoke user code. The event must identify the effective intrinsic, receiver, callback identity and role (explicit argument vs object-provided method), callback timing, dispatch provenance and host contract. It contributes an observed-value edge for the callback/method and an active-frame edge only while the original activation is actually visible. JSON replacer/reviver establish ExactSource in this sloppy Node witness; the other synchronous callbacks establish FramePosition only. A deferred Promise.then callback does not inherit the completed caller frame, though its callback argument remains a separate HostHeldCallable edge.

A familiar spelling is not native identity: a patched JSON/Array/String/Map/Promise method is unknown or mutable unless the mode-specific HostContractRef verifies the effective operation. A verified native intrinsic is not necessarily callback-free. Keep this evidence as an intermediate donor; it does not select a compiler candidate or alter the NO-GO / RELEASE-BLOCKED decision.


## Agent 12 Storage and Window.name Web IDL source sinks (23 November 2026)

These are **COO Chromium** witnesses on research branches, with relevant current-main source pins independently verified by Agent 1. They add a distinct Web IDL conversion producer family; they do not establish SCO/SNO behavior.

### Storage and Window.name behavior

The HTML Standard declares `Storage.setItem(DOMString key, DOMString value)`. Both arguments are conversion points. A function passed as key or value is converted to its native function-source string; the string can be read back through `Storage.key(index)` or `getItem`. The same applies to `localStorage` and `sessionStorage`. The Storage named-property setter `localStorage[name] = value` is another conversion path. `Window.name` is a DOMString IDL attribute; `window.name = inspectWindow` stores the function source, which is visible on readback.

Browser evidence [45162975795](https://github.com/FlareZ123/obfs/actions/runs/45162975795), research branch `agent12/storage-source-observation-20261123`, browser head `cdf7989f6e72f7f63ea6711f291c08cc2fcf6355):
- native/emitted source mismatch for localStorage.setItem value, sessionStorage.setItem value, Storage named-property value, Storage.setItem key/readback, and Window.name;
- function numeric results preserved;
- independent private helper still rewrites and returns 7;
- metrics: literals 0, objects 0, properties 0, bindings 4. This is an **identifier-mangling** source-parity failure, not a property-rewrite failure.

Relevant current-main source blobs independently verified identical to the browser donor:
- `src/ast.js`: `c227e6e604635a42663af745fd0cfb194b215a67`
- `src/identifiers.js`: `c7e2ed1469381c5bc6dc42cef9a6ca8bfa347f0f`

Focused Node tests [45163858773](https://github.com/FlareZ123/obfs/actions/runs/45163858773) passed on Ubuntu and Windows, including same-file sinks, cross-file export boundary, shadowed local `localStorage/window` names, primitive values and unrelated-helper yield. The overall external JSDoc gate had unrelated pre-existing errors. The Chromium browser step passed; the larger manual Web IDL workflow later failed on two unrelated Blob positive-yield tests. Do not describe the whole workflow as green.

### Dispatch identity is part of the sink proof

The follow-up donor `agent12/storage-dispatch-controls-20261123` separates four cases:
1. native inherited `localStorage.setItem`;
2. own-instance `setItem` override;
3. modified `Storage.prototype.setItem`;
4. a native `Storage.prototype.setItem` alias captured before prototype replacement and later invoked with `.call`.

The current scanner misses all four. Real Chromium confirms that native inherited and captured-native calls stringify the function and expose source mismatch; own/prototype wrappers preserve the function reference and do not store a string. Focused validation [45181276801](https://github.com/FlareZ123/obfs/actions/runs/45181276801) passed on Ubuntu and Windows, and the new browser step [45181268302](https://github.com/FlareZ123/obfs/actions/runs/45181268302) passed. The larger browser workflow later failed at an unchanged bound-runtime-interception assertion; that is separate from the Storage dispatch step.

Therefore a member-name rule for `.setItem` is insufficient and would over-refuse overrides. The plan must prove:
- genuine unshadowed Storage receiver identity;
- effective dispatched method identity and prototype/own-property provenance;
- whether the method is native inherited, a captured native alias, or a user override;
- argument position (both key and value);
- conversion target (DOMString);
- whether the argument is primitive or a callable/source value.

The same identity requirement applies to the Storage named-property setter and native `Window.name` accessor. A shadowed local binding named `localStorage` or `window` is not a browser sink. If an override itself stringifies a function, model that as a separate user-code effect; do not mislabel it native Web IDL conversion.

### Dynamic-frame relation and source-byte effect

The plan's `ActiveFrameEdge` is explicitly the reverse **DynamicFrame** relation: a callback may observe an active caller/ancestor frame without the callable escaping through heap/value flow. Keep this relation separate from trigger-value and observed-value edges. Its observation effects may include exact function source, source bytes, callable metadata and source coordinates, each under the strictness/engine/host contract that actually permits the observation.

`SourceBytes` is now a separate ObservationEffect from `ExactSource`: exact function source text and whole-source byte/mirror observation are different closure obligations. The latter may require closing over a whole source unit, HTML/DOM mirror, loader response or integrity-pinned bytes; a function-local span closure is not enough.


### SCO confirmation for native intrinsic callback dispatch

The actual `createScoHandler` HTTP-response differential is now recorded on the intermediate Agent 3 branch. Focused run [45317205047](https://github.com/FlareZ123/obfs/actions/runs/45317205047) passed on Ubuntu and Windows (Node 22.23.4), with all eight classification controls green. In this SCO fixture:
- **ExactSource mismatches:** JSON.stringify replacer and JSON.parse reviver;
- **FramePosition mismatches:** Array.sort comparator, Array.map callback and Array.from mapFn;
- **Frame-column-stable controls:** JSON.stringify `toJSON`, String.replace callback and Map.forEach callback.

All eight cases retain positive owner-property and unrelated-helper rewrite yield and preserve ordinary return values. The three stable controls prove only that the measured frame column did not change in those particular variants; they do not prove all source/metadata/coordinate effects safe. The earlier dynamic JSON text fixture was invalid for this classification because it caused an unrelated unknown-input refusal; the final test uses a statically known primitive JSON string. This is Node/CommonJS actual-handler evidence, not browser evidence. See the branch report for the exact test and run boundary.

Combined with the focused COO/SNO differential, five callback operations now have current-main Node/CommonJS mismatch evidence in all three modes. The other three are not universal failures: their measured SCO frame columns were stable in this fixture, while their COO/SNO tests still changed the measured observation. Preserve the mode-specific distinction.


### Web IDL conversion composes with ECMAScript coercion; dispatch identity is mandatory

A Web IDL `DOMString` conversion is not interchangeable with a generic ToPrimitive event:
- If the input is a function object, the native Web IDL conversion exposes its exact function source text.
- If the input is a non-primitive object, ECMAScript ToString/ToPrimitive may invoke `@@toPrimitive`, `toString` or `valueOf`; record a nested `ToPrimitiveDispatch` linked to the `WebIDLStringConversion` by `causedByEffectId`.
- If the input is definitely primitive, no callable-source edge is created; do not veto unrelated transformations.
- The sink event itself must carry the native interface, receiver, effective operation/accessor, conversion target and argument/property position. Member spelling alone is never proof of native dispatch.

Examples:
- `Storage.prototype.setItem`: separate DOMString conversions for argument 0 (key) and argument 1 (value); a function in either slot exposes source. A captured native alias remains the native operation after prototype replacement. An own/prototype wrapper is a different user-code dispatch and must not inherit the native sink summary.
- Storage named-property assignment: `ToPropertyKey` on the property key (if non-primitive) is distinct from DOMString conversion of the assigned value.
- `Window.name`: native Window attribute setter converts the assigned value to DOMString; a shadowed local `window` or replaced accessor is not this native sink.
- A custom `Symbol.toPrimitive` on an object passed to Storage or Window.name can produce both a WebIDLStringConversion event and a nested ToPrimitiveDispatch, with its own trigger value and DynamicFrame edges.

Use `causedByEffectId` only for actual nested/deferred causality, not as a substitute for source-unit/operand identity. It allows the plan to represent (for example) a PromiseResolve thenable getter followed by a deferred thenable job, or a Web IDL conversion that invokes user-defined coercion. Multiple sibling effects may still share one operation span without a parent-child relation.


## SourceBytes and embedding/reader provenance: browser witness

Agent 43's reproducible Chromium probe `sims/browser-dom-blob-source-parity.js` (current-main file blob `b1c4f1631f8b76d1f14c631ec15211a70b808f63`; final harness commit `ca137356713babb6cff4d63feb838f9181e2f4db`) establishes a separate browser source-bytes channel. It is a manual native-vs-shortened-source probe, **not** an obfuscator compiler differential: The focused Chromium probe itself passed all 18 observations in [manual-browser run 45159146125](https://github.com/FlareZ123/obfs/actions/runs/45159146125) on commit `ca137356713babb6cff4d63feb838f9181e2f4db`; the overall workflow failed later at the unrelated `test/bound-runtime-interception-browser.js:52` assertion (`0 !== 2`). Do not report the overall workflow as green or attribute that failure to SourceBytes.

- Inline module bytes appear in `document.documentElement.outerHTML` and `XMLSerializer.serializeToString(document)`; the same module served as a Blob module does not appear in those DOM serializations.
- A Blob ESM module can still read its own bytes using `fetch(import.meta.url)`; an aliased `fetch` plus `Response.prototype.text.call` also reads the source. The companion `sims/browser-dom-external-module-source-parity.js` (blob `821e6d89e4431fd432245b5fef51ff470e78efc9`) shows the same self-fetch and aliased self-fetch behavior for inline and external ESM: inline modules expose source through DOM serialization, external modules do not, but both can fetch their own module/document URL.
- `document.title` is a negative reader control.
- A separate Blob ESM `Error.stack` control exposes a changed source column after shortening a preceding property; this is FramePosition, not SourceBytes.

Agent 1's scanner audit reports that current `observesDistributedSource` has broad reader names such as `fetch`, XMLHttpRequest, FileReader and CacheStorage, but no explicit `outerHTML`, `XMLSerializer`, `serializeToString`, `documentElement`, `import.meta` or `currentScript` handling. Do not respond with a blanket `fetch` name veto: it would also catch unrelated JSON API fetches and sacrifice yield.

The `SourceMirrorRef` in the plan must therefore record:
- the exact SourceUnitRef being mirrored;
- embedding kind (inline script, external URL, Blob URL, data URL, loader response);
- embedding identity (script element, resolved URL, Blob URL, loader key);
- the concrete reader operation and host contract.

A SourceBytes effect closes over the whole source unit only when the provenance proves the relevant mirror/URL is readable. DOM serialization exposes inline embedding text, not arbitrary external/Blob bytes. `fetch(import.meta.url)` is a source-byte read for the module's own resolved URL, including Blob URL; an unrelated fetch is not. Keep SourceBytes, ExactSource, and FramePosition as distinct effects.

Required future acceptance pair: same transformed module as inline script vs external/Blob ESM; compare outerHTML/XMLSerializer and fetch(import.meta.url) native/emitted bytes; include aliased fetch, document.title negative, and an unrelated JSON API fetch positive-yield control. This is browser runtime evidence only; no current-main transform regression is claimed by this probe.


### Receiver and effective-dispatch provenance lattice

A host member spelling is never sufficient to create a Web IDL sink. The shared plan records receiver identity separately from effective callable/accessor dispatch:

- `ReceiverProvenance`: `native-global`, `native-property`, `alias`, `proxy`, `userland`, or `unknown`.
- `DispatchProvenance`: `native-inherited`, `native-accessor`, `captured-native`, `own-data`, `own-accessor`, `prototype-patched`, `proxy-forwarded-native`, `userland`, or `unknown`.

`ReceiverRef` preserves the originating realm binding, host interface, realm, alias relation and Proxy target. The `HostEffectRecord` carries both a stable receiver ref and the effective operation identity/dispatch state, with `HostContractRef` proving the native interface/method/accessor premise. For example, a captured `Storage.prototype.setItem` alias remains `captured-native` even after the prototype is patched; an own `setItem` override is `own-data` or `own-accessor`; a same-named userland object is `userland`; a Proxy that forwards with the genuine target as receiver is `proxy-forwarded-native`. A Proxy that stores the function reference is not a native Storage conversion.

The same lattice applies to DOM setters, CSSOM setters, Window.name, Storage named properties and method sinks. The lattice is evidence, not a name heuristic: unresolved receiver or dispatch state remains `unknown` and takes the conservative fallback.


### Actual current-main SCO request-time Storage result

Agent 19 has now closed the single-file actual-handler gap with a real Chromium request-time witness: [report](../im-results/agent19-sco-create-handler-storage-source-2026-11-23.md), [focused run 45276781187](https://github.com/FlareZ123/obfs/actions/runs/45276781187). The actual `createScoHandler` route served two distinct allowed-Host variants (200/200) and rejected a disallowed Host (403; routing only, not authentication). The browser executed each exact response beside the native ESM source.

The witness covers:
- a function passed to native Storage.setItem argument 0 (key) and argument 1 (value);
- a captured `Storage.prototype.setItem` alias invoked through `Reflect.apply`;
- a same-named userland `setItem` that retains the function reference and preserves private renaming.

Native Storage readback exposed the original `Function#toString` source; both per-request SCO variants exposed different rewritten source. Numeric result 29, marker runtime value and unrelated helper result 7 were preserved. The userland control returned 11 and retained its private rewrite. The handler measured `observesFunctionSource(parse(source,'module')) === false`; its single-file group bypasses the group-level interfile observer, then the request-time literal pass and identifier/property transforms mutate the source.

All relevant implementation blobs in the Agent 19 SCO branch match current main: `src/ast.js` `c227e6e604635a42663af745fd0cfb194b215a67`, `src/core.js` `8d33996821650de540b87502baff00a9e7ea99c7`, `src/sco.js` `c8f98b553172426559b21abaf0dc9a4fc3ea068e`, `src/properties.js` `bda3c6097e2679f59bd003fa0aed3e0291d4ba4c`, `src/identifiers.js` `c7e2ed1469381c5bc6dc42cef9a6ca8bfa347f0f`, `src/cross-properties.js` `7298df722d65f545dcb7b55c81cb6b8e101ce6b7`, and `src/strings.js` `df489cf25a8aaeb87d90e6dc1b7eb66476da8dd6`. Thus this is current-main actual SCO handler evidence for one single-file ESM case.

This extends Storage evidence from same-file COO Chromium to actual SCO request-time Chromium. It does **not** establish SNO Storage, multi-file SCO, Storage named-property assignment, all own/prototype overrides or all call/apply/bind variants. The earlier statement that no SCO Storage result existed is superseded; Window.name remains COO-only in the current evidence set.


## Additional DOM/HTML/CSSOM sink donors: current-main status must be revalidated

Agent 19's `workplace/dom-source-observation-capability-graph.md` and its intermediate matrices provide a valuable sink/receiver donor: DOM Web IDL property setters, `insertAdjacentHTML` argument 1, DOMParser/Range parser methods, 23 modern HTML parsing/streaming methods, writer aliases/pipeTo, Document.write/writeln yield cost, and CSSOMString setters. Agent 1's CSSOM donor adds HTML Element.style, SVGElement.style and CSSStyleRule.style receivers, direct/computed/bound/Reflect.apply/detached/aliased calls, cross-file ESM, and ordinary userland/primitive positives.

These donors must not become a second resolver or be represented as current-main validation without source re-pinning:
- Agent 19 DOM/HTML matrix branch has `src/ast.js` `eea89ceb890cf190deb714751158a055c6cb2224`, `src/properties.js` `5748e5b27146fe8a0b2937b0ad6b4bc4382ebe6f`, and `src/cross-properties.js` `adb626c7533ac08cc51823b10bdbd9b09d966149`; current main is respectively `c227e6e604635a42663af745fd0cfb194b215a67`, `bda3c6097e2679f59bd003fa0aed3e0291d4ba4c`, and `7298df722d65f545dcb7b55c81cb6b8e101ce6b7`.
- Agent 1 CSSOM branch has `src/ast.js` `8f902c171c30fcc12d87204b1857f7ca39d46d3f`, `src/core.js` `a2b689b00050653ebc506b3d1be1d014bad38412`, `src/properties.js` `5748e5b27146fe8a0b2937b0ad6b4bc4382ebe6f`, and `src/cross-properties.js` `e011e81e60df08cd8c169120c0532448cb8d8cbf`, all different from current main.

The old `observesFunctionSource` implementation differs from current main by caller/callee source-observer checks; `src/properties.js` has added direct-invoked-arrow/source-privacy logic; `src/cross-properties.js` has added static string-selector metadata. These differences can affect both detection and positive yield. Rebase only the test harnesses/configuration onto one exact current-main base and rerun before candidate acceptance. The current plan should consume these sink families through the same `HostEffectRecord`/`ReceiverRef`/`DispatchProvenance`/value-closure graph, not through a parallel DOM-specific resolver.

For CSSOM, use `WebIDLStringConversion` with interface `CSSStyleDeclaration`, conversion target `CSSOMString`, argument index 1, proven style receiver and effective `setProperty` identity. For HTML parser APIs, distinguish attribute setters, method argument positions, TrustedHTML/DOMString unions, and asynchronous stream writer value flow. Preserve the primitive/literal and same-named userland positives. Trusted Types CSP/default-policy behavior, Firefox/WebKit, and current-main revalidation remain open.
