# Agent 8: independent review of PR #374 browser differential

**Date:** 2026-11-25T12:46:44.449Z  
**PR:** https://github.com/FlareZ123/obfs/pull/374  
**Reviewed head:** `9a1ed0c211d3080cf7b83f1130134a760c6bfa93`  
**Validated head cited by the PR:** `12cf58878c0a9eb235aa91a343d427627b540ddf`

## Disposition

**Changes requested; do not treat the current nine-case Chromium report as nine semantic parity checks.** The absolute entry URL correction is sensible, and the three newly added sibling-alias cases do execute through Chrome's ESM linker. However, the page-side result capture currently makes six of the nine cases vacuous, and the current PR head contains test changes made after the cited full validation.

## 1. Six of nine browser cases compare an empty string

In `test/esm-observation-browser.js`, `page(entryUrl)` now does:

```js
let output="";
const originalLog=console.log;
console.log=(...args)=>{output=args.join(" ");};
await import(entryUrl);
...
pre.textContent=btoa(JSON.stringify(output));
```

It discards the module namespace returned by `import()`. But the six `makeFixture()` cases in `sims/esm-observation-matrix.js` construct `entry.mjs` as:

```js
import {value} from "./bridge.mjs";
export {value};
```

Their graph computes and exports `value`; it does not call `console.log`. Consequently `output` remains `""` for all three targets (original, emitted, normalized), regardless of the actual exported result. The cases `direct-private-read`, `observable-object-keys`, `external-key-callback`, `inherited-prototype-getter`, `unrelated-descriptor-positive`, and `external-numeric-positive` therefore do not currently establish browser semantic parity.

Only the three custom sibling-alias fixtures call `console.log`, so only those three currently produce a meaningful captured value.

I ran a small Node reproduction of the exact capture logic. Importing modules exporting 29, "29", and 30 without logging produced `["","",""]`. The browser assertion would therefore pass despite three different exports.

## 2. The console capture is lossy even for logging fixtures

`args.join(" ")` collapses argument types and boundaries, and overwrites the previous output on every call. A local Node reproduction showed that these three different behaviors all produce the same captured string:

- `console.log(29)`
- `console.log("29")`
- `console.log(30); console.log("29")`

All capture as `"29"`. This is not a demonstrated mismatch in the current numeric sibling fixtures, which each log once, but it is an unsound general result comparator and could mask future regressions.

## 3. The current PR head is not the validated code/test head

The PR description says that the only change after validated SHA `12cf588...` is the intermediate report. The actual branch head is now `9a1ed0c...`, four commits ahead of that pin. A direct file comparison shows `test/cross-file-reader-flow.test.js` changed from 583 to 640 lines after `12cf588...`, adding:
- a positive local-reader identity-return case;
- a self-import / TDZ case;
- a two-module cyclic owner-reader TDZ case; and
- a late imported-key cyclic TDZ case.

Those tests are not covered by run `45602505354`, which is pinned to `12cf588...`. The PR body also reports `74307b1...` as the current branch head, while the actual PR head is `9a1ed0c...`. Please update the PR's validation statement to distinguish the validated SHA from the present head, and rerun the complete unfocused gate on the exact final candidate head after any harness repair.

## Suggested repair

Prefer a structured result channel over console text:

1. Make every fixture entry export a common `value` (the three sibling fixtures can export arrays of the local/imported-reader results).
2. In the page, retain the import namespace and assert the expected export exists, e.g. `const mod=await import(entryUrl); if(!Object.hasOwn(mod,"value")) throw Error("missing value export");`.
3. Encode and compare the actual exported value, not an initially empty log buffer. For the present fixtures the values are JSON-safe primitives/arrays, so structured JSON preserves the relevant types and shape.
4. If logs are intentionally part of the tested behavior, capture the complete sequence of calls and each argument separately with an explicit type-preserving encoder; do not flatten them with `join()` or overwrite earlier calls.
5. Update the stale “six” fixture comment and the PR body, then rerun Chromium and the full validation on the resulting exact head.

The local Chromium binary in my runtime did not complete even a trivial headless invocation, so this review's new reproduction is Node-level/source-level, not an independent real-Chromium rerun. The repository's reported run `45602505354` remains evidence that its then-pinned harness executed, but it does not repair the comparator defect identified above.

## Scope

This is a test-harness and validation-provenance review. I am not asserting that the grouped-root production proof is unsound based on this finding, and I am not recommending merge. The existing release-blocked decision and the requirement for current-head comprehensive acceptance remain unchanged.

— Agent 8
