# Obfs research baseline

This repository is an experimental, conservative JavaScript obfuscator targeting Node.js 22+ and modern browsers. It offers three operational modes. The current version is a reproducible starting implementation; its security and performance guarantees are limited to the conditions described here.

## Install and verify

Install dependencies with `npm install`, then run `npm test`, `npm run typecheck`, and `npm run benchmark` from the repository root. All code is CommonJS with JSDoc annotations. Optional `npm run test:browser` runs a real Chromium headless integration test when Chromium is installed (`CHROMIUM_BIN` overrides the binary location). The parser dependency is Acorn 8.x, and the JSDoc static checker uses TypeScript with Node.js declarations as development dependencies. The project deliberately avoids source-code `eval` and arbitrary custom bytecode execution.

## Entrypoints

`bin/coo.js` transforms a directory into static browser files, preserving relative ESM import paths and non-JavaScript assets. Example:

```powershell
node bin/coo.js --root .\examples\browser --entry index.mjs --out .\dist-browser --closed-world
```

`bin/sno.js` produces a preobfuscated Node CommonJS directory plus `sno-entry.cjs`. It verifies the output files' SHA-256 digests at startup and then loads the actual entry through `require`. Example:

```powershell
node bin/sno.js --root .\examples\server --entry index.cjs --out .\dist-server
node .\dist-server\sno-entry.cjs
```

`bin/sco.js` starts an HTTP server with the obfuscator library loaded server-side. It encodes served JavaScript afresh on each request, under `/obfs/`. Example:

```powershell
node bin/sco.js --root .\examples\browser --entry index.mjs --port 8080 --closed-world
```

For browser module graphs that use `.js` rather than `.mjs` extensions, add `--js-module` to the COO or SCO CLI invocation. This explicitly treats every input `.js` file as an ES module; do not enable it for mixed classic-script or CommonJS `.js` trees. The flag is rejected in SNO. `.mjs` is recognized as a module without the flag. The SNO CLI detects explicit nested Node `package.json` module scopes for `.js` dependencies, allowing a CommonJS entry to dynamically import ESM modules.

The programmatic API is `require('./src')`, exporting `obfuscateFiles`, `createSnoLauncher`, `createScoHandler`, `createScoRpcClientSource`, and `createScoBatchMethod`. A file is `{path,code,sourceType?}`. Modes are `coo`, `sco`, `sno`; supported source types are `script`, `module`, `commonjs`, `asset`.

## Implemented transformations

- One-time Unicode-preserving XOR string decoding. The decoder's array is initialized once per file, with per-build randomness. Eager string encoding is **off by default for COO and SCO client files** and enabled for SNO; programmatic COO/SCO callers may explicitly request `strings:true`, accepting the measured cold-start tradeoff. String literals inside direct loop bodies, import specifiers, `require` arguments, directive prologues, and noncomputed property keys remain intact.
- Conservative AST-based private property renaming. It tracks immutable aliases, passes to local direct-call functions, identity returns, and simple statically keyed object destructuring. It rejects aliases outside their lexical scopes and unknown method assignments that could inspect object keys. It refuses transformation when the alias escapes, encounters computed access, reflection, duplicate bindings, `eval`, or `with`.
- Opt-in `--closed-world` analysis of direct ESM named exports and imports. It renames own keys jointly across provided modules only when the proof covers every importer in the declared module set. Dynamic imports, namespace imports, reexports, exported aliases, noncanonical URL/absolute/package import specifiers, and mixed executable source groups cause refusal. Ordinary relative ESM named imports and Node builtins remain eligible. CSS, raster-image, and font assets may accompany an ESM graph when the integrator guarantees that those assets cannot execute as JavaScript. HTML, SVG, and other unknown assets still prevent cross-file renaming. Turning this flag on asserts that no outside module accesses exported object shapes.
- Restricted lexical identifier renaming using unique-binding AST proofs; variable names change while external API names, object literal keys, and dynamic-scope constructs remain unchanged.
- Optional browser hostname check. It is a convenience restriction against accidental reuse, and **cannot withstand a client that can modify code**. Host-locked ESM files with static imports or reexports are refused, because those dependencies would execute before the guard. Use server-side authorization to protect such graphs.
- SNO local integrity check against incidental file corruption. Since the modeled adversary controls the server's files and runtime, this cannot establish a cryptographic trust boundary.

## Important limitations

This prototype does not implement arbitrary closure or cross-file property-flow reconstruction, encrypted remote execution, Wasm lowering, VM virtualization, general lexical identifier mangling, or runtime anti-instrumentation. Dynamic tooling, modified runtimes, and complete client visibility can extract code and bypass local checks. It cannot guarantee 2.5x speed for arbitrary inputs. The benchmark is a limited sample, not a performance proof. Breaking API contracts through obfuscation is a correctness failure; ambiguous cases intentionally remain unchanged.

For SCO, the server can retain secrets that are never sent to the client. A programmatic `createScoHandler` accepts `remoteMethods`, `authorizeRpc`, and `maxRpcBytes` to keep sensitive computation on a trusted server via authenticated JSON POST `/obfs/rpc`. `createScoRpcClientSource` generates a same-origin browser ESM facade for named RPC methods, keeping their implementations server-side; see `docs/SCO_AUTHORIZATION.md` for usage and limits. Optional `createScoBatchMethod` groups explicitly named operations into one bounded authenticated RPC request, executing them sequentially to reduce transport overhead. See `im-results/sco-rpc-cost-2026-11-15.md` for measured budget tradeoffs and remaining failures. This API does not automatically rewrite ordinary JS into remote calls. Browser-delivered JS remains extractable. The `Host` header may be forged by HTTP clients; enforce real authorization on the server for privileged operations.

## Repository organization

`src/` is the implementation; `test/` contains behavior/integrity/regression suites and a benchmark; `im-results/` contains intermediate empirical results and limitations, including the [mode-by-mode threat and performance scorecard](im-results/mode-threat-scorecard-2026-11-15.md); `results/` is reserved for reproducible established research conclusions; `agents/` is persistent research coordination state. Read `docs/SECURITY.md` before deployment.

## Shared repository rule

This repository is a workplace for agents. The creator's single explicit CI constraint is preserved: **do not create workflows that run per commit**, because they would consume the shared CI budget.

