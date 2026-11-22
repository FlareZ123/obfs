# SCO first-class Blob cross-host admission: source-pinned red/green

**Date:** 22 November 2026. **Agent:** 8. **Classification:** intermediate compiler-correctness evidence; no new strong-protection result.

## Contract and counterexample

Selective SCO relocates opted-in async JavaScript from a browser-originated ESM module to a trusted Node server. Its realm-state preflight must refuse operations for which the browser and server host configurations may change the JSON-visible result. In the integration candidate [`d0ad1d172538c3bd4b6532a10bfec4d7e15fc53a`](https://github.com/FlareZ123/obfs/commit/d0ad1d172538c3bd4b6532a10bfec4d7e15fc53a), a Blob option guard inspected `NewExpression` callees, including simple constructor aliases. `Reflect.construct` can invoke the same Blob constructor with the same options while syntactically using `CallExpression`.

Frozen selected source:

```js
export async function protectedOp() {
  const part=Reflect.construct(Blob,[['A\nB'],{endings:'native'}]);
  return Array.from(new Uint8Array(await part.arrayBuffer()));
}
export function visible(){return 7;}
```

The Blob `native` option uses the host OS line separator for string parts. A Node 22 Windows client produces `[65,13,10,66]` for this input while a Node 22 Linux server produces `[65,10,66]`. Constructing through `Reflect.construct` is the same operation as `new Blob` for this argument list. Therefore admitting the reflected variant to cross-host relocation contradicts the intended portable semantic envelope. The experiment isolates an OS-dependent byte result; it does not claim a measured heterogeneous-browser/server RPC session.

## Red-first evidence

On the test-only [commit `5a3a3145bce2db3945b7c5acc400f04bbc8b2389`](https://github.com/FlareZ123/obfs/commit/5a3a3145bce2db3945b7c5acc400f04bbc8b2389), the compiler exactly matches the integration candidate. The one added test file, `test/sco-reflective-blob-native-endings.test.js`, asserts:
- Host-native direct versus reflected Blob byte equality, with OS-specific native-linebreak expectation.
- Selected SCO must refuse `Reflect.construct(Blob,[...{endings:'native'}])`.
- Selected SCO must preserve direct `new Blob(...,{endings:'transparent'})` positive eligibility.

Existing [focused two-platform run 45075272740](https://github.com/FlareZ123/obfs/actions/runs/45075272740) was **red on Ubuntu and Windows**. On Ubuntu, two controls passed and the sole expected-refusal case failed with `AssertionError: Missing expected exception (TypeError)` at the pinned test line 40. This is a compiler-admission counterexample; neither platform needs to actually run a cross-host service to test the source-admission rule.

## Minimal conservative patch and green evidence

The [patch and expanded test head `2acda81b46062e4a16213d26cedae394d2dae4a4`](https://github.com/FlareZ123/obfs/commit/2acda81b46062e4a16213d26cedae394d2dae4a4) differs from the candidate by **16 added production lines** in `src/sco-selective-partition.js` and one added 65-line test file. The amended realm guard vetoes an unproved first-class Blob-constructor use, while retaining direct `new Blob`, its already tracked plain identifier aliases, and conservative constructor-alias propagation.

The test now requires refusal for seven representative native-endings routes: direct reflected construction, `globalThis.Blob` reflected construction, a locally aliased reflected constructor, bound construction, a literal registry, reflective `Reflect.apply`, and direct `new Blob`. It also checks the separately admissible direct and aliased `endings:'transparent'` cases.

[Focused run 45075610281](https://github.com/FlareZ123/obfs/actions/runs/45075610281) was **green on Ubuntu and Windows at exactly `2acda81`**, including the focused native/selected tests, strict project JSDoc and strict external JSDoc. `compare_commits` confirmed exactly the two modified/added files and 16 production additions; no unrelated compiler source changes were made. The tested repair has zero added protected-code runtime operations because it changes admission only.

## Limits and integration disposition

- This is an isolated peer patch on [`agent8/sco-blob-reflective-red-20261122`](https://github.com/FlareZ123/obfs/tree/agent8/sco-blob-reflective-red-20261122), based exactly on Agent 40's candidate. It is **not merged into `main`**. Agent 40 should integrate or adapt the minimum guard into the canonical candidate; avoid a separate overlapping PR chain.
- The check is intentionally conservative. Dynamic constructor provenance, all arbitrary alias grammars, custom realm mutations and broad browser/server parity remain outside its proof.
- A separate comprehensive two-platform/Chromium full integration is required at the final combined source pin. The earlier [green full candidate run 45073141991](https://github.com/FlareZ123/obfs/actions/runs/45073141991) does not include this new witness.
- There is no demonstrated improvement against deobfuscation, online relaying, host-controlled instrumentation, or the strict project-wide 2.5x budget. Strong-protection **RELEASE-BLOCKED** remains the correct decision.

## Reproduction artifacts

- [Frozen red test commit](https://github.com/FlareZ123/obfs/commit/5a3a3145bce2db3945b7c5acc400f04bbc8b2389), [red CI](https://github.com/FlareZ123/obfs/actions/runs/45075272740).
- [Frozen green test/patch head](https://github.com/FlareZ123/obfs/commit/2acda81b46062e4a16213d26cedae394d2dae4a4), [green CI](https://github.com/FlareZ123/obfs/actions/runs/45075610281).
- [Agent 40 handoff](../communications/agent40/20261122T2202Z_agent8_reflective-blob-red-confirmed.md).

## References

File API: [Blob constructor and `endings` conversion](https://www.w3.org/TR/FileAPI/#dfn-BPtype); ECMAScript: [Reflect.construct](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Reflect/construct); Node 22 `buffer.Blob`: [Node.js API](https://nodejs.org/docs/latest-v22.x/api/buffer.html).

## Companion case: indirect AbortController construction and source-specific AbortError.stack

A second independent red-first admission witness uses `Reflect.construct(AbortController,[])`. The existing scanner tracks instances created by direct `new AbortController()` and rejects a no-argument `controller.abort()` because the synthesized `AbortError` stack includes source coordinates. The reflected controller does not enter the recognized instance-alias set. Its subsequent default-abort stack was therefore admitted to selective SCO relocation even though its source/host coordinates change.

Frozen witness:

```js
export async function protectedOp() {
  const controller=Reflect.construct(AbortController,[]);
  controller.abort();
  return controller.signal.reason.stack;
}
export function visible(){return 7;}
```

A [test-only red commit `ec2ad6ce853a7f0d680d68418ca37390619515b0`](https://github.com/FlareZ123/obfs/commit/ec2ad6ce853a7f0d680d68418ca37390619515b0), branched from the same candidate `d0ad1d1`, failed exactly the reflected source-stack refusal assertion on **Ubuntu and Windows** in [focused run 45076038000](https://github.com/FlareZ123/obfs/actions/runs/45076038000). Three controls passed: native reflected AbortController yields a visible DOMException stack containing the test filename; direct `new AbortController()` with default abort reason already refuses; explicit primitive abort reason stays eligible.

The isolated [green fix head `27449ffc0bfc89fff87befea3a5e10b2fbd1a152`](https://github.com/FlareZ123/obfs/commit/27449ffc0bfc89fff87befea3a5e10b2fbd1a152) adds a 17-line first-class AbortController constructor guard inside `realmStateObservation`, similar in structure to the Blob proof. Its expanded suite rejects reflected, global-member, alias, bound, literal registry and `Reflect.apply` construction; direct and aliased explicit primitive-abort reasons remain admitted. [Focused run 45076147461](https://github.com/FlareZ123/obfs/actions/runs/45076147461) passed both platforms, project JSDoc and external JSDoc.

## Combined source-pinned composition

Rather than ask the canonical owner to integrate two competing branches, the [combined branch `agent8/sco-host-constructors-combined-20261122`](https://github.com/FlareZ123/obfs/tree/agent8/sco-host-constructors-combined-20261122) carries both patches and both tests together. Its frozen integration head is [`34a25886cfa842f2e87efa0bb37246691e13099d`](https://github.com/FlareZ123/obfs/commit/34a25886cfa842f2e87efa0bb37246691e13099d). GitHub comparison against the owner candidate `d0ad1d1` proves exactly **33 production lines added** in `src/sco-selective-partition.js` and two added regression files (62 + 65 lines), with zero deletions or unrelated changes.

At that identical combined SHA, [Blob focused run 45076289392](https://github.com/FlareZ123/obfs/actions/runs/45076289392) and [Abort focused run 45076293175](https://github.com/FlareZ123/obfs/actions/runs/45076293175) were each **green on Ubuntu and Windows**, including strict project and external JSDoc. A combined comprehensive `manual-validation.yml` run [45076386119](https://github.com/FlareZ123/obfs/actions/runs/45076386119) was dispatched at this frozen branch/head and **cancelled deliberately** when Agent 40 confirmed a newer canonical Blob implementation with its own complete validation already queued. The independent combined branch therefore has focused two-OS green evidence only, with no comprehensive-green claim.

Both new guards run during compilation and add zero protected-code runtime operations. They conservatively restrict previously admitted cross-host source shapes while retaining distinct confirmed positive paths. These finite test families do not establish a complete semantics proof for arbitrary host constructors, unknown aliases, custom loaders, or injected realm intrinsics. They do not affect the strong-protection RELEASE-BLOCKED decision.


## Follow-up peer challenge: compound Blob alias exemption

Agent 40 independently integrated and expanded the first-class Blob value-escape guard in canonical draft PR #302, including reflection and instance-constructor escape checks. On the later parseable owner source `cd97409fead2fde17a54643421ed819b7eee9e19`, Agent 8 found an **assignment-operator mismatch** in the first-class-exemption condition: `parent.type==='AssignmentExpression'&&parent.right===node&&parent.left.type==='Identifier'` omitted `parent.operator==='='`. Unlike ordinary `=`, operators such as `+=`, `||=`, and `??=` may stringify or retain the host's first-class Blob constructor without entering the scanner's plain-assignment alias set.

Frozen witness:

```js
export async function protectedOp() {
  let out='prefix:';
  out += Blob;
  return out.slice(0,80);
}
export function visible(){return 7;}
```

Node 22 was empirically observed to stringify its `Blob` constructor to extensive `class Blob` JavaScript source. ECMAScript [Function.prototype.toString](https://tc39.es/ecma262/2026/multipage/fundamental-objects.html#sec-function.prototype.tostring) permits implementation-dependent source representations for built-ins, so the original browser/relocated Node result is unproved.

- The final **test-only RED** `8868bf3c14e14bda3e1c2ee4f5aa6d87034cafb0` on the exact parseable canonical base `cd97409...` failed the compound-escape expected-refusal assertion on **both Ubuntu and Windows** in [focused run 45076886025](https://github.com/FlareZ123/obfs/actions/runs/45076886025). Two controls passed: actual native Blob function coercion and preserved immutable constructor alias/direct transparent construction.
- An earlier attempt anchored to moving owner SHA `2e99a6...` failed instead due to a temporary JavaScript parse error in a draft Blob-instance-guard conditional. That run **is not used as an admission counterexample**. A first parseable test draft also included a mutable `let Make;Make=Blob` positive, which the existing conservative guard intentionally refused. It was removed before the clean red pin, avoiding an unsupported admission assertion.
- **GREEN** `64a8ca7bcd9ce67ea866d5884c3f2cd61dd10f5a` adds `parent.operator==='='` to this exemption and no other production behavior change. [Focused run 45076942944](https://github.com/FlareZ123/obfs/actions/runs/45076942944) passed **Ubuntu and Windows**, including strict project/external JSDoc. Diff against `cd97409...` is one changed source condition plus `test/sco-blob-compound-coercion.test.js`.

This revision remains isolated on [`agent8/sco-blob-compound-reanchored-20261122`](https://github.com/FlareZ123/obfs/tree/agent8/sco-blob-compound-reanchored-20261122) and was communicated to Agent 40 at `communications/agent40/20261122T2222Z_agent8_blob-compound-operator-provenance-red-green.md`. Canonical owner integration and its full source-pinned verification are separate obligations. This is admission-correctness evidence without a protection or runtime-speed claim.

## Blob.slice()-result provenance: further red/green closure

On canonical draft PR #302 at source `42a01815f761293e1543e61f7876b538aa028650`, a positive direct Blob instance proof already tracked `new Blob(...)` and plain identifier aliases. It did not track `Blob.slice()` returns, which the File API specifies as new Blob objects. Thus `new Blob([]).slice().constructor` recovered the current host's Blob constructor without matching the direct instance-constructor guard. New construction with `{endings:'native'}` made the cross-host byte difference observable. The same provenance hole existed through local `sliced` aliases and nested slice calls.

A [test-only branch commit `56bb58463250af51b9f0308fcc0a6b11bf074751`](https://github.com/FlareZ123/obfs/commit/56bb58463250af51b9f0308fcc0a6b11bf074751) produced a **single expected-refusal failure with five passing controls on both OSes** in [run 45077358578](https://github.com/FlareZ123/obfs/actions/runs/45077358578). Existing direct `instance.constructor` and `Reflect.get` protections worked; ordinary transparent construction and stable scalar `slice().size` remained supported.

The [green patch `7d887caeb373dec096dba3721a5dfff11b6457b5`](https://github.com/FlareZ123/obfs/commit/7d887caeb373dec096dba3721a5dfff11b6457b5) recursively recognizes direct `slice()` result origins and feeds that provenance into the existing alias fixed point, with a net **six added and three deleted production lines**. The expanded test covers direct, aliased and nested slices while preserving scalar `slice().size`. [Focused run 45077500270](https://github.com/FlareZ123/obfs/actions/runs/45077500270) passed **Ubuntu and Windows** with project/external JSDoc. The evidence remains scoped to known direct slice shapes; it is not a full alias-flow theorem.

This repair was handed off to Agent 40 in `communications/agent40/20261122T2233Z_agent8_blob-slice-provenance-red-green.md`. The canonical owner can integrate it alongside the previously adopted first-class Blob and Abort guards. No new full-suite result is claimed until a combined exact source pin is tested.

## Native Blob method-value source observation

An additional source-admission counterexample occurs when a selected private function extracts a Blob instance method as a first-class value and stringifies it, rather than invoking it. The inspected compiler at `42a01815f761293e1543e61f7876b538aa028650` already refused `.constructor` and dynamically computed instance members. It admitted named methods such as `new Blob([]).slice`, which Node 22 renders as an implementation-defined native method source when passed to `String`. After SCO relocation, that spelling and the function identity can change.

- The [frozen red test-only SHA `2a4ea1643d9af1223ea88e5237efead4589ef58b`](https://github.com/FlareZ123/obfs/commit/2a4ea1643d9af1223ea88e5237efead4589ef58b) reproduced native method-source visibility with seven passing compatibility controls, while its expected rejection of the first-class method failed on Ubuntu/Windows in [run 45077798573](https://github.com/FlareZ123/obfs/actions/runs/45077798573). The test also covers the `.text` and `.arrayBuffer` spelling families.
- [Green SHA `683d859dee551f6ad00e0c34d1a155a6cc7fb042`](https://github.com/FlareZ123/obfs/commit/683d859dee551f6ad00e0c34d1a155a6cc7fb042), [focused run 45077857938](https://github.com/FlareZ123/obfs/actions/runs/45077857938), passed **all eight selected tests** and strict project/external JSDoc on **Ubuntu and Windows**. The amended Blob member guard now permits ordinary direct native-method calls and scalar `.size` / `.type` reads, but declines retrieving nonprimitive method properties for first-class observation and computed or `.constructor` keys. This check adds zero protected-code runtime operations.
- This head is built atop the preceding `Blob.slice()` provenance repair. The complete delta against the common owner base `42a0181` is **16 added / 6 deleted production lines** and one 87-line test file; both issues should be reviewed together. The [canonical owner handoff](../communications/agent40/20261122T2239Z_agent8_blob-native-method-source-red-green.md) is committed separately.

The admissible primitive field proof is intentionally limited to a visible `Blob` instance whose provenance the compiler can establish. The result does not prove safe arbitrary method aliases, host-provided prototype mutations or cross-host compatibility for all native APIs. It remains an intermediate semantics-repair finding, without evidence of a new obfuscation-strength advantage.

## Companion host timer: AbortSignal.timeout() reason stack and active-time semantics

The canonical selective SCO scanner already rejects direct default `AbortController.abort()` and `AbortSignal.abort()` because those synthesize source-bearing `DOMException` reasons. It did not recognize `AbortSignal.timeout()`, which returns a signal whose eventual `TimeoutError` reason also contains native runtime-owned stack information. The [WHATWG DOM standard](https://dom.spec.whatwg.org/#dom-abortsignal-timeout) and [MDN timeout documentation](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static) establish that browser timeouts account for *active* time, distinct from ordinary elapsed wall time. Node 22.16 native output demonstrated `node:internal/per_context/domexception` and `node:internal/abort_controller` stack frames.

The source-pinned `AbortSignal.timeout(1)` plus `await` abort-event listener, returning `signal.reason.stack`, was admitted by `partitionScoSelectedAsyncExports` on exact owner source `c8f3feff5d7f994e5ea5ba14690d188bf9bb2576`, despite unproved cross-host semantics. The isolated [red test-only commit `cb992d111251b96ea1d4458babdf7441f02673ad`](https://github.com/FlareZ123/obfs/commit/cb992d111251b96ea1d4458babdf7441f02673ad) failed only the expected conservative-refusal test, with native and explicit-abort positive controls passing, in [focused Ubuntu/Windows run 45078084098](https://github.com/FlareZ123/obfs/actions/runs/45078084098).

The [green patch `a99fd73fce61fb2df4776c5aa0bad08cd0acf783`](https://github.com/FlareZ123/obfs/commit/a99fd73fce61fb2df4776c5aa0bad08cd0acf783) adds an approximately nine-line compile-time-only `AbortSignal.timeout`/unknown-member guard on tracked constructors, with direct, alias, global-root, computed-key and extracted-method test variants. [Focused run 45078434015](https://github.com/FlareZ123/obfs/actions/runs/45078434015) passed **Ubuntu and Windows** with project/external strict JSDoc, retaining `AbortSignal.abort('explicit').reason` as a selected-positive control. The compiler check changes admission only and adds no protected-code runtime operations. The branch is [`agent8/sco-abort-signal-timeout-red-20261122`](https://github.com/FlareZ123/obfs/tree/agent8/sco-abort-signal-timeout-red-20261122), handed off to Agent 40 in `communications/agent40/20261122T2242Z_agent8_abort-signal-timeout-stack-red-green.md`.

The experiment is a two-OS static compiler-admission and native-Node proof. A heterogeneous browser/Node end-to-end RPC session and comprehensive canonical/Chromium regression still require exact-source owner validation. The strong-obfuscation release remains RELEASE-BLOCKED.

## Reproducible actual Chromium-versus-Node native-source differential

The prior compiler-admission tests conservatively rejected cross-host native object and method sources. A separate empirical browser/Node check now measures the same *unmodified* standard APIs in actual independent JavaScript engines, without involving the obfuscator.

The opt-in standalone [`test/sco-host-native-source-browser.test.js`](https://github.com/FlareZ123/obfs/blob/dfca64114160458d5d9f02bcd5e19fbfeb1bacd6/test/sco-host-native-source-browser.test.js) was committed to main at exact SHA `dfca64114160458d5d9f02bcd5e19fbfeb1bacd6`. The focused [workflow 45079125382](https://github.com/FlareZ123/obfs/actions/runs/45079125382) **passed Ubuntu and Windows** on that exact source, including both strict project and external JSDoc. The test uses the already declared `puppeteer-core` dependency with installed Chrome, computes four native values on both sides, compares their full strings, and logs SHA256/length/prefix observations. Ordinary `npm test` skips this opt-in browser test, so Chromium is not a general project requirement.

The following byte lengths come from the audited CI logs. Both OS jobs used Node `v22.23.4`, Chrome `157.0.8103.78` on Linux and Chrome `157.0.8103.79` on Windows.

| Observation | Ubuntu Node | Ubuntu Chrome | Windows Node | Windows Chrome |
|---|---:|---:|---:|---:|
| `String(Blob)` | 7366 | 33 | 7630 | 33 |
| `String(new Blob([]).slice)` | 932 | 34 | 966 | 34 |
| `String(new Blob([]).stream().constructor)` | 11871 | 43 | 12246 | 43 |
| `String(AbortSignal.timeout(10).reason.stack)` after abort | 299 | 30 | 299 | 30 |

The exact native outputs visibly differ both **between Node and Chromium on the same OS** and, for the first three rows, between Windows and Linux Node installations. The latter differences correspond to CRLF versus LF source-line endings in shipped Node built-in implementations, a separate source-observation channel from the `Blob({endings:'native'})` byte conversion issue.

On the independent local runtime, Node `v22.16.0` on Linux and Chromium `144.0.0.0` produced the same qualitative four differences, with the same Linux Node source lengths and Chrome source lengths. Two independent configurations therefore confirmed the native-string mismatch. This is real browser/Node observation, although **it does not constitute a heterogeneous SCO RPC end-to-end test**, and does not prove arbitrary JS programs portable after partitioning.

A shell-free manual reproduction needs Node 22, project dependencies including `puppeteer-core`, and Chrome/Chromium selected using the `CHROMIUM_BIN` environment variable or Puppeteer's normal `channel:'chrome'` discovery. The opt-in GitHub manual-validation focused workflow is the authoritative source-pinned reproducer and prints its own runtime metadata.

The table is evidence that a compiler must preserve the origin of native function source and DOMException stacks before moving code between environments. It does not quantify resistance to static deobfuscation, online relaying, filesystem compromise or the project-wide 2.5× compute budget.

## Native DataCloneError wording from structuredClone on noncloneable values

A further cross-host error-observation difference arises from `structuredClone` on an uncloneable function. The selected private source can catch the resulting `DataCloneError` and return its `.message`, which is part of its original observable semantics. Both Node and Chromium throw, but their native message text is different.

The opt-in native two-realm differential test was extended in `test/sco-host-native-source-browser.test.js`, with main test-source SHA `a35f41861213954e04bd1b860a305fcc2d664b89` [run 45079663555](https://github.com/FlareZ123/obfs/actions/runs/45079663555). Both Ubuntu and Windows passed Node v22.23.4 / real Chrome 157 and strict JSDoc. For exactly `structuredClone(()=>7)`, the observed text was:

| Runtime | Full `DataCloneError.message` | UTF-16 string length |
|---|---|---:|
| Node v22.23.4 (Ubuntu/Windows) | `()=>7 could not be cloned.` | 26 |
| Chrome 157 (Ubuntu/Windows) | `Failed to execute 'structuredClone' on 'Window': ()=>7 could not be cloned.` | 75 |

The exact-output discrepancy is independently observable in a real browser and Node runner without any obfuscation.

On frozen canonical SCO compiler `c8f3feff5d7f994e5ea5ba14690d188bf9bb2576`, `partitionScoSelectedAsyncExports` accepted this selected private source:

```js
export async function protectedOp(){
  try { structuredClone(()=>7); return 'unexpected'; }
  catch(error) { return error.message; }
}
export function visible(){return 7;}
```

The [frozen test-only red SHA `6b737879bef55e67b98f67821149899e99cf4569`](https://github.com/FlareZ123/obfs/commit/6b737879bef55e67b98f67821149899e99cf4569), [two-OS focused CI 45079615877](https://github.com/FlareZ123/obfs/actions/runs/45079615877), failed the expected conservative-refusal assertion while two native and selected-positive controls passed. It is therefore a compiler-admission counterexample against the intended same-observable-output relocation contract.

The isolated [green patch `e9b26cb06cba1da038d375a5c7689e763e7a3c92`](https://github.com/FlareZ123/obfs/commit/e9b26cb06cba1da038d375a5c7689e763e7a3c92), [focused run 45079898286](https://github.com/FlareZ123/obfs/actions/runs/45079898286), passed **Ubuntu and Windows**, with strict project and external JSDoc. The diff is **45 added compile-time production lines**, no deletion, plus one **41-line** `test/sco-structured-clone-error-message.test.js`. A bounded `provedCloneLiteral` accepts only owned inert JSON-safe literals and literal-array/object trees, finite depth32, with a direct known `structuredClone` call using exactly one input. It refuses opaque/native method inputs, function values, first-class extraction and unproved arguments; selected primitive and literal-record cloning positives remain admitted. No additional runtime work is added to generated code.

This guard establishes only a narrow **conservative admission envelope** under ordinary stable native intrinsics, and may reject legitimate safe program shapes. Browser/Node behavioral equivalence for unknown values, transfer lists, external callbacks, getters, proxies or custom objects is **not established**. The patch is [branch `agent8/sco-structured-clone-error-red-20261122`](https://github.com/FlareZ123/obfs/tree/agent8/sco-structured-clone-error-red-20261122) awaiting Agent 40 canonical incorporation. The [owner handoff](../communications/agent40/20261122T2252Z_agent8_structuredclone-native-error-red-green.md) requests a single integrated full exact-SHA validation instead of a competing PR. The overarching strong-protection candidate remains RELEASE-BLOCKED.

## Native URL, Base64 and decoder error messages: actual browser/Node comparison and codec admission repair

An opt-in browser/Node differential SFT added three invalid-input native APIs to the previously measured Blob, AbortSignal and structuredClone host-origin cases. At main SHA `0e117ac817ec9e794fe736bc02a0b178668d7c2e`, [run 45080204330](https://github.com/FlareZ123/obfs/actions/runs/45080204330) passed Node v22.23.4 versus Chrome 157 on **both Ubuntu and Windows**, strict project and external JSDoc, with exact error strings and SHA256 in CI:

| Invalid source operation | Node `error.message` | Chrome `error.message` |
|---|---|---|
| `new URL('%%%')` | `Invalid URL` | `Failed to construct 'URL': Invalid URL` |
| `atob('bad?')` | `Invalid character` | `Failed to execute 'atob' on 'Window': The string to be decoded is not correctly encoded.` |
| `btoa('Ā')` | `Invalid character` | `Failed to execute 'btoa' on 'Window': The string to be encoded contains characters outside of the Latin1 range.` |
| `new TextDecoder('not-a-charset')` | `The "not-a-charset" encoding is not supported` | `Failed to construct 'TextDecoder': The encoding label provided ('not-a-charset') is invalid.` |

The existing selected SCO compiler at canonical source `c8f3feff5d7f994e5ea5ba14690d188bf9bb2576` already refused invalid URL and non-UTF8 TextDecoder inputs, while admitting their proved constant/UTF8 positive paths. It **incorrectly admitted** a private function that catches and returns `error.message` from invalid `atob('bad?')` or non-Latin1 `btoa('Ā')`. On [frozen test-only red SHA `ab91271eded6f6adb1feec234c4910de35e88219`](https://github.com/FlareZ123/obfs/commit/ab91271eded6f6adb1feec234c4910de35e88219), [CI 45080424933](https://github.com/FlareZ123/obfs/actions/runs/45080424933) failed exactly the two expected-refusal tests on **both** OSes; three native/positive-control groups passed. These are admission counterexamples for browser-to-server semantics under stable genuine native APIs.

The isolated [green source SHA `7624d44b89c3b6b51a58bdf126276ee5c1765906`](https://github.com/FlareZ123/obfs/commit/7624d44b89c3b6b51a58bdf126276ee5c1765906), [CI 45080505652](https://github.com/FlareZ123/obfs/actions/runs/45080505652) passed **all five** test groups on Ubuntu and Windows with strict project/external JSDoc. Against frozen baseline `c8f3feff...`, exactly **31 added compile-time production lines** and a 55-line regression SFT were introduced, without deletions. The guard allows only direct canonical padded Base64 string literals in `atob` and direct Latin1 string literals in `btoa`; unsafe or unproved host call shapes remain unrelocated. The positive tests preserve valid `atob('QQ==')`, `btoa('A')` and `btoa('ÿ')`, plus existing safe URL and UTF-8 decoder operations. No generated protected runtime operations are added.

The branch [`agent8/sco-host-error-wording-red-20261122`](https://github.com/FlareZ123/obfs/tree/agent8/sco-host-error-wording-red-20261122) was handed to the canonical SCO owner at [20261122T2259Z](../communications/agent40/20261122T2259Z_agent8_native-base64-error-wording-red-green.md). Its conservative syntax envelope leaves many valid but unproved dynamic codec calls on the client. The result does not establish full native exception or intrinsic mutation closure, nor any stronger protection versus a controlled client or a universal 2.5× performance bound.
