# Fail-closed ambient capabilities in source-observer-island property admission

**28 November 2026 — provisional engineering evidence, not a release result.**

## Exact failing witness

The separate PR #386 property-only exemption (based on frozen PR #384 at
`a8a22f9aef6e7f0d487cebc23c87063376df55cb`) can rename a private key in
a supposedly source-unobserved ESM leaf. Its prior checker
`proveSourceObserverIslands` rejected a list of known native source readers,
but did not treat an arbitrary unbound host capability as dangerous.

On the pre-guard candidate, test-only commit
`c93958941502e6f99da16b24a83abd2160d5039d` supplied a closed three-file
ESM graph. A separate trusted *fixture runner*, not an included ESM import,
installed Node's `node:fs` as `globalThis.ambientFilesystem`. The app called
`openSync/readSync` on `independent.mjs` and printed the exact file text
alongside its numeric result. This exposed transformed key bytes versus the
original `privateB` spelling. The imported arithmetic result remained 23.

The [exact two/three-platform failed run 46114823985](https://github.com/FlareZ123/obfs/actions/runs/46114823985)
reported **three failures on each Ubuntu, Windows and macOS runner**, one
each for COO, SCO and SNO. The changed file had one property rewrite; the
observable bytes differed. This is a concrete *semantic-parity failure*,
not a source-secrecy or deobfuscation-strength conclusion.

## Candidate conservative repair

Branch `agent3/source-island-ambient-capability-guard-20261128` is based on
PR #386's previously positive-yield branch, not a new accepted production
source. It modifies `src/source-observer-islands.js`:

1. Take a restricted set of actual **module-scope** declared names from static
   imports, declarations and named exported declarations. A declaration only
   in a nested function cannot falsely explain a free reference elsewhere.
2. For every identifier in the declared ESM group, distinguish literal
   grammar spelling (noncomputed property/member keys, import/export names,
   labels) from a runtime reference. Reject any unproved reference.
3. The only unbound admitted primitives are `undefined`, `NaN`, and
   `Infinity`; admit `JSON.stringify(...)` as an explicitly trusted
   standard serializer and direct `console.log(...)` only as a discarded
   expression-statement output sink. No `console` or `JSON` method alias,
   computed lookup, or consumed logger return value is allowed.

The existing source-observer veto remains for identifier renaming, string
transforms, symbol lowering, cross-file property renaming, and VM lowering.
This repairs a **source-admission** boundary only. It deliberately reduces
positive coverage for other global APIs. The code retains native JavaScript
operations; no additional obfuscated runtime work is introduced.

Tests include the actual process-level source-reader witness,
`test/agent3-source-island-ambient-host-reader.test.js`, and a separate
`test/agent3-source-island-ambient-envelope.test.js` with unlisted free
globals, computed host access, nested binder decoys, logger/serializer escapes
and two positive primitive-output envelopes.

## Validation / uncertainty

The initial focused and existing proof-suite jobs were dispatched at exact
branch source `256f0b051fdbcf0d66c1d732f82f81590a699b83`
(Actions runs 46130328707 and 46130332074). The extra envelope test was
added at `f786aaf79f180d56ae15f812e67e7306d138803f` and dispatched in
run 46130436118. **These were queued at writing; a dispatch or passing
negative assertion is not evidence of an accepted general proof.** The
two-platform full integration and independent Chromium gates must still be
run on one frozen source SHA if this narrow candidate is integrated.

The admitted `console.log` and `JSON.stringify` operations rest on
ordinary-host, output-only assumptions. A hostile runtime can replace either
intrinsic or read distributed source independently. Under the specified COO
and SNO full-control attackers, JavaScript-only source secrecy and tamper
resistance are not established by this fix. In SCO, server-held private
computations remain an independent trust boundary. The known authorized SCO
relay, SNO owner-tamper and strict 2.5x compute counterexamples remain
**RELEASE-BLOCKING**, regardless of this candidate's eventual compatibility
tests.

Do not merge PR #386 based solely on the prior full-green candidate: it
predates the source-reader falsifier and this conservative repair.
