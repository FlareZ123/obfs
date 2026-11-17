# Host-provided same-origin iframe falsifies closed-ESM source isolation

**Date:** 2026-11-17. **Status:** independently witnessed runtime counterexample, mitigation remains architectural. **Agent:** Agent 8.

## Frozen original and execution setting

Three declared ESM files are passed to `obfuscateFiles`: a watched primitive-returning leaf, a selected pure primitive-returning leaf with one private own-data property `privateB`, and an entry importing and calling each function. The watched function is observed with `toString()` to cause the normal compiler to decline group rewrites. With the explicit experimental island selection, the selected leaf gets exactly one property rewrite while the watched module stays unchanged.

The *hosting HTML document* is deliberately outside this all-ESM input list. It includes a same-origin named iframe `sourceView` whose `src` URL requests the selected leaf from the same server, using `?plain=1` so that the browser renders exactly the corresponding JS text as an ordinary `text/plain` child document. The normal `.mjs` import URL still receives the standard JavaScript MIME type. The entry uses `frames['sourceView']['doc'+'ument']['body']['textContent']`, producing a boolean for whether the selected source still includes `privateB`. It deliberately avoids the forbidden literal `document`, `fetch`, `Object`, `Reflect`, and timer-string APIs in its own AST. Its `load` listener executes after the named iframe has finished loading.

## Pinned real Chromium result

Source SHA: `6c7defd1db576b7624b91588ff958b419ead9df1`. [Focused Ubuntu/Windows workflow 44110651162](https://github.com/FlareZ123/obfs/actions/runs/44110651162), with Ubuntu real Chromium `157.0.8103.50`, passed the expected counterexample check. The simulation is [`sims/source-island-browser-host-iframe-attack.js`](../sims/source-island-browser-host-iframe-attack.js).

| Measurement | Native graph | Emitted selected-leaf graph |
| --- | --- | --- |
| Own private property rewritten in emitted leaf | N/A | **1** |
| Same-origin iframe body includes `privateB` | `true` | `false` |
| Primitive application return | 23 | 23 |

The log marker is `SOURCE_ISLAND_IFRAME` with status `host-source-observation-changed`. The run demonstrates real external observation of a changed distributed byte sequence despite the compiler recognizing only a pure ESM leaf within its supplied JavaScript graph.

## Scope of the result

This is a **host-capability counterexample**. It does not claim that every browser hosting page exposes source files this way or that a source file is normally served with a `text/plain` alias. The special query route is part of the reproducible test environment and must be declared in any comparison. Because external HTML and its frame hierarchy are absent from the ESM-only input set, the compiler cannot establish a universal absence of host-provided source readers using an internal file-graph scan alone.

An immediate targeted mitigation could conservatively forbid `frames`, `parent`, `top`, `opener` and all unproved free host identifiers in the experimental path, but arbitrary global names introduced by the embedding HTML mean a fixed blacklist cannot prove the stronger open-world contract. A lexical-scope-aware free-global check could reduce the admission surface for a *declared trusted intrinsic* allowlist. Such a change requires its own positive coverage and nested lexical shadowing tests before adoption. Longer-term: explicitly distinguish a closed-world deployment with independently audited hosting markup and browser capabilities from code intended for an arbitrary embedder.

No compiler repair is claimed in this report. The focused test is an executable negative witness, while independent positive selected-leaf real-browser tests remain available in `test/source-observer-islands-browser.js`. Do not promote this finding to a general source-secrecy or 2.5× runtime conclusion.
