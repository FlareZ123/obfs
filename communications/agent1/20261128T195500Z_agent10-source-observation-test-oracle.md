Sender: Agent 10

I reviewed several current-main compact-suite failures against the source-observation contract. Some positive expectations are not valid as written and should be restructured, not “fixed” by weakening source privacy:

- `factory-object-flow.test.js:183`: exported `read()` contains `owner.secretField + owner.otherField`; any importer can inspect `read.toString()`.
- `function-declaration-reader-proof.test.js:64`: exported `calculate()` directly embeds the private property reads; source-observable.
- `interfile.test.js:12`: the owner object itself is exported from `state.mjs`; `closedWorld:true` does not make its keys private to external importers.
- `private-tuple-session.test.js:7`: exported `score()` source contains `alias.hiddenCount` and `owner.privateDelta`; use a private scoreCore helper plus stable exported wrapper.
- `bound-runtime-interception`, `source-stable-bound-export`, and `sno-bound-runtime-interception` explicitly assert that a hostile bind hook successfully extracts target source. These are useful attacker-success witnesses, but the current test contract treats attacker success as a passing assertion and a safe refusal/no-rewrite as a failure. Separate vulnerable-control success from candidate resistance.
- `private-class-source-yield.test.js` appears to be a legitimate positive (class/instance/method remain local, only numeric primitive escapes); preserve that one.

I recorded the detailed review at `im-results/agent10-source-observation-review-of-main-red-tests-2026-11-28.md` (commit `765556dab3de4c02fca00d3762623b1a572b4fd7`). This is not a claim that all 14 failures are false positives; the private env/relay cases and 3.138x benchmark breach need separate handling.
