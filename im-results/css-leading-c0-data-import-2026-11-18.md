# Leading ASCII C0 control escapes bypass CSS data-stylesheet import refusal

**Agent 20, 18 November 2026. Classification: intermediate source-publication exploit and bounded repair.** This does not establish strong algorithmic obfuscation or runtime tamper protection.

## Attack and standards connection

The WHATWG [URL Standard](https://url.spec.whatwg.org/) removes leading and trailing ASCII C0 controls or spaces (U+0000–U+0020), and removes ASCII tab/newline anywhere in the input, before parsing the scheme. The [CSS Syntax standard](https://www.w3.org/TR/css-syntax-3/) allows hexadecimal escape sequences in strings, consuming an optional following whitespace character. Thus a stylesheet import expressed as

```css
@import "\1 data:text/css;base64,...";
```

can yield a decoded URL beginning with U+0001 followed by `data:`. It is a `data:` URL after URL-standard normalization. An embedded second stylesheet can carry an inline version-3 source map whose `sourcesContent` contains exactly the private original JavaScript.

At source SHA [`c50dc0b`](https://github.com/FlareZ123/obfs/commit/c50dc0b2163ba8cd4635024a3fa70cf20891e81c), the CSS-tree `hasCssDataImport` parser decoded the escape, removed interior ASCII tabs/newlines, then called `trimStart()`. JavaScript `trimStart()` does **not** remove U+0001. Consequently the scanner accepted the disguised data stylesheet, while native Node `new URL(String.fromCharCode(1)+'data:text/css,...')` reports `data:`.

## Immutable failure and bounded fix

A preregistered [negative-control suite](../test/css-c0-url-normalization.test.js) checks real `data:` scheme resolution for leading C0 controls, CSS quoted and `url()` escapes, non-`data:` interior-C0 controls, and publication refusal for CSS, HTML-style and SVG-style assets across COO, SCO and SNO and direct SCO handler construction.

The [Ubuntu/Windows prepatch run 44275718377](https://github.com/FlareZ123/obfs/actions/runs/44275718377) **failed as intended** at exact SHA `65901ac3a97d78aa7a2121c926ac7c7e65b48372` with two failures on both OS: the scanner returned `false` for an escaped U+0001 data import and protected compilation unexpectedly accepted `style.css` in COO. The source-only recovery experiment was separately prepared to compare prepatch and patched public-byte outputs.

The small repair in `src/css-data-imports.js` normalizes leading ASCII C0 control-or-space code points using `/^[\\x00-\\x20]+/u` after removing ASCII tab/CR/LF and before scheme comparison. It leaves interior controls such as `da\u0001ta:` intact. This strictly expands the protected data-scheme set while preserving safe external/relative stylesheet imports and declared image data assets.

The patched [two-OS gate 44276101986](https://github.com/FlareZ123/obfs/actions/runs/44276101986) **passed** at exact SHA `3c33a3083ad1c277408e43537ba612da20ee9ef0`, including the C0 source-leak suite, previously validated CSS grammar suite, strict JSDoc and real Chromium tests. An additional [raw HTTP/Chromium fixture](../test/css-c0-url-browser.js) directly compares a normal data-stylesheet import with the leading-U+0001 CSS escaped version. It requires both to create an actual `CSSImportRule` and produce the same computed RGB color. This is independent of the obfuscator's CSS parser.

## Paired source-only attacker and further gate

The [paired attacker](../sims/css-leading-c0-attack.js) loads a prepatch compiler from immutable commit `c50dc0b2163ba8cd4635024a3fa70cf20891e81c` and a current candidate, compiles the same original CommonJS source and copied CSS/HTML/SVG asset under each mode, and runs native/emitted executable parity inside isolated V8 contexts. A separate child process [extractor](../sims/css-leading-c0-extractor.js) receives **only published asset bytes** via stdin, reconstructs a nested base64 CSS source-map from the data URL, and must print the exact private source. The candidate must refuse the same public asset before publication. For SCO, the attacker reads the source from a real old-handler localhost HTTP GET and verifies that new handler construction refuses. An accepted external stylesheet control requires byte-identical emitted JavaScript and public CSS under the same options. The workflow checkout is pinned to the actual prepatch source.

The exact [Ubuntu/Windows paired-asset and source-only gate 44276645628](https://github.com/FlareZ123/obfs/actions/runs/44276645628) **passed on both operating systems** at immutable executable SHA `cdb13ea7fadf4983d657b4f91a0e451347fd8d5b`, including all COO/SNO/SCO original-source recovery versus patched refusal, actual old SCO HTTP extraction, accepted output byte parity, direct browser URL import equality, existing asset adversaries, and strict core JSDoc.

## Scope

This closes a concrete URL-normalization mismatch for CSS embedded imports. It is a build/publish-time asset policy, with no newly emitted runtime JS instructions. It cannot establish full absence of secret source in arbitrary public binary/text/CSS values, defeat a full-control client reverse engineer, prevent authorized SCO relaying, or prove any application's full-session 2.5x runtime bound. Valid CSS data-stylesheet imports containing these controls become conservatively refused, a deliberate compatibility tradeoff. Preserve this as an intermediate security finding.

## Escape-encoding and C0 boundary coverage extensions

[PR #101](https://github.com/FlareZ123/obfs/pull/101) extends the original four disguised data-import fixtures to eight, adding U+001F, a six-digit CSS hex escape without separator, unquoted `url(...)`, and uppercase `@IMPORT`. Exact [Ubuntu/Windows gate 44278023982](https://github.com/FlareZ123/obfs/actions/runs/44278023982) passed at `0582252093f6d3d6d5a5e7fc63384978e840d687`, including the historical source-only public-byte extractor and Chromium tests. This is additional parser and admission coverage rather than separate evidence of browser import execution for all spellings.

[PR #102](https://github.com/FlareZ123/obfs/pull/102) adds a deterministic 31-code-point matrix for every **nonzero ASCII C0 control U+0001..U+001F**, each written as a six-hex-digit CSS escape in a quoted string and inside `url("...")`. The scanner must recognize all **62** leading-control data-stylesheet imports. A separate **31-case** interior-control matrix checks that only ASCII TAB (9), LF (10), and CR (13) are stripped inside the URL scheme; the other 28 ASCII C0 interior controls remain non-data under the WHATWG URL parser. Node's native `URL` constructor is the independent leading-control oracle. Exact [Ubuntu/Windows asset, source-only attacker, real Chromium, and strict JSDoc gate 44278585693](https://github.com/FlareZ123/obfs/actions/runs/44278585693) passed at `020ab6c3adde4d38079e665b411b54e2ec261767`. These cases do not exhaust every malformed syntax recovery or browser implementation.

### Raw paired-attacker counts from the immutable gate

The Ubuntu job log in [44276645628](https://github.com/FlareZ123/obfs/actions/runs/44276645628) records the paired standalone source-only extractor's exact JSON summary: **COO 3 extracted/3 patched refusals/2 byte-identical safe outputs; SNO 3/3/2; SCO 3/3/2**. That totals **9 successful old public-asset source recoveries**, **9 protected prepublication refusals**, and **6 byte-identical output-file controls**. Independently, actual old SCO HTTP publication yielded **3 recovered** sources and patched handler construction yielded **3 refusals**. The Windows counterpart and all other asset adversaries also passed. These are deliberately finite, named input contexts, not universal confidentiality or tamper guarantees.
