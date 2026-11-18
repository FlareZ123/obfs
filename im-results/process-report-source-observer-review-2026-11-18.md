# Diagnostic-report source-observer adversarial review

**Date:** 18 November 2026. **Agent:** 8. **Classification:** intermediate semantic-compatibility result. This report reviews the process-report source-observer candidate on `agent1-source-observer-integration-20261118`. It does not establish incremental obfuscation security or alter the repository's RELEASE-BLOCKED strong-protection decision.

## Scope

Node diagnostic reports can expose JavaScript stack coordinates. A transform that shortens or otherwise relocates source can therefore change program-observable report data when the program can obtain a report through `process.report` or enable an automatic report.

Agent 1's candidate added a conservative source-observer proof for these capabilities. This review tried to falsify both sides of that proof:

- **false negatives**, where real Node report capability was obtained through an alias the detector missed;
- **false positives**, where an ordinary user binding happened to look like Node's `process` or where a report mutation could only disable automatic reporting.

All code changes below are confined to `src/ast.js`; regressions are confined to `test/process-report-source-observer.test.js`.

## First red pair

Review commit `bcf97ced371d5051333e46e2907cbe9e4e9dbc67` added:

1. real process extraction through `const {process:proc}=globalThis`, followed by `proc.report.getReport()`;
2. a function parameter named `process` whose runtime value was only an ordinary user object containing `report.filename`.

Manual validation **44396929327** reproduced the intended failures on Ubuntu and Windows: the first path was missed, while the second caused unnecessary source-preservation refusal.

The original Agent 1 branch also had independent full-suite blockers in **44391209068** on both operating systems:

- benign detached `Reflect.get(process,'env')` lost expected property-renaming yield;
- benign destructured `Reflect.get` process-env lookup lost expected yield;
- strict JSDoc reported a nullable report-mutator key at `src/ast.js`.

## First bounded green repair

Commit **`4f966416f36fcd9b6395bdca3b332e06d0cf215f`**:

- records binding-position identifiers so declaration nodes do not masquerade as escaped global capabilities;
- follows `globalThis.process` destructuring;
- follows direct `Reflect.get(globalThis,'process')`;
- restores only the already-proven benign static `env` reflection read;
- fixes the nullable trigger-key JSDoc path.

Full manual validation **44398171553** passed on Ubuntu and Windows, including strict JSDoc/type checks.

## Second red pair and green repair

A later adversarial pin added:

- detached `Reflect.get` acquisition:
  `const {get}=Reflect; const proc=get(globalThis,'process')`;
- a lexically shadowed function parameter named `process` passed as an ordinary value to a harmless local function.

Manual validation **44399188970** reproduced both failures on Ubuntu and Windows.

Commit **`3361f200f9ede40c08e957a1c75fe2b49e62f40e`** then added a dedicated `Reflect.get` provenance chain, direct and detached global-process acquisition, immutable computed global-process keys, and function-parameter process-shadow recognition. Full validation **44400416331** passed on both operating systems.

This pin remains a useful independently validated integration point if later computed-key changes are not desired.

## Computed and opaque capability keys

The review then widened to report namespace, method and trigger keys.

Positive cases include immutable computed keys such as:

- `process[key]` where immutable `key === 'report'`;
- `process.report[key]()` where immutable `key === 'getReport'`;
- immutable trigger names such as `reportOnUncaughtException`.

Opaque computed keys fail closed because an unresolved value can select the report namespace, a source-bearing report method, or an automatic-report trigger.

A deliberately benign control keeps `process.report[key]=''` analyzable when immutable `key === 'filename'`.

Two intermediate runs, **44400668912** and **44401198478**, caught a review-branch bug before promotion: a broad replacement had called the later `sourceStringKey` helper from earlier alias analysis, causing TDZ failures in the fuzz corpus, while the generic unknown-member guard still ignored proven computed keys. The final branch removes every pre-helper use and applies immutable-key reasoning only after the helper exists. These failed pins are preserved as rejected evidence, not green candidate sources.

## Automatic-report disabling precision

Node's automatic-report controls are booleans. Explicit literal-`false` assignments cannot enable an automatic report.

The final branch therefore retains transformation yield for bounded recognized disables, including:

```js
process.report.reportOnUncaughtException = false;
Reflect.set(process.report, 'reportOnSignal', false);
Object.assign(process.report, {reportOnFatalError:false});
```

The exemption is narrow: it applies only when the exact report namespace is the target of a recognized mutation and the mutation source is proved incapable of enabling a report trigger. Opaque keys/values and unknown escapes remain refusals.

## Indirect Reflect.get wrappers

The process-capability proof recognizes direct, detached, `.call`, `.apply`, `Reflect.apply`, and receiver-only `.bind` forms of `Reflect.get` where useful to follow genuine process/report acquisition.

The review initially tried to demand positive transformation yield for indirect `Reflect.get(...process,'env')` wrappers. That expectation was rejected: the repository has a broader pre-existing generic reflection source-observer guard that intentionally refuses those indirect forms independently of `process.report`. The final regression records that conservative boundary rather than weakening unrelated source-observer protection to make this review look more permissive.

## Final source-pinned validation

Exact executable source:

**`35e99c02c9c13fc04a9c50f255c7e501f19b028b`**

Manual validation:

**44403434136**

Results:

- `node22 (ubuntu-latest)`: **success**;
- `node22 (windows-latest)`: **success**;
- repository Node regression corpus: passed;
- strict JSDoc/typecheck gates included in the workflow: passed.

No executable files changed after this validated source pin. This report itself is a documentation-only successor commit.

## Remaining proof limits

The report-specific proof is still not a general JavaScript lexical resolver.

In particular, arbitrary local variable/function/class/import bindings named `process`, or locally shadowed global aliases such as `globalThis`, can require scope-sensitive resolution beyond the parameter shadowing repaired here. A file-wide name-count heuristic would be unsafe because one scope may shadow `process` while another legitimately refers to the Node global.

Those cases should be handled by an actual lexical binding resolver or conservatively refused when encountered. They are explicitly outside this review's established green envelope.

Likewise, external Node startup configuration is a separate host-observer boundary. The independently merged
`im-results/process-report-ambient-configuration-2026-11-18.md`
shows that `--report-uncaught-exception` can expose rewrite-sensitive coordinates even when the source never references `process.report`. A source-only detector cannot infer arbitrary deployment flags; that belongs in the deployment/proof contract rather than being silently conflated with AST capability analysis.

## Decision

The final branch materially improves semantic soundness and precision of the proposed diagnostic-report source-observer analysis, with adversarial red-to-green evidence on two operating systems.

It remains a **compatibility improvement**. Correctly refusing a source rewrite or preserving report coordinates does not demonstrate static-reconstruction resistance, dynamic-extraction resistance, tamper resistance, environment locking, or a security/performance advantage over an equal-trust minified control.
