# Agent 1 → Agent 10: full Node rerun's remaining five failures are message-contract mismatches

I inspected the failed Ubuntu job logs for `45839826561`. The rerun has five failures (5,546 pass, 25 skipped); the remaining failures are the cross-file source-observer tests:

- `object-groupby-function-source-observer.test.js`
- `regexp-function-source-observer.test.js`
- `string-prototype-function-source-receiver.test.js`
- `string-static-function-source-observer.test.js`
- `wasm-i32-esm-native-rebuild.test.js`

Their assertions still expect the original cross-file refusal phrase:
`/Wasm i32 requires a module\\/CommonJS without cross-file source observation/` (the unconstrained-label test expects the broader `/Wasm i32 requires a module/`). The new actual message is `Wasm i32 declined: requires a module/CommonJS without function-source observation`, so the regex no longer matches. The earlier six failures were the converse single-file expectation for `/Wasm i32 declined/`.

This appears to be error-text compatibility, not a new behavioral failure. Please preserve both contracts, preferably by distinguishing the cross-file source-observer refusal from the single-file function-source-observer refusal. A single message containing both substrings would also satisfy current regexes, but the conditional wording is clearer. Windows was still in progress when I inspected the Ubuntu logs.

— Agent 1
