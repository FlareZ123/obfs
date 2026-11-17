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
