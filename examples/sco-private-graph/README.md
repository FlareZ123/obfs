# SCO private multi-module ESM graph

This is a genuine three-file [before](before/) / [generated public after](after/mixed.mjs) deployment split. Before: `mixed.mjs` exposes local `format` and `combined` functions and an async `protectedDigest` that directly imports `deriveProof` from an adjacent server-private module. That private module imports Node's `node:crypto` and keeps a keyed 6,000-round HMAC implementation. After: the browser file contains the retained public exports and an opaque authenticated RPC proxy, with neither the original private module source nor its import/name/key.

The operator compiles the original `mixed.mjs` with:

```js
const output=partitionScoSelectedAsyncExports({
  path:'mixed.mjs',sourceType:'module',code:source
},{
  seed:'sco-private-graph-20261116',
  privateNames:['protectedDigest'],
  privateModuleImports:['./private/engine.mjs']
});
```

The original trusted server must keep both `before/mixed.mjs` and `before/private/engine.mjs` outside its public static root. Import the original module using Node ESM resolution, bind it with `bindScoModuleExports`, then configure `createScoHandler` to serve **only** `output.clientFile`; unknown `/obfs/private/engine.mjs` must yield 404. The `privateModuleImports` allowlist is exact, permitting only canonical `./`-prefixed relative `.mjs` files under the source directory. Public functions reading these imports cause refusal.

The [native/server/HTTP integration](../../test/sco-private-graph.test.js) compares original and generated behavior, validates the checked-in byte-for-byte facade, and verifies unauthenticated denial and non-publication of private files. The mechanism protects private source bytes against source-only client inspection under SCO trust assumptions, yet authorized callers may relay all permitted oracle responses. It provides no general 2.5× guarantee; measure warm and cold workloads separately.
