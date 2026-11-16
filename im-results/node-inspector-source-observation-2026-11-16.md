# Native Node inspector observes distributed source without filesystem APIs

**Agent 8, 2026-11-16.** Intermediate semantic-compatibility evidence only. Exact source-byte introspection is a JavaScript application behavior that can invalidate otherwise private property renaming.

## Mechanism and reproducible counterexample

Node.js 22 exposes `node:inspector` and `node:inspector/promises`. A connected `inspector.Session` receives `Debugger.scriptParsed` notifications and can call `Debugger.getScriptSource` for a loaded CommonJS or ES module. This returns the complete runtime-compiled script source without importing `fs`, calling `require.cache`, or fetching the source over a network. The procedure is documented in the [Node.js inspector API](https://nodejs.org/download/release/latest-jod/docs/api/inspector.html), and the local Node 22 probe independently confirmed actual source retrieval.

The full executable differential witness in `test/inspector-source-observation.test.js` compiles a CommonJS source containing a private object `{secretField:7}`. It starts an inspector session in the actual Node child process, identifies its own `entry.cjs` scriptId, requests the script source, and checks whether that script contains the original property spelling. The search needle is built from separate pieces `['secret','Field',':7'].join('')` so a standalone literal search string cannot give a false match after the obfuscator rewrites the key.

The original process emits `{"value":7,"matchesSource":true}`. At pre-fix source SHA `580030eb5b38228726dcdd6e9e9af6daf7c6bc72`, the compiler emits a renamed field `"_p9bc499cb78":7`, and the generated process emits `{"value":7,"matchesSource":false}`. This is a direct failure of one-to-one observable behavior despite preserving the numeric field value. The [Linux/Windows red CI gates 43915337589](https://github.com/FlareZ123/obfs/actions/runs/43915337589) and [43915342784](https://github.com/FlareZ123/obfs/actions/runs/43915342784) exercised the corrected self-match-safe oracle. Earlier [gate 43914519086](https://github.com/FlareZ123/obfs/actions/runs/43914519086) included an invalid oracle whose literal needle also appeared in the inspected code; it must not be cited as behavioral-difference evidence.

## Conservative repair and validation

Source change `src/ast.js::observesDistributedSource` at commit `01de806ef6d9099e631d60accfd2a7f6feb5702d` adds `inspector`, `node:inspector`, and `node:inspector/promises` to recognized source-observation module specifiers. This uses the existing group-wide opt-out and requires no new runtime hooks or anti-debug behavior. Recognizing these module imports conservatively declines unrelated property transformations in the same declared source group, since a local source inspection can reveal the distributed program's bytes.

The test explicitly distinguishes a source-observing negative control from an ordinary `node:crypto` user with a private scalar owner that still undergoes an actual renamed property. The static cases cover bare and `node:` CommonJS inspector require, ESM named and promises imports, and ESM dynamic import.

The complete first repaired matrix at SHA `a8dd4b1e24abe93ccbfa5b5e832dabe18994b8ee` passed the full [Linux/Windows Node 22, JSDoc, sampled benchmarks and Ubuntu Chromium gate 43915744093](https://github.com/FlareZ123/obfs/actions/runs/43915744093). Further real ESM `inspector/promises` single-file and two-file exported-owner source readers, with a positive non-inspector closed-graph counterpart, are committed in `test/inspector-source-observation.test.js`. The later [full gate 43916609630](https://github.com/FlareZ123/obfs/actions/runs/43916609630) evaluates this expanded real-ESM envelope.

## Boundaries

This is a demonstrated compiler semantic compatibility repair. The mere presence of an inspector import is not proof that the application uses it to inspect source, so the guard trades optimization coverage for safety. Aliased or custom inspector mechanisms and out-of-process DevTools are not exhaustively modeled. The external attacker's direct ability to inspect a fully controlled runtime is unaffected; the guard does not block inspection, strengthen tamper resistance, or establish source confidentiality. Passing a bounded regression suite does not prove universal semantic equivalence or an all-program 2.5× slowdown ceiling.
