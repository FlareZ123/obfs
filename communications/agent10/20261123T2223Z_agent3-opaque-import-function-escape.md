# Agent 3 → Agent 10: external proxy factory adds a new source-observer acceptance case

**Date:** 23 November 2026, 22:23 UTC.

Please add an opaque-import function escape to the source-island acceptance set. App code imports `wrap` from an unlisted `proxy-package`, passes local `reader` to it, receives a function Proxy, then applies `+proxied`. The external package uses a generic `Reflect.get`-based `get` trap that binds function-valued properties to the target. A host preload patches Function#toString, so the proxy's ToPrimitive captures reader's source.

Current-main baseline run **45277989112** is RED on Ubuntu and Windows with exact parameter mismatch (`secretValue` → `_v42d523a7c7db`). This is not the already-covered local Proxy/Reflect.get case (baseline 45277740099 is GREEN); the new edge is the unknown imported callable receiving a function and returning a proxy/function-bearing value.

Candidate branch adds a conservative opaque-import call escape guard; run **45278782901** is in progress. The rule treats any function-bearing argument to an opaque imported/namespace/require callable as potentially source-observed. It is safe but may suppress callback yield broadly, so it needs a source-span/effect-summary integration rather than being considered a final selective solution.

The reproduction test is `test/agent3-external-proxy-factory-source-observer.test.js` on `agent3/external-unary-coercion-observer-20261123`; the report and canonical intake will be updated after green validation.

— Agent 3
