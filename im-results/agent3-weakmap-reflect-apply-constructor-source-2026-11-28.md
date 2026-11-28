# Native bound-constructor indirection through Reflect.apply: three-mode source-observer unsoundness and repair

**Date:** 2026-11-28 UTC. **Agent:** 3. **Status:** reproducible negative/positive **intermediate compatibility** finding; donor candidate only. This does **not** establish strong obfuscation or certify main/PR #384.

## Parent and research branch provenance

- Exact prior experimental compiler donor: Agent 48 source `2897ebdf60eea2a2ce95d37631feb82e0099d0e8` on `agent48/weakmap-cfg-snapshot-20261128`; this already handles multiple native WeakMap constructor recoveries and branch/heap aliases.
- Red exact test head: `1a8d51677967e7fd99c7a1356e149afb94f7e494` on `agent3/weakmap-reflect-apply-audit-20261128`. It **adds tests only**, retaining the donor compiler.
- Minimal corrective source commit: `70fa5ef794ce4825f251525b188b1d348bd07110` on `agent3/weakmap-reflect-apply-fix-20261128`. Delta against parent donor: `src/ast.js` (+45 changed lines) and two test files, no generated CLI artifacts, no production files besides ast.
- Node actual environment: GitHub Actions Node `22.23.4` on Ubuntu, Windows and macOS. The frozen three-mode fixture uses the same direct `obfuscateFiles` API for `coo`, `sco`, and `sno`; it does not establish true SCO HTTP or SNO CLI runtime behavior.

## Native brand semantics and missed scanner provenance

The public runtime expressions

```js
const C = Reflect.apply(Function.prototype.bind, WeakMap, [null]);
// Equivalent native operation:
const D = Function.prototype.bind.apply(WeakMap, [null]);
const value = new C();
Object.getPrototypeOf(value) === WeakMap.prototype; // true
```

produce native-brand WeakMap instances because the native bind intrinsic can be applied through either `Reflect.apply` or `Function.prototype.bind.apply`. The donor `hasWeakMapPrototypeExposure(parse(source,'module'))` returned **false** for both, despite direct `Object.getPrototypeOf(instance)` reaching the shared mutable `WeakMap.prototype`. The source observer scan also returned false.

A separate supplied module later overrides `Storage.prototype.setItem` to store a callable in a native WeakMap. The first module mutates the shared `WeakMap.prototype.set` to feed that callable to an external host `document.title` setter; the independently supplied host setter invokes `String(fn)`. This observes the imported function's *source bytes* without `String`, `.toString`, or a visible DOMString sink in the producer module. This is an established cross-file source-parity failure, not merely an AST false negative.

## Frozen red/green executable evidence

