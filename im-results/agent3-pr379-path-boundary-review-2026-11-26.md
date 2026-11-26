# PR #379 path-boundary review — 26 November 2026

**Reviewer:** Agent 3  
**Status:** Intermediate adversarial review; not release authorization  
**Reviewed candidate:** `agent1/esm-url-attributes-integration-20261125` at `0b282c8de6168a7ba398e3797fc5238c5866f50b`

## Repository and integration state

The current GitHub PR state does not match the latest integration message or the PR description:

- PR #379 is `open`, `merged=false`, `merged_at=null`, `mergeable_state=unknown`.
- PR head is `0b282c8de6168a7ba398e3797fc5238c5866f50b`; the PR API's base SHA is `20cf9ff08dada0d06b5ecf4870cb15699d8cecad`.
- Current `main` at review time is `0d1e425dae47a71757f967dd4d85cd5909ccb250`.
- Comparing current main to the candidate reports 68 commits ahead, 13 behind, with 42 changed paths. This is not a merge-only sync.
- Current main does not contain `src/esm-url-paths.js`, `src/unicode-casefold.js`, or `src/unicode-casefold-data.js`. Main's `src/portable-paths.js` still uses only NFC lowercase and uppercase keys; the candidate has the additional upper-lower and pinned Unicode 17 full-fold keys.
- The PR body still describes an older head (`74b2c0...`), base (`3a3c3...`), and 11-ahead/0-behind comparison. Refresh it after reconciling the branch.

Therefore the candidate's production changes are not currently integrated into main, and the PR is not merged.

## ESM/SCO path review

I inspected the candidate implementations in:

- `src/cli.js` — static ESM publication traversal;
- `src/sco.js` — HTTP route decoding and lookup;
- `src/core.js` — complete host-lock graph, imported ESM target, and unproved-import checks;
- `src/cross-properties.js` — cross-file property resolver;
- `src/source-observer-islands.js` — selected-leaf resolver;
- `src/sco-graph.js` and `src/sco-selective-partition.js` — private graph import checks.

For the examined consumers, the candidate rejects or fails closed on the important URL/POSIX ambiguity classes: raw pathname C0/DEL, URL-trimmed trailing pathname spaces, encoded slash/backslash/control/dot segments, repeated or empty separators, query/fragment aliases in graph proofs, and terminal dot segments. The SCO CLI decodes one layer per segment and rejects decoded separators, controls, and whole dot segments before deriving a POSIX target. The SCO handler uses WHATWG `url.pathname` and one decode per segment for its route key.

The strongest focused regression is `test/sco-control-char-publication.test.js`: it compares native Node ESM target/decoy behavior for 15 TAB/LF/CR insertions in dot segments, then starts the actual SCO CLI separately for each case and requires either an explicit fail-closed startup diagnostic or correct target bytes with the POSIX decoy returning 404. The companion tests cover all 33 percent-encoded C0/DEL values, COO/SNO parity, host-lock refusal, cross-file proof refusal, and source-observer island refusal.

The bounded audit `sims/esm-url-path-identity-audit.js` enumerates 1,429,428 generated specifiers in its stated grammar. Its recorded result is zero mismatches after terminal-dot refusal. This is useful bounded evidence, not a proof for arbitrary loaders, import maps, proxies, server rewrites, or every URL spelling.

I did not find another direct WHATWG-URL-versus-POSIX target mismatch in the named ESM graph consumers during this review.

## Additional uncovered URL consumer: HTML/SRI path matching

There is an adjacent path-normalization gap in `src/html-assets.js` that the new ESM helper does not cover.

`targetPath(href, base)` constructs a WHATWG URL, then calls `decodeURIComponent(url.pathname)`. It returns the decoded path without normalizing it. `matchesDistributedScript()` then compares portable name keys; those keys perform Unicode/case folding but do not collapse `..` path segments. For a relative URL, `hasUnknownMount()` is false, so the original-source-digest fallback is not used.

Minimal witness:

- Document: `public/index.html`
- Distributed JavaScript: `public/client.js`
- SRI URL: `./folder%2F..%2Fclient.js`

Under Node v22.16.0:

```js
const base = new URL('/public/index.html', 'https://obfs.invalid/');
const url = new URL('./folder%2F..%2Fclient.js', base);
url.pathname;                         // /public/folder%2F..%2Fclient.js
decodeURIComponent(url.pathname);    // /public/folder/../client.js
path.posix.normalize(
  decodeURIComponent(url.pathname).slice(1)
);                                    // public/client.js
```

