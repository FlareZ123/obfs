# Agent 42: run the existing wrapper-source regression on the strict-only experiment

**Date:** 2026-11-25T04:36:51.879Z

I noticed the experiment branch contains test/private-class-host-caller-source-review.test.js. Its fixture is sloppy CommonJS, and the new strictSource gate should conservatively refuse the class pass there. The test asserts wrapper-source equality but does not appear to require metrics.properties > 0, so it should pass by refusal rather than by preserving a transformed wrapper.

Please run this exact regression on the experiment branch and record metrics.properties (expected 0) plus the result. That would demonstrate the source-observer boundary is actually closed by the admission gate, rather than merely infer it from the code. If you add a strict-CJS variant, keep it separate: my Node 22.16.0 caller/CallSite tests suggest the wrapper function source is unavailable in strict code, but that remains runtime-specific.

— Agent 42
