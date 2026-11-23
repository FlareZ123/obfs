# Selected SCO URL constructor failure text changes across Node and Chromium

**Agent 8, 23 November 2026.** Status: independently source-pinned, real browser/RPC red and narrow fixed-literal green. **Intermediate semantic compatibility result only**. It does not establish generalized JavaScript cross-runtime equivalence, stronger attacker resistance or any 2.5× budget.

## Existing compiler boundary and discovered counterexample

The current `src/sco-selective-partition.js::usesUnprovedRelocatedUrlStatic` checked that a `new URL(...)` object was used only through immediate scalar getters and selected simple methods. It permitted **arbitrary constructor inputs** when the resulting instance access was syntactically allowed. That proof neglected that `URL` itself can throw. A malformed input throws a `TypeError` with host-specific `message`, which user code can catch and return as an ordinary JSON-visible string.

Both [MDN URL constructor reference](https://developer.mozilla.org/en-US/docs/Web/API/URL/URL) and [Node WHATWG URL documentation](https://nodejs.org/api/url.html) identify `TypeError` on invalid inputs. They do not establish equivalent native error message text.

At source `6385016c39ca2d9d889fb604c613e8405b476627`, [GitHub Actions red-first 45248837659](https://github.com/FlareZ123/obfs/actions/runs/45248837659) executed the same private source in original Chromium **157.0.8103.78** and in the emitted **selected-SCO** facade through a real same-origin, cookie-authorized Node.js **22.23.4** HTTP RPC handler:

| Selected private operation | Native Chromium original | Emitted client facade executing on Node |
| --- | --- | --- |
| `try{return new URL(':').hostname}catch(e){return e.name+':'+e.message}` | `TypeError:Failed to construct 'URL': Invalid URL` | `TypeError:Invalid URL` |
| `new URL('https://example.org/a?b=1').hostname` | `example.org` | `example.org` |
| `Math.imul(13,23)` | `299` | `299` |

The invalid-URL test **failed** on Ubuntu as intended with a precise original/emitted semantic mismatch. The benign fixed ASCII URL and arithmetic both passed and, independently, the same run verified unauthorized RPC requests received HTTP403. The Windows browser tests were skipped by the focused-test configuration; its static/JSDoc stages succeeded.

## Focused conservative admission repair

A narrow proof gate now checks every direct `new URL(...)` expression on the selected private path. It admits only **one statically known ASCII HTTP(S) absolute literal** satisfying a deliberately restricted authority and unescaped path/query grammar. Inputs with unknown values, relative/base resolution, unusual schemes, ambiguous IDNA text, malformed authority or first-class constructor escapes are refused. This reduces accidental host exception-message drift while preserving the common fixed-valid case confirmed above. The existing instance-escape/scalar-access restrictions remain in force. A simple source literal does not establish full future-engine equality; the matcher is explicitly a bounded admission hypothesis.

In the added `test/sco-url-constructor-failure-browser.test.js`, the new negative tests include malformed absolute input, unproved function parameter and relative URL with an explicit base. The positive controls include a direct fixed URL hostname, a local fixed-URL instance's pathname, unmodified retained browser-public code and actual selected `Math.imul`. Compiled clients are served through the existing authenticated Node handler; the valid URL and arithmetic run in real Chromium with the native and server outputs checked.

Exact patched compiler/test source `f58a1f296222558da9c82636a11ff312970e56e6` completed [focused run 45249503831](https://github.com/FlareZ123/obfs/actions/runs/45249503831) **SUCCESS Ubuntu and Windows**, including strict project, external and paired-budget JSDoc stages. Ubuntu executed all four selected tests, **four passes, zero failures**. The emitted authenticated fixed literal URL still returned `example.org` with native=Node=facade equality; the unsafe literal was refused pre-relocation. Windows static tests passed, browser-only tests were skipped by design. The full project suite was not run under the focused job.

## Limits and next actions

- This report establishes one **real cross-host failure-path incompatibility** with corresponding source-pinned prevention and a useful positive protected-work sample. The test does not claim that every string matching the admitted grammar is semantically identical across every future URL parser version, or that the user host's `URL` global and prototype are untampered.
- This is an admission-safety improvement. It is independent of SCO's authenticated-oracle relay weakness, full runtime instrumentation, static reconstruction, and the obfuscator's universal runtime budget.
- Other host APIs with native exceptions may require similar analysis. Changes should be driven by reproducible original-vs-emitted browser and authenticated HTTP evidence, including legitimate nonzero protected-work positives. Avoid speculative enlargement of unsupported APIs.
- **Overall strong-obfuscation release remains RELEASE-BLOCKED.** A current-main integration decision requires source-locked testing and truthful recording of the full-suite baseline failures.

## Follow-up: transitive private ESM graph admission (same host boundary)

A selected-SCO module can call an imported **private ESM leaf**. The original URL checker was invoked for a selected export and its selected helpers; it was missing at the static private-import admission stage. This allowed a second access path to the exact host-sensitive URL constructor even after the direct export guard shipped. This is an admission-scope issue, distinct from a new error-message experiment.

At test-only branch source `1a74653cfb7d81707944c776b02a29d9393f8a36`, [focused RED 45250908487](https://github.com/FlareZ123/obfs/actions/runs/45250908487) on both OS showed that `partitionScoSelectedGraph` **accepted** the imported `private/leaf.mjs` containing `try{return new URL(':').hostname;}catch(e){return e.name+':'+e.message;}` where the test expected URL-host admission refusal. The two independent positive leaf controls, `new URL('https://example.org/a?b=1').hostname` and `Math.imul(13,23)`, already compiled successfully. The existing cross-host Base64 private-dependency guard already refused ambient `atob('%')` in the same graph fixture.

The minimal repair invokes the same `usesUnprovedRelocatedUrlStatic(ast)` predicate on the **entire imported private ESM source** inside the static dependency admission block. It refuses unknown, invalid, relative/base URL paths before packaging into the Node private graph; fixed valid URL leaf and ordinary arithmetic remain eligible. Exact patched compiler/test source `636a364080eecf801719d9fdb180d74c0f8804af` passed [focused GREEN 45251097147](https://github.com/FlareZ123/obfs/actions/runs/45251097147) **both Ubuntu and Windows**, including strict JSDoc: **3/3 static graph tests per OS**. These tests assert compiler graph admission and source-level positive selections; they do **not** execute the emitted multi-module graph in Chromium. Browser-versus-Node native URL error divergence and actual selected facade behavior were demonstrated separately in [red-first 45248837659](https://github.com/FlareZ123/obfs/actions/runs/45248837659) above. No complete-suite acceptance is implied.

## Independent admitted-literal positive corpus (23 November 2026)

A follow-on deterministic test addresses the evidence-quality risk that a narrow fail-closed `new URL` grammar could protect only a token positive example. `test/sco-fixed-url-host-corpus-browser.test.js` constructs **240 distinct valid ASCII absolute HTTP(S) literal strings** from two schemes, six hostnames and twenty plain path/query shapes. These include a hyphenated label, `xn--` ASCII punycode spelling, repeated slash and `/../` normalization, and repeated query keys. Every string is compiled as an actual selected-private `new URL(<literal>).hostname` operation under the current admission rule, with a retained public export. This fixture verifies **240 / 240 successfully selected private exports** rather than a mere regex-membership claim.

The same 240 native URL inputs are run in Node **22.23.4** and real Chromium **157.0.8103.78**, comparing eight observable fields per URL: `href`, `host`, `hostname`, `origin`, `pathname`, `search`, `hash` and `protocol`. Their complete JSON array SHA-256 digests both equal `f85632b58966a9266f62df91018b8bfb4d83f97988a797eb0ff6fbb81682cfac`, with **zero differences** in the entire declared 240-input corpus. The distinct source-corpus digest is `341e99912dfee4f59dd98f4087a9706111aaa594d416643a856c7a75b041df8a`. Direct selected-SCO admission checks were completed in **128.95ms** within the sampled CI process; this is a fixture diagnostic and not a 2.5× workload benchmark.

Exact test-only source `51d760dbe66cfb45fba03f148f83e788539efb1c`, [focused run 45252944794](https://github.com/FlareZ123/obfs/actions/runs/45252944794), completed **SUCCESS Ubuntu and Windows** with project/external/paired-budget strict JSDoc. Ubuntu ran both corpus/compiler and real-browser native-parity tests (2 passed, 0 failed); Windows ran the static compiler case and explicitly skipped the Chrome-only native comparison.

**Scope:** this is additional **positive** evidence for the restricted syntax, supporting useful host-consistent URL behavior for those sampled literals. It is neither an exhaustive proof about every matching URL nor a browser execution of **240 generated authenticated RPC facades**. The existing single live emitted URL-facade positive and actual invalid-URL error red/green remain separately source-pinned above. The repository's overall release stays **RELEASE-BLOCKED**.
