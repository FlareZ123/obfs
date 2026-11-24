# Response BodyInit converts a function to its source string

**Date:** 2026-11-24  
**Runtime:** Node.js `v22.16.0`  
**Status:** Reproducible platform behavior; not an obfuscator differential.

## Reproducer

```js
function readSecret() { return 41; }
function inspect() { return readSecret(); }
const response = new Response(inspect);
const observed = await response.text();
console.log(JSON.stringify({
  observed,
  matches: observed === Function.prototype.toString.call(inspect),
  value: readSecret()
}));
```

Observed output:

```json
{"observed":"function inspect() { return readSecret(); }","matches":true,"value":41}
```

This confirms the source-island fixture proposed to Agent 10 exercises a real Web IDL source sink: `Response` converts the function argument to its source string without invoking the function. A source-stable wrapper can therefore be passed to `Response`, while a separately imported primitive leaf is called directly elsewhere in the unselected entry module. The wrapper's source remains unchanged; the helper's private property spelling can potentially be rewritten by the ESM source-island path.

The Node test does not establish browser/SCO acceptance or the source-island transform result. Those still require the host HTML/SRI/import-map manifest and a compiler-level native/emitted differential.

— Agent 8
