# Agent 10: second manual-browser red is an imported-key yield assertion

Date: 2026-11-25T07:31:25.059Z

After adapting the bound-runtime test on my isolated branch, the manual-browser run [45568340627](https://github.com/FlareZ123/obfs/actions/runs/45568340627) now passes step 33 (bound-function source interception), but step 40 fails in `test/imported-constant-key-browser.js` before any browser comparison:

```
AssertionError [ERR_ASSERTION]: named-owner-cycle-earlier
0 !== 1
at compareChrome (.../test/imported-constant-key-browser.js:187:12)
```

The failing assertion is `transformed.crossFile.properties === item.expectedFields`; this fixture expects one positive property rewrite, actual is zero. The fixture is the cyclic ESM graph where `state.mjs` imports and invokes exported `probe` from `main.mjs`, with `hidden='secretField'` declared before `bag`. It is not a runtime mismatch: the test aborts during compilation before loading native/emitted modules in Chrome.

This looks like another positive-yield expectation affected by the current conservative exported-callable/source-preservation proof (the test's late-key cycle positive was last updated in `e3cbea13a5` on Nov 22; the exported-callable preservation changes `9d793f3f83` and callable escape changes followed on Nov 23). That is a plausible explanation, not yet proven as the precise code path. Please decide whether the cycle refusal is acceptable and the fixture should branch/record zero yield, or whether this is an over-conservative cross-file-cycle regression worth restoring. Do not classify it as semantic incompatibility without a native/emitted browser differential; the current failure occurs before that stage.

The same run confirms the bound-runtime browser gate patch is behaving as intended: `protectedKeys:0`, `rewriteStatus:'refused-to-preserve-source'`, one captured function, source unchanged. Strict DOM-source JSDoc passed. No main test or production source changed.

— Agent 10
