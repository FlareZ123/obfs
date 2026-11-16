# A source-visible Proxy descriptor trap can execute a host observer on an unrelated key (16 November 2026)

**Status:** Real two-platform regression, bounded red/green compiler refusal, and a preserved inert-Proxy positive control. This is intermediate semantic compatibility research.

## Why the known-unrelated selector exception was unsound

The previous `safeClosedCallerRecordRead` proof permitted a native `Object.getOwnPropertyDescriptor(receiver, 'UNRELATED_FIXTURE')` call because its selector could not return the global `Reflect`/`Object` intrinsic. That reasoning ignored ECMAScript Proxy handler effects. A declared, nonempty `getOwnPropertyDescriptor` trap can execute arbitrary JavaScript **before** returning `undefined` for an unrelated missing property.

The test's Node CJS preloader exposes a read-only-to-source `globalThis.HOST_GETTER` accessor. Its getter invokes the test's already established private host observer, which dynamically imports the published `state.mjs` and records `Object.keys(state)`. The submitted ESM entry declares a Proxy trap that reads `target.HOST_GETTER`, then returns `undefined` for a missing property:

```js
const proxy=new Proxy(globalThis,{
  getOwnPropertyDescriptor(target,key){void target.HOST_GETTER;return undefined;}
});
Object.getOwnPropertyDescriptor(proxy,'UNRELATED_FIXTURE');
```

The input contains no explicit replacement of `Reflect.ownKeys`. The source-visible Proxy trap acquires the host behavior through a getter from its argument. The original graph emits `[41,"audit-v1",["secretField"]]`, while the compiler had emitted `[41,"audit-v1",["_pba1ac96865d0"]]`.

[Paired real red Ubuntu/Windows gate 43867960214](https://github.com/FlareZ123/obfs/actions/runs/43867960214), SHA `844ea5d9f9628e292e3b0345a84cff2e457a9cd1`. The exact native-vs-generated regression is in `test/closed-record-visible-reflect-overwrite.test.js`.

## Bounded guard and measured coverage

The compiler's exceptional private-record proof now treats source-visible construction of `Proxy` with any statically nonempty or unknown handler as an unproved side effect, including a captured constructor alias, `new globalThis.Proxy(...)`, and `Proxy.revocable(...)`. A literal empty own-property handler `{}` remains admissible **under the explicitly assumed ordinary/stable realm**. Its inherited prototype can still be instrumented by a hostile runtime; no stronger guarantee is made.

This is a graph-level conservative syntactic veto, not an interprocedural Proxy effect solver. It may reject unrelated programs that construct a nonempty Proxy which is never used to affect the reader; that is a precision loss, not a protection strength gain. The distinct existing positive fixture uses `new Proxy(globalThis,{})`, a known unrelated descriptor key, and requires **one actual private state field rename**. The ordinary own-key-only six-module modified app remains a separate two-field positive.

[Green manual application validation 43868314304](https://github.com/FlareZ123/obfs/actions/runs/43868314304) at SHA `8f75844e7a979dfee0f5878cd2097807fa35a90d`: Ubuntu/Windows Node22, legacy Node22, the new host getter/Proxy test, prior descriptor and missing inherited-key refusals, frozen positive/negative applications, source-only clone attack, full-session profile, and Linux Chromium tests passed.

The root project also requires a 2.5× repeated compute-time limit. This guard generates no new executed instructions and has no direct emitted-runtime overhead; it does **not** prove any application-wide or universal 2.5× limit. Compile-time analysis has additional AST traversal cost, and the full compiler's performance must be assessed separately.

## Security and remaining proof gap

Under the stated COO/SNO threat models a full-control recipient can copy and instrument the JavaScript, observe every renamed key and change the runtime. A source-visible Proxy trap is an **input semantics** mismatch even without a malicious recipient, but the positive inert-handler claim still depends on a normal, unchanged intrinsic realm.

The scanner does not prove all Proxy construction routes, trap mutation after construction, `Reflect.construct` aliases, inherited Proxy handler trap methods, arbitrary function-return proxies, or host-loader effects. Do not use this change to assert general cross-module property-soundness or tamper resistance. A trusted-host contract and value/effect analysis remain necessary. See the [closed-world acceptance envelope](../docs/CLOSED_WORLD_PROPERTY_PROOF.md), [opaque receiver report](ambient-descriptor-opaque-receiver-2026-11-16.md), and [computed selector report](ambient-descriptor-const-selector-2026-11-16.md).
