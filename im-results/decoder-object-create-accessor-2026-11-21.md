# Object.create descriptor accessors and eager-decoder semantic parity

**2026-11-21. Agent 1. Status: intermediate compiler-correctness evidence.** The project-wide strong-obfuscation release assessment remains **RELEASE-BLOCKED**.

## Observed boundary

`Object.create(proto, propertiesObject)` installs properties from a map of property descriptors. Accessor descriptors can expose a mutable intrinsic through a later object read; see [ECMAScript Object.create](https://tc39.es/ecma262/2025/multipage/fundamental-objects.html#sec-object.create) and [MDN Object.create](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/create).

A three-file CommonJS program with load order `entry.cjs -> mutator.cjs -> target.cjs` can use:

```js
const box = Object.create(null, {
  ref: { get() { return String.prototype; } }
});
box.ref.charCodeAt = () => 0;
```

The target's long literal is loaded after the mutation. An eager obfuscator-emitted string decoder must therefore decline unless it can prove that the installed runtime getter does not expose a decoder-sensitive reference. The original source's literal has no such decoding dependency.

## Test methodology

`test/decoder-object-create.test.js` builds the three-file graph, compiles it with `obfuscateFiles` separately in COO and SNO with `strings:true`, and compares subprocess exit status, stdout, and stderr between original and emitted programs. Four descriptor forms are tested against both `String.prototype` and a matched harmless `Number.prototype` control, for 16 checks per operating system. The test also requires zero long-string transformations for unsafe cases and one positive transformation for the safe controls. The implementation uses the existing `atomicWrite` helper for fixture files.

A source-pinned, pre-guard regression at `9519660592f29ed9d70c52b2088b298fa5c2bf5c` ran in [manual validation 44930261593](https://github.com/FlareZ123/obfs/actions/runs/44930261593). **Ubuntu: 4,068 passed / 13 failed / one skipped out of 4,082. Windows: 4,065 passed / 13 failed / four skipped out of 4,082.** The targeted Object.create cases contributed six failures on each platform, precisely the getter/arrow/function-expression String cases; the data-descriptor paths and eight Number controls passed.

The first guarded candidate at `0a7f07d5ab2c36d3ec729548dbd87fe913f7e5e0` ran in [manual validation 44930452923](https://github.com/FlareZ123/obfs/actions/runs/44930452923). **Ubuntu: 4,074 passed / seven failed / one skipped. Windows: 4,071 passed / seven failed / four skipped.** All 16 new Object.create cases passed on both platforms, along with strict JSDoc typechecking. The seven remaining test names were identical to seven failures in the pre-guard baseline. The separate Ubuntu `test/browser-integration.js:123` assertion failed in both revisions. These are unresolved pre-existing or independently occurring failures; a two-run comparison cannot prove their root cause.

The original test's metric assertion preceded runtime comparison. A runtime-first form was committed at `53812569dcd0afe9470f17c47a68a25cabb6d25e`. Its exact matched pre-guard counterpart is `2fe2d0964d5a8105870096f534ffabc1021c44fd`. Their respective manually dispatched runs are [44930861479](https://github.com/FlareZ123/obfs/actions/runs/44930861479) and [44930857374](https://github.com/FlareZ123/obfs/actions/runs/44930857374). The patched runtime-first run independently passed **all 16 Object.create native-versus-emitted tests** on Ubuntu and Windows, with the same seven other Node test failures (Ubuntu 4,074 passed/7 failed/1 skipped, Windows 4,071 passed/7 failed/4 skipped). The before-fix Ubuntu runtime-first run failed all six accessor cases with actual output corruption: generated Unicode output replaced the original repeated `Z` characters while both child processes exited normally. The matched Windows runtime-first before-fix job also reproduced all six failing accessor cases, with the same seven other Node test failures. The completed baseline totals were Ubuntu 4,068 passed/13 failed/1 skipped and Windows 4,065 passed/13 failed/4 skipped. Linux and Windows logs both show concrete native-versus-emitted corruption ahead of the transform-yield assertion. The pre-fix Ubuntu run also reported unrelated browser integration failures, so its full workflow was not green. These runs prove a scoped semantic difference and its repair, not a fully passing project suite.

## Compiler change and limitations

The source patch in [PR #204](https://github.com/FlareZ123/obfs/pull/204) recognizes a direct `Object.create` call with an inline object descriptor map. It checks accessor descriptor fields named `get`, using the existing `proxyGetMayReturnDecoderIntrinsic` return-effect analysis. A sensitive getter marks the file group as unsafe for eager decoding. Harmless Number controls retain positive decoder yield.

The change adds a compile-time guard and no new execution-time decoder work. This limited fact does not establish a 2.5x performance bound over arbitrary original programs. The implementation has no general proof for descriptor maps built dynamically, aliases of the intrinsic method, getters returned through opaque functions, or reflective mutation of descriptor objects.

The result is compiler-correctness evidence for these bounded inputs. It is not evidence of source secrecy, instrumentation resistance, full-control tamper resistance, domain authorization, or a released obfuscator. The published COO/SNO output remains inspectable by the threat-model attacker.

## Reproduction and next steps

With Node.js 22 and declared dependencies installed, run `node --test test/decoder-object-create.test.js` on the exact source pin. For a broader pre/post comparison, rerun the manually dispatched `manual-validation.yml` workflow on the named branches.

Independent review should test descriptor-map aliasing, returned descriptor factories, computed keys, `Object.create` aliases, and getters that indirectly return mutable intrinsic aliases, always paired against a matched positive decoder-yield control. The seven unrelated full-suite failures require separate triage before promoting a release-level correctness claim.
