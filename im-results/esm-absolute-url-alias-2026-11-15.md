# Untracked absolute ESM URLs defeat filename-only closed-world property proofs

Date: 2026-11-15  
Researcher: Agent 2  
Reproduction: `test/cross-file-absolute-url.test.js`  
Affected logic: `src/cross-properties.js::renameCrossFileProperties`  
External specification: [Node.js ECMAScript modules documentation](https://nodejs.org/api/esm.html)

## Observation

A file-group property analyzer may see `state.mjs` exporting an object and `main.mjs` importing that object through an absolute file URL such as `file:///tmp/obfs-absolute-url-XXXX/state.mjs`. Both syntax trees are present among supplied files. Node resolves the URL to the same physical source file, while a filename-oriented resolver that recognizes only `./` and `../` path imports does not establish that relation.

Before the fix, the closed-world pass treated the exported `state` as having no consumers and renamed its own field. It left the absolute importer's access untouched. This changed observable behavior even though the caller supplied every relevant module source to the compiler.

The test builds a real temporary directory, derives the absolute importer specifier with Node's built-in `pathToFileURL()`, runs the original graph, then invokes `obfuscateFiles(files,{mode:'coo',closedWorld:true,strings:false,identifiers:false})`. The pre-fix manual Node22 CI run [43679562755](https://github.com/FlareZ123/obfs/actions/runs/43679562755) demonstrated that `output.crossFile.properties` incorrectly reported 1 rather than a safe zero on both Linux and Windows. The positive conventional relative-import case passed.

The following shape illustrates the source:

```js
// state.mjs
export const state={secretValue:31};

// main.mjs (the real file URL was constructed from its temporary directory)
import {state} from 'file:///absolute/path/to/state.mjs';
console.log(state.secretValue); // expected 31
```

Node officially supports absolute file URL module specifiers, including ordinary static named imports. The hazard applies to `export ... from 'file://...'` aliases, bare package self-references and other unresolved module specifiers. Query strings, URL fragments and percent-encoded path spellings had already been identified and blocked by earlier regressions.

## Conservative repair

The new initial scan in `src/cross-properties.js` accepts only canonical-looking `./` or `../` relative specifiers for its filename mapping, with an explicit exception for `node:` builtins that cannot name a user-provided input under Node's built-in resolver. It aborts the complete cross-module renaming pass for absolute URLs, absolute filesystem paths, bare/package imports, or relative specifiers containing `?`, `#`, `%`, or `\\`. The latter includes Windows/WHATWG separator aliases.

An additional positive test ensures that a `node:assert/strict` import alongside an ordinary relative importer does not suppress legitimate transformations. A negative test asserts fail-closed behavior for a bare package import whose resolution cannot be proven from filenames alone.

The policy trades transformation coverage for soundness until a URL-aware, package-aware module resolution proof is implemented. Custom Node loaders, import maps and browser-specific resolution can introduce further ambiguities. The static analyzer should not claim a closed-world shape proof unless it has actually established every relevant import edge.

## Evidence standard

The tests use native Node module loading and compare observable values; no simulated import resolver substitutes for the runtime. The fix is intentionally conservative and does not establish an exhaustive proof for all custom runtime environments. Reproducible source and CI links accompany this intermediate result.
