# Agent 3 review: HTML/SRI one-decode path normalization patch (26 November 2026)

**Reviewed commit:** `b6f09a491d7ee0889cf730cb85cc65bc6b3f8abd` on `agent1/exported-closure-owner-proof-20261126`  
**Status:** Focused review passed for the documented one-decode POSIX/Win32 path-alias contract; not release authorization.

## Implementation review

The patch changes `targetPath(href, base)` in `src/html-assets.js` to:

1. Resolve the address using WHATWG `new URL()` and retain the raw encoded pathname candidate.
2. Try the raw candidate against the distributed-script inventory.
3. Decode the URL pathname exactly once with `decodeURIComponent`; malformed escapes fail closed for this candidate.
4. Generate both `path.posix.normalize(decodedPath)` and `path.win32.normalize(decodedPath)` (converting Win32 separators to `/`).
5. Reject empty/current/parent-only candidates, candidates that remain above the publication root (`../...`), and absolute POSIX/Win32 candidates.
6. Match any remaining candidate using the existing portable-name matcher (NFC/case equivalence and Win32 trailing-dot/space aliases).

This addresses the encoded `%2F` and `%5C` examples without double-decoding. The raw candidate is retained so literal percent-containing names can still be recognized when correctly encoded. The POSIX and Win32 interpretations are intentionally conservative: if either plausible one-decode interpretation identifies a distributed script, the SRI pin is treated as a source observer.

I inspected the current branch head after the patch and found the same implementation.

## Validation

- Agent 1's expanded `test/sri-portable-url-alias.test.js` covers HTML/XHTML, encoded-slash dot-segment aliases, encoded-backslash Win32 aliases, and unrelated-path positive-yield controls. Focused run `45789211163` completed successfully on Ubuntu and Windows (the focused workflow's `node22` full-suite job was skipped).
- I added `test/agent3-sri-traversal-candidates.test.js` on isolated audit branch `agent3/win32-dot-space-sri-normalization-audit-20261126`. Encoded POSIX and Win32 paths that normalize above the publication root must not pin a root-level `client.js`; both tests passed in run `45789023008` on Ubuntu and Windows.
- I probed the possible order-of-operations edge `public/folder/.. /client.js` on actual Windows Node filesystem access. The initial hypothesis that Node Win32 would trim `.. ` to `..` was falsified: run `45788670371` returned `ENOENT`. I corrected the probe to assert that behavior; run `45788838558` passed on Ubuntu and Windows (the native filesystem assertion runs only on Windows). Thus the post-normalization trailing-dot/space matcher does not miss a demonstrated Node Win32 alias of this form.
- The traversal tests confirm that above-root normalized candidates are excluded rather than accidentally matching an in-root file.

## Boundary and residual limitations

- The algorithm intentionally decodes once, not recursively. Double-encoded separators or custom multi-decode proxies remain outside the documented guarantee.
- The repository's `docs/SECURITY.md` explicitly disclaims universal URL rewriting behavior for Windows, proxies, and CDNs. The new POSIX/Win32 candidates improve conservative handling but do not prove every third-party static server's routing semantics.
- A custom server that strips trailing dots/spaces before path normalization, uses 8.3 aliases, or applies undocumented rewrites may still have distinct behavior. The Windows Node probe did not reproduce the `.. ` alias; do not extrapolate that result to every third-party server.

## Disposition

I found no blocking malformed-percent or traversal issue in the patch's stated one-decode contract. The implementation is conservative for the tested POSIX and Win32 encoded-separator aliases, rejects above-root candidates, and retains unrelated positive transformation yield. I recommend accepting this focused patch subject to the replacement branch's remaining full-gate and security reviews, while retaining the documented serving-layer limitation.


### Focused-workflow platform qualification

The manual workflow's focused-test configuration runs the Windows and Ubuntu jobs; its separate `node22` full-suite job is skipped when `focused_test` is set. Thus the run IDs above establish Windows + Ubuntu coverage, not macOS coverage. The native Win32 filesystem assertion itself executes only on Windows.



## Independent encoded-separator browser confirmation (17:06Z)

The older main-source implementation was independently challenged with a dedicated matrix and a real Chromium host:

- Main baseline red run [45862271529](https://github.com/FlareZ123/obfs/actions/runs/45862271529): 21 tests total, 3 positive controls passed, 18 preservation assertions failed on Ubuntu and Windows. The 18 failures span COO/SNO/SCO × HTML/XHTML × uppercase/lowercase encoded POSIX separators and encoded Win32 backslashes. The simulated host resolves the decoded path with POSIX/Win32 normalization to the pinned `public/client.js`.
- Main baseline browser run [45862614701](https://github.com/FlareZ123/obfs/actions/runs/45862614701) reached the dedicated Chromium witness after the preceding SRI browser tests passed and logged `POST_DECODE_SRI_BROWSER {"nativeLoaded":true,"protectedLoaded":false,"requestSeen":true}`. The browser requested `folder%2F..%2Fclient.js`; the test host decoded and normalized it to the published script. Native bytes passed SRI; transformed COO bytes were blocked.
- I then tested the existing Agent 1 candidate implementation from `agent1/exported-closure-owner-proof-20261126` (source head `a16a46fce43c1c04796e3c05c0c6149805694502`) using an isolated test-only branch `agent3/agent1-sri-browser-audit-20261126`. The full manual Chromium workflow [45864279566](https://github.com/FlareZ123/obfs/actions/runs/45864279566) completed successfully. Its new witness logged `POST_DECODE_SRI_BROWSER {"nativeLoaded":true,"protectedLoaded":true,"requestSeen":true}`; the full Chromium job concluded success.

This independently confirms the existing Agent 1 one-decode POSIX/Win32 normalization patch against a real browser and the explicit decode-then-normalize host contract. The end-to-end witness is COO only. The compile-time Node matrix shows the source observer is consulted in SCO/SNO too, but this report does not claim their runtime route behavior; in particular the built-in SCO route rejects encoded separators. No production source change was made on main. My isolated implementation on `agent3/html-sri-postdecode-separator-audit-20261126` duplicates the Agent 1 patch and is not proposed for integration; the useful new artifact is the independent Chromium test and receipt.
