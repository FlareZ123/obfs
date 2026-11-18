# SCO static asset MIME: browser and WebAssembly compatibility

**18 November 2026, Agent 44.** Intermediate engineering evidence, without a new confidentiality or tamper-resistance claim.

## Contract and prepatch counterexample

The SCO `createScoHandler` publication path already audits static asset bytes through `assertNoSourceMapDisclosure`, retains exact approved bytes, applies `Cache-Control: no-store`, and sends `X-Content-Type-Options: nosniff`. Before this change, asset GET selected only `.json`, `.css` and `.html` for specific `Content-Type` values. Valid `.htm`, `.svg`, raster and font files, and `.wasm` binaries otherwise received `application/octet-stream`.

WebAssembly streaming requires a JavaScript Web API `Response` with `Content-Type: application/wasm`. An actual Node 22 negative control with the same 37-byte valid no-custom-section module returned `TypeError: WebAssembly response has unsupported MIME type 'application/octet-stream'`; the positive control with `application/wasm` exported and ran `ping() === 42`. This is a **correctness defect** in the original SCO asset-serving interface, even though non-streaming compilation of already-read bytes could still work. See the [W3C WebAssembly Web API 2](https://www.w3.org/TR/wasm-web-api-2/) and [MDN WebAssembly.instantiateStreaming](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/instantiateStreaming_static).

## Patch and scope

The static asset branch in `src/sco.js` now maps lowercased extension names to standard MIME values: HTML, CSS, JSON, SVG, PNG/JPEG/GIF/WebP/ICO, WOFF/WOFF2/TTF/OTF and `application/wasm`. Unknown asset suffixes remain `application/octet-stream`. The map runs **after** the existing source-map, executable-inline-markup, archive, Wasm-debug-metadata, reviewed-asset and private-source publication preflights. No generated JavaScript, private source, authentication or callback-order semantics were changed.

The MIME mapping assumes the public file list contains the declared file types; it does not inspect arbitrary unknown binaries to establish their truthful types. Browser compatibility and publication-safety policy remain separate responsibilities.

## Reproduction and measurements

- `test/sco-asset-mime.test.js`: 17 static asset cases, exact HTTP status, media type, `nosniff`, `no-store` and byte-for-byte body preservation. Includes Node's actual `WebAssembly.instantiateStreaming(fetch(...))` and a mismatched `octet-stream` negative control.
- `test/sco-asset-mime-browser.js`: a real HTTP-served Chromium page loads an external stylesheet, SVG image, generated SCO ESM module and streamed Wasm. Expected DOM witness `rgb(0, 128, 0)|9|7|42`; an earlier smoke test without Wasm exercised `rgb(0, 128, 0)|9|7`.
- The existing manually dispatched two-OS `.github/workflows/manual-asset-attack.yml` also executes the other bounded static-asset disclosure attacks and strict JSDoc. No new per-commit workflow was created.
- Pinned **passed** [first HTTP test, 44246287135](https://github.com/FlareZ123/obfs/actions/runs/44246287135) on `1e0b09129c7ecb688532157dc2616ac96ae7a91b`.
- Pinned **passed** [Chromium CSS/SVG/ESM browser test, 44246669474](https://github.com/FlareZ123/obfs/actions/runs/44246669474) on `0308b4b52ba6e0d978b220dd84838112b1a1d934`.
- Pinned **passed** [Wasm streaming and asset browser test, 44247213568](https://github.com/FlareZ123/obfs/actions/runs/44247213568) on `2f6b1d5a2eeff757090e1c107959730b7118dca0`, including Ubuntu, Windows and actual Chromium.
- The historical-wrong-MIME negative control committed at `bb171aa7ce34d633cd4cb8c4f8a0b666fbdf5817` passed the later two-OS [source-pinned asset gate 44248491213](https://github.com/FlareZ123/obfs/actions/runs/44248491213) at `2cf02ac9ac30330277b6dc8383aaad86e275b022`. That run also repeated the Chromium Wasm streaming parity test on Linux.

## Security and 2.5× interpretation

This patch repairs a browser execution precondition. It adds no opaque algorithm, server secret, integrity authority, environment lock, or adversarial cost advantage. It does not change Wasm byte disclosure, which remains complete for a client with access to published assets. No strict representative 2.5× application runtime benchmark accompanies this publication-layer change. It should remain in `im-results/` and cannot change the main research index's release-blocked security decision.
