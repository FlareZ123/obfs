# Agent 1: terminal dot-segment ESM URL identity and SCO publication over-inclusion

**Date:** 2026-11-25  
**Owner:** Agent 1  
**Disposition:** Intermediate red witness; do not promote as an established result.

## Scope and exact source pins

This is an independent audit of the ESM URL-identity candidate in PR #374, not a claim about a merged production fix.

- Main snapshot at audit start: `77268184c90aead722d0ffa936b97b22cb18c08e`.
- PR #374 head inspected: `585471ffc73f1b7239589cb8af1ed6850aac0648`.
- PR #374 base: `9f11599ddc299c991590195fc0e75d2461df6b07`.
- PR #375 remains a separate import-attribute/source-observation guard and must still be composed with #374.

## Finding

PR #374 correctly identifies that repeated empty URL path segments cannot be collapsed by `path.posix.normalize`. Its new checks reject `specifier.includes('//')` in the cross-file, source-observer-island, and core ESM graph resolvers, and the SCO CLI selector rejects empty interior path segments.

The candidate still accepts a relative specifier whose final path segment is exactly `.`:

```js
import { value } from './private.mjs/.';
```

For a root-level `entry.mjs`, the candidate SCO selector's logic does the following:

1. `rawSegments` is `['.', 'private.mjs', '.']`; there is no empty interior segment.
2. Segment decoding succeeds.
3. `path.posix.normalize(path.posix.join('.', './private.mjs/.'))` produces `private.mjs`.
4. If `private.mjs` exists in the input tree, `selectScoPublicFiles` adds it to the public `included` set.

The browser does not resolve that specifier to the same module URL. WHATWG URL resolution produces `/obfs/private.mjs/`, not `/obfs/private.mjs`.

The current SCO handler constructs a `URL` from the request, then calls `decodePublicName(url.pathname.slice(prefix.length))` and looks up the resulting exact name in `inputs`. The URL's trailing empty segment is retained as `private.mjs/`; it does not match the included file's key `private.mjs`. A normal request for the import URL therefore misses the file, while a direct request for `/obfs/private.mjs` can reach it because the selector unnecessarily added it to the public input map.

This is a public-file publication-authority failure in SCO selection: an otherwise unselected file can be made public by a noncanonical import spelling, even though the browser import URL is a different module-map key. The response is still the SCO-transformed response, not raw source; the problem is that a file outside the intended public dependency closure becomes an exposed endpoint.

A separate local Node 22.16.0 runtime check of `import('./private.mjs/.')` against an existing `private.mjs` file returned `ERR_MODULE_NOT_FOUND` with the resolved URL ending in `private.mjs/`. This confirms that the final dot segment is not equivalent to importing the file.

## Reproduction

Run with Node.js:

```js
'use strict';
const path = require('node:path');

const filename = 'entry.mjs';
const specifier = './private.mjs/.';
const rawPath = specifier.split(/[?#]/u, 1)[0];
const rawSegments = rawPath.split('/');

// This is the candidate's empty-interior-segment check.
if (rawSegments.some((part, index) => index > 0 && part === '')) {
  throw new Error('candidate rejects path');
}

const clean = rawSegments.map(part => decodeURIComponent(part)).join('/');
const selectedTarget = path.posix.normalize(
  path.posix.join(path.posix.dirname(filename), clean)
);
const browserUrl = new URL('/obfs/' + specifier.slice(2), 'http://localhost');
const handlerLookupKey = browserUrl.pathname.slice('/obfs/'.length);

console.log({
  specifier,
  rawSegments,
  selectedTarget,
  browserUrl: browserUrl.href,
  handlerLookupKey,
  exactLookupMatches: handlerLookupKey === selectedTarget
});
```

Observed values:

```text
specifier:          ./private.mjs/.
rawSegments:        [".", "private.mjs", "."]
selectedTarget:     private.mjs
browserUrl:         http://localhost/obfs/private.mjs/
handlerLookupKey:   private.mjs/
exactLookupMatches: false
```

The candidate's SCO selection path uses the decoded segments and POSIX-normalized target above. The SCO handler's exact lookup behavior is visible in `src/sco.js`: `new URL(request.url, ...)`, `decodePublicName(...)`, then `inputs.get(name)`. This audit initially used a source-backed deterministic reproducer plus a Node URL-resolution check. The combined integration candidate now adds a full repository CLI startup regression in `test/sco-client-exposure.test.js`: it asserts that an otherwise unselected `private.mjs` cannot cause the SCO CLI to remain listening when the import ends in `/.`.

