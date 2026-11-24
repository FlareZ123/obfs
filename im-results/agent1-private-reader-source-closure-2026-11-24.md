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

A second conservative proof admits a class method's `FunctionExpression` into `privateFunctionNodes` only when its enclosing `ClassDeclaration` has one synchronous, non-generator, non-static, non-accessor, zero-argument method with a single static member return of the tracked owner; the class is local and non-exported; exactly one `const` instance is created in the same lexical scope; and every instance use is a direct, non-optional, zero-argument call of that exact method. Classes with inheritance/additional methods, exported class bindings, multiple instances, extracted methods, escaping instances, optional calls, and source-observation paths fail closed. This addresses the existing direct-use class fixture without treating arbitrary methods as private.

## Tests

The focused regression file now verifies:

- local and cross-module named declaration readers;
- public-only source normalization through a private arrow reader;
- exact source equality of the exported caller before and after transformation;
- refusal for a reader with an additional call/side effect;
- refusal for an identity forwarder;
- refusal when the owner is passed at a non-reader parameter position;
- refusal for optional calls;
- existing duplicate-formal, unproved external-owner, escaped-reader, and source-observed-reader refusals;
- direct-use private class methods in COO/SNO;
- refusal when the class, instance, or method escapes, when the method is extracted/observed, or when it is invoked optionally.

## Validation

Workflow [45465220379](https://github.com/FlareZ123/obfs/actions/runs/45465220379) completed successfully on Ubuntu and Windows with Node 22.23.4:

- `test/function-declaration-reader-proof.test.js`: 8/8 passed on each platform;
- project JSDoc typecheck: passed;
- external-corpus JSDoc typecheck: passed;
- paired-budget JSDoc typecheck: passed.

Both focused runs `45464417131` and `45465220379` passed the file on Ubuntu and Windows. The latest run includes the expanded wrong-parameter-position and optional-call negative controls. The earlier run `45463676009` had 8/8 tests on both platforms but exposed three implicit-any JSDoc errors; those annotations were corrected before `45464417131`.

## Broader validation and remaining work

A broader manual-validation run [45465798510](https://github.com/FlareZ123/obfs/actions/runs/45465798510) on the earlier fixture completed with 10 failures on both operating systems. After the interfile fixture was split into a positive private-reader wrapper and a negative direct-exported-reader source-preservation case, comprehensive run [45468219501](https://github.com/FlareZ123/obfs/actions/runs/45468219501) completed with 9 failures on each OS. After adding the conservative private class-method proof, comprehensive run [45471798625](https://github.com/FlareZ123/obfs/actions/runs/45471798625) completed with **7 failures on each OS**. It ran 5,373 tests per platform: Windows 5,332 passed / 7 failed / 34 skipped; Ubuntu 5,341 passed / 7 failed / 25 skipped. Both the interfile and private-class failures are gone. The remaining seven failing cases are:

- `bound-runtime-interception.test.js` — hostile bind interception expected two rewrites;
- `bound-runtime-minifier-control.test.js` — minified ESM bind interception expected two rewrites;
- `factory-object-flow.test.js` — two-file factory expected one rewrite;
- `private-tuple-session.test.js` — private tuple session expected two rewrites;
- `sco-dense-hybrid-matched-http.test.js` — selective SCO input rejected by its current const/environment admission rule;
- `sno-bound-runtime-interception.test.js` — bound private target expected two rewrites;
- `source-stable-bound-export.test.js` — bound public export expected two private-key rewrites.

Both platforms passed the project, external-corpus, affine-oracle, and paired-budget JSDoc checks. Benchmarks and paired session profiles also completed: sampled interprocedural local-reader ratios were 1.034x (Ubuntu) and 0.726x (Windows); all reported session/profile ratios were below 1.04x and output equality held. These are bounded workload measurements, not a universal 2.5x guarantee for all applications. The full workflow remains red because of the seven listed repository-level acceptance failures; it does not establish full repository acceptance.

The interfile fixture correction preserves the original exported-source contract rather than weakening it. The positive four-file ESM fixture now has exported `internal()` delegate to a local private `readSecret(owner)` whose body is one static member return; this exercises the exact-reader transfer. A separate negative test requires refusal and byte-for-byte source retention when an exported function directly contains `state.secretValue`. Focused workflows [45467947847](https://github.com/FlareZ123/obfs/actions/runs/45467947847) and [45468747514](https://github.com/FlareZ123/obfs/actions/runs/45468747514) passed `test/interfile.test.js` on Ubuntu and Windows; the latter also asserts byte-identical exported-wrapper source with identifier obfuscation enabled. The comprehensive run [45468219501](https://github.com/FlareZ123/obfs/actions/runs/45468219501) confirms the old interfile failure is removed.

Focused workflow [45471168641](https://github.com/FlareZ123/obfs/actions/runs/45471168641) passed `test/private-class-source-yield.test.js` on Ubuntu and Windows, including the positive COO/SNO class method and refusal controls for class, instance, and method escape, optional invocation, and source observation. Project, external, affine-oracle, and paired-budget JSDoc checks also passed. Comprehensive run [45468219501](https://github.com/FlareZ123/obfs/actions/runs/45468219501) predates the class-method proof and still contains the two private-class failures; a fresh comprehensive run is required to measure the updated count.

This is a focused proof-coverage result, not a general source-observer theorem, nor a security/performance claim. The patch is not merged into `main`. The frozen source-observer candidate remains parked/NO-GO; this branch is a separate narrow mainline proof-coverage improvement.
