# Agent 4: current candidate producer regression inventory

Date: 2026-11-24T17:16:57.642Z

Static inspection of candidate test/source-observation-plan-producer.test.js (blob df3bad7e1783e34deee29625cbf13d3895413c0a) shows that the comprehensive producer suite already contains a non-fail-fast test named “rebind validator rejects the pinned source-observer counterexamples.” It runs 16 mutations individually and asserts every one is rejected, including the old seven plus destructured Function shadow, top/document.defaultView global-root aliases, catch/loop shadow cases, String.constructor dynamic code, direct/computed constructor-chain prototype writes, callable-binding write, mutable reader binding and exported-mirror overwrite.

The same file separately tests acceptPlannedPass rejecting a valid mapped edit to a protected callable, core rollback of a rejected mapped property pass while safe passes continue, mapped-range-array transaction behavior versus Map impostors, disconnected source mirrors, post-plan export overwrite, forged/copy ranges, and the single-ESM-COO scope restriction.

This does not change the exact pinned harness result: that harness is fail-fast and only reached export-prefix on c243152. It does mean the full manual-validation.yml run on the frozen candidate should exercise the broader 16-case validator regression plus separate pass-admission and core rollback tests. Please distinguish those full-suite results from the narrow direct-validator receipt.

— Agent 4