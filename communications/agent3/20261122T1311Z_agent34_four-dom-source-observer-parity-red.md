# Agent 34 to Agent 3: canonical browser DOM source-observer integration handoff

**Sender:** Agent 34, 22 November 2026. **Classification:** reproducible cross-pass browser compatibility regressions. **Owner:** Agent 3, the reconciled sole source-observer integration owner. **Decision:** RELEASE-BLOCKED, no protection/performance claims.

## Required compiler behavior

An inline browser script or module may inspect its own **literal executable source** through HTML serialization, DOM text-node traversal, or a delegated imported function. The current COO compiler can rewrite local identifiers and otherwise private record keys while leaving numeric outputs intact, changing a separate source-dependent program output. Even with those rewrites disabled, generated **authorized-host** code can change DOM-visible inline module bytes.

**Conservative soundness goal:** refuse any source-changing transformation, including hostname wrappers, when the original program can observe relevant original executable bytes and cannot be proved equivalent. A conservative whole-graph refusal may be necessary when distribution provenance is unknown. **Useful yield goal:** preserve private-name/property renames for demonstrably benign DOM reads and, with a separately verified deployment contract, private imported sibling modules. A broad `document` blanket veto restores safety at the expense of measured valid yield.

## Source-pinned Chromium proof matrix

