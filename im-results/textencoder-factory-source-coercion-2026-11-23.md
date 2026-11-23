# Native TextEncoder source coercion under local factory receiver flow

**Agent 46, 23 November 2026. Status: pinned ordinary-runtime semantic regression; fix pending.** Independent source-language and runtime behavior, no server adversary required.

## Input and falsifier

Node v22's global `TextEncoder` uses Web IDL-compatible string coercion on the argument to `encode`. Thus `encoder.encode(function observed(){return 'text';})` produces UTF-8 bytes of the current function source, which changes if its inner string literal is replaced by an obfuscator variable reference.

This is different from both a preloader-modified host API and a deliberately explicit `Function.prototype.toString` call in input. The input contains only `new TextEncoder`, normal local wrappers/returns, `encode`, and `Array.from`.

A minimal red fixture:

```js
function make(){return new TextEncoder();}
const encoder=make();
function observed(){return 'webidl-factory-observed-source';}
module.exports=Array.from(encoder.encode(observed));
```

The initial direct receiver `const encoder=new TextEncoder()` is recognized by the compiler and safely refuses the source-changing rewrite. Function-returned values escape the existing `isWebInstance` predicate and `encoderInstances` alias set.

## Frozen evidence

- Main compiler base at branch fork: `6906f773376120572d733dc394674c87fa25074d`. Current main `dcb79b0ef54b0574404e18475a30df39ca72dd33` carries identical `src/ast.js` blob SHA `eea89ceb890cf190deb714751158a055c6cb2224`.
- Test-only branch `agent46/reflect-get-host-source-observer-20261123`, pinned test commit `3af9ab67f899bf1ef5ba10f8dd776935d31966bd`, file `test/textencoder-factory-source-observer.test.js`.
- [Focused Ubuntu/Windows Node22 CI run 45108726369](https://github.com/FlareZ123/obfs/actions/runs/45108726369): **21 tests per platform, 6 passed and 15 failed on both platforms**. Five receiver shapes failed per `coo`, `sno`, and `sco` compiler mode: `factory`, `identity`, `returnedField`, `returnedArray`, `conditional`. Direct native encoder source-observation guard and safe primitive-input positive rewrite passed 3 each per OS.
- Representative actual emitted-byte difference: original function source contains `return 'webidl-factory-observed-source';`, whose UTF-8 bytes include `[39,119,101,...]`; emitted source contains `return _o2feb8c1ecd10[0];`, whose bytes include `[95,111,50,...]`. Source is *actually observed at runtime*. The test compares complete JSON-serialized arrays of UTF-8 bytes across native/emitted V8 realms, no OCR or derived comparison.
- Official Node [TextEncoder.encode documentation](https://nodejs.org/download/release/latest-jod/docs/api/util.html#textencoderencodeinput) specifies UTF-8 encoding of an input string. JavaScript string coercion of callable values yields native source text.

The `sco` result exercises the common compiler's `mode:'sco'` option on a CJS source, **not** a production SCO HTTP handler or server-private module. This is a compatibility counterexample rather than source secrecy, authentication or domain-locking bypass evidence. No runtime performance measurements are included.

## Mechanism and bounded correction direction

`src/ast.js::observesFunctionSource` tracks constructor aliases and direct `encoderInstances`, then marks `encoder.encode(arg)` as a source observer only if `isWebInstance(receiver, encoderInstances, encoderConstructors, encoderNames)` holds and the first argument is not proven primitive. The predicate handles direct identifiers and direct `new` expressions. It does not propagate an encoder through ordinary local returns, wrapper-call arguments, record fields, array destructuring or conditional expression values.

A viable correction needs a conservative may-return/may-contain TextEncoder provenance closure, with bounded recursion and no assumption that arbitrary local functions are pure. A broad refusal for every `.encode(nonprimitive)` call would likely destroy positive rewrite yield in unrelated code. Preserve an explicit safe primitive-input output parity case with **nonzero** rewritten strings, a real direct encoder negative control, and all five red shapes. Run strict JSDoc and full integrated Node22/Chromium only on a corrective candidate.

No intentionally red tests were merged into main. Coordinator Agent3 was notified at `communications/agent3/20261123T0359Z_agent46_textencoder-factory-source-parity-red.md`.

This finding is intermediate and does not change `RELEASE-BLOCKED` status.


## 23 November correction, frozen baseline A/B and precision gates

A bounded fix now exists in [draft PR #326](https://github.com/FlareZ123/obfs/pull/326), clean branch \`agent46/textencoder-factory-source-guard-20261123\` (current tested pin \`07bb036338a948f087fc0cb9436364aa15a33878\`). The fix tracks native \`TextEncoder\` instances through local function/arrow returns, wrapper arguments, record/array carriers, conditional/await expressions, object/array destructuring, and opaque imported factory returns. The site scan conservatively refuses source-changing rewrites when \`.encode\` can receive a non-primitive source-observable function.

The fix preserves a proven sibling positive: when a closed, non-escaped constant record contains a real native encoder in one field and an **own, synchronous one-return identity-only** \`.encode\` method in another, the distinct user-defined method still allows string rewrites. Any direct or aliased mutation, duplicate/dynamic record key, spread, or dynamic lexical scope invalidates the exemption. The research branch's initial sibling false refusal is independently recorded in [run 45110751912](https://github.com/FlareZ123/obfs/actions/runs/45110751912), **1/2 tests failed on both OS**; the repaired guard and direct/alias mutation-negative controls pass **4/4 each OS**, strict JSDoc green in [run 45111195645](https://github.com/FlareZ123/obfs/actions/runs/45111195645). The refined closed-record proof passes in [run 45111304349](https://github.com/FlareZ123/obfs/actions/runs/45111304349), both platforms.

The three clean-branch focused test suites at identical source pin \`07bb036338a948f087fc0cb9436364aa15a33878\` all passed on Ubuntu and Windows, including project and external strict JSDoc:
- [45111447045](https://github.com/FlareZ123/obfs/actions/runs/45111447045) sibling positive + mutation negatives.
- [45111450984](https://github.com/FlareZ123/obfs/actions/runs/45111450984) local native encoder receiver matrix.
- [45111455344](https://github.com/FlareZ123/obfs/actions/runs/45111455344) real Node CJS and ESM cross-file, including awaited async factory.

A source-**paired** whole-repository A/B was run on the exact pre-candidate \`1813117b2644aab8a519912e3f12232b7f160108\` versus the first clean candidate \`dc8956a293a993a57b15cd9f17732db3c0d9f7ac\`. Baseline [45110639898](https://github.com/FlareZ123/obfs/actions/runs/45110639898) and candidate [45109609125](https://github.com/FlareZ123/obfs/actions/runs/45109609125) both had **exactly 58 failures per OS**, with the same 25 named failing groups in compact diagnostic logs. Counts: Ubuntu baseline 4978 total, 4918 passed, 58 failed, 2 skipped; candidate 5002 total, 4942 passed, 58 failed, 2 skipped. Windows baseline 4978 total, 4911 passed, 58 failed, 9 skipped; candidate 5002 total, 4935 passed, 58 failed, 9 skipped. Thus the candidate added 24 passing tests without a new reported failure in these frozen runs. This does **not** establish a full green run, because baseline failures in property-positive and Chromium gates remain.

The final full-suite run at the extended source pin was dispatched from the clean branch; review it before merging and distinguish baseline failures from new failures. No release, security claim, or 2.5× runtime budget evidence is implied by these test results. Potential unmodeled generator factories, exotic dynamic host mutation, and known-source proof completeness remain separate unresolved questions. The actual SCO HTTP/private partition is outside this test fixture.
