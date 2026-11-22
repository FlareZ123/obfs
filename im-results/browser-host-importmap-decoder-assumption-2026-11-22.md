# Browser host import map invalidates a filename-only decoder provenance assumption

**Agent 27, 22 November 2026. Classification: empirically reproduced host-contract counterexample and proof-boundary clarification. It does not demonstrate a compromise of the obfuscator-controlled SCO server.**

## Attack condition

The COO compiler receives a **complete declared three-module graph**:

- `entry.mjs` statically imports `./side.mjs` and `./target.mjs`, and stores the target export in `globalThis.answer`.
- `side.mjs` is inert and is included in the compiler's input graph.
- `target.mjs` exports the exact literal `protected-literal-value`.

The compiler sees the entire literal relative import graph and, under the post-[PR #277](https://github.com/FlareZ123/obfs/pull/277) `hasUnprovedModuleImport` check, permits **one real encoded target literal**. That path check assumes the host resolves each literal relative module specifier to the filename in the source graph.

A separate, uncompiled, host-controlled HTML page publishes a standard `<script type="importmap">` whose `imports` entry remaps `./side.mjs` to a `data:text/javascript,` module executing `String.fromCharCode=()=>'?'`. The browser import-map resolver applies this mapping **before** loading `entry.mjs`; the substituted side module patches the realm's String constructor before the emitted target's eager decoder initializes.

This remains a **valid host configuration** with valid JS and a completely ordinary standard ESM import. It demonstrates that knowing a relative specifier and possessing the matching distributed file does not prove that file will execute in the actual browser. Import maps are part of module-specifier resolution; see the [HTML import-map standard](https://html.spec.whatwg.org/multipage/webappapis.html#import-maps) and [MDN importmap reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type/importmap).

## Reproducible real Chromium result

The executable [`sims/importmap-host-intrinsic-counterexample-browser.js`](../sims/importmap-host-intrinsic-counterexample-browser.js) serves **the same four variants** from localhost using an actual headless Chromium process, with no simulated browser, VM evaluation, or manual host-variable injection:

| Browser HTML host | Original supplied graph | Emitted COO graph |
|---|---|---|
| No import map | `protected-literal-value` | `protected-literal-value` |
| Host import map remapping a known dependency to the mutator | `protected-literal-value` | `???????????????????????` |

The script asserts positive encoding (`metrics.literals=1`), normal-host native/emitted parity, unchanged original output under the map, and an exact native/emitted mismatch when the map applies. The machine-readable output is:

```json
{"browser":"Chromium","unmappedParity":true,"nativeWithMap":"protected-literal-value","emittedWithMap":"???????????????????????","encodedLiterals":1}
```

The temporary research branch `agent27/importmap-hidden-mutator-20261122` at source `887af264c292e7564cf54c5445b25ac7f22856fb` inserted this probe into the **existing** manual browser workflow. Its [pinned CI run 45016334134](https://github.com/FlareZ123/obfs/actions/runs/45016334134) passed the probe and all remaining browser checks; the probe printed exactly the record above. The reusable harness was separately copied unchanged into `main` at commit `06175fdf12a4c889c1929c056a242df5b3e59275`, without adding a permanent CI job.

## Same-origin remapping under a restrictive CSP

The first witness uses an inline `data:` module. A second independent [same-origin CSP script](../sims/importmap-host-csp-same-origin-counterexample-browser.js), copied unchanged into `main` at `6ef57f1b9d0c3433163fd20ca28d59d0ded55392`, removes that potential deployment objection. It uses an HTML response with:

```http
Content-Security-Policy: script-src 'self' 'nonce-fixture-nonce'; object-src 'none'; base-uri 'none'
```

The import map and inline bootstrap each have the matching CSP nonce. Instead of a `data:` module, the map redirects `./side.mjs` to a **same-origin** `./host-mutator.mjs` endpoint outside the compiler's supplied file group. The host module patches `String.fromCharCode` before the emitted target decoder runs. Because the substituted resource is same-origin, `script-src 'self'` admits its load without a `data:` exception.

The second full [Chromium workflow 45017367781](https://github.com/FlareZ123/obfs/actions/runs/45017367781) passed at research source `87850e48e2623c38c959bff62cdbc7e0eed00427`, including both host-import-map negative probes and the remaining repository browser checks. The CSP probe printed exactly:

```json
{"browser":"Chromium","csp":"script-src 'self' 'nonce-fixture-nonce'; object-src 'none'; base-uri 'none'","plainParity":true,"original":"protected-literal-value","remappedEmitted":"???????????????????????","protectedLiterals":1}
```

This confirms the same native/emitted mismatch under a same-origin-only script policy. The experiment shows a **host-resolver trust condition**; CSP still protects its stated origins and inline-script authorization according to the configured policy, and a nonce-bearing host page is allowed to choose its own import map. The test does not imply CSP is bypassed.

## Interpretation and adoption rule

This is an explicit **untrusted-host dependency-resolution counterexample**, outside the bounded compiler-supplied file graph that PR #277 checks. It does **not** contradict the CI evidence proving semantics when Node's ordinary module resolver or Chrome without a hidden import map loads the supplied group. It does invalidate a stronger statement that a statically known relative import ensures the same code is executed in *all* browser deployments.

A deployer wishing to rely on ambient decoder correctness must control or audit module resolution and input-group completeness, including the HTML import maps actually active before any module loads. More robust designs should either admit a complete, verifiable hosting manifest or conservatively decline decoder insertion where the host's resolution cannot be attested. Even a source-reviewed HTML file cannot prove a hostile client has not modified import maps at runtime, because the COO threat model gives the attacker full control over the browser. An absolute environment-locking claim is unavailable under that threat model.

The current HTML asset source-disclosure audit intentionally rejects nonempty inline scripts, including an import-map script supplied as an asset; that refusal does not govern **external host pages omitted from the compiler input**. Do not silently treat absence of import maps in the supplied source files as proof of absent host import maps.

No production decoder patch is proposed from this experiment: indiscriminately disabling all known relative imports would discard positive protection yield, and a partial import-map detector would still leave unrestricted host instrumentation. The appropriate immediate change is to state the conditional resolver trust boundary explicitly and retain this reproducer. The primary strong-protection release remains **BLOCKED**.
