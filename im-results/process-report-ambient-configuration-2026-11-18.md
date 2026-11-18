# External Node diagnostic-report configuration exposes rewrite-sensitive source coordinates

**18 November 2026, Agent 8. Classification: intermediate compatibility/threat-model evidence.** This result establishes an ambient host-observer boundary for SNO/source rewriting. It does not establish a compiler miscompilation, confidentiality, tamper resistance, runtime-extraction resistance, or a strong-protection release result.

## Claim

Node can be started with an externally supplied uncaught-exception diagnostic-report flag. Under that runtime configuration, an otherwise identical one-line CommonJS program produces a diagnostic report whose JavaScript frame contains the executed file's line and column. A length-changing source rewrite changes that reported column even when the supplied program never references `process.report`.

This is materially different from source-visible calls such as `process.report.getReport()` or source-visible assignments to `process.report.reportOnUncaughtException`. A finite AST proof can detect those program constructs. It cannot infer arbitrary CLI or `NODE_OPTIONS` values supplied later by the deployment environment.

## Reproducer

`sims/process-report-cli-source-observer.js` writes a fixed one-line CommonJS source atomically, executes it in a fresh Node child with:

```text
--report-uncaught-exception
--report-filename=report.json
--report-directory=<fresh temporary directory>
```

The source creates and reads a deliberately long private-looking field, then throws `Error('73')`. A second variant manually replaces that long field spelling with `x` and performs the same execution. The oracle parses only the normalized `entry.cjs:<line>:<column>` coordinates from `javascriptStack.stack`, so differing temporary-directory paths cannot create a false mismatch.

`test/process-report-cli-source-observer.test.js` requires both child executions to exit through the same uncaught exception, requires both report messages to remain `Error: 73`, requires both frames to stay on line 1, and requires the normalized columns to differ.

## Validation

Exact branch source **`96629f4a7fde8128faf51843e6d73e30baf07a2e`** passed full manual validation **44400198008** on **Ubuntu and Windows**. The run included the repository's ordinary Node corpus and strict type/JSDoc validation in addition to this new cross-platform witness.

Two earlier attempts were intentionally rejected rather than promoted:

- **44397497047** tried to make the current compiler rename the long property, but the compiler performed zero property rewrites, so the attempted compiler differential was vacuous.
- **44398465151** tried identifier rewriting, but again observed zero compiler rewrites. Its first oracle also compared whole stack-frame strings from different temporary directories, which could differ while line/column coordinates remained identical. That oracle was invalid and was replaced.

The established claim therefore concerns **ambient coordinate observability of length-changing source rewrites**, demonstrated with an explicit manual rewrite. It does not claim that the current compiler currently emits the unsafe rewrite for this specimen.

## Proof boundary and architectural implication

This belongs in the external-host/instrumentation lane of the repository's proof envelope. Source-visible mutable-runtime behavior should continue to be treated as compiler semantic correctness. Externally supplied runtime flags, preloaders, debugger tooling, and similar deployment controls are environmental assumptions or attacker capabilities.

For SNO deployment contracts, source-coordinate parity cannot be promised across arbitrary unmodeled Node startup flags while simultaneously performing length-changing source transformations. A deployment that requires parity for such diagnostics must either constrain the runtime configuration, explicitly model the relevant ambient observer, or accept that diagnostic metadata changes with the transformed source.

The result does not change the repository's blocked strong-protection decision. It also does not justify globally refusing source transforms: that would erase useful obfuscation yield to preserve an external diagnostic channel that may be outside the declared deployment contract.
