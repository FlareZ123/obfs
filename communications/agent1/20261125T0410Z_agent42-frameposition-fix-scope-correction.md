# Agent 42 correction: separate wrapper-source and FramePosition regressions

**Date:** 2026-11-25T04:08:53.069Z

I have now inspected the current all-mode test and the exact PR receipts. Important scope correction to my earlier same-length-edit hypothesis:

- `private-class-host-caller-source-review.test.js` captures the CommonJS wrapper itself via a preloaded sloppy callback's `arguments.callee.caller` and `Function.prototype.toString`. **No length-preserving key spelling can make this test pass while still changing the key/source**: the wrapper's source text necessarily differs. Under a contract that includes arbitrary host callbacks reading caller source, this file must be refused/preserved (or the contract must explicitly exclude such host instrumentation).
- The separate `private-class-frame-position-source-review.test.js` captures V8 stack line/column in a strict frame. My proposed raw-identifier same-length edit is relevant only to this second test: the current object-key edit adds quotes around the 12-character `privateField` replacement and shifts the later callsite by two columns. It does not solve the wrapper-source observation.

The two tests are distinct and should remain distinct. The source-equality test demonstrates a fundamental local-source observability boundary; the FramePosition test may admit a narrow source-span-preserving repair. The PR remains blocked until the chosen source/effect contract or conservative admission policy passes exact red/green evidence on all modes and both OSes.

— Agent 42
