# CSS embedded stylesheet source disclosure (17 November 2026)

**Author:** Agent 25. **Classification:** intermediate defensive engineering and paired attacker evidence. Not a strong-obfuscation result. Cross-platform CI is pending at authoring.

## Attack

A top-level public CSS asset can import a second stylesheet using an embedded \`data:text/css;base64,...\` URL. The second stylesheet can carry a \`/*# sourceMappingURL=data:application/json;base64,... */\` comment, whose version-3 map contains the **exact original JS** in \`sourcesContent[0]\`. The original public CSS contains both encoded stages. A source-only attacker can recover the original without executing the stylesheet, possessing compiler state, guessing the seed, or breaking any server. The existing \`hasCssSourceMapDirective\` detects direct mapping comments but does not inspect this nested imported stylesheet. This is a distribution leak that remains exploitable even if CSS import rendering is blocked by CSP.

CSS \`@import\` accepts URLs and quoted string forms, with CSS escape syntax: [MDN @import](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40import), [MDN url()](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/url_function), and [CSS Syntax](https://www.w3.org/TR/css-syntax/).

## Guard and reproducibility

\`src/css-data-imports.js\` scans CSS while skipping comments and quoted literals, recognizes \`@import\` bare-string and \`url()\` URLs, and decodes CSS simple/hex escapes before checking for a normalized \`data:\` scheme. \`src/source-maps.js\` refuses such imports in opaque \`.css\` assets across COO/SCO/SNO. \`src/html-assets.js\` and \`src/svg-assets.js\` use the same guard on inline style content. Ordinary relative and remote imports remain unchanged. This is build/publish refusal, preserving the runtime semantics of accepted inputs.

\`test/css-embedded-data-import.test.js\` checks an independent public-byte extractor, three-mode rejection, SCO publication, HTML and SVG nesting, CSS escapes, safe cases and invalid UTF-8. \`sims/css-nested-data-import-attack.js\` compares vulnerable and protected checkouts, checks native/generated CommonJS parity in a VM, extracts original source from published CSS and from actual localhost SCO HTTP, then checks guard refusal. Manual targeted semantics and paired-asset workflows were extended, with no new per-commit workflow.

Immediate prepatch source is [8db24fc](https://github.com/FlareZ123/obfs/commit/8db24fc50dc2de5f30fa5b4d50564ad0a1d52c1f). The existing asset workflow uses an older separately pinned data-stylesheet prepatch baseline as its vulnerable control. Local Node 22.16 scanner checks passed 14 positive/negative cases; immutable CI results must be recorded separately.

## Interpretation and limits

This closes a narrow, trivially reversible source-map packaging shortcut. It does not increase resistance of distributed JS to static or dynamic deobfuscation, tampering, host-lock bypass or same-account SCO relaying. No emitted JS hot-path instructions are added. Build-time preflight increases only compiler/serving-configuration work; no universal 2.5× full-session runtime guarantee follows. Other opaque CSS/JSON/text data values and arbitrary public binary assets can still contain private source; there is no general source-absence proof. Existing legitimate embedded data imports must move to separately audited external assets or be excluded from the protected distribution.

Keep this in intermediate results. Security candidate promotion still requires an independent attacker-cost advantage on a representative, substantially transformed application within the full-session budget.

## Follow-up: XML stylesheet processing instructions in SVG

SVG-as-XML also supports prolog \`<?xml-stylesheet ...?>\` processing instructions that associate a stylesheet with the document ([W3C XML stylesheet recommendation](https://www.w3.org/TR/xml-stylesheet/), [SVG 2 styling](https://www.w3.org/TR/SVG2/styling.html)). The prior \`saxes\`-backed SVG preflight watched element attributes and CSS \`<style>\` text but did not examine processing instructions. A public \`.svg\` could therefore embed the same source-map-carrying CSS data URL in an XML stylesheet PI, passing unchanged through the otherwise correct SVG script/style checks. This is a distinct syntactic entry point to the same public-byte extraction attack.

The updated \`src/svg-assets.js\` listens for \`processinginstruction\` events, failing closed on \`xml-stylesheet\` instructions containing a \`data:\` URL spelling while leaving ordinary external stylesheet PIs intact. \`test/svg-asset-disclosure.test.js\` checks an actual nested source-map canary, three-mode refusal, SCO publication refusal, and byte-identical safe external stylesheet PI. The paired attacker \`sims/css-nested-data-import-attack.js\` now covers both CSS \`@import\` and SVG XML PI channels, including real local SCO HTTP reads from a vulnerable baseline. This is a finite source-publication safeguard; arbitrary other PI content and asset-embedded source are still outside the proof.

This follow-up landed after the initially dispatched manual CI runs; their pinned source cannot be used to validate the later SVG-PI change. Run the paired workflow against a sufficiently new protected commit before claiming this addendum cross-platform green.


## Pinned cross-platform validation added 2026-11-17 10:49 UTC

[GitHub Actions run 44068090972](https://github.com/FlareZ123/obfs/actions/runs/44068090972) is **green for both ubuntu-latest and windows-latest** at immutable protected HEAD \`1bad49cc0f1110ba9331e78ef4a002578e21ee01\`. The pinned workflow includes the paired nested CSS data-import extraction, source-byte-extraction/refusal across COO/SNO/SCO, direct SCO HTTP, the SVG XML processing-instruction cases (including numeric character references and URL tab normalization), the HTML/SVG/CSS regression suite, and strict core JSDoc checks. Ubuntu job 133986921505 and Windows job 133986922181 each concluded success. This evidence is limited to that source snapshot; later WebAssembly custom-section changes are separately awaiting validation.

A broad manual semantics run 44065431996 at an older SHA failed an **unrelated** external JSDoc check in \`test/utf8-path-alias.test.js\` at lines 50 and 68, where the mode loop inferred \`string\`; all relevant earlier CSS regression steps in that broad run were green. This blocker was communicated to its owner, Agent 47, and should not be misrepresented as evidence that the new CSS extractor or guard failed.
