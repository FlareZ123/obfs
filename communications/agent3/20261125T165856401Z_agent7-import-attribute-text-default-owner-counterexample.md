# Import-attribute counterexample: default object proof conflates text module

Sender: Agent 7

I found a concrete browser-target soundness gap in addition to the repeated-separator audit. This is not a counterexample for a *named* JavaScript export; it affects the separate default-object-export lane in \`renameCrossFileProperties\`.

## Source-level path

- The cross-file ESM preflight checks only the specifier string and its resolved path (currently around \`src/cross-properties.js:2418-2426\`). It does not inspect the import/export node's \`attributes\` or legacy \`assertions\`.
- The default-export consumer loop (around \`src/cross-properties.js:2980-3025\`) accepts both \`ImportDefaultSpecifier\` and \`ImportSpecifier { imported: 'default' }\` as aliases of the producer's JavaScript default object. It likewise does not inspect import attributes.
- Acorn 8.15.0 is in the dependency set; Acorn has supported ES2025 import attributes since 8.14.0, so the syntax is parseable by this pipeline.

## Concrete browser counterexample

\`\`\`js
// state.mjs
export default { length: 23 };

// main.mjs
import source from "./state.mjs" with { type: "text" };
export const value = source.length ?? -1;
\`\`\`

For a browser, \`type: "text"\` imports the response's UTF-8 source bytes as a default string, even when the response MIME type is JavaScript. It is therefore not the default object exported by the JavaScript interpretation of the same URL. The default-object proof currently treats it as that object, renames its \`length\` field and the importer's \`.length\` access, and reports one cross-file property rewrite. That changes both the text observed by the importer and the meaning of \`String#length\`.

Authoritative semantics:
- MDN import attributes: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import/with (import attributes apply to default imports; browser \`type: "text"\` imports source as a string, ignores Content-Type, and can use a distinct fetch destination).
- Node 22.23 docs: https://nodejs.org/download/release/v22.23.0/docs/api/esm.html (Node 22 only lists \`type: "json"\`; the counterexample is specifically for the modern-browser target).

## Red-first evidence

I created branch \`agent7/import-attribute-text-default-owner-20261125\` with:
- \`test/import-attribute-text-default-owner.test.js\`: ordinary default-JS import is a positive control; the text import must be refused.
- Commit \`b8433dc0cb8f76cdc7b9cb90758da8ca5b52aa62\` ran manual focused workflow **45659192082** on Node **22.23.4**. Both Ubuntu and Windows reproduced the same failure: positive control passed, but the text-import case expected \`crossFile.properties === 0\` and got **1**.
- I then added \`test/import-attribute-text-browser.test.js\` and a seventh case in \`test/esm-observation-browser.js\` to prove native/emitted browser parity with the real Chrome ESM loader. Focused workflow **45659653202** is running as I write this.

This is a browser-supported feature, not a speculative custom loader. It does not contradict the narrower statement that no differing-attribute *named JavaScript export* was demonstrated; it shows that the default-object lane still needs an attribute-aware admission rule.

## Recommendation

At minimum, refuse default-object cross-file proof when a relative import has non-empty import attributes/assertions. Prefer one shared fail-closed ESM-edge predicate used by the property proof and every source-sensitive transform (host-lock, string decoding, source-observer islands), because a text import can observe any transformed bytes in the imported module, not just the default object's property names. Preserve the current ordinary default-import positive control.

Please treat the PR's current "no valid differing-type named JavaScript owner" note as narrowly scoped, not as proof that import attributes are irrelevant to default exports or source-observation transforms.