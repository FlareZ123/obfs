# HTML import-map web URL fragment can carry raw unobfuscated JavaScript

**Agent 7, 23 November 2026. Intermediate source-admission compatibility
result.** This closes a reproducible finite raw-text leak in the recently
admitted import-map HTML subset; it is not a proof that arbitrary opaque
URL text cannot encode original source.

## Counterexample

The HTML parser's `safeHtmlImportMap` rule treated JSON import maps as
source-free configuration when their values were ordinary HTTP(S) or relative
module URLs. A fragment such as

```js
'./lib.mjs#(()=>{globalThis.PRIVATE_SOURCE_DISCLOSURE=17})()'
```

is syntactically a relative URL even though it visibly embeds JavaScript
text in the HTML file. Browsers need not execute the fragment to expose it
to anyone downloading `index.html`. The URL accepted by the previous
`src/html-assets.js::isWebModuleAddress` therefore undermined the
narrow audit claim that admitted import-map JSON contains no raw script
source. The same route for URL text existed in the `scopes` and
`integrity` keys.

## Red/green source evidence

- Test source `dee923552a0f9e1f32876f4976f04dfe9d30266a`,
  [focused Node 22 run 45284292518](https://github.com/FlareZ123/obfs/actions/runs/45284292518):
  both Ubuntu and Windows rejected the new expected assertion. Existing
  logic returned `null` (accepted HTML) where
  `findInlineHtmlSource` should return `inline script source`.
- Updated `isWebModuleAddress` conservatively refuses raw parentheses,
  square/curly brackets, semicolons, backticks, backslashes and angle brackets
  in URL text. The source remains admitted if an ordinary relative web
  URL contains query/fragment decoration such as
  `./lib.mjs?build=27#release-1`. The same URL scanner applies to mapping
  values and `scopes`/`integrity` URL keys.
- Corrected source `4b99b28d07a86a20d7ac4e0dc03dffd64d5fc93b`,
  [focused 45284437372](https://github.com/FlareZ123/obfs/actions/runs/45284437372):
  expanded import-map test file and strict project/external/paired-budget
  JSDoc all **green on Ubuntu and Windows**.
- [PR #367](https://github.com/FlareZ123/obfs/pull/367) merged as
  `2dba3854f119d6b7899d8cf6088cb85d8d51f657`.
  Production changes are limited to one conservative import-map URL
  validation check, with no change to normal JavaScript transformation.

## Limits

Encoded executable source in a URL or a base64-looking ordinary specifier
may still be opaque to the finite source audit; no universal detection
claim is made. URLs with characters that might be benign for some hosting
arrangements are conservatively rejected by this intentionally narrow
parser. The change does not establish stronger obfuscation or attacker
resistance, nor does it change the project's **RELEASE-BLOCKED** status.
The separate original import-map SRI proof and browser three-way test
are preserved in
`im-results/html-importmap-integrity-source-commitment-2026-11-23.md`.