## Current-main status

The same `./private.mjs/.` over-inclusion is present in the inspected main snapshot `77268184c90aead722d0ffa936b97b22cb18c08e`: its `src/cli.js::selectScoPublicFiles` has no empty-segment rejection before POSIX normalization. PR #374 adds the repeated-separator refusal, but its candidate still admits the terminal-dot spelling. Thus this is both a current-main SCO publication issue and a residual in the proposed partial repair; it is not limited to a hypothetical later integration.

## Related resolver coverage

The same terminal-dot mismatch remains possible in the PR #374 candidate's:

- `src/cross-properties.js::resolveImport`;
- `src/source-observer-islands.js::resolveKnownImport`;
- `src/core.js::completeGuardedModuleGraph`;
- `src/core.js::staticallyImportedEsmTargets`;
- `src/core.js::hasUnprovedModuleImport`;
- `src/cli.js::selectScoPublicFiles`.

These paths reject repeated separators but do not reject a terminal `.` or `..` segment before POSIX normalization.

The existing `src/sco-graph.js::verifyPrivateImport` and `src/sco-selective-partition.js::isCanonicalPrivateModulePath` are materially different: both compare the original specifier against a canonical relative spelling, so `./private.mjs/.` is rejected there.


## Local route-model cross-check

A minimal local Node HTTP route model copied the handler's relevant sequence (`new URL(request.url, 'http://localhost')`, `decodePublicName(url.pathname.slice(prefix.length))`, exact `inputs.get(name)`) with the selected `private.mjs` entry. It returned:

```json
{
  "/obfs/private.mjs/": {"status": 404, "body": "not found"},
  "/obfs/private.mjs": {"status": 200, "body": "compiled-private-module"}
}
```

This is a route-model cross-check, not an invocation of the full repository `createScoHandler`. The actual CLI regression instead verifies the safer fail-closed behavior before the handler starts.

## Recommended repair and tests

Do not create another resolver branch. Extend the existing #374 candidate's shared ESM-specifier admission rule, or consistently apply the same rule at each consumer:

- Reject a final raw path segment equal to `.` or `..` before calling POSIX normalization.
- Keep the existing repeated-separator, percent-encoding, backslash, query/fragment, and traversal policies.
- In `test/sco-client-exposure.test.js`, add a red-first case with an otherwise unselected `private/secret.mjs` and a static import ending in `/.`. The candidate must refuse publication rather than include the secret module. Check both the noncanonical import URL and a direct request for the private file.
- Add equivalent refusal cases to the cross-file and host-graph tests so all proof consumers share the same module identity boundary.
- Retain positive controls for canonical `./private/secret.mjs` imports and ordinary interior `.` / `..` normalization when they resolve to the same exact file.

A centralized predicate is preferable to another set of slightly different string checks. It should model the admitted URL grammar first and only then derive the corresponding input-tree path.


## Reusable bounded grammar audit

The deterministic model is preserved as `sims/esm-url-path-identity-audit.js`. It mirrors the candidate SCO CLI's segment admission and POSIX target derivation, compares that target with WHATWG URL resolution, models the SCO handler's exact path-name lookup, and checks a proposed terminal-dot refusal. Run with `node sims/esm-url-path-identity-audit.js`.

On Node v22.16.0, the finite grammar used atoms `a`, `b`, `private.mjs`, `.`, `..`, and the empty segment, with one to five segments. It generated 11,190 sequences; 4,514 passed the candidate admission model and 4,308 remained in-root. Of those in-root candidates, 1,566 had a POSIX/URL path mismatch; all mismatches ended in literal `.` or `..` in this bounded grammar. Adding a terminal-dot/dot-dot refusal left 2,742 in-root candidates and zero mismatches. These counts are bounded model evidence, not a claim about all possible URL strings or all file trees.

## Limitations

This finding concerns a specific candidate branch and one URL/path grammar edge. It does not establish a general browser exploit, a bypass of the current merged mainline, or a complete SCO compromise. The CLI regression passed on both Ubuntu and Windows in manual-validation runs 4073 (commit `c1b6c8edb6fc4c9ea7324783c60678e683184c26`, tree `c8cca0c6643c946dd8a7b039bb0489d812307c48`). The rebased integration head `7f695ec4beffe7d34d6a7323b52f292b1e1db5a7` retains the identical tree. The full manual-validation run, including real Chromium browser cases and broader parity, remains pending.
