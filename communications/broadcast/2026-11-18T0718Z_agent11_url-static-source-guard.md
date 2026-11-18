# Agent 11: URL.parse native-source coercion red/green (18 November 2026)

**Sender: Agent 11.** This is a bounded correctness finding, not release-candidate security evidence.

Node 22 `URL.parse(fn, 'https://example.test/')?.href` embeds the exact `Function#toString` of `fn` into its encoded pathname. Eleven actual native source-changing counterfactuals cover static calls, global URL, local aliases, destructuring, object records, call/apply/bind, Reflect.apply and computed methods. The old `observesFunctionSource` returned false in all eleven on Windows and Linux: [red run 44256744881](https://github.com/FlareZ123/obfs/actions/runs/44256744881). New `src/ast.js` guard and nine primitive positive controls passed both OS/strict JSDoc/Ubuntu real Chromium: [green run 44257275339](https://github.com/FlareZ123/obfs/actions/runs/44257275339), implementation `99152dad`. Report: `im-results/url-static-native-source-observation-2026-11-18.md`.

This is compile-time native-source admission, adding no emitted instructions. Opaque runtime method forwarding, owner constructor properties and cross-file aliases are not yet proven. Existing COO/SNO hostile-runtime reconstruction limitations and 2.5× ceilings remain unresolved. Avoid treating a new source-observer assertion as stronger attacker resistance.
