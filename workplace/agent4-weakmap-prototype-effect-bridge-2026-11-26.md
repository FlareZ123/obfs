# WeakMap prototype observation: bridge into the canonical value/effect graph

**Author:** Agent 4, 26 November 2026  
**Status:** design proposal based on source-pinned counterexamples; not an implementation, theorem, or established result.

## Purpose and integration boundary

This is a WeakMap-specific bridge into the existing shared source-observer architecture, not a competing BindingId, points-to, or effect system.

Reuse:
- \`workplace/source-observer-carrier-effect-contract-2026-11-23.md\` for \`BindingRef\`, \`DefinitionRef\`, \`ValueRef\`, \`CallSiteRef\`, \`HostEffectRecord\`, \`HostEffectValueEdge\`, \`ActiveFrameEdge\`, \`PropertyKeyIdentityRef\`, and effect closures;
- \`workplace/agent3-source-observation-summary-integration-2026-11-23.md\` for one shared immutable plan consumed by AST, identifier, property, string, cross-file and SCO transforms;
- \`workplace/agent1-lexical-observer-proof-contract-2026-11-23.md\` for lexical binding identity and the rule that a lexical resolution alone is not a value/host proof.

The WeakMap work should extend those identities and edges. Do not add another identifier-name alias table or a separate mode-specific observer boolean.

## The actual effect chain

The observed behavior is not merely "read WeakMap.prototype":

1. Resolve a WeakMap instance or derived instance to a specific native prototype object.
2. Read or recover the shared native prototype, potentially through a container, a local helper, a class constructor/static field, or a derived class's parent prototype.
3. Mutate a shared method such as \`WeakMap.prototype.set\` or install a wrapper through a descriptor/Reflect operation.
4. The replacement method reaches a source-observation sink (for the current fixtures, a host DOM string conversion that exposes a function's source).
5. The source observer changes the safe rename set: identifiers/property names occurring in the observed callable source must remain stable.

The graph should model both the capability path (steps 1–3) and the actual source effect (steps 4–5). A prototype read that cannot reach a mutation/observer is not automatically the same effect as exact source observation. An unresolved escape or mutable native prototype remains fail-closed.

## Candidate value facts and edges

Represent the following as facts on existing \`ValueRef\`s, not as a parallel resolver:

| Fact | Meaning |
| --- | --- |
| \`WeakMapInstance(nativeBrand, realm)\` | A proven instance of the native WeakMap constructor in a particular realm |
| \`WeakMapDerivedInstance(classRef, parentRef)\` | An instance of a statically proven subclass of native WeakMap |
| \`Container(staticSlots, unknownRead, unknownWrite)\` | An object/array/class constructor/instance with keyed value edges |
| \`PrototypeObject(kind, parentValueRef)\` | A prototype object; \`kind\` distinguishes native WeakMap prototype, derived own prototype, and unknown |
| \`FunctionSummaryRef\` | A local callable with parameter/return/effect summary |
| \`MaybeWeakMap\` | A join/widening result where a WeakMap may be reachable |

Required value-flow edges include:
- \`NewWeakMap\` → instance;
- object/array literal and spread → container slots;
- member/element write and read → keyed slot values;
- destructuring read → bound value;
- alias assignment → same container identity;
- actual argument → formal parameter;
- return expression → call result;
- class static field / static block \`this\` → class-constructor container;
- instance field initializer → instance container;
- class heritage → derived prototype parent edge;
- ESM import/export/re-export and CommonJS export/require → cross-module value identity.

Property keys are use-site identities. A statically proven key can select one slot. An unresolved computed key on a container that may contain a WeakMap must join the possible slot values and produce \`MaybeWeakMap\`; it must not silently become \`Other\`.

## Candidate host effects

The shared plan already has source/dispatch effects such as \`WebIDLStringConversion\`, \`ToPrimitiveDispatch\`, \`UnknownHostCall\`, \`CallableMetadataRead\`, and \`SourceMirrorRead\`. The WeakMap path may need explicit candidate event kinds (names subject to the canonical contract owner):

- \`NativePrototypeRead\`: read/recover a prototype object from a proven native instance or a derived prototype chain.
- \`NativePrototypeMutation\`: write/define/delete a method or accessor on a native shared prototype, with exact receiver/prototype ValueRef and PropertyKeyIdentityRef.
- \`PrototypeEscape\`: a native prototype capability reaches an unresolved external call, export, shared global, or opaque container.
- Existing exact-source/DOM/Function effects: represent the actual callable source observation independently from the prototype mutation.

A mutation record should carry:
- exact receiver/prototype \`ValueRef\`;
- prototype kind and realm;
- exact property-key identity;
- operation and effective-dispatch provenance (assignment, Object.defineProperty, Reflect.defineProperty, setPrototypeOf, etc.);
- replacement value/callable identity;
- callsite/CFG provenance and the mode-specific HostContractRef, if any.

A read of the native prototype is a capability acquisition; it is not itself proof that Function#toString occurs. A mutation that can replace a source-observer-relevant method, combined with a source sink, yields the corresponding exact-source closure. If the mutation target or effect cannot be resolved, use \`UnknownHostEffect\`.

## Function summaries: remove the local-call false-positive without losing soundness

The current donor's broad call-argument veto is a fail-closed fallback, but it treats every call receiving a WeakMap as an escape. The latest Agent 1 candidate also initializes local function parameters as \`carrierOther\` rather than propagating actual values. This causes both false positives and missed return flows.

Add a bounded summary for each known local function:

\`\`\`text
FunctionSummary {
  parameterEffects[i]: {
    readsAsWeakMap,
    readsPrototype,
    mutatesPrototype,
    returnsValue,
    storesInContainer,
    escapesToGlobalOrExport,
    passesToOpaqueCall
  },
  returnValueSummary,
  thisEffects,
  unknownEffect
}
\`\`\`

Compute summaries monotonically to a fixed point over the known local call graph and module graph. At a callsite, substitute actual argument ValueRefs for formal parameters, apply effects, and propagate the summarized return ValueRef to the call result.

Required distinctions:

- \`hold(map) { return map; }\`: returns parameter 0; no prototype read, mutation, or escape. Its call result remains a WeakMap value in the caller, but merely calling it does not create source observation.
- \`consume(map) { return map.get("key"); }\`: reads a WeakMap method as receiver; does not expose the prototype or return/escape the map.
- \`inspect(map) { return Object.getPrototypeOf(map); }\`: parameter 0 reaches a prototype-read effect.
- \`patch(map) { Object.getPrototypeOf(map).set = hook; }\`: parameter 0 reaches native prototype mutation.
- \`leak(map) { globalThis.saved = map; }\`: parameter 0 escapes to shared global state.
- \`wrap(map) { return { instance: map }; }\`: return summary contains a container slot that must be readable at the caller.
- \`opaque(map)\`: if the callee is unresolved/external or its summary is unknown, retain the fail-closed escape rule.

This preserves conservative behavior for opaque calls while allowing safe local helpers to retain unrelated identifier/property yield. Recursive calls and module cycles require a bounded monotone fixed point with explicit widening to \`MaybeWeakMap\`, not optimistic fallthrough.

## Four exact implementation gaps in the current carrier candidate

1. **Unknown computed key.** In \`evaluateCarrierValue(MemberExpression)\`, when the base is a known container, a missing static key currently returns \`carrierOther\` unless \`base.unknown\` is already true. For \`carrier[dynamicKey]\` with a known WeakMap slot and no unknown writes, the possible slot values must be joined; the result is \`MaybeWeakMap\`.
2. **Static field alias.** The class scan records a class name in \`weakMapContainerOwners\` when a field initializer may contain a WeakMap, but \`evaluateCarrierValue(Identifier)\` does not propagate that owner fact into the environment. \`const protoCarrier = Carrier; protoCarrier.instance\` therefore loses the class constructor's static-container identity. Keep a static constructor container with property values and alias the container ValueRef; do not conflate static and instance fields.
3. **Static-block receiver.** The class visitor creates a detached \`staticThis\` container and marks it unknown, but does not associate it with the class constructor's ValueRef. Writes through static-block \`this\` disappear before a later \`Carrier.instance\` read. Bind static-block \`this\` to the constructor container and join writes back to the class binding. Nested arrows inherit lexical \`this\`; instance methods have a different receiver.
4. **Subclass parent prototype.** The current \`isWeakMapConstructor\` logic does not represent a class heritage edge from a local subclass to native WeakMap. Track derived class prototype objects and their parent ValueRefs. The derived class's own prototype is not the native WeakMap prototype; \`Object.getPrototypeOf(Derived.prototype)\` (and equivalent aliases/Reflect/\`__proto__\`) can return the shared native parent. Preserve the two-level chain case.

## Evidence and acceptance gates

Exact Agent 1 candidate head \`dd9f5783abb3df607c615dd08fe6646ce4264006\` currently has:
- 11/11 getter/container alias cases passing on three OSes (run 45868621647);
- 3/3 cross-file COO/SCO/SNO compile-mode cases passing (run 45868497810; only COO runtime parity is exercised);
- 14/17 expanded local carrier cases passing (run 45868160922): dynamic array key, class static field initializer alias, and class static block remain false-safe;
- five parent-prototype variants × three mode flags false-safe across three OSes (45/45 combinations, run 45868603409);
- known-local identity helper over-refusal (run 45867337001).

The donor and candidate also need the same positive controls:
- local identity and local reader helpers;
- unrelated non-WeakMap objects/prototypes;
- derived class's own prototype (must not be confused with native parent);
- primitive and userland same-name controls;
- exact captured source and ordinary result parity.

Acceptance should require:
1. no false-safe across object/array/destructuring/spread/unknown-key/factory/return/class/static-block/subclass-parent/cross-file paths;
2. no known-local identity/reader over-refusal when the summary proves no escape/prototype effect;
3. identical behavior and exact source where a source observer is present;
4. mode-separated COO/SCO/SNO compile evidence, with real runtime/browser/server tests for each claimed boundary;
5. independent runtime overhead measurement against the 2.5× limit.

This proposal is an integration aid for the existing canonical graph, not proof of correctness or a release decision.
