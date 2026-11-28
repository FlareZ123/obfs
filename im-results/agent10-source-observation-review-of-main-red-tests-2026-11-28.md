# Agent 10 — source-observation review of current-main red tests

The current-main compact suite has 14 failures (run 46181044016). Several are not straightforward compiler defects: their positive assertions conflict with the source-observation trust frontier and should be reclassified/restructured rather than “fixed” by weakening source privacy.

## Positive fixtures that expose their own property spellings

- `test/factory-object-flow.test.js:183`: `state.mjs` exports `read()`, whose body contains `owner.secretField + owner.otherField`. Any importer can call `read.toString()`; renaming those fields changes observable source. Keep the export source-stable and move field reads into a private direct-call helper.
- `test/function-declaration-reader-proof.test.js:64`: exported `calculate()` directly contains `readAlpha(privateRecord)` and `readBeta(privateRecord)`, whose local helper bodies contain the property spellings. The exported function source is observable. A stable exported wrapper around private readers preserves a valid positive.
- `test/interfile.test.js:12`: `state.mjs` exports the owner object itself. `closedWorld:true` does not make an exported object private; external importers can still read its original property names. The expected two-key rename is not valid while the object remains a public export.
- `test/private-tuple-session.test.js:7`: `module.exports=function score(n){...alias.hiddenCount...owner.privateDelta...}` exports the function whose source contains both keys. A private `scoreCore` helper plus source-stable exported wrapper can retain the cold-session positive while respecting source parity.
- `test/function-declaration-reader-proof.test.js:141`: the public-only normalizer fixture must be reviewed against the exact source-visible function boundary; it currently assumes a public function can be transformed and then normalized into a functional clone.

## Attacker-success tests that need explicit disposition

- `test/bound-runtime-interception.test.js:45` intentionally installs a hostile `Function.prototype.bind` before module evaluation and asserts that the attacker recovers transformed target source.
- `test/source-stable-bound-export.test.js:25` expects two private key rewrites inside a bound target while preserving the bound export's native source.
- `test/sno-bound-runtime-interception.test.js:42` similarly expects a host-side bound-target interception attack to succeed.

These are valuable adversarial witnesses, but their current test contract treats successful attacker extraction as a test pass and refusal/no-rewrite as a failure. For a release gate, separate “attack succeeds on deliberately vulnerable control” from “candidate blocks or safely declines the transformation.” A candidate that refuses to rewrite a source-observable bound target should not fail merely because the attack can no longer extract transformed private source; retain a separate positive case with a nonescaping private helper.

## Positive control to preserve

`test/private-class-source-yield.test.js` is a plausible valid positive: the class, method, and instance remain local; only a numeric primitive escapes; no source observer or opaque callback receives the class. If this remains unrenamed, it is a genuine yield gap worth fixing.

This is an oracle-design warning, not a claim that all 14 main failures are false positives. The environment/relay cases and benchmark breach require separate treatment. Preserve exact native/emitted parity and the 2.5x budget while rebuilding positive controls around genuinely private helper boundaries.
