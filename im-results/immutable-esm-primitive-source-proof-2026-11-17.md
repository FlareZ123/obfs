# Closed-world immutable ESM primitive provenance removes false source-observer refusals

**Agent 3, 2026-11-17.** Intermediate, compiler-correctness result. Current implementation commits: `7dee2b9132bb4c6bf3b66fb952acd24fce9d10d5` (`cross-properties.js` collector), `54af1238ddd1fd8bcffa8bc718fd293e0cb810b4` (`ast.js` consumer), `f588caf50a634f7417b5ffadb62ce3a3ef7f51bc` (`core.js` plumbing). Pinned regression at `54ab90f117a867f0eaf2217a43859168973d98a1`.

## Problem

A closed ESM graph may import a proven immutable primitive literal and pass it to a native source-coercing API, e.g.:

```js
// state.mjs
const owner = {secretField: 23};
const secret = owner.secretField;
export function peek() { return secret; }
export const marker = 37;

// consumer.mjs
import {marker as observed, peek} from './state.mjs';
export const result = String(observed);
export const value = peek();
```

The earlier `observesFunctionSource` correctly recognized `String` as a source observer but treated every imported binding as a potentially native Function object. In a **closed** set of source files, `marker` is provably an immutable primitive. That refusal froze even the unrelated, private `secretField` key in the originating module.

The repair supplies a separate `Set<string>` proof of primitive import *types* to the source-observer analyzer. It deliberately does not propagate concrete values into the string-key proof: a numeric primitive is safe from function-source stringification, but substituting a fake string as a computed property name would be unsound.

## Bounded implementation and threat assumptions

`collectVerifiedImportedPrimitives(files)` accepts only uniquely bound, top-level `const` initialized by direct primitive literals (number, boolean, null, bigint, string), exported by direct named declarations or local named export specifiers, and imported by unique direct named ESM bindings whose relative path resolves exactly to one supplied module. It does not accept mutable exports, factory calls, ambiguous alias/shadowing, reexports, unknown graph members or dynamic module resolution. The graph must declare `closedWorld:true` before the compiler trusts any proof.

`src/ast.js` uses the proof only to rule out local function values and to answer `isDefinitelyPrimitive` for the particular imported identifier; it refuses when the observed expression contains other unproved function-like values. For example, `String(marker)+peek()` stays **refused**, because the addition can stringify an unproved return value from `peek()`, even though `marker` is safely primitive. The isolated `String(marker)` plus separately evaluated `peek()` form is admitted.

This proof relies on the integrity of the declared ESM module graph. Attacker-controlled import maps, malicious host intrinsics or rewritten files can violate that assumption. These are not solved by proving local import types; actual COO and SNO tamper resistance must be evaluated independently.

## Native differential tests

`test/imported-primitive-source-proof.test.js` now contains ten Node ESM integration cases using unique temporary module directories and actual native linking:

- Positive: number, boolean, null, bigint, string exported literals and a quoted export alias; each requires **one genuine local private key rename** and identical original/emitted runtime outputs.
- Negative: imported Function value, mutable export switched to a Function, opaque factory returning a primitive, and an otherwise valid primitive import without `closedWorld`; each must decline the private-field rewrite and preserve runtime output.

Parser-level isolation showed `observesFunctionSource` for `String(observed)` changed from true without provenance to false with a proven primitive import, while the immediately surrounding `String(observed)+peek()` correctly remained true. The independent `sims/ci-brief-failures.js` tool surfaces all failures without truncating thousands of TAP lines.

A separate preexisting `test/quoted-module-names.test.js` assertion previously demanded an encoded value from a multi-file graph without `closedWorld`. The test was corrected to declare the closed-graph precondition; the pinned [run 44121079165](https://github.com/FlareZ123/obfs/actions/runs/44121079165) reduced its full-suite failing count from five to four and passed the adjusted positive. This correction does not make the four unrelated failed-yield assertions pass.

The first experimental new proof test constructed `String(observed)+peek()`, which was correctly refused, and also accidentally selected a quoted import for three negative cases. Those test bugs were corrected before claiming the final proof. The pinned [run 44123150852](https://github.com/FlareZ123/obfs/actions/runs/44123150852) at `4cfc83bc070b20c738a954226e1e1a1b95ed1ec3` **completed successfully on Ubuntu and Windows**. Both systems passed **19/19 targeted tests**, strict JSDoc project/external checks and sampled performance; Ubuntu passed real Chromium integration. The full 377-file Node suite reported **2,553 passes, four established positive-coverage assertion failures, one skip, 2,558 total**. These remain strictly non-green; the disposable one-shot CI uses `continue-on-error` for only that diagnostic so independent checks can run. A later source-cache fix in `src/ast.js` is separately validated on both systems at [run 44124496481](https://github.com/FlareZ123/obfs/actions/runs/44124496481).

## Remaining gaps

- General interprocedural and cross-file return-type inference remains unproved. This proof does not establish that a call `peek(state)` returns a primitive from another module.
- There are four independent historical positive-yield failures after correcting the closed-graph string case: application own-key yield, token-normalization proof, three-module ESM reader, and public JSDoc field reconstruction. Historical [CI 44119681750](https://github.com/FlareZ123/obfs/actions/runs/44119681750) reproduced all five initial failures before this invocation.
- This correctness improvement cannot certify the 2.5× performance ceiling, a static reconstruction barrier, or resistance to an instrumented runtime. Type proof precision and genuine protected-byte yield need separate evaluation.
