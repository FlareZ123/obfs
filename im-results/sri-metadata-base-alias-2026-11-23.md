# SRI metadata algorithm casing and document-base URL alias admission

**Agent 7, 23 November 2026.** Intermediate browser-compatibility research, continuing the mainline source-pinned URL-alias correction in merged PR #311. This is a semantics/admission result. It does not claim stronger resistance to static reconstruction, debugger extraction, authorized relaying or the global strict 2.5× budget.

## Distinct input counterexamples

A source inventory has `client.js` and a preserved HTML/XHTML `index.html`. The document's external script may have a digest of the **original** declared source even when the server mounts it as `/app/v3/renamed-browser-entry.js`.

**Case A: ASCII-uppercase SRI algorithm.** Current [W3C SRI, section 2](https://www.w3.org/TR/sri/#key-concepts-and-terminology) defines a recognized hash algorithm token by ASCII-lowercased membership in `sha256`, `sha384` and `sha512`, with digest comparison remaining case-sensitive. `SHA256-<original digest>` can therefore be a source commitment for conforming/future user agents. The original merged matcher compared the entire label and digest literally and missed it. Preserve the digest's own case while lowering only the algorithm label.

**Case B: explicit absolute HTML base and relative script URL.** `<base href="/app/v3/">` followed by `<script src="./renamed-browser-entry.js" integrity="sha384-<original digest>">` fetches an absolute URL unknown to the input filenames. The previous policy considered only the raw `src` for the unknown-mount fallback, then checked the resolved path against file names. This missed the original-source digest despite the browser's actual routing contract. Detect the active HTML base or declared XHTML base with an absolute/root address, and apply the original digest fallback to the relative pinned script. Preserve the existing precise path checks when no such base is present.

## Red-first and browser findings

- Two-OS [focused red 45088766338](https://github.com/FlareZ123/obfs/actions/runs/45088766338), commit `52840cdd1318173c560d593f0da1077d8fa3398d`: both uppercase and explicit-base cases failed; unrelated-digest positive-yield test passed.
- Real [Chromium red 45088836459](https://github.com/FlareZ123/obfs/actions/runs/45088836459), commit `48e370a5f4e643c8ec5ebc4933d3017fa1b9a9db`, Google Chrome **157.0.8103.78**: `uppercase: {native:true,safe:true,unsafe:true,safeBytes:656,originalBytes:148}`; `documentBase: {native:true,safe:false,unsafe:false,safeBytes:727,originalBytes:148}`. This is a crucial distinction. Chrome 157 **did not enforce uppercase SHA256 integrity** and executed altered JavaScript, even though the current W3C syntax classifies the token as valid. The document-base case **was enforced**, so the compiler emitted code the browser rejected while the native original worked. Future/conforming browser behavior is the motivation for uppercase preservation; do not present it as an observed Chrome 157 SRI rejection.
- Implementation commit `34b118cd9b9b27e73715bcc34bbbce42400f8162` canonicalizes only the algorithm prefix and accounts for absolute `<base href>` when matching original JavaScript digests. Both HTML and XHTML static paths are covered. Two-OS focused [green 45088903782](https://github.com/FlareZ123/obfs/actions/runs/45088903782) passed all three focused tests and JSDoc.
- Corrected complete Chromium with explicit baseline divergence and additional Base64 metadata probes: **pending final run pin**.

## Boundaries and next verification

The build-time matcher is conservatively oriented toward standards-conforming/future browsers. It may preserve original code in a currently deployed browser that ignores uppercase metadata, reducing obfuscation coverage by design. Root/absolute base mounting is a sufficient conservative admission cue but the offline compiler cannot prove the publisher's actual routing configuration. Ordinary unrelated relative script URLs, and documents whose digest does not match original source bytes, retain transform yield in the positive controls.

The SRI grammar imports CSP `base64-value` syntax, which admits URL-safe characters and optional padding. The [W3C SRI response verification steps](https://www.w3.org/TR/sri/#do-bytes-match-metadatalist) compare the supplied hash value against base64 of actual bytes. Whether Chrome accepts unpadded or URL-safe spellings is an independent browser question: observe the native and tampered responses before deciding whether further token normalization preserves actual executable behavior. Do not silently classify valid-looking metadata as enforced.

Source: `test/sri-metadata-base-alias.test.js`, `test/sri-metadata-base-alias-browser.js`, `src/html-assets.js`. Existing [PR #311](https://github.com/FlareZ123/obfs/pull/311) is already merged and verified on main.

**Security decision stays RELEASE-BLOCKED.**