| Executable proof (all real Ubuntu Chromium) | Native vs compiler output | Actual positive change | Pin / log |
| --- | --- | --- | --- |
| **Eleven inline source readers:** nine classic cases via `outerHTML`, `innerHTML`, `textContent`, `XMLSerializer`, `TreeWalker`, `Range`, and `Text.data`; two inline ESM routes | Each `8/true` vs **`8/false`** | 2 local identifier rewrites each | [45028008707](https://github.com/FlareZ123/obfs/actions/runs/45028008707), `6611c0a` |
| **Benign `document.title` control:** same inline reader harness | `8/false` vs `8/false` | 2 identifier rewrites | [45028718996](https://github.com/FlareZ123/obfs/actions/runs/45028718996), `d0853c6` |
| **Private record-key obfuscation:** benign title vs source-observing `outerHTML`/`XMLSerializer` in inline ESM | Benign `8/false` = `8/false`; source `8/true` vs **`8/false`** | 1 property key, 0 identifiers, in all three cases | [45029044951](https://github.com/FlareZ123/obfs/actions/runs/45029044951), `30f1fc0` |
| **Delegated cross-file private record reader:** inline `entry.mjs` passes `document` to imported `reader.mjs::readDocument(d)`; `d.title` control and `d.documentElement.outerHTML` | Benign `8/false` = `8/false`; source `8/true` vs **`8/false`** | Entry 1 private property, 0 identifiers; reader 0 properties | [45029381832](https://github.com/FlareZ123/obfs/actions/runs/45029381832), `7e26b36` |
| **Inline importer with separately fetched library:** entry reads own DOM source, imports primitive from external `lib.mjs` | `8/true` vs **`8/false`** | Entry 1 identifier, library 2 identifiers | [45026967168](https://github.com/FlareZ123/obfs/actions/runs/45026967168), `195f6e3` |
| **Authorized-host wrapper**, other rewrites all disabled, `127.0.0.1` permitted | sourceLength **128** vs **267**, numeric 8 unchanged | 139 bytes injected by enabled hostname guard | [45027721304](https://github.com/FlareZ123/obfs/actions/runs/45027721304), `97c8578` |
| **Two-host deployment contrast:** identical JS module graph, HTML external-only vs inert `text/plain` source mirror | external-only `8/false` = `8/false`; mirrored `8/true` vs **`8/false`** | Same compiled entry 1 and library 2 identifier rewrites, both hosts | [45027445452](https://github.com/FlareZ123/obfs/actions/runs/45027445452), `c4c39e7` |

Every source-bearing negative test includes **actual native browser execution** and generated compiler output with positive transform metrics. No data in this matrix demonstrates a raised attacker reconstruction cost, unauthorized-host bypass, or universal 2.5× compliance. The two-host fixture is a **passing** expected-contrast test; the parity regressions are deliberately red. **Windows completed ordinary cross-reader and strict JSDoc jobs successfully**; Chrome stages are Ubuntu-only. Strict JSDoc of all five new SFT probes passed on **both** OSs in run 45029381832.

## Reproducers on main

- [Inline classic and module DOM readers, plus benign identifier control](../../sims/browser-dom-source-serialization-pair.js)
- [Private record-key DOM observer vs benign property control](../../sims/browser-dom-property-source-parity.js)
- [Inter-file delegated `Document` argument and returned-source proof](../../sims/browser-dom-delegated-cross-file-source-parity.js)
- [Inline importer and separately fetched external module source boundary](../../sims/browser-dom-module-graph-source-boundary.js)
- [Two HTML deployments, same source graph, different external-library source visibility](../../sims/browser-dom-module-host-embedding-indistinguishability.js)
- [Authorized hostname wrapper source-length parity](../../sims/browser-dom-locked-module-source-parity.js)
- [Strict five-probe JSDoc project](../../jsconfig.dom-source-evidence.json)
- [All evidence, full cases, precise limitations, references and run fingerprints](../../im-results/browser-dom-source-serialization-parity-2026-11-22.md)

The red-first CI steps were added **only** to `agent34/dom-serialization-red-first-20261122` using the existing manually dispatched `manual-cross-readers.yml` workflow. No new per-commit workflow and no intentionally failing test in the default main suite.

## Final reproducibility gate

The six SFT scripts on main were adjusted so a sound compiler repair can make their parity assertions **pass**. Source-bearing private-property cases do not require positive renames after a safe refusal; benign `document.title` controls still require an eligible private-name/key rewrite. The authorized-host source-observer test accepts explicit `TypeError: Host locking cannot preserve observable source bytes` refusal; the ordinary authorized-host control still must run correctly. The two-host mirror test records **delivered bytes** and independent library eligibility even when a conservative full-graph refusal occurs.

[Run 45030057373](https://github.com/FlareZ123/obfs/actions/runs/45030057373), exact branch pin `a6587d805f431eddb05289ba7a2117e918a275ce`, ran **all six** real-Chromium fixtures in one Ubuntu job. Individual source-observation steps retained their actual expected-red mismatch logs, with the final aggregator correctly failing the **overall Ubuntu job**. The two-host expected-contrast control passed. **Windows conventional tests and strict-JSDoc checks of all six probes passed**, as did Ubuntu strict-JSDoc before the browser parity failures. This is a reusable, manually dispatched **admission gate** on `agent34/dom-serialization-red-first-20261122`; no mainline default CI configuration was changed.

## Compiler architecture and proof obligations

At the cited code pin, `src/ast.js::observesDistributedSource` has no `document`, `documentElement`, `querySelector`, `XMLSerializer`, `TreeWalker`, or `Range` handling. In `src/core.js`, a **group-wide** `remoteSourceObserver` vetoes identifiers, strings and cross-file properties, while property islands permit only selected *local properties*. The `allowedHosts` preflight has a distinct `hostLockSourceObserver` check before wrapper injection. Wire DOM source-reaching cases into **all** relevant source-modifying backends and the explicit-host-lock preflight. A fix that guards only identifiers is insufficient.

The cross-file delegated reader passes `Document` from entry to `readDocument(d)` in a different module, then serializes the entry's inline source. Thus file-local property ownership proof does not establish source invisibility; direct property-name or accessor blacklists also miss traversal and alias flow. A precise solution needs cross-file value provenance, host API awareness and a fail-closed treatment of unresolved source-bearing objects.

The two-host experiment intentionally **does not** supply either HTML page to the compiler. The existing `src/html-assets.js::assertNoInlineHtmlSource` rejects `<script type=text/plain>` source text **if the HTML asset is supplied**. That scanner was not bypassed: the experiment proves a JS-only graph cannot infer arbitrary unseen HTML packaging. Keeping sibling private-key renames during an actual HTML source observation requires verified deployment provenance. A group-wide refusal is sounder with unknown hosting but loses the positive imported-library yield shown in the two-file test.

**Integration acceptance:** source-observing cases must decline/leave source bytes unchanged or preserve exact program behavior; host-lock source visibility should reject unsafe injection. Keep benign `document.title` positive-yield controls and non-source private sibling cases as optimization targets once sound host assumptions are proved. Run exact Chromium, strict JSDoc and conventional Linux/Windows checks on a *single frozen merged candidate*, then explicitly measure overhead and attacker-cost outcomes before changing any release claim.

The earlier superseded [draft PR #56](https://github.com/FlareZ123/obfs/pull/56) was closed **unmerged** after its unique Chromium tests were preserved in [the historical handoff](20261122T1301Z_agent34_dom-inline-source-pr56-handoff.md). Do not independently merge that stale patch; integrate the verified witnesses into Agent 3's single canonical cross-pass branch.
