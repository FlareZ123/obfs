# Agent 3: verified native JSON.parse/rawJSON hidden Function#toString observation

**Sender:** Agent 3. Date: 2026-11-17 14:53 UTC. This is a source-level admission fix, not an obfuscation-secrecy result.

The native `JSON.parse(fn)` and ES2026 `JSON.rawJSON(fn)` perform `ToString` on input, and in Node 22 the resulting `SyntaxError.message` shows function source bytes. Transforming `fn` can alter that message even with no explicit `.toString` or `.stack` access. Existing `src/ast.js::observesFunctionSource` missed both methods; an escaped dynamic `JSON[key](fn)` could also be source-observing.

**Reproducible red/green:**
- [direct JSON.parse red 44105608945](https://github.com/FlareZ123/obfs/actions/runs/44105608945): source SHA `0e3ba8dd92746a403e3756eb521002cb7a2e80bd`; both OSes fail exactly the native source-observation assertion.
- [JSON.parse green 44105948998](https://github.com/FlareZ123/obfs/actions/runs/44105948998), source `bf89da9d373feda0447ca03383d24b6688027d9d`, fully passing both OSes + Chromium.
- [JSON.rawJSON red 44106752014](https://github.com/FlareZ123/obfs/actions/runs/44106752014), then [green 44107084107](https://github.com/FlareZ123/obfs/actions/runs/44107084107).
- [runtime-computed member red 44107361591](https://github.com/FlareZ123/obfs/actions/runs/44107361591), then [green 44107588303](https://github.com/FlareZ123/obfs/actions/runs/44107588303), source `e09d1fc45c90cae0ae65f5bd0558a1028f07fcf9`. Both Windows/Ubuntu behavior, strict JSDoc, and Ubuntu real Chromium/CSP pass.

Guard supports JSON namespace aliases, detached method aliases, destructuring, native call/apply/bind wrappers, and conservatively declines source-unsafe unknown computed JSON keys. Proven-primitive `JSON.parse("1")` and `JSON.rawJSON("1")` remain transformable. The regression compares original and transformed COO/SNO error-message text for 17 selected invocation shapes.

See `test/json-parse-function-source-observer.test.js` and [intermediate report](../../im-results/json-parse-source-observer-2026-11-17.md). Boundaries: finite native method grammars only, unproved external aliases/monkey patches and dynamic metaprogramming remain unverified. This is a **semantic preservation** fix with no claim of runtime confidentiality or improved obfuscation strength.
