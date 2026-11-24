# Agent 13 — well-known Symbol key runtime matrix (intermediate)

**Status:** reproducible local semantic evidence; not an established compiler result.  
**Runtime:** Node.js v22.16.0, using Node's experimental Web Storage implementation.  
**Command:** `node sims/agent13-symbol-key-runtime-matrix.js`

## Scope

This matrix tests the identity and effects of computed keys used to install an own `Symbol.toPrimitive` hook on a function later passed to `localStorage.setItem`. Each case runs in a fresh child process with `--experimental-webstorage` and a separate `--localstorage-file`. The script asserts the function's ordinary return value and the stored string.

The matrix does **not** run the obfuscator, compare native and compiler-emitted artifacts, or establish a security guarantee. It is a runtime-semantics control for the future shared ToPrimitiveDispatch / PropertyKeyIdentityRef analysis.

## Results

| Case | Storage result | Function source in stored string? | Interpretation |
|---|---|---:|---|
| direct-real | `direct-real-hook` | No | Direct intrinsic well-known key invokes own hook |
| preloader-fake-key | Original function source | Yes | A preloader replaces global Symbol with a same-description but distinct Symbol.for value; ToPrimitive ignores the hook |
| preloader-userland-real-key | `preloader-real-wrapper-hook` | No | A userland global Symbol wrapper exposing the actual well-known value remains valid |
| local-symbol-shadow | Original function source | Yes | Local Symbol object yields an ordinary string key |
| local-globalThis-shadow | Original function source | Yes | Local globalThis root yields an ordinary string key |
| globalThis-real-root | `globalThis-real-hook` | No | Unshadowed host globalThis.Symbol.toPrimitive invokes hook |
| mutable-key-reassigned-fake | Original function source | Yes | Mutable alias reassigned to Symbol.for before computed-key use is not @@toPrimitive |
| captured-key-survives-source-reassignment | `captured-real-hook` | No | Immutable capture preserves the original well-known symbol after another binding is reassigned |
| factory-real-actual-formal-return | `factory-real-hook` | No | Actual Symbol argument flows through a parameter, key read, hook installation and function return |
| factory-fake-actual-formal-return | Original function source | Yes | Fake userland constructor argument produces a non-well-known symbol |
| cross-file-esm-real | `cross-file-real-hook` | No | Actual Symbol value flows through ESM import/export, factory parameter and returned callable |
| cross-file-esm-fake | Original function source | Yes | Fake value remains fake across the same module boundary |
| pure-userland-key-getter | `pure-getter-hook` | No | Getter returns actual well-known symbol without observing source |
| source-observing-key-getter | `source-getter-hook` | No | Storage hook succeeds, but getter separately captures Function#toString source |
| cross-realm-well-known-symbol | `cross-realm-hook` | No | Node vm realm's Symbol constructor exposes the same well-known symbol in the same ECMAScript agent |

All 15 cases passed. The script also asserts the expected numeric return value for each function. In the source-observing-getter case, “source in stored string” is false because Storage stores the hook's primitive result; the separate `observed` field confirms the getter captured the original function source.

## Main implications

1. **Prove value identity, not spelling or description.** A same-description `Symbol.for('Symbol.toPrimitive')` is not the well-known `@@toPrimitive` value. A userland wrapper can be safe if it exposes the actual well-known symbol and the value provenance is proved.
2. **Resolve both lexical roots.** A local `Symbol` or local `globalThis` shadow can make the same source spelling evaluate to a string or unrelated symbol key.
3. **Use-site reaching definitions matter.** A mutable key binding reassigned before use is different from an immutable capture made before reassignment.
4. **Follow interprocedural and cross-file value flow.** The exact argument value must flow through actual-to-formal, property read, key capture, own-property write, function return and Storage sink.
5. **Separate key identity from key-access effects.** A getter can return the correct well-known symbol and still observe the function source before the hook is installed. AccessorCall and ProxyInternalMethod effects must be analyzed independently.
6. **Model agent scope.** Node confirms `vm.runInNewContext('Symbol.toPrimitive') === Symbol.toPrimitive`; well-known symbol identity is shared across realms within the same ECMAScript agent, not realm-local.
7. **Make host assumptions explicit.** A preloader can replace global Symbol before entry. A pristine-intrinsics premise must be supported by a trusted deployment/loader contract; a Node version or clean default test process is insufficient in attacker-controlled COO/client, SCO/client or SNO/server partitions.

## Limitations and disposition

- This run used Node v22.16.0. It is not a Node v22.23.4 CI receipt and does not replace Agent 12's persisted ten-case SNO suite.
- No obfuscator transform was invoked. The paired manually renamed counterfactual described in Agent 13's communications is not counted as a compiler differential.
- The current main compiler's generic computed-function-key refusal remains fail-closed and is not shown to be incorrect by this matrix.
- Keep this in `im-results/` as intermediate evidence. Do not promote it to `results/` or claim a release candidate. Any future positive ToPrimitive admission must consume the shared v2 WellKnownSymbolRef / PropertyKeyIdentityRef, use-site reaching definitions, receiver/dispatch proof, and accessor/proxy transitive effects.

Reproduction implementation: `sims/agent13-symbol-key-runtime-matrix.js`.
