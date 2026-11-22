# An apparently unrelated Reflect alias write can change `Reflect.ownKeys` through an inherited host setter

**22 November 2026. Intermediate cross-platform semantic-counterexample evidence.** This is a correctness and compiler-admission finding. It does not establish source secrecy or resilience to instrumented clients.

## Context and falsifiable hypothesis

[Historical PR #15](https://github.com/FlareZ123/obfs/pull/15) proposes tracking source-visible `Reflect` aliases so a clean closed-world record can still rename a private exported owner while visible writes to `Reflect.ownKeys` are refused. Its 11-case suite, based on the 16 November branch head `bfd95cfc591cf377cf89ac03f4c7d5fba8d08e16`, includes a **positive** claim that this assignment is harmless:

```js
const R=Reflect;
R.localAuditMarker=1;
```

An ordinary property assignment to an ambient object is only benign with assumptions about its prototype and runtime. The declared ESM files in the compiler input do not include the host preload, and the intended proof already preserves opaque host callbacks. A Node preload can install an inherited setter on `Object.prototype.localAuditMarker` that replaces `Reflect.ownKeys` with a callback that changes a closed local record's `auditCount` from `3` to `Function`.

This is a source-visible operation with hidden side effects in a legitimate but externally supplied environment. The same callback can dynamically import a separate declared ESM module and observe its exported object's own keys. No attacker modification of emitted files is necessary.

## Reproduction and controls

The one-file [independent regression](../test/closed-record-inherited-setter-host.test.js) creates a three-module closed ESM graph (`state.mjs`, `record.mjs`, `entry.mjs`) and starts each original/compiled variant in a fresh Node process with the same `--require` host preload. It asserts:

- With no inherited setter, original source returns `[41,null]`.
- With the inherited setter, original source returns `[41,["secretField"]]`. The host callback modifies `Reflect.ownKeys`, changes the record field to `Function`, and the module dynamically imports `state.mjs`.
- Current mainline declines the unsafe exported owner-key rewrite (`crossFile.properties=0`) and retains `[41,["secretField"]]`.
- The 16 November PR #15 compiler instead rewrites the exported key, returning `[41,["_pe92b84abcefc"]]` in the same hostile-but-legitimate host.

The actual original 11-case PR #15 suite was first copied **unchanged** onto an isolated branch rooted at contemporary main. The [two-platform replay 44981356217](https://github.com/FlareZ123/obfs/actions/runs/44981356217) at `612f7afbf509eab88374d7bada84fe03c65572eb` passed 10/11 and failed exactly the benign-Reflect-alias positive-yield expectation: main emitted zero renamed fields while the old test demanded one. Every explicit malicious-mutation refusal and clean positive case passed. This alone was a positive-yield disagreement, not a semantic failure on main.

The independent **paired actual-behavior** control used the exact same new test on two isolated branches, changing only the compiler revision, not the host/fixture assertion:

| Compiler under test | Exact branch SHA | Ubuntu / Windows | Observed result |
| --- | --- | --- | --- |
| Contemporary main, `src/cross-properties.js` blob `b8234b2ca54c88ad3d8381dcb3eb6a9b86e89ea4` | `d13d49f679653e25629ea4c68833102d908b2ad4` | [44981544136](https://github.com/FlareZ123/obfs/actions/runs/44981544136), **green both** | Exact original behavior; zero owner-field renames |
| Historical PR #15 branch, `src/cross-properties.js` blob `14b9868dbdba16fa486326d6791c74a2ccd6e935` | `0d9ee7a846975267574e9fa3900708979f4c364d` | [44981547424](https://github.com/FlareZ123/obfs/actions/runs/44981547424), **red both** | `[41,["_pe92b84abcefc"]]` diverges from `[41,["secretField"]]` |

Both workflows exercised real Node v22.23.4 module execution, not an AST-only argument. The source byte identity of contemporary main `src/cross-properties.js` was verified again after both runs; the code is byte-identical to the green isolated branch. The new regression entered main at `a0a90fc1ae3f79a587908358b3b908a696948358`; the existing `manual-application-challenge.yml` reflection suite includes it as of `ceda16d16d1e897873aa81885cb18c85ee1f5805`.

## Decision and limits

Do **not** merge the 16 November relaxation without an additional safety proof that rules out inherited setters or otherwise preserves the original callback-visible keys. The conservative mainline refusal is justified by this concrete host environment even though it reduces positive rewrite yield for a seemingly benign assignment.

This is one finite source/host combination. It does not establish that all `Reflect` alias writes are dangerous, nor that the mainline graph proof handles every host effect. The broader property renaming algorithm must still preserve positive yield on verified safe inputs, and the existing clean closed-record positive control passes. No client runtime mechanism, 2.5× recurring execution overhead or stronger obfuscation resistance was introduced.

The stale [PR #15](https://github.com/FlareZ123/obfs/pull/15) should be triaged as **superseded pending an updated proof** or **adversarial review**, retaining its historical test evidence; directly merging its 2026-11-16 implementation would reintroduce this source-pinned semantic error.
