# Version-pinned SCO TextDecoder migration admission, 22 November 2026

## Native cross-host reproduction

The SCO selective source-partition contract relocates selected code from a
browser to a Node.js server. `package.json` declares `node >=22`, rather
than a fixed native/ICU mapping-version pair. Legacy character-decoder
tables and error replacement behavior therefore cannot be assumed
byte-equivalent solely because both runtimes expose `TextDecoder`.

The real-browser experiment in
`test/sco-textdecoder-realm-browser.js` compared unmodified native
`TextDecoder` on **Google Chrome 157.0.8103.78**, **Node v22.16.0**
and **Node v22.23.5** on Ubuntu GitHub Actions. Results are Unicode
code-point values for the same byte sequences:

| Decoder and byte(s) | Node 22.16.0 | Chrome 157 | Node 22.23.5 |
| --- | --- | --- | --- |
| `windows-1252` / `80` | U+0080 | U+20AC (€) | U+20AC (€) |
| `gbk` / `FF` | U+F8F5 | U+FFFD (replacement) | U+FFFD |
| `utf-8` / `41 42` | `AB` | `AB` | `AB` |

The [source-pinned run 45007030169](https://github.com/FlareZ123/obfs/actions/runs/45007030169)
contains the pinned v22.16.0 / real Chrome output under job
`pinned-legacy-decoder` and latest v22.23.5 / Chrome output in
`graph (ubuntu-latest)`. The pinned comparison job **passed**.
The overall workflow intentionally failed because the unchanged
compiler **admitted** the known incompatible selected sources.
The later [dedicated manual witness workflow](../.github/workflows/manual-sco-textdecoder-compat.yml)
is isolated from the frequent SCO graph research gate and uses a two-version
Node matrix to keep this comparison reproducible.

The upstream [Node issue #61041](https://github.com/nodejs/node/issues/61041)
records related historical `TextDecoder` correctness defects; the exact
environment-sensitive claim here rests on **our measured native outputs**.
The [WHATWG Encoding Standard](https://encoding.spec.whatwg.org/) supplies
the browser's intended legacy mapping. Newer Node 22.23.5 agrees on
these two specific malformed/legacy bytes, so this report does not claim
that every Node 22 and Chromium combination differs.

## Source-pinned admission correction

The two-platform [red-first SCO graph run 45007030169](https://github.com/FlareZ123/obfs/actions/runs/45007030169)
at source and test SHA `c7f977548573091fc069e49c8eadb790cb5c8125`
failed for `new TextDecoder('windows-1252')` missing its required refusal.
The new `usesUnprovedRelocatedTextDecoder` preflight runs on both selected
private functions and static audited private ESM dependency sources. It:

- Admits direct `new TextDecoder()` and literal,
  case-insensitive recognized UTF-8 encoding names (`utf-8`, `utf8`,
  `unicode-1-1-utf-8`), preserving compatible controls
- Refuses known legacy labels and unknown/dynamic labels, constructor
  aliases, first-class extractions, and destructuring of a global
  `TextDecoder` constructor through tracked global-root aliases
- Leaves unrelated local record-property spellings `TextDecoder`
  unaffected, avoiding a gratuitous false refusal

After fixing one strict-JSDoc implicit callback-`any` error in
`src/sco-selective-partition.js`, the
[two-platform targeted workflow 45007304169](https://github.com/FlareZ123/obfs/actions/runs/45007304169)
passed at `074a9ee40d0e1bb24a6930adf81daf2946ebf3d8`,
including strict JSDoc and the original four negative/three positive
source cases across selected and two static-graph depths. Further
coverage added global constructor destructuring, a global-object alias
and a dynamic label, plus inert record-key and explicit UTF-8 positives.
The final [clean focused workflow 45007421055](https://github.com/FlareZ123/obfs/actions/runs/45007421055)
passed Ubuntu and Windows at compiler/test/workflow SHA
`0c04891aab54f7ec64a686f294625ab6d364c693`,
covering **seven unsafe and five retained-safe source bodies** each
at selected and two audited static graph depths. The temporary browser
job was removed from the frequent graph workflow and retained as an
independent manual reproduction workflow.

## Limits and interpretation

This is a bounded syntactic admission proof for direct UTF-8 construction,
not a complete cross-realm `TextDecoder` ownership or Unicode
conformance theorem. Recovering constructors via complex reflection,
dynamic property access, opaque callbacks or outside modules remains
unproved. A locally shadowed `TextDecoder` may be conservatively refused.
Similarly, correctness across every browser and Node version cannot be
inferred from the above three point samples.

The change affects only compilation decisions, adding no obfuscated
runtime instructions to any still-admitted source. No universal runtime
2.5× bound, extraction resistance, or authorization security follows.
The overall project remains **RELEASE-BLOCKED**.
