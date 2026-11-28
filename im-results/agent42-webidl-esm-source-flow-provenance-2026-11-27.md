# Cross-file ESM DOMString function-source provenance and selective obfuscation

**Status:** Intermediate executable research; finite exact-source compatibility result, *not* a general proof or release approval. Recorded 2026-11-27, Agent 42. This evidence is intentionally under `im-results/`, not the academic `results/` index.

## Problem and externally observable contract

When a JavaScript function value is passed to an actual browser DOMString-converting operation, the native host may observe the stringified function source, not merely the function's numeric return value. A cross-file obfuscator that safely renames `owner.secretField` for ordinary runtime values can break a perfectly valid program that passes the exported function through a local alias, object property, array, conditional, callback parameter, local function return, namespace import, or re-export before assigning it to `Element.id`:

```js
// logic.mjs
const owner={secretField:57};
export function inspect(){return owner.secretField;}

// observer.mjs
import {inspect} from './logic.mjs';
const alias={callback:inspect};
const element=document.createElement('div');
element.id=alias.callback; // native DOMString conversion observes function text
```

For this example, changing `owner.secretField` to `owner._p...` can preserve `inspect() === 57` while changing `element.id` from the original source string. Thus numeric output parity and property-name coverage alone are inadequate correctness criteria. This is a semantic compatibility boundary, not a claim that observers can always recover protected server-private logic.

## Exactly pinned baseline and donor candidate

- **Production comparison baseline:** draft PR [#384](https://github.com/FlareZ123/obfs/pull/384), exact source SHA `a8a22f9aef6e7f0d487cebc23c87063376df55cb`.
- **Test-only research branch:** [agent42/dom-source-immutable-alias-falsifier-20261127](https://github.com/FlareZ123/obfs/tree/agent42/dom-source-immutable-alias-falsifier-20261127); not a production PR, and HEAD can advance beyond tested source commits.
- **Narrow patch 1:** `f40cf3f634220402c19fd420a6802c8b93a5ef15`, restore selected-island property rewrite exception *only for property renaming*, preserving all other source-observer vetoes.
- **Narrow patch 2:** `6f02b59cb81b333f7236714fbd9383e1e52f5e06`, propagate imported callable source origin across plain identifier assignments and chains using a monotone may-origin set.
- **Wider candidate:** `a01555e35f7fb7ba54e762788e5d536d8b1f30d8`, add bounded points-to/source-flow inference for statically imported module values over object/array fields, member writes, destructuring, conditional values, local function parameters/returns, namespace member reads and transitive static re-exports. Unproven DOMString operand origins fall back to conservative preservation of potentially callable imported producers. This is *not* arbitrary JavaScript whole-program inference.

## Differential fixtures and evidence

Every flow below uses a valid static three- or four-file ESM graph with a separate `pure.mjs` whose safely renameable `privateField` remains an actual positive obfuscation yield. The harnesses execute **both original and emitted programs**, not merely inspect code text. They verify numeric `inspect()===57`, independent value `73`, exact native source text `function inspect(){return owner.secretField;}`, and positive independent property rewrite count.

| Pinned source / fixture | Environment | Exact-source result | Provenance |
| --- | --- | --- | --- |
| `a8a22f9...`, simple direct vs local alias | Ubuntu headless Chromium native `Element.id` | Direct pass for each COO/SNO/SCO; alias fail for each | [run 46076254328](https://github.com/FlareZ123/obfs/actions/runs/46076254328) |
| `a8a22f9...`, local alias, DOMString-like property setter and stream writer | Native Node process + external `String(value)` host shim, Ubuntu/Windows/macOS | Six source divergences, three modes × two sinks; six direct controls pass | [run 46076041626](https://github.com/FlareZ123/obfs/actions/runs/46076041626) |
| `6f02b59...`, same simple alias | Real headless Chromium native `Element.id` | Six comparisons pass with independent property rename | [run 46076750507](https://github.com/FlareZ123/obfs/actions/runs/46076750507) |
| `6f02b59...`, 16 flow patterns | 3 OS × Node host-shim, original vs emitted × three modes | 36/48 mismatches remain in 12 advanced flows | [run 46077151326](https://github.com/FlareZ123/obfs/actions/runs/46077151326) |
| `a01555e...`, exact same 16 flows | 3 OS × Node host-shim | 0/48 mismatches, all unrelated positive property rewrites retained | [run 46077714440](https://github.com/FlareZ123/obfs/actions/runs/46077714440) |
| `a8a22f9...`, expanded 16-flow single-session Chromium test | Native browser `Element.id` | **45/48 fail**, all 48 execute and positive yield 1 | [run 46078041289](https://github.com/FlareZ123/obfs/actions/runs/46078041289) |
| `a01555e...`, *identical* expanded Chromium harness | Native browser `Element.id` | **0/48 fail**, all 48 execute, producer rewrites 0, independent positive yield 1 | [run 46078032525](https://github.com/FlareZ123/obfs/actions/runs/46078032525) |

The exact browser test-only harness is pinned at `7d6cb9dd145a2c894079419ae3b9a6b6c03fb59d:im-results/agent42-dom-flow-browser-matrix-2026-11-27.js` and was loaded by the *existing* `.github/workflows/source-observer-direct-validator.yml` after an exact candidate checkout; the workflow verifies candidate and harness commit IDs independently. The native browser runs serve all 96 original/emitted ESM module graphs by localhost HTTP, dynamically import them from a single document, collect results and compare 48 original/emitted pairs. This is stronger than the Node String shim but covers **only native Chromium Element.id**; stream writer evidence remains the external-host-shim witness, not a native-browser proof.

The precise 16 carriers are direct import, immutable alias, two-hop alias chain, mutable identifier assignment, object property, array index, assigned object property, object alias, object destructuring, conditional expression, local parameter-to-return function, closure return, arrow return, callback parameter to DOM sink, ESM namespace import, and named barrel re-export. The original PR fails 15 per mode in real Chromium; the narrow direct-alias fix still fails 12 per mode in Node; the widened may-origin solver covers this finite set.

## Why negative and positive controls are paired

A false security-performance solution can simply freeze *every* imported module and report zero source mismatches. We therefore require the unrelated `pure.mjs` private owner property to be genuinely rewritten in **every** flow and mode, not just that `independent===73` remains true. An intermediate overbroad fallback at source `c6f3fe5e...` preserved additional source but **failed the independent rewrite control** for at least the object-property case, and its typecheck initially exposed an automatic-semicolon-insertion error in a multiline `return`. This was rejected as an acceptable final solution. The later `a015...` source tracks proven may origins before conservative fallback and passes the paired controls across all 48 observations.

## Distinguish SCO offline compiler from SCO HTTP handler

The baseline test of `obfuscateFiles({mode:'sco'})` treats SCO as an obfuscation output mode, but the actual request-time `createScoHandler` can make different, globally conservative publication decisions. A separately pinned exact-source HTTP-handler Chromium test using `a8a22f9...` and harness `8d6aa8d471e6cb6e1def4379104b423537478530:im-results/agent42-sco-dom-alias-handler-browser-2026-11-27.js` shows the **specific** local alias `Element.id` source preserved both directly and through an alias. The handler served `logic.mjs` byte-identically, while it **did** change and truly rename the unrelated `pure.mjs` private field. [Run 46076999628](https://github.com/FlareZ123/obfs/actions/runs/46076999628). This is a narrow counterexample to an overgeneralized SCO claim, **not** evidence the handler is universally source-safe: prior Agent 19 Storage DOMString source observations (e.g. `im-results/agent19-sco-create-handler-storage-source-2026-11-23.md`) document a separate live request-time source-divergence boundary.

## Integration and unresolved requirements

The donor remains unmerged, and the single actual release candidate PR #384 was not changed by these tests. Its earlier exact-head full Node.js gate [46069581867](https://github.com/FlareZ123/obfs/actions/runs/46069581867) failed seven **selected source-observer island** positive rewrite cases on both Ubuntu and Windows; restoring the property-only exception at donor `f40cf3f...` passed its focused three-OS test [46076548656](https://github.com/FlareZ123/obfs/actions/runs/46076548656). The narrow combined `6f02b59...` source subsequently passed the original full two-OS manual gate [46076746019](https://github.com/FlareZ123/obfs/actions/runs/46076746019). The widened `a015...` source has a distinct full two-OS run [46077808076](https://github.com/FlareZ123/obfs/actions/runs/46077808076), **pending at this report's first version**; check final conclusion before any admission decision.

Remaining *unproven* dimensions: arbitrary computed/dynamic property access, arbitrary host/webidl coercion dispatch, mutable native host and prototype methods, function-source reflection across foreign realms, cross-module dynamic import and opaque return values, lexical scope-sensitive precision, byte-level source observation by other APIs, attacker instrumentation and source extraction, domain-locking against an adversary controlling the client, unrestricted SNO runtime compromise, reconstruction difficulty, and the user's **universal ≤2.5× obfuscated execution-time bound**. A bounded no-runtime-cost compiler-side analysis cannot by itself establish those guarantees. Further adversarial regression suites (including Agent 8 branch-CFG and Agent 47 descriptor/evaluation-order falsifiers) must pass at the **same exact integrated candidate head** before a release can be justified.

## Reproduction path

1. Check out the pinned candidate SHA, rather than mutable branch HEAD, and confirm it.
2. Fetch a pinned test-only harness SHA independently; compare checksums.
3. Use the existing `source-observer-direct-validator.yml` `workflow_dispatch` inputs `candidate_sha`, `harness_sha`, `harness_path` or run the standalone harness from `RUNNER_TEMP` with the compiler candidate as working directory and installed package dependencies.
4. For the 3-OS Node host-shim differential, run `node --test test/agent42-dom-alias-flow-matrix.test.js` at or after test-only commit `a53b0878...`.
5. Read `DOM_FLOW_REAL_CHROMIUM` structured JSON in the browser logs, including the *empty/nonempty mismatch array* and the independent rewrite metric; do not infer success from a single numeric output.
6. Distinguish the released production candidate's own full two-OS, browser, typechecking, benchmark, and adversarial gates from any standalone research donor's passing tests.

**Interpretation:** The protected producer-source mismatch is a reproducible, non-vacuous compatibility defect. The research donor resolves a specified finite set with useful obfuscation yield, but a global security/performance solution is not established and no general release approval follows.
