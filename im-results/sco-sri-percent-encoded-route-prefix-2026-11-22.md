# SCO source-byte integrity under percent-encoded route prefixes

**Status:** Red control confirmed; repaired candidate under cross-browser and two-platform validation.
**Impact:** SRI compatibility for valid `routePrefix` spellings, including percent-encoded reserved path bytes.

## Mechanism

SCO handlers accept a configured absolute HTTP `routePrefix` that begins and ends in `/`. That prefix is matched against the WHATWG URL's raw `pathname`. The SRI source-byte observer `hasPinnedLocalJavaScriptIntegrity` recorded the mount path in its original configured spelling, but its `targetPath` helper *always decoded* the entire script URL pathname. As a result, an absolute SRI script URL under `/obfs%23/client.js` was decoded to `/obfs#/client.js` before comparing it to the declared mount `obfs%23/client.js`. The mismatch made the compiler rewrite exact SRI-bound JavaScript bytes, so the browser could refuse to execute the modified script.

The same representational mismatch affects other encoded route components; decoding `%5C` to a backslash could trigger the previous rejection before checking an otherwise valid raw configured route.

## Red control

The existing SCO HTTP test `SCO route-prefix-qualified SRI paths preserve the exact served script` was extended with `/obfs%23/`. The handler served the requested JavaScript under that literal HTTP pathname but modified its source, with a string literal rewritten into Unicode escapes.

- **[Failing manual browser workflow 44977342293](https://github.com/FlareZ123/obfs/actions/runs/44977342293)**, source SHA `fe1153072af9bd3ce7f7442676e95fd59dc4694e`. The single new SCO route-prefix case failed with original byte equality, while earlier unrelated tests passed.

## Repair

`targetPath` now tests the raw URL pathname as an exact inventory candidate before applying `decodeURIComponent`. If the original configured public mount spelling already names a distributed JavaScript file, the source is treated as integrity-pinned. The existing percent-decoding fallback still recognizes ordinary encoded filenames in HTML and XML. This is deliberately conservative: an ambiguous raw alias may preserve extra source bytes, but it cannot make the browser's SRI contract fail.

The scope of valid route-path aliases is exercised by `/obfs%23/`, `/obfs%25/`, `/obfs%5C/` and `/obfs%2F/` alongside the original plain prefixes.

`test/sco-sri-encoded-route-browser.js` provides an independent Chrome comparison: native source and SCO-protected source with a public SRI observer must load; the same generated SCO source without its HTML observer is deliberately byte-mutated and must fail Chrome's SRI check.

## Status and limits

The updated browser workflow was dispatched after this report's first draft; only pin completed evidence to its exact source SHA. This test does not show that arbitrary reverse-proxy rewrites, URL decoding performed by intermediate infrastructure, or unknown source-document mounts are modeled. SRI-constrained source is distributed in original bytes; this necessarily limits source confidentiality and does not establish the overarching tamper-resistance objective. The global release remains **BLOCKED**.

Reference: [WHATWG URL Standard](https://url.spec.whatwg.org/), path percent encoding and URL path serialization.
