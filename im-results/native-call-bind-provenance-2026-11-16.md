# Native invocation adapters and partial binding: source-visible host provenance

**Agent 4, 16 November 2026. Bounded compiler-correctness experiment.** An unchanged Node host preloader makes runtime `Reflect.ownKeys` mutation observable by dynamically importing an ESM owner with `secretField:41`. Native/generated parity, private-key rewrite counts, a separate benign positive and full two-platform runtime tests are used as acceptance criteria. The experiment does not establish general obfuscation security.

## Real red: native invocation adapters

The suite `test/closed-record-host-formal-provenance.test.js` uses an explicitly declared three-file ESM graph plus a fixed host callback. Source-visible local `rewire({['Ref'+'lect']:cap})` writes `cap.ownKeys=globalThis.HOST_REFLECT`; a separately imported reader triggers the new host callback, which dynamically imports `state.mjs` and enumerates `Object.keys(ns.state)`.

The [test-only full Ubuntu/Windows red 43897812907](https://github.com/FlareZ123/obfs/actions/runs/43897812907) at `754f01a262c391023d8c4eadd5d2249f0bff8b1d` recorded **six actual native/emitted semantic failures** in 1,721 Node tests: direct and aliased `Function.prototype.call`, `apply` with a literal argument array, immediate `bind` with captured arguments, aliased arrow `bind`, and `Reflect.apply`. Original host observation contained `secretField`; emitted observation contained randomized `_p...`, despite `closedWorld:true`. The unrelated bound-function positive retained **one actual safe cross-file owner rewrite**.

The compiler change at `3b831fc2eb21cde1ea33c84fca60a7af5484a868` normalizes supported direct local calls and native adapters to the same argument-to-formal edge representation, and conservatively declines `apply` on unknown argument arrays or spread arguments when such values target a locally known function. [Full two-platform green 43898538917](https://github.com/FlareZ123/obfs/actions/runs/43898538917) passed the 1,721 Node test suite, strict JSDoc, benchmark and Ubuntu Chromium integration.

## Real red: returned bound functions with remaining parameters

A local `const bound=rewire.bind(null);bound(globalThis)` returns a new callable whose original first formal remains unbound. The earlier candidate tracked `bind`'s captured arguments but did not transfer arguments supplied to the **returned** function. Equivalent red cases included one ordinary identifier alias of the returned function, partial binding of the first of two parameters, and `Reflect.apply` on the returned function.

At the **test-only** SHA `583afde832797dd27c91422dde087a4f56490e2a`, [full two-platform red 43899209631](https://github.com/FlareZ123/obfs/actions/runs/43899209631) reproduced all **four genuine semantic mismatches** (1,726 tests, four failures on each operating system). The separate two-parameter bound **benign positive** still preserved one real owner-key transformation.

The subsequent candidate `12ea4b24d48ae78483285d6a1cb48d5b4c4f7a3b` registers syntactically assigned `.bind` return values as locally callable function identities. It represents their remaining formal parameters as canonical `(original function formal array, consumed-prefix count)` signatures. The join propagates through assignment aliases and nested bind operations to a finite fixed point, even for source-visible binding cycles.

The [post-fix two-platform full gate 43899791363](https://github.com/FlareZ123/obfs/actions/runs/43899791363) at exact candidate SHA `12ea4b24d48ae78483285d6a1cb48d5b4c4f7a3b` **passed both Ubuntu and Windows Node 22**, including all 1,726 Node behavioral/adversarial tests, strict compiler and external JSDoc, sampled benchmarks, the two-field transformed six-module whole-process runtime profiles and Ubuntu real Chromium checks. The negative host-effect witnesses now preserve original key spelling; distinct benign positive fixtures still transform one protected own key.

## What this proves, and what it does not

The two independent prepatch-red/postpatch-green pairs show finite real-source semantic preservation improvements and reduce one unsound form of property-key renaming. They are **engineering evidence**, not a theorem of generalized interprocedural soundness. The analysis is a lexical-spelling keyed syntactic may-transfer over direct known local functions, ordinary aliases, and a fixed set of native invocation adapters. It cannot establish full closure through arbitrary imported functions, method tables, rest/spread arrays, opaque higher-order function returns, hostile loaders, mutated host intrinsics or arbitrary JS reflective behavior. Unknown dynamic argument arrays are conservatively refused where identified. The named host callback is an explicit same-host semantic contract, not part of the obfuscated source set.

All checks have a source-scoped positive yield denominator: one distinct benign property rewrite in each new local fixture; the existing six-module **2/2 transformed** own-record application remains separately tested. A 0-key safe refusal is not a security win by itself. The fixes alter the **compiler acceptance decision**, so none of these observations establish more static reconstruction resistance, unextractability, client tamper resistance or a universal 2.5× bound. COO/SNO public files remain exposed to the prompt's fully controlled client/server owner; SCO's server-private method withholding and unlimited-query relay boundary are separate.

## Reproduction and evidence

Run `node --test test/closed-record-host-formal-provenance.test.js` under Node 22, or dispatch `manual-validation.yml` on the exact cited source SHAs. Check original/generated stdout, `compiled.crossFile.properties`, and the unchanged positive cases independently. The full validation workflow includes Linux/Windows, compiler JSDoc, sampled runtimes and real Chromium integration. The linked red runs change **only the test inputs** from their preceding green source, and the later green runs change the candidate compiler implementation.
