# Imported ESM callable host-origin proof: paired source-visible semantic witnesses

**Agent 6, 16 November 2026.** Status: intermediate compiler-safety result for selected closed-source-graph ESM call shapes. No strong-obfuscation theorem or universal semantic equivalence is asserted.

## Threat boundary and exact witness

A four-module declared ESM graph holds an exported `state={secretField:41}`, a separate private literal record inspected through `Reflect.ownKeys`, a source-owned imported hook, and an entrypoint. The fixed Node host preloader provides `HOST_REFLECT`; this callback, invoked by `Reflect.ownKeys` on the record, dynamically imports the state module and inspects `Object.keys(state)`. The callback is the **same** for native and compiled execution.

The entry calls an imported function with `globalThis`. That function receives a root argument or a destructured parameter, extracts the same ambient `Reflect` object and replaces `ownKeys`. A graph-local proof that does not follow that imported call may wrongly treat a separate computed private record read as unable to reach the Function constructor, and rewrite `state.secretField`. A native process then sees `secretField` while the obfuscated process sees a generated `_p...` field in the host callback.

**Pinned true pre-patch red:** [Ubuntu/Windows manual workflow 43895013695](https://github.com/FlareZ123/obfs/actions/runs/43895013695) at test-only source `1cfb19752e774aff3c996ca3648af9f9d6cbc5a4` failed **four genuine behavioral cases**: direct named function import, aliased named import, imported arrow destructured formal, and imported function with internal local forwarding. Both positive controls stayed safe and admitted one private-owner property rename. The red is based on real process output parity failures, not a guessed compiler decision.

## Finite provenance transfer

The proof now constructs a cross-module may-origin map from a statically declared ESM graph:

1. Locate locally defined function/arrow expressions and their explicitly exported names, preserving any export aliases.
2. Resolve canonical relative named ESM imports to in-graph exported callable signatures, carrying local import aliases.
3. Transfer possible root identities through ordinary identifier assignments and direct call arguments into target formals, iterating to a fixed point across module boundaries.
4. Seed each module's existing conservative reflection proof with all discovered root and destructured-parameter native capability origins, before inspecting local ObjectPattern declaration/assignment and mutable intrinsic effects.

The implementation uses lexical-name may-analysis and overapproximates alias collisions. It is bounded to recognizable direct call graphs; arbitrary dynamic dispatch, mutable callable reassignment, host-supplied runtime graph effects, Proxy and all ECMAScript reflection are not proven by this model.

**Pinned first post-patch green:** [workflow 43895890532](https://github.com/FlareZ123/obfs/actions/runs/43895890532) at exact compiler source `38701dca105b2e25da8d677ea82b3143d146eefa` passed Ubuntu and Windows full Node 22 suites, strict JSDoc, benchmark and Ubuntu Chromium; Ubuntu counted **1,710 passes, zero failures, one skip** out of 1,711 tests. Four negative imported-call cases now preserve exact native result and refuse unsafe owner rewrite. An imported call to a harmless unrelated field reader and an imported call with a provably local literal record retain **one actual owner-key rewrite** each.

## Further coverage

A later extension recognizes default and namespace ESM import invocation as well as direct named imports, with separate harmless-field positive controls. It is under validation at source after `562644c0e9c0bd9c122410658cde64b3ab9ed9a9`; this report must not treat the additional syntax as established until its exact full gate passes.

## Assessment

The experiment repairs a concrete source-visible semantic violation and retains nonvacuous protected work. It does not demonstrate that names remain hidden against an adversary with complete public COO bytes. The companion [public-token attack](host-formal-provenance-and-public-token-attack-2026-11-16.md) shows simple name-label normalization succeeds on two other genuinely transformed application contracts. No universal **2.5×** statement follows from this compiler-safety test; earlier whole-session profiles apply only to their specified graphs.

Future work should measure a real protected-work fraction and attacker extraction cost on a frozen representative application, and replace growing syntactic provenance cases with lexical binding identity and call/effect summaries that conservatively refuse unknown dispatch. Preserve the exact fixed host preloader and independent native/emitted execution for every claimed safety repair.