| Proof | Frozen red donor | Isolated corrective source |
| --- | --- | --- |
| Native Node brand vs actual scanner, 3 cases incl ordinary control, **three OS** | [46111487436](https://github.com/FlareZ123/obfs/actions/runs/46111487436): FAILURE on Ubuntu, macOS and Windows; both WeakMap cases scanner=false/native=true | [46111594143](https://github.com/FlareZ123/obfs/actions/runs/46111594143): SUCCESS on all three OS, full project/external/paired-budget JSDoc checks |
| Three supplied ESM files, COO/SCO/SNO transformed output vs native host-observed callable source, 3 cases, **three OS** | [46111512666](https://github.com/FlareZ123/obfs/actions/runs/46111512666): FAILURE all three OS; each of two WeakMap cases differs in **all three modes** | [46111597351](https://github.com/FlareZ123/obfs/actions/runs/46111597351): SUCCESS all three OS, emitted/native parity + full project/external/paired-budget JSDoc |

Observed red: in each WeakMap case, 4 transformed binding identifiers in the observed `storage.mjs`; published source changed `privateLocal` to generated `_v...`, while the original host still observed original source. The result values remain equal but `capturedSource` differs. On the green source, the group scanner becomes `true`, **zero** unsafe bindings are rewritten, and the exact native source and output match. The separate **ordinary bound-constructor control** remains a positive yield: `nativeShared=false`, `group=false`, 4 rewritten identifiers and exact observable parity on **all three modes/OS**. This guards against a vacuous blanket transformation veto.

This repair extends the compiler's native Function.prototype.bind provenance to `Reflect.apply` and `Function.prototype.bind.apply`, reusing a precise helper `isNativeFunctionPrototypeBind`. It intentionally makes a **may**-WeakMap claim even when mutable intrinsics might have changed, which can conservatively overrefuse but must not report false safety.

## Independent actual Chromium 158 red/green and local-alias extension

The browser challenge must compare **identical host source** before any compiler-side conclusion. A first derived Chromium fixture inherited an unrelated conservative Storage source guard (both sides emitted 0 renames), and a later fixture accidentally double-escaped the generated Storage module newline. Those initial attempts did **not** establish browser red/green; a separate baseline CI step referred to a file absent from this donor and was isolated explicitly. Neither fixture failure is a protection result.

The corrected exact-source browser fixture uses the same native `Storage.prototype.setItem` interception and weak-map-carrying `Reflect.apply(Function.prototype.bind,WeakMap,[null])` module as the verified Node red test. It runs in real headless **Google Chrome 158.0.8127.36** and the same isolated browser workflow on both branches:

- **Unpatched donor** [46113430317](https://github.com/FlareZ123/obfs/actions/runs/46113430317), head `9e2039de7e1be1fc39955cb867921f1d5faf772b`: expected failure of exact function-source parity. The unmodified source has `function inspect(){const privateLocal=29;return privateLocal;}`; the emitted source has `function inspect(){const _v1306a0f722b4=29;return _v1306a0f722b4;}`. The compiler emitted **4** binding rewrites while the numeric result `{value:29,independent:7}` remained identical.
- **Repaired scanner** [46113433972](https://github.com/FlareZ123/obfs/actions/runs/46113433972), head `ff238648e8a1feffa9b8ac05c27e6b93c17302b2`: SUCCESS, **0** unsafe binding rewrites, identical `privateLocal` source under actual browser host coercion and equal numeric outputs. Only the new witness step was activated via `only_bound_weakmap=true`; the missing unrelated baseline fixture was explicitly skipped, not counted as passed.

A second defect appeared after the minimal direct-syntax repair: three local aliases of `Function.prototype.bind`/the `Function` constructor remained falsely safe. A conservative component-root union upgrade at `b7da938848220f37aaf8014841253548e77dda4e` passed native scanner alias [46112086245](https://github.com/FlareZ123/obfs/actions/runs/46112086245) and actual three-mode emitted parity [46112089483](https://github.com/FlareZ123/obfs/actions/runs/46112089483) on **Linux, Windows, and macOS**. A 320-program deterministic native-V8 branch/alias oracle, imported-bind cross-file fixture, and 20-form metamorphic constructor matrix remain separate pending falsifiers, not demonstrated fixes.

## Remaining limits / next experiments

- A distinct finite **local binding-alias** matrix first falsified the minimal direct-syntax fix on `b24f747a56d6c93459c6a1261430c3df605bdfc3`, and the later component-root union source `b7da9388` passes its own bounded matrix. The broader 20-form native-origin and imported-bind falsifiers are still unresolved; do not merge or advertise generalized soundness.
- Arbitrary `eval`, `Proxy` traps, dynamic properties, imported intrinsics, exception paths, or prototype poisoning are not solved. More special-case syntax checks can improve bounded correctness, not certify complete JavaScript semantics.
- The scanner's `group=true` may conservatively stop useful renames; exactly preserved function source in source-observing graphs is an **intentional safety measure**, not anti-deobfuscation strength. Evidence for independent positive-yield controls is mandatory.
- This isolated donor source is *not* main and is *not* PR #384. A full integration replay on an actual merge candidate and independent reviewer challenge remain required. The scoped real-Chromium case above is not a complete browser compatibility suite.

**Suggested design direction:** unify provenance of *constructor values*, *intrinsic Function.bind handles*, *receiver/argument identity*, and *member/heap aliasing* into one conservative compositional may-effect lattice. An open-ended list of direct syntax names is an unsound substitute for that abstraction. A practical default where proof is unavailable is to freeze foreign function source, with explicit positive-yield precision tests to prevent global overrefusal.
