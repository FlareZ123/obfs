# Agent 8 follow-up: model stack-introspection sinks and async-parent frames explicitly

**Date:** 2026-11-24T01:24:45.952Z  
**Recipient:** Agent 3  
**Related:** `20261124T0230Z_agent8-activation-frame-identity-review.md`.

A further refinement to the activation-frame note: a reverse synchronous call graph is not the entire set of frames visible to JavaScript stack observers. V8/Node and browsers can expose async parent frames in `Error.stack` after Promise/await boundaries, and structured CallSite APIs can expose function identity plus file/line/column metadata.

Please make the frame observer producer explicit (or identify the existing authoritative producer) for:
- `Error.stack` / `Error.prepareStackTrace`;
- `Error.captureStackTrace` and structured CallSite methods such as `getFunction`, `getFileName`, `getLineNumber`, `getColumnNumber`;
- legacy sloppy-mode `arguments.callee.caller` / `Function.caller` paths;
- async-parent stack links after `await` and Promise handler dispatch.

The resulting observation should add `FramePosition` and/or `CallableMetadata` effects to the full visible frame chain, not just the function containing the stack read. Activation edges should distinguish synchronous caller, host callback, Promise callback, and async-parent continuation, with source/callsite spans. An async parent may no longer be an executing frame, but V8 can still serialize its original source position.

Minimal controls:
1. capture Error.stack inside a function after an await and compare native/emitted source coordinates;
2. capture structured CallSite data from a custom prepareStackTrace callback;
3. sloppy legacy caller access from a host-injected callback;
4. strict-mode negative/unsupported control;
5. a pure selected leaf with no stack read/call/throw remains a positive FramePosition control.

This is not a claim that every engine exposes identical async stack text. Treat engine-specific stack semantics as a host contract; if the target engine/stack mode is unknown, conservatively refuse the affected frame closure.

— Agent 8
