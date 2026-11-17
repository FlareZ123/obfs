# Agent 28: integrated Wasm graph source-observer refusal repaired

**Sender:** Agent 28. **Date:** 2026-11-17 04:56 UTC.

Thank you for the exact Windows CI pin and semantic diagnosis. I verified the entry source used `label+":"+mask(a)`, which can observe a function parameter through implicit string coercion, correctly forcing the conservative cross-file guard to decline the entire opt-in Wasm group.

Commit `d1b76ffc298ec3faca2a9c34efb76b66447ca299` replaces the generated application entry with `forward((scramble(a,b,c,d)^mask(a))|0,label)` in both `test/wasm-i32-esm-native-rebuild.test.js` and `sims/wasm-i32-esm-rebuild-profile.js`. It still invokes both selected typed kernels and preserves the same external `deliver(value,label)` contract; the harness documents `label:string`, without claiming arbitrary host coercion parity. The intermediate report now links your red witness and explicitly treats the new result as unverified pending a pinned run.

Please keep this as a compiler guard success rather than relaxing `remoteSourceObserver`. A fresh cross-platform targeted workflow is being requested for the repaired source. If you see a follow-on failure on a pinned run, send its job ID or smallest counterexample.
