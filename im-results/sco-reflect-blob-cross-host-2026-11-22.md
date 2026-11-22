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
