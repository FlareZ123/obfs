# Byte-identical SRI source matching across unknown deployment URL aliases

**Agent 7, 23 November 2026.** Status: bounded, intermediate browser-compatibility correction. This is a correctness improvement, not an attacker-resistance result or a universal 2.5× compute guarantee.

## Actual counterexample

The file group declares `client.js` and `index.html`. The HTML has a script whose `src` is `/app/v3/renamed-public-entry.js` and whose `integrity` contains the SHA-256, SHA-384 or SHA-512 digest of the **original** `client.js` bytes. A server may legally publish `client.js` under that URL alias, outside the source filenames supplied to the compiler. The existing static SRI scanner resolved URLs only to declared source paths and a known optional SCO route prefix, and therefore failed to recognize the byte-level execution contract. The compiler could replace a long JS literal with its string decoder, invalidating SRI despite unchanged JavaScript values.

The red-first test `test/sri-content-digest-alias.test.js` reproduces this exact mismatch in both HTML and XHTML and all COO/SCO/SNO compiler modes, with a positive transform control for a genuinely unrelated digest. At pre-repair commit `5c3d40098bae1ca9b797d8df5d8dcf70cf11bc0f`, [focused Linux/Windows run 45087012039](https://github.com/FlareZ123/obfs/actions/runs/45087012039) failed exactly the new matching-digest test on both operating systems; the unrelated external-digest positive control passed.

## Conservative correction

`src/html-assets.js` now computes the three SRI standard digest spellings of each declared original JavaScript file using Node's `crypto.createHash`. For an HTML/XHTML external script, modulepreload or script preload bearing nonempty integrity metadata, a whitespace-separated hash token equal to a declared source digest triggers a group-wide exact-source policy **when the URL is root-relative or HTTP(S) absolute** and its mount could not be inferred from this input tree. Ordinary relative URLs retain the original, precise path-matching contract. This conservative distinction preserves existing positive transformation yield where `./other.js` has unrelated path provenance, even when it deliberately shares integrity metadata with another declared script. SRI's reserved `?options` suffix is removed for this comparison. Existing portable URL alias, case/Unicode and trusted SCO prefix matching remains intact.

The recognition relies on a digest supplied by the document author rather than a compiler-invented public URL prefix. It does not attempt to guess a CDN domain, remap source filenames or rewrite SRI metadata. It may conservatively decline an otherwise valid transform if an absolute external SRI resource happens to have identical bytes. It deliberately leaves a genuinely unrelated digest free to transform. The absolute-URL fallback is a byte-commitment heuristic and does not constitute proof that a particular deployment actually serves that source file at the alias.

The hash scan is a build-time source-admission operation. For a pinned script the emission becomes byte-identical to original input. It does not add runtime interpreter work. The same compiled graph may still contain unrelated original assets and does not become confidential or tamper resistant.

## Evidence and reproduction

- Targeted red: [45087012039](https://github.com/FlareZ123/obfs/actions/runs/45087012039), Linux/Windows focused test, before the fix.
- Targeted green: [45087095721](https://github.com/FlareZ123/obfs/actions/runs/45087095721), exact compiler commit `007ccb14d502fd5d5d2d7b25e93f544fb6a228ac`, both operating systems passed the new tests and strict JSDoc.
- Intermediate over-conservative red: [45087202465](https://github.com/FlareZ123/obfs/actions/runs/45087202465) at `111fd7989a8af0352f4dace43d4319173b2fad77` exercised the real-Chromium `test/sri-content-digest-alias-browser.js` witness. It confirmed `SRI_MOUNT_ALIAS_BROWSER {"native":true,"safe":true,"unsafe":false,"nativeBytes":129,"unsafeBytes":682}`. The workflow then **failed two older positive-yield cases** because the initial digest fallback also vetoed provably unrelated `./OTHER.JS` source paths. Follow-up commit `aca6383f70e43c9015367e6b19a17b072098957f` restricts the digest fallback to root-relative and absolute URLs. This regression and its correction are kept visible to prevent claiming an initial full-browser pass.
- Real Chromium witness: `test/sri-content-digest-alias-browser.js` mounts JavaScript at a filename-disjoint absolute path and compares original, complete-group compiled and intentionally JS-only compiled responses using the same correct SHA-384 HTML integrity metadata. The expected result is native and safe script execution, with browser refusal for the unsafe byte-rewritten response. It is wired into the existing manual browser workflow. Final source-pinned full-browser result pending.
- Reproduce focused tests with `node --test test/sri-content-digest-alias.test.js` after `npm ci`; reproduce Chrome with `CHROMIUM_BIN=google-chrome node test/sri-content-digest-alias-browser.js` on a supported runner.

Standards: [W3C Subresource Integrity](https://www.w3.org/TR/sri/) and [WHATWG HTML scripting](https://html.spec.whatwg.org/multipage/scripting.html). The standard selects the strongest recognized metadata algorithm and checks fetched response bytes; the bounded compiler policy conservatively treats **any** matching recognized digest as evidence that an original file may be source-pinned.

## Limits and release interpretation

A compiler may not see files injected after build, dynamic SRI hashes generated at runtime, changing deployment headers, opaque server URL rewrites, service-worker responses or other resource normalization. Source hash matches are sufficient to decline transformation of a declared file, but failure to match is **not a proof** that the file will execute under no SRI constraint. An asset may pin a hash of postprocessed output bytes that differ from the compiler's original source; only a deployment-stage HTTP audit can verify actual response equality.

This is finite positive compatibility evidence. It does not overcome static reconstruction, instrumented runtime extraction, same-trust source copying, authorized SCO relaying or existing strict compute-budget counterexamples. The project's primary security decision remains **RELEASE-BLOCKED**.
