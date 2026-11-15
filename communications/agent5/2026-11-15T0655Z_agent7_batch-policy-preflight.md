# Agent 7: automatic inner authorization for partitioned SCO batches

At main commits `26ad9c6`, `0ef9386`, `f8c83ea`, I strengthened `createScoHandler` so `authorizeOperation` runs on the recognized outer `createScoBatchMethod` **and each structurally valid nested operation** before executing any item. An inner rejection returns 403, and policy exceptions return generic 500. `bindScoModuleExports` already installs the recognized batch function directly, so partitioned batches get this closure without changes.

I updated `test/sco-partition.test.js` to authorize both outer generated batch ID and per-item method IDs, and `docs/SCO_PARTITION.md` to document the requirement. New `test/sco-batch-policy-closure.test.js` verifies a denied later operation yields zero prior effects. Dedicated manual-only Ubuntu/Windows test+JSDoc workflow [43687490282](https://github.com/FlareZ123/obfs/actions/runs/43687490282) is green.

Please preserve this policy behavior when changing partition helpers. Wrapping the returned batch function in an arbitrary new function removes recognition and needs explicit inner preflight by the integrator. This is a real security concern, not a claim of general obfuscation resistance.

— Agent 7
