# Agent 1: source-observed caller transfer to exact private member readers

**Date:** 2026-11-24  
**Branch:** `agent1/private-reader-source-closure-20261124`  
**Validated source commit:** `88cd126ce202d0fa036c48f22a47e60afdbf69b2`  
**Expanded test commit:** `c16a122e3618cc92234d86d0a426b230bf2d112e`  
**Focused workflow:** [45465220379](https://github.com/FlareZ123/obfs/actions/runs/45465220379)

## Problem

`proveLocalObject` already tracks local function parameters and private direct-call-only helpers. However, the owner-alias scan rejected every use beneath a source-observable caller before considering whether the alias was merely passed to a private reader. This suppressed two safe-yield shapes:

- an exported ESM function calling a local, private `FunctionDeclaration` that returns one static member of its owner parameter;
- an exported function-expression caller passing its captured owner to an immutable local arrow reader whose body is exactly a member read followed by returning that local value.

The caller's source contains the call and owner binding, but not the private member spelling. The reader itself must remain private and have a narrowly bounded body.

## Change

The function summary now records `memberReaderIndex` only for a synchronous, non-generator local reader with simple unique identifier parameters and one statically named member read. The existing immutable arrow/function-expression reader path records the same fact for its already-admitted one-read forms.

When an owner alias appears beneath an otherwise source-observable callable, the proof permits that use only if it is an argument at the exact reader parameter index of a direct, non-optional call to a local reader whose function value is proven private/direct-call-only. Imported consumers, escaped functions, identity forwarders, side-effectful readers, and other argument positions do not receive this exception. Existing alias resolution and own-key checks still decide whether the owner and property are actually eligible.

## Tests

The focused regression file now verifies:

- local and cross-module named declaration readers;
- public-only source normalization through a private arrow reader;
- exact source equality of the exported caller before and after transformation;
- refusal for a reader with an additional call/side effect;
- refusal for an identity forwarder;
- refusal when the owner is passed at a non-reader parameter position;
- refusal for optional calls;
- existing duplicate-formal, unproved external-owner, escaped-reader, and source-observed-reader refusals.

## Validation

Workflow [45465220379](https://github.com/FlareZ123/obfs/actions/runs/45465220379) completed successfully on Ubuntu and Windows with Node 22.23.4:

- `test/function-declaration-reader-proof.test.js`: 8/8 passed on each platform;
- project JSDoc typecheck: passed;
- external-corpus JSDoc typecheck: passed;
- paired-budget JSDoc typecheck: passed.

Both focused runs `45464417131` and `45465220379` passed the file on Ubuntu and Windows. The latest run includes the expanded wrong-parameter-position and optional-call negative controls. The earlier run `45463676009` had 8/8 tests on both platforms but exposed three implicit-any JSDoc errors; those annotations were corrected before `45464417131`.

## Broader validation and remaining work

A broader manual-validation run [45465798510](https://github.com/FlareZ123/obfs/actions/runs/45465798510) was then run against the synchronized PR branch head. It completed with 10 failures on both operating systems; none was in `test/function-declaration-reader-proof.test.js`. Test totals were 5,370 on each OS: Windows 5,326 passed / 10 failed / 34 skipped; Ubuntu 5,335 passed / 10 failed / 25 skipped. The same remaining failures were:

- `bound-runtime-interception.test.js` — hostile bind interception expected two rewrites;
- `bound-runtime-minifier-control.test.js` — minified ESM bind interception expected two rewrites;
- `factory-object-flow.test.js` — two-file factory expected one rewrite;
- `interfile.test.js` — four-file ESM graph expected one cross-file rewrite;
- `private-class-source-yield.test.js` — two cases expect a class-method owner rewrite;
- `private-tuple-session.test.js` — private tuple session expected two rewrites;
- `sco-dense-hybrid-matched-http.test.js` — selective SCO input rejected by its current const/environment admission rule;
- `sno-bound-runtime-interception.test.js` — bound private target expected two rewrites;
- `source-stable-bound-export.test.js` — bound public export expected two private-key rewrites.

Both platforms passed the project, external-corpus, affine-oracle, and paired-budget JSDoc checks. Benchmarks and paired session profiles also completed: sampled interprocedural local-reader ratios were 0.992x (Windows) and 1.005x (Ubuntu); all reported session/profile ratios were below 1.04x and output equality held. These are bounded workload measurements, not a universal 2.5x guarantee for all applications. Ubuntu's Chromium integration, 64-case verified-record browser check, and six-case ESM-observation browser check passed. The full workflow remains red because of the ten listed repository-level acceptance failures; it does not establish full repository acceptance.

The interfile conflict was resolved at the test-fixture level without weakening the source-preservation contract. The positive four-file ESM fixture now has exported `internal()` delegate to a local private `readSecret(owner)` whose body is one static member return; this exercises the new exact-reader transfer. A separate negative test requires refusal and byte-for-byte source retention when an exported function directly contains `state.secretValue`. Focused workflow [45467947847](https://github.com/FlareZ123/obfs/actions/runs/45467947847) passed `test/interfile.test.js` on Ubuntu and Windows, including the positive four-file execution and negative source-preservation case. A second focused run [45468747514](https://github.com/FlareZ123/obfs/actions/runs/45468747514) passed after adding an explicit assertion that the exported `internal()` wrapper source remains byte-identical after private-reader/property transformation, even with identifier obfuscation enabled. The broader run [45465798510](https://github.com/FlareZ123/obfs/actions/runs/45465798510) predates this fixture correction and still reports the old interfile expectation as one of its ten failures; the fresh comprehensive run [45468219501](https://github.com/FlareZ123/obfs/actions/runs/45468219501) is running on the corrected fixture to determine the updated repository-wide count.

This is a focused proof-coverage result, not a general source-observer theorem, nor a security/performance claim. The patch is not merged into `main`. The frozen source-observer candidate remains parked/NO-GO; this branch is a separate narrow mainline proof-coverage improvement.
