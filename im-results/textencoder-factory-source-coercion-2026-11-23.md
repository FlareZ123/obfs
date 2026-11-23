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
