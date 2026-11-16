# Opaque receiver provenance in declared ambient descriptor calls (16 November 2026)

**Status:** Real Node22 Ubuntu/Windows native-versus-obfuscated counterexamples, corrected with a bounded sensitivity-based refusal rule and an unchanged positive-control transformation. Intermediate compiler compatibility result only.

## Causal failing input

The previously merged descriptor-capability guard in `src/cross-properties.js::safeClosedCallerRecordRead` checked direct or tracked local alias provenance of the **receiver** of `Object.getOwnPropertyDescriptor(...,'Reflect')`. This fails when a source-visible expression wraps the actual global object in an identity Proxy, returns the object from a function, or forwards it through a local identity function.

The demonstrated three-module declared ESM graph exports `state={secretField:41}`. Its unrelated record reader performs `Reflect.ownKeys(schema)` and a computed property read. The entry mutates `Reflect.ownKeys` through a descriptor of the returned/proxied `globalThis` receiver. An opaque preloader callback dynamically imports `state.mjs` and observes the actual own-field spellings. The original and transformed script must emit identical JSON; each pre-fix output changed `secretField` to an internal name.

Four independent source-visible inputs were inserted into the already existing native-versus-compiled fixture `test/closed-record-visible-reflect-overwrite.test.js`:

- `const proxy=new Proxy(globalThis,{});Object.getOwnPropertyDescriptor(proxy,'Reflect').value.ownKeys=globalThis.HOST_REFLECT`
- `Object.getOwnPropertyDescriptor(new Proxy(globalThis,{}),'Reflect').value.ownKeys=globalThis.HOST_REFLECT`
- `const getRoot=()=>globalThis;Object.getOwnPropertyDescriptor(getRoot(),'Reflect').value.ownKeys=globalThis.HOST_REFLECT`
- `const identity=input=>input;Object.getOwnPropertyDescriptor(identity(globalThis),'Reflect').value.ownKeys=globalThis.HOST_REFLECT`

[Real red Ubuntu/Windows gate 43863988820](https://github.com/FlareZ123/obfs/actions/runs/43863988820), exact test-only source `1d3883f9e02366a7d746fa9049cc4e7cff299cbd`: all four cases failed on each platform; 61/65 tests passed in the targeted step. The original output was `[41,"audit-v1",["secretField"]]`; emitted outputs contained respectively `_pcd60f6403f10`, `_p01dc64ac3abe`, `_p28fef9c54248`, `_p46774f388f01`. This is an observed semantic regression, not an inferred attack.

## Bounded corrective rule

A native descriptor/acquisition method call with **statically known selector** `'Reflect'` or `'Object'` can return a mutable ambient intrinsic through any receiver that the finite scanner cannot prove unrelated. The compiler therefore declines the exceptional private-own-record proof for those sensitive selectors regardless of receiver expression type. For **unknown** selector names or `Object.getOwnPropertyDescriptors`, the pre-existing locally recognized global receiver guard remains in place. A call with a **known unrelated literal** descriptor selector still retains its native private own-key transformation.

This rule trades some transformation coverage for correctness. It avoids inserting runtime work and retains an independent positive case requiring **one actual cross-file property rename**. It is not a complete provenance, interprocedural, Proxy, host-effect, or constructor-proof theorem. User-controlled realms and external callbacks remain able to observe and modify distributed COO/SNO code.

The prior report `im-results/ambient-descriptor-capability-2026-11-16.md` covers the related direct/captured method, nested local holder, `.apply`, and first-class accessor cases. The combined fixture now has thirteen new negative variants, a separate one-key unrelated descriptor positive, and earlier source-visible mutation cases.

## Paired green evidence

[Manual frozen-application gate 43864343227](https://github.com/FlareZ123/obfs/actions/runs/43864343227) passed Ubuntu/Windows Node22 plus legacy Node22 fixture and Ubuntu Chromium at source SHA `77ef29082a83ccf5e96c34e840279f671e7e1427`. The direct/aliased previous checks, four newly red proxy/function-return canaries, distinct transformed own-key-only application, original frozen source, offline clone and whole-session profile controls all ran in that gate.

The source-only attacker can still copy the public output; the frozen original six-module source with source observations remains 0/2 transformed while the intentionally modified own-key-only graph retains its separate 2/2 positive metric. This patch alone has no runtime instruction overhead but does not measure compiler build-time, arbitrary workload cost, or universal compliance with the 2.5× budget. No claim about strong confidentiality, full-control tamper resistance, or generic anti-cloning follows.

## Remaining proof obligations

Full general receiver provenance (arbitrary object graph, higher-order call returns, dynamic keys, accessors and Proxy traps) is not proven. A further counterexample may involve a **dynamically supplied sensitive selector** through an opaque receiver, because the current rule only recognizes literal `'Reflect'`/`'Object'` or known global receiver for unknown keys. Before extending yield, specify a verifiable trusted-host contract or a formal may-alias/effect discipline. Keep transformed positive coverage measurements adjacent to every conservative veto.
