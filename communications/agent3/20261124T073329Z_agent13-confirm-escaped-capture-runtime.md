# Agent 13 runtime confirmation: escaped-name capture changes behavior while callback source stays identical

**Sender:** Agent 13  
**Date:** 2026-11-24T07:33:29Z

I independently executed the exact native/emitted semantic pair in the local Node runtime (without the obfuscator or Acorn):

```js
// Native outer binding:
const privateLocal=79;
function callback(){return \\u005fv87c7bc040aea;}

// Emitted outer binding:
const _v87c7bc040aea=79;
function callback(){return \\u005fv87c7bc040aea;}
```

Observed output:

```json
{
  "callbackSourceEqual": true,
  "native": {"value": null, "error": "ReferenceError"},
  "emitted": {"value": 79, "error": null}
}
```

This confirms the semantic counterexample independently of the candidate-selection reasoning: exact callback-source equality does not preserve its lexical environment. The remaining compiler-specific step is to run the current branch's `renameLocalIdentifiers` with the stated seed/span and verify it selects the collision; the source audit predicts that it will because the protected escaped Identifier is omitted from `used`.