The current `targetPath()` result is `public/folder/../client.js`, which does not match the distributed key `public/client.js`. I reproduced this resolver-stage mismatch locally. A deployment that decodes `%2F` before filesystem path normalization can route this URL to `public/client.js`; the HTML/SRI checker would fail to recognize that the digest pins the distributed script. `obfuscateFiles()` consumes this check through `remoteSourceObserver=hasPinnedLocalJavaScriptIntegrity(prepared) || ...`. If the checker misses the pin, it may transform the script and invalidate an otherwise valid SRI commitment.

This is conditional on the serving layer decoding encoded separators; it is not a demonstrated disclosure or a bypass of the built-in SCO route, which rejects encoded separators. It is a behavior-preservation risk for COO/SNO deployments with such static-server semantics, and an unresolved deployment-contract boundary.

Coverage gap: `test/sri-portable-url-alias.test.js` uses strings such as `encodedslash%2F` as *document filename segments*, which `documentUrl()` re-encodes as `%252F`. It does not exercise an encoded slash in the SRI `src`/`href` itself.

Recommended disposition: add an SRI regression for this URL and either (a) classify encoded separators / post-decode dot-segment paths as ambiguous and conservatively use the matching-original-digest fallback, or (b) explicitly constrain and test the supported server decoding contract. Treating ambiguous relative paths as possible matches is safer than silently assuming a particular proxy's behavior.

## Smaller API-shape boundary

The candidate's `safePath('state.mjs/')` accepts a trailing-slash path because `path.posix.normalize('state.mjs/')` preserves the slash. A direct in-memory `SourceFile` can therefore represent a directory-shaped key, and some graph checks can regard `./state.mjs/` as an exact in-group key even though Node filesystem ESM treats that URL as a directory, not a file. The CLI filesystem walk cannot produce this key. This is not an observed SCO CLI URL/POSIX mismatch; decide whether the direct API intentionally permits virtual URL resources or should reject trailing separators for filesystem-backed modes.

## Validation observed

Full manual-validation run `45782162524` at the reviewed head completed with the behavioral/adversarial suite failing on Ubuntu and Windows. The nine reported failures are property/yield cases (`bound-runtime-interception`, `bound-runtime-minifier-control`, `factory-object-flow`, `interfile`, two `private-class-source-yield` cases, `private-tuple-session`, `sno-bound-runtime-interception`, and `source-stable-bound-export)); no URL-path test appears in the failed-test list. JSDoc, performance sampling, paired runtime profiles, and whole-process budget steps passed on both platforms; Chromium integration passed on Ubuntu and was skipped on Windows after the behavioral failure. Do not label these failures as baseline relative to today's main without a same-head comparison.

The Unicode 17 table tests all 1,585 C/F mappings, and the native filesystem probe covers 24 candidate pairs on Ubuntu, Windows, and macOS. The compound `ßϑ` / `ẞϴ` macOS alias is the motivating native observation. The mapping table is pinned, but NFC normalization still follows the Node runtime's Unicode data; the report correctly records that boundary. These probes are not an exhaustive model of every filesystem/version.

## Review disposition

The candidate's ESM/SCO URL-path guards and focused target/decoy tests are materially useful and look sound for the inspected call sites. Do not describe the PR as merged or integrated. Resolve the stale branch/PR metadata, add or explicitly scope the HTML/SRI encoded-separator case, and keep release status blocked while the full gate remains red and the broader security/performance objectives remain unproven.


### Follow-up: encoded backslash is another ambiguous SRI spelling

The same issue has a Windows-specific spelling. For `./folder%5C..%5Cclient.js`, WHATWG URL preserves `%5C` in `url.pathname`; `decodeURIComponent` produces `/public/folder\\..\\client.js`. Candidate `targetPath()` then returns `null` because the decoded pathname contains a backslash. The caller does not treat this ambiguous relative address as an unknown mount and does not consult `matchesOriginalDigest()`. A serving layer that decodes `%5C` and applies Win32 path normalization can resolve it to `public\\client.js`. Local Node v22.16.0 reproduced both the URL preservation and `path.win32.normalize()` target. Thus the recommendation should cover both encoded slash and encoded backslash (and, conservatively, encoded path controls): ambiguous relative paths should trigger the original-digest fallback or an explicit unsupported-path refusal, not silently become an unrecognized non-observer.
