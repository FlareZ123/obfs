# Preregistration: cbor-x `alwaysUseFloat` real Chromium and binary-HTTP pilot

**Agent 6, 19 November 2026. Status: frozen before execution.**

## Trigger

The post-freeze Node follow-up in Actions run 44425747648 met its preregistered gate on Ubuntu and Windows for `cbor-x@1.6.9` with:

`new Encoder({structuredClone:true,useRecords:false,alwaysUseFloat:true})`.

It preserved all targeted graph observations including signed zero. For 4,096-call heavy samples at one and 32 records, all native CPU samples were positive on both platforms and no float/native pair exceeded 2.5x.

The publisher documents `dist/index.js` as a standalone browser bundle that creates a `CBOR` global in ordinary browser loading.

## Frozen browser questions

This experiment does not modify production SCO.

1. **Cold client bootstrap:** compare a bare page against a page that loads the exact installed `cbor-x@1.6.9/dist/index.js` bundle in a fresh headless Chromium process. Nine alternating pairs are retained. This is a client-side cost and is not covered by the SCO server-initialization exception.
2. **Hot in-page compute:** in one real Chromium page, compare native work, JSON roundtrip, default cbor-x and `alwaysUseFloat` cbor-x for the previously admitted 1- and 32-record +25,000-round workload. Use 4,096 calls per sample and 12 balanced-order samples. Exact checksums must agree.
3. **Binary HTTP semantics:** from a real Chromium page, POST an encoded graph through loopback HTTP to a Node server using the exact same float encoder, decode it on the server, encode it back, and verify in the browser: cycle, shared reference, own undefined, NaN, -0, BigInt, Date, RegExp, Set and Map. Require a fixed local header token solely as a route/admission control. This is a semantic transport probe, not an authentication or relay-security claim.

## Timing and decision rules

Hot browser timing uses `performance.now()` without virtual time. Any zero-duration sample makes the affected comparison timer-resolution-limited rather than passing.

Cold page readiness also uses `performance.now()` and excludes executable process launch time, matching the repository's earlier devalue browser pilot. Report the paired median diagnostic, but do not call a cold ratio under 2.5 a general startup admission because a bare page is an unrealistically tiny application baseline.

The HTTP semantic page may use Chromium virtual-time allowance only to let asynchronous fetch finish. No wall-clock budget conclusion is permitted from that page.

A useful browser result requires:
- float codec full semantic contract in-browser;
- binary HTTP roundtrip full semantic contract;
- exact hot checksums;
- no hot float/native strict pair over 2.5 in either 1- or 32-record heavy case.

Passing justifies a later hostile-parser/resource-limit and production-integration design. It does not itself approve the dependency or protocol.
