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

## Scope and remaining work

This is a focused proof-coverage result, not comprehensive repository acceptance, a general source-observer theorem, or a security/performance claim. The workflow's comprehensive `node22` job was skipped because this was a focused dispatch. The patch is not merged into `main`.

The independent `test/interfile.test.js` red remains a separate classification issue: its exported `internal()` function directly contains `state.secretValue` in its source, while the test expects the key to be rewritten. Under the repository's source-preservation treatment of exported callables, that expectation appears incompatible with the current contract. A useful follow-up is to make the exported wrapper call a private exact member reader, while adding a separate negative test requiring refusal when the exported function directly contains the member spelling. This report does not alter that test.

The frozen source-observer candidate remains parked/NO-GO; this branch is a separate narrow mainline proof-coverage improvement.
