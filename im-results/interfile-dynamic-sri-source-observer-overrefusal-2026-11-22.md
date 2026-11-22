# Runtime-composed SRI through imported factories: existing source observer overrefusal

**Status:** A proposed missing SRI-protection witness was falsified by independent controls. Source-pinned targeted exploration, not an established release/security claim.
**Reproducer branch:** `agent30/interfile-dynamic-sri-provenance-20261122`, final diagnostic source `8783c1d7d51d65491593e7d8b29be7a7db3ef570`.

## Experiment

An ESM module exports `build()`; a second ESM module imports it and assigns a runtime-built SRI string through an opaque property:

```js
import {build} from './factory.mjs';
const target = build();
target.src = './client.js';
const attr = globalThis.injectedAttribute || 'integrity';
const digest = globalThis.injectedDigest || '<base64 hash of original client>';
target[attr] = 'sha256-' + digest;
document.head.append(target);
```

The implementation's bounded `looksLikeSriHash` evidence requires a recognizable static full hash; the string here is dynamically combined. The initial hypothesis was that an imported `build()` returning `document.createElement('script')` would escape both the imported factory receiver proof and literal hash fallback.

**Observed:** The compiler already preserved `client.js` without changes, in all three modes, for three syntactic direct/arrow/alias exported DOM factory shapes. [Focused run 45073765152](https://github.com/FlareZ123/obfs/actions/runs/45073765152) passed at `5490a0490877dbb644e391d2593636a1e0f8714c`, so the proposed underrefusal did not reproduce.

A stronger positive control substituted `export function build(){return {src:''};}`, retaining the same importer and string expression. The ordinary-object graph was **also preserved**, so the expected transformation-yield control failed on both operating systems in [run 45073948851](https://github.com/FlareZ123/obfs/actions/runs/45073948851) at `632a9eafa66d164d5a931fd40838e2583b4fe1c6`. This constrains interpretation: the initial passing test was caused by conservative analysis, without a proven DOM-specific provenance chain.

## Guard attribution

The isolated direct diagnostic in `test/source-observer-control-diagnostic.test.js` (branch revision `8783c1d7d51d65491593e7d8b29be7a7db3ef570`) ran in [Ubuntu/Windows focused workflow 45074530565](https://github.com/FlareZ123/obfs/actions/runs/45074530565). Both factory variations returned:

| Factory return | Transformed client | `observesDistributedSource(entryAst)` | `observesFunctionSource(entryAst)` | Both producer source guards |
| --- | --- | --- | --- | --- |
| DOM script | false | false | true | false |
| Plain object | false | false | true | false |

These are true observed flags at that pinned source version. They identify **generic function-source overrefusal in the importer**, independently of an explicit SRI source guard. They do not establish a JS semantic defect or justify removing a guard, since an opaque computed property can observe function source under other runtime values.

## Research consequence

A precise improvement would need evidence about the value returned by `build()`, including interprocedural may-return-function and may-return-DOM-script facts. Suppressing the generic observer solely because the local import is unknown would risk exposing `Function#toString` behavior. A future candidate should demonstrate: (1) source parity for an actual imported function receiver, (2) SRI preservation for an actual imported DOM script receiver, and (3) positive obfuscation yield for a strictly proved ordinary-object factory, with real Chromium and Node differential tests. Until then the existing conservative refusal remains preferable. The primary strong-obfuscation objective remains RELEASE-BLOCKED.
