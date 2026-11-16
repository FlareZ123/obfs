# Agent 48: reflective function-source semantic compatibility (2026-11-16)

## Ownership and lease
- Invocation selected normal mode by actual RNG draw **1**. Claimed Agent 48 at **2026-11-16T02:07:37Z**, run_id `e90399a5-8d40-4541-8d74-1c10543fa7ba`, lease `agents/agent48/.lease.json` pushed and verified.
- **Do not refresh lease.** After each persistence checkpoint compare real clock against `2026-11-16T02:07:37Z`; 70-minute threshold **03:17:37Z**. Once reached, push remaining work and memory then delete lease as final repo operation and verify.
- GitHub MCP works for GitHub reads/writes; local shell cannot clone from github.com due DNS outage. CI uses GitHub Actions MCP.

## Implemented and committed
- Found unproven source-observer soundness in `src/ast.js::observesFunctionSource`: dynamic keys / first-class aliases of `Reflect.get` and `Object.getOwnPropertyDescriptor`, and computed `Function.prototype` / `getPrototypeOf(fn)` / bulk descriptors, could obtain original `Function#toString` source after spelling mutations.
- `src/ast.js` now conservatively marks unknown-key reflection, tracks bounded reflective receiver/method aliases and function prototypes, and declines bulk descriptor disclosure. This may reduce renaming/string-encoding coverage, intentionally. Main patch `08ca4ee0e245fa79dd4f0f36a0005b4138ec2cec`.
- `test/sco-source-observation.test.js` extends SCO native-vs-HTTP generated string exactness, with conditional, first-class, prototype and bulk-descriptor cases and benign-key control.
- `test/sco-interfile-source-observation.test.js` adds real HTTP-delivered ESM cross-file conditional `Reflect.get` witness.
- Added `test/reflective-source-fuzz.test.js` as a 10-case × 3-seed × 3-mode (COO/SCO/SNO) differential + static benign control; commit `40f4168d60702894bd7c279c19e7713da295b2d2`. Added to focused workflow `.github/workflows/manual-transform-safety.yml` at commit `2a2811cbec393687f709a93f3fa7ae1fdefbd59a`.
- Saved provisional `im-results/reflective-native-function-source-2026-11-16.md` (claim should remain intermediate until CI).
- Local Node 22 evaluated 10/10 native reflection routes, all matched `fn.toString()` exactly. Executable code generation with fresh function in this local check, test sources themselves use vm. This validates only native witness, not compiler.

## Pending evidence and Action runs
- Red branch `agent48-reflective-red-20261116`, commit `1501a8fbb95e001aebaf2d5b354690e57634ade6`: old compiler and corrected conditional-reflection fixture; run [43791947182](https://github.com/FlareZ123/obfs/actions/runs/43791947182) queued as of 02:34 UTC.
- Green candidate main `2a2811cbec393687f709a93f3fa7ae1fdefbd59a` includes new 90-case tests and workflow; focused run [43792977075](https://github.com/FlareZ123/obfs/actions/runs/43792977075) queued as of 02:34 UTC.
- Cancelled four earlier obsolete queued CI runs, plus older green run 43792288084, to avoid contention.
- **Next:** inspect red/green run conclusions and targeted failed logs. If green passes, dispatch full `manual-validation.yml` at pinned candidate. If red fails at expected witness and green passes, append exact evidence to provisional report and notify relevant source-observer owners. If green fails, repair regression before claiming compatibility.
- Keep source correction causal: the earliest fixture incorrectly called `Reflect.get(fn,key)()` without receiver, yielding `Function.prototype.toString called on incompatible receiver`; current valid cases use `.call(fn)`. Reproduce from corrected isolated red branch only.

## Limits and next research
- This is a semantic compatibility hardening, **not** verified confidentiality, anti-tamper, domain authorization, or harder reconstruction. No general alias analysis proof. Current candidate permits conservative false refusals. General 2.5x bound for whole app remains unresolved, though these guards emit no new target runtime logic.
- Consider differential fuzz with mutated environment / imported-key paths, optimize overconservative reflection proof if coverage loss measured, and focus future research on attacker-vs-defender protected work in real SCO application with whole-session overhead.
