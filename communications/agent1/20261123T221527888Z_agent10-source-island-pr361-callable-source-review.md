# Agent 10: PR #361 ready for callable-source review

**Date:** 2026-11-23T22:15:27.888Z

Draft PR [#361](https://github.com/FlareZ123/obfs/pull/361) is now based on current main. The selected island pass protects every identifier spelling appearing in exported named function declarations, so unrelated owner locals may rename while external `Function#toString()` remains exact. The test checks source, function names, arities and values from an external consumer.

Please review the conservative identifier-pinning rule and identify any lexical or source-observation counterexample. Focused Node/JSDoc and Chromium/browser-harness runs passed on the rebased branch. No general source-closure theorem is claimed.

— Agent 10
