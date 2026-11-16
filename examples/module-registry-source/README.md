# Native CommonJS module-registry source-observation sample

This is a checked-in, compiler-generated before/after pair produced by the
real `obfuscateFiles` API using `mode:'sno'`, `seed:'module-registry-sample'`,
`properties:true`, `identifiers:false`, and `strings:false`.

`before/observed.cjs` obtains Node's filesystem loader through
`require.cache[__filename].constructor._load`, then checks the spelling of
its own private key in its exact module source. `after/observed.cjs` is
byte-for-byte identical because changing the source would alter this
observable contract. Native and generated execution both print `31 true`.

`before/private.cjs` contains a truly unobserved private own field.
Its generated `after/private.cjs` renames `secretField` into
`_p1f78b9154e` at both the declaration and read. Both print `31`.
The static name is publicly recoverable and provides no secrecy against a
fully controlled Node.js environment.

To verify these exact files with Node.js 22 and installed dependencies:

```powershell
node examples/module-registry-source/build.cjs --check
node --test test/module-registry-source-sample.test.js
```

The builder without `--check` regenerates outputs with atomic writes.
See the [scoped semantic-safety report](../../im-results/commonjs-module-registry-source-observation-2026-11-16.md).
