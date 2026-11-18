# SCO ordinary RPC argument consistency, 18 November 2026

**Classification:** intermediate correctness and paired-cost evidence, without a new obfuscation-security or universal runtime guarantee.

## Red-to-green counterexample

The original `src/sco.js` supplied the **same mutable parsed `args`** to `authorizeOperation(request,method,args)` and subsequent private `task(...args)`. A trusted application authorizer approved `charge(1)` and then changed `args[0]=99`, so the private operation executed 99, returned 990, and bypassed its original argument-level decision. The real-HTTP test also covers nested object mutation.

The pre-fix test-only [commit 51b64ee3](https://github.com/FlareZ123/obfs/commit/51b64ee3b5516e8d70dd5f16eafdbb1da398c243) failed the new test on Ubuntu and Windows in [run 44248239618](https://github.com/FlareZ123/obfs/actions/runs/44248239618): actual 990 versus expected 10. The [fixed source c66f47bc](https://github.com/FlareZ123/obfs/commit/c66f47bcb61893374bb76ab7db510fee935ddf8b) gives the authorizer an independent native JSON reparse of the already bounded request and preserves the original `args` for execution. Recognized batches retain a further independent inner-policy view. No policy means no extra parse.

The [post-fix exact-source targeted run 44248393007](https://github.com/FlareZ123/obfs/actions/runs/44248393007) passed on Ubuntu and Windows with the new real-HTTP test, existing SCO authorization suite, and JSDoc checks. [PR #88](https://github.com/FlareZ123/obfs/pull/88) merged at [70fa5304](https://github.com/FlareZ123/obfs/commit/70fa5304059ca3b5c84a67cc76005f574c739d35). Integrations intentionally mutating policy argument inputs must now normalize inside a reviewed method or wrapper. This is a behavior change.

## Source-pinned cost sample

The reproducer [`sims/sco-policy-args-paired.js`](../sims/sco-policy-args-paired.js) and [manual workflow](../.github/workflows/manual-sco-policy-args-paired.yml) compare pre-fix `51b64ee3` versus repaired `c66f47bc` as separate Node 22 checkout directories. Both use a real authorized loopback HTTP handler with identical read-only `check({text})` method. Each byte size was tested in seven alternating-order 80/160-request pairs, with exact HTTP outputs verified. Nine alternating parser-only pairs compare one parse against two. [Run 44249518446](https://github.com/FlareZ123/obfs/actions/runs/44249518446) passed both OS jobs.

| JSON request bytes | Ubuntu HTTP fixed/old median | Windows HTTP fixed/old median | Ubuntu parser two/one median | Windows parser two/one median |
| ---: | ---: | ---: | ---: | ---: |
| 71 | 0.985× | 0.998× | 2.009× | 2.000× |
| 1,063 | 1.007× | 0.892× | 1.977× | 2.011× |
| 16,423 | 0.986× | 1.049× | 1.970× | 2.005× |
| 60,039 | 1.037× | 0.986× | 1.957× | 1.985× |

All **56 authenticated HTTP paired fixed/old ratios** and all **72 parser-only two/one paired ratios** were below 2.5× in this sample. Exact raw pairs are emitted in CI as `SCO_POLICY_ARGS_PAIRED` records. Parser-only extra cost was approximately 2×, while the selected localhost whole-HTTP profile was near 1×. These samples exclude TLS/WAN, externally backed policies, process-startup variability, concurrency, and arbitrary protected work, so they do not establish general compute admissibility.

## Bounded interpretation

A policy callback cannot redirect the private method's submitted JSON arguments by accidentally modifying its own view. This does not make a permissive callback secure, resolve state races, prevent authorized online relaying, or increase attacker reconstruction cost. The project's strong-protection release remains blocked.
