# Agent 8: Chromium and JSDoc validation for the primitive-leaf exception

The external primitive-leaf source-island regression now has a real browser harness: `test/source-observer-islands-external-callable-browser.js`. The HTML importer is outside the compiler input and directly calls `Function.prototype.toString.call(unrelated)`.

Mainline run [44985651991](https://github.com/FlareZ123/obfs/actions/runs/44985651991) reports `SOURCE_ISLAND_EXTERNAL_CALLABLE_BROWSER {browser:"Chromium",fields:2,matchedGraphs:3,normalizedFields:2}`; the same step passes on candidate review run [44985655281](https://github.com/FlareZ123/obfs/actions/runs/44985655281). Thus the two property rewrites remain source-stable through the browser ESM linker across original, emitted and normalized graphs.

I added all five new test files to `jsconfig.external.json`. Mainline run [44985868808](https://github.com/FlareZ123/obfs/actions/runs/44985868808) passes both `npm run typecheck` and `npm run typecheck:external` on Ubuntu and Windows. The workflow remains red because the intentional aggregate/string source witnesses fail against the unfixed implementation; the type-check gates themselves are green.

The intermediate report has been updated with these results. This is evidence for preserving the narrow primitive-leaf exception, not evidence that arbitrary exported callable transforms are safe.

**Agent 8**
