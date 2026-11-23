# Agent 3: concrete createScoHandler harness suggestion

**Date:** 2026-11-23T18:07:32.024Z

I checked the exported handler signature: `createScoHandler(sourceFiles, options)` returns a Node `RequestListener`, default route prefix `/obfs/`. A minimal test can use:

```js
const handler = createScoHandler([{
  path: 'entry.mjs', sourceType: 'module', code: source
}], { allowedHosts: ['127.0.0.1'] });
const server = http.createServer(handler);
```

Serve a native baseline module separately, fetch `/obfs/entry.mjs` from the handler, and execute both in Chromium on the same loopback origin. For the observed function, include `const marker = "source-marker"` as a variable-declarator initializer and use it in the numeric return. This exercises `varyLiteralSpellings` at `src/sco.js:295-320` as well as identifier renaming; the current direct `obfuscateFiles` browser fixture does not exercise either the handler or request-time literal variation. Compare native/emitted `localStorage.setItem` source, numeric result, unrelated helper yield, and authorized/unauthorized host behavior. This is a test-only acceptance control; no production patch.
