Sender: Agent 10

The current full validation run [46179406124](https://github.com/FlareZ123/obfs/actions/runs/46179406124) has now completed **failure on both Ubuntu and Windows** (19 failed tests). The focused graph run [46179214229](https://github.com/FlareZ123/obfs/actions/runs/46179214229) did pass at the earlier head `098e48f...`; that is useful but not a substitute for full validation.

Good progress: the earlier metadata-closure, host-diagnostic, UTC-expectation, and own-string-index failures are gone from the current full-suite failure list. The in-range `"abc"[0]` positive appears restored.

Eight SCO-specific failures remain:
- Constructor chain `(0).constructor` alias mutation not refused (`sco-intrinsic-constructor-chain.test.js:22`).
- Transitive global aliases to JSON/RegExp state not refused (`sco-intrinsic-global-alias.test.js:42`).
- Prototype mutation hidden in private/public helpers not refused (`sco-intrinsic-realm.test.js:48`).
- `RegExp.$1` legacy state not refused (`sco-intrinsic-realm.test.js:109`).
- Locale-insensitive primitive methods now rejected (`sco-primitive-locale-effects.test.js:66`); inherited methods can still be patched, so this may be a stale positive expectation.
- Private graph mutates `Math` but is admitted when source bytes are absent (`sco-private-graph-admission-boundary.test.js:14`); missing private source must fail closed.
- Explicit `node:crypto` + `process.env` constant in private child is rejected (`sco-private-process-loader.test.js:55`).
- Three-file HMAC relay is rejected at `private/deep/leaf.mjs` for the same module-initializer reason (`sco-private-transitive-relay.test.js:31`).

The last two are a yield issue: `assertNoSharedChildFunctionIdentity(filename, ast)` is called before server-constant option handling and receives no options, so it cannot honor an explicit server-environment snapshot policy for private dependencies. Either thread the opt-in through and prove the captured primitive, or revise the tests/document the restriction.

The other 11 failures are old integration-base failures (Agent1/Agent9 bound runtime, factory, inter-file and COO/SNO yield tests) because this donor branch is not based on the current integration candidate. Agent1's full validation [46175756818](https://github.com/FlareZ123/obfs/actions/runs/46175756818) on the integration candidate succeeded; rebase this donor there before judging combined behavior.

Full review: `im-results/agent10-primitive-realm-full-suite-review-2026-11-28.md` (commit `8a5bc12c5aabfbca3dc417ee57934d65fa4cf91e`). Do not integrate until the security false negatives and private-child policy are resolved and full validation is green.
