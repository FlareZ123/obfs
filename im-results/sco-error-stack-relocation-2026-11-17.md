# Selective SCO error-stack execution-origin mismatch (17 November 2026)

**Status:** intermediate engineering semantic counterexample, with **confirmed cross-platform pre-fix red**. The post-fix green gate was pending at the next checkpoint. Keep the red and green exact source SHAs distinct.

## Why the same source can return different JSON-visible text

Selective SCO relocates an async private export into a server module while a retained caller continues in the original client realm. The nonstandard native [Error.stack](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/stack) string contains function call-site and filename metadata. [Node.js Error stack documentation](https://nodejs.org/api/errors.html#errorstack) likewise describes frame filenames, line and column coordinates. These are host/execution-origin observations independent of whether the source's business logic is otherwise deterministic.

Local executable Node22 native \`node:vm\` comparisons used **identical JavaScript expression source** with two artificial execution filenames: \`browser-client.mjs\` versus \`server-private.mjs\`. The produced strings differed, and each included its respective execution filename. The eleven witnessed private function forms were:

- Direct \`new Error('tag').stack\` and \`Error('tag')['stack']\`
- Local Error instance \`err.stack\` and one-hop \`alias.stack\`
- A \`TypeError\` constructor alias \`const Native=TypeError\`
- Destructured \`globalThis.Error\` constructor
- Destructured instance \`const {stack:trace}=new Error('tag')\`
- Direct \`Error.captureStackTrace(record)\` and extracted capture function
- Constant-key computed access \`err[key]\` with \`key='stack'\`
- A caught local \`throw new Error('tag')\` followed by \`err.stack\`

The native loop is preserved in \`test/sco-error-stack-realm.test.js\`, alongside source partition refusal assertions. This establishes **a finite host/filename observable counterexample**, not general observational-equivalence results.

## Compiler scope

The original \`src/sco-selective-partition.js::realmStateObservation\` protected intrinsic static writes, selected source observations, timezone, entropy and host clocks. It did not explicitly classify instance \`Error.stack\` or \`Error.captureStackTrace\` as relocation-sensitive. That omission allowed ordinary constructed-error stack observations to reach the partitioner's source-admission path, despite the changed execution origin.

At source commit [\`09bbd252\`](https://github.com/FlareZ123/obfs/commit/09bbd252b871a8a5126bcc2f939c881585f92205), the analysis now:
1. Recognizes the standard built-in Error constructor family through direct and simple global/lexical aliases.
2. Uses a fixed-point set for Error instances created via native construction/call and one-hop aliases.
3. Rejects native instance \`.stack\` and destructuring, unresolved computed keys on known Error origins, catch-bound \`.stack\`, and static \`captureStackTrace\`/stack metadata APIs.
4. Retains safe positive controls for \`new Error('tag').message\`, Error \`name\`, and an unrelated local \`{stack:'safe'}\` field. A supplied JSON object with an inert \`stack\` key alone does not identify a native Error.

JSDoc cleanup followed in [\`bdafb11d\`](https://github.com/FlareZ123/obfs/commit/bdafb11db5d6937560556f4acb00f2476952f625). The source-only red test was introduced in [\`a66d175b\`](https://github.com/FlareZ123/obfs/commit/a66d175b4e583cc7d983d7cb88c8f7cc4e7e7e8d) and appended to the manual SCO workflow in [\`5adbb70a\`](https://github.com/FlareZ123/obfs/commit/5adbb70a692f8198e3e5b82996339cae9033abb6); additional native positive/negative cases were added after that baseline.

**Pinned workflows to inspect:**
- [Pre-fix run 44069192061](https://github.com/FlareZ123/obfs/actions/runs/44069192061) at \`6323ee014c5fa2d37c59801e08540fae55b9a908\`, before the source fix. Initially queued.
- [Post-fix run 44071122893](https://github.com/FlareZ123/obfs/actions/runs/44071122893) at \`e285797d1ae9cb8493047aa72f28d3b6fea32ae6\`, includes source guard, 11-form test loop, and focused typing fix for an unrelated Unicode-path JSDoc issue. Initially queued.

The separate earlier extracted-\`Intl\` admission proof and exact red CI live in \`im-results/sco-intrinsic-extraction-host-2026-11-17.md\`.

## Known limits

The static origin graph models direct native constructors, one-hop instance aliases, simple catches and direct stack accesses. It does not establish sound provenance across arbitrary functions, reflective readers, dynamic import graphs, proxies, containers, getters or nested error factories. Converting a source to a server-private RPC facade also has known JSON serialization and exception-shape limits independent of this scanner. Native Error stacks are nonstandard and may differ across JS engines; the reported differential uses a deterministic Node22 fixture.

This source-admission refinement has no generated client runtime instructions, but it is **not** a measured transformation-efficiency/security improvement. It does not prove the 2.5× runtime bound, original source confidentiality against authorized relays, tamper resistance under attacker-owned runtimes, or general strong obfuscation.

Next: confirm red-to-green Windows and Ubuntu on exact pinned SHAs; measure coverage loss using safe positive controls; integrate stack provenance across interprocedural calls only when there is a reproducible uncovered witness and a precise enough analysis to avoid globally refusing every property named \`stack\`.
