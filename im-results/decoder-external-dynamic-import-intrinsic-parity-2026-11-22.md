# Unproved dynamic ESM import corrupts later ambient string decoder

**Agent 27, 22 November 2026. Classification: intermediate source-pinned correctness defect and conservative proposed repair.** This is not an adversarial-protection or performance advancement.

## Boundary and original red witness

The compiler accepts a supplied ESM group with `entry.mjs` and `target.mjs`. The entry dynamically imports a `data:text/javascript,` module **outside** that group before dynamically importing the target. The external module executes `String.fromCharCode=()=>'?'`, mutating the same Node realm intrinsic before the target initializes. The target's original source is `export default 'protected-literal-value';`.

With `mode:'coo'`, `strings:true`, `properties:false`, `identifiers:false`, the original two-file graph prints `protected-literal-value`. The original compiler encodes the target literal with a decoder that calls the mutable ambient `String.fromCharCode`, so the emitted graph prints 23 question marks. This is genuine 1:1 semantic corruption, independent of source secrecy. The exact same issue applies to SNO in the supplied graph; the initial assertion stopped on COO.

Red proof: [source `ff434b58cf8ec0e58991707fcc74c8df7d949835`](https://github.com/FlareZ123/obfs/commit/ff434b58cf8ec0e58991707fcc74c8df7d949835), [Ubuntu/Windows focused run 45013749778](https://github.com/FlareZ123/obfs/actions/runs/45013749778). Both OS jobs failed the native-versus-emitted comparison with the same exact output discrepancy. A separate exactly supplied relative `import('./target.mjs')` positive case retained a real string rewrite and passed.

## Bounded repair

`src/core.js` now scans `ImportExpression` nodes at the string-decoder admission boundary. A dynamic import is proven within the group only when its source is a literal, unadorned `./` or `../` relative specifier, its resolved canonical posix filename is an input **JavaScript** source, and there are no import options or URL query/hash/percent/backslash aliases. Other dynamic imports conservatively disable string encoding across the supplied group. The existing intrinsic-mutation scanner still examines each supplied source, including a dynamic dependency which directly patches String.

The production JavaScript string decoder is not changed; the repair chooses when to avoid adding it. This preserves an important positive lane: a known direct relative import of a supplied target still receives at least one real encoded literal and executes identically.

Initial green proof: [source `e58f404d79a4600a4ab3403d29787b3a798f21b4`](https://github.com/FlareZ123/obfs/commit/e58f404d79a4600a4ab3403d29787b3a798f21b4), [two-platform focused run 45013936799](https://github.com/FlareZ123/obfs/actions/runs/45013936799), including strict project and external JSDoc. Expanded cases at `ef2633bc850855c1b65ce6f7b5760d029bb2c34f` cover computed `data:` module imports and in-group dynamic dependency mutations; the [second two-platform focused run 45014066119](https://github.com/FlareZ123/obfs/actions/runs/45014066119) also passed all four tests on both operating systems with both JSDoc checks.

## Scope and open verification

The proof deliberately treats unknown imports and attributes as untrusted. It does not establish provenance for static external imports, custom host import maps, a malicious Node loader, external preloads, or dependencies absent from the supplied group. It can refuse benign dynamic imports. Native code can also be modified through other dynamic capabilities not represented by an `ImportExpression`; this repair is one bounded source-identified route, not a general effect theorem.

The added `test/decoder-dynamic-data-esm-browser.js` uses actual localhost-served Chrome ESM pages with a dynamic `data:` module mutating the browser intrinsic. It compares original and emitted module graphs and a positive safe relative-import control. It is wired into the **existing** `manual-browser.yml` rather than adding a separate workflow. Its verdict should be pinned separately once the manual run completes. No full ~4,300-test validation or strict 2.5× workload gate has been run against this candidate yet. The code change affects build-time admission, without establishing runtime budget compliance for a full application.

Overall strong-protection release decision remains **RELEASE-BLOCKED**. A stable combined source and browser validation is required before integrating this candidate.
