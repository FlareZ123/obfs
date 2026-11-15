# Obfs research baseline

This repository is an experimental, conservative JavaScript obfuscator targeting Node.js 22+ and modern browsers. It offers three operational modes. The current version is a reproducible starting implementation; its security and performance guarantees are limited to the conditions described here.

## Install and verify

Install dependencies with `npm install`, then run `npm test` and `npm run benchmark` from the repository root. All code is CommonJS with JSDoc annotations. The parser dependency is Acorn 8.x. The project deliberately avoids source-code `eval` and arbitrary custom bytecode execution.

## Entrypoints

`bin/coo.js` transforms a directory into static browser files, preserving relative ESM import paths and non-JavaScript assets. Example:

```powershell
node bin/coo.js --root .\examples\browser --entry index.mjs --out .\dist-browser --host app.example.org --closed-world
```

`bin/sno.js` produces a preobfuscated Node CommonJS directory plus `sno-entry.cjs`. It verifies the output files' SHA-256 digests at startup and then loads the actual entry through `require`. Example:

```powershell
node bin/sno.js --root .\examples\server --entry index.cjs --out .\dist-server
node .\dist-server\sno-entry.cjs
```

`bin/sco.js` starts an HTTP server with the obfuscator library loaded server-side. It encodes served JavaScript afresh on each request, under `/obfs/`. Example:

```powershell
node bin/sco.js --root .\examples\browser --entry index.mjs --port 8080 --host localhost --closed-world
```

The programmatic API is `require('./src')`, exporting `obfuscateFiles`, `createSnoLauncher`, and `createScoHandler`. A file is `{path,code,sourceType?}`. Modes are `coo`, `sco`, `sno`; supported source types are `script`, `module`, `commonjs`, `asset`.

## Implemented transformations

- One-time Unicode-preserving XOR string decoding. The decoder's array is initialized once per file, with per-build randomness. String literals inside direct loop bodies, import specifiers, `require` arguments, directive prologues, and noncomputed property keys remain intact.
- Conservative AST-based private property renaming. It tracks immutable aliases, passes to local direct-call functions, and identity returns. It refuses transformation when the alias escapes, encounters computed access, reflection, duplicate bindings, `eval`, or `with`.
- Opt-in `--closed-world` analysis of direct ESM named exports and imports. It renames own keys jointly across provided modules only when the proof covers every importer in the declared module set. Dynamic imports, namespace imports, and reexports cause refusal. Turning this flag on asserts that no outside module accesses exported object shapes.
- Optional browser hostname check. It is a convenience restriction against accidental reuse, and **cannot withstand a client that can modify code**.
- SNO local integrity check against incidental file corruption. Since the modeled adversary controls the server's files and runtime, this cannot establish a cryptographic trust boundary.

## Important limitations

This prototype does not implement arbitrary closure or cross-file property-flow reconstruction, encrypted remote execution, Wasm lowering, VM virtualization, general lexical identifier mangling, or runtime anti-instrumentation. Dynamic tooling, modified runtimes, and complete client visibility can extract code and bypass local checks. It cannot guarantee 2.5x speed for arbitrary inputs. The benchmark is a limited sample, not a performance proof. Breaking API contracts through obfuscation is a correctness failure; ambiguous cases intentionally remain unchanged.

For SCO, the server can retain secrets that are never sent to the client, but ordinary client-delivered JS remains extractable. The `Host` header may be forged by HTTP clients; enforce real authorization on the server for privileged operations.

## Repository organization

`src/` is the implementation; `test/` contains behavior/integrity/regression suites and a benchmark; `im-results/` contains intermediate empirical results and limitations; `results/` is reserved for reproducible established research conclusions; `agents/` is persistent research coordination state. Read `docs/SECURITY.md` before deployment.

## Shared repository rule

This repository is a workplace for agents. The creator's single explicit CI constraint is preserved: **do not create workflows that run per commit**, because they would consume the shared CI budget.
