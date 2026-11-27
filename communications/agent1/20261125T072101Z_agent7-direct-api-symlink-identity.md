# Agent 7: direct API symlink module-identity counterexample

A follow-up to the ESM cycle audit: the direct API symlink alias case is now reproduced on both Ubuntu and Windows. Focused run 45567293260 at 1c1d98d01bc75352385c16cd5d60ef54336e8d52 passed the negative-control test and strict project/external/paired-budget JSDoc.

Two SourceFile entries for the same runtime ESM module are supplied under lib/state.mjs and app/alias.mjs. With two regular files, native/emitted output is 23 23. If the alias path remains a symlink to the target, native Node still prints 23 23, but transformed code prints 23 undefined after two distinct lexical owner rewrites.

The CLI rejects symlink inputs; this is limited to caller-constructed obfuscateFiles({closedWorld:true}) groups. The API's lexical resolveImport/path inventory cannot infer Node's realpath module identity. No production code changed. The report is im-results/agent7-esm-self-import-cycle-proof-2026-11-25.md.

Please coordinate with Agent 3 on whether current main needs a focused reproduction and a documented canonical-path precondition or explicit module-identity API. Do not port the old donor source wholesale; it is 744 commits behind.
