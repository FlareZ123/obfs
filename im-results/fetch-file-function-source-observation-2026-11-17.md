# Fetch/Blob Web IDL function-source observation gap (17 November 2026)

## Scope and finding

**Classification:** intermediate, native Node 22 computational counterexample plus compiler safeguard under exact-commit validation. This is semantic-compatibility hardening, not an obfuscation-strength result.

A source rewrite can change the exact string observed from native Web Fetch/Blob APIs even when application source never invokes `Function.prototype.toString`. Direct experiments on Node **22.16.0** evaluated the same source-level function with `secretField` and with an otherwise equivalent renamed `x` key. Three independent native observations changed:

- `new Request(inspect)` emitted a `TypeError.message` including the complete function-source text.
- `new Response(inspect).text()` returned the function-source text as a response body.
- `new File([inspect], "a.txt").text()` returned the function-source text as a file body.

Further direct native probes confirmed source text in `Response` `statusText` and `headers`, `Request` `method` and `headers`, `File` filename, and `Response.redirect(inspect)` URL-parse error. Ordinary Web IDL string conversion therefore extends the function-source-observer boundary beyond existing string/URI, Intl, structured clone, URL, Headers, Blob and FormData handling in `src/ast.js`.

The method signatures and browser support are documented by the [WHATWG Fetch Standard](https://fetch.spec.whatwg.org/) and [MDN Request](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request), [Response](https://developer.mozilla.org/en-US/docs/Web/API/Response/Response), and [File](https://developer.mozilla.org/en-US/docs/Web/API/File/File) constructor references. Native behavior above was observed on one concrete Node version; this report does not claim universal browser error wording.

## Implementation and reproducibility

`src/ast.js::observesFunctionSource` now conservatively recognizes `Request`, `Response`, and `File` constructor calls whose arguments can coerce function-bearing values through scalar, record, or array/sequence inputs. Ordinary direct/global-member, simple variable-assignment, and `globalThis` destructuring aliases are tracked through the existing finite fixed-point framework. `Response.redirect` is also recognized through direct, constructor-alias, detached method, destructured method, `.call`, `.apply`, `.bind`, and `Reflect.apply` paths.

The test `test/fetch-constructor-function-source.test.js` supplies **18 source-observing cases** and **8 primitive-only positive controls**. For each source-observing fixture it compares actual native versus emitted Node behavior across COO, SNO, SCO and requires the compiler to decline property, identifier and string-source rewrites. The positive controls require an unrelated local `secretField` property to continue being renamed with identical observable results, distinguishing conservative safety from blanket refusal. Tests use actual native constructors and return resolved `Promise` values from a `node:vm` context.

Commits: `42651e4` (test introduction), `c27d462` (Web constructors), `1d6353f` (direct redirect), `5dae615` (direct redirect tests), `0802716` (redirect alias proof), `9e8d12a` (redirect alias tests).

**Exact tested compiler head:** `9e8d12a92de06f0e41080c55a9d3c490e6de5d12`.

**Manual full validation:** [Node 22 Linux/Windows workflow 44057779910](https://github.com/FlareZ123/obfs/actions/runs/44057779910) was queued when this report was created. An older, superseded `c27d462` full run was cancelled before start to avoid waste. A full-success claim requires checking this exact SHA's workflow conclusion, diagnostics, and tested property-yield metrics. 

## Boundaries and implications

- The current scanner is finite and syntactic. Opaque imported functions, dynamically computed constructors/method names, host callback reassignment, runtime monkey patching, and arbitrary asynchronous consumers still prevent any universal behavioral equivalence proof.
- The fix adds compiler-side static checks and no generated runtime operations. Any affected graph previously eligible for property/string rewriting can now be refused, reducing transformation yield. Correctness and protected-work yield must be scored separately.
- No source confidentiality or hostile-runtime integrity follows. A fully controlling COO/SNO attacker can observe the emitted program. The established decision remains that no general strong-obfuscation or 2.5× ceiling guarantee has been demonstrated. 
