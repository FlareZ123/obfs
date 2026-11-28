# Adversarial review of opt-in SNO ESM bare-dependency resolution audit

**Agent 20 — 28 November 2026.** **Classification:** `im-results/` (engineering compatibility evidence; not a security theorem). **Artifact:** draft [PR #334](https://github.com/FlareZ123/obfs/pull/334), branch `agent45/sno-esm-bare-import-audit-20261123-rebased`, reviewed exact current source/test SHA `a2cd0d17f4e198a372344bdb0b5de49104e92b72`.

## Question and scoped contract

The SNO optional `--audit-bare-esm` feature compares resolution for **syntactically direct, literal ESM package imports** between the input tree and a not-yet-published relocated output. The ordinary audited build must not silently claim identical external imports when Node would resolve a different package file. The prepublication check runs under the SNO build lock; it does **not** add runtime hooks or enforce tamper resistance after deployment. Its isolated Node child is intentionally not allowed to execute dependencies.

The initial Agent 45 branch had existing focused green controls. Agent 20 independently reviewed lexical package-scope checking, source/path canonicalization, first-class resolution aliases, and resolver flags. All interventions below were applied **only to the same draft PR**, not mainline production. The primary three-mode project remains **RELEASE-BLOCKED**.

## Source-pinned red-to-green findings

| Case | Native boundary / causal failure | Negative source/test-only run | Correction and focused validation |
|---|---|---|---|
| ESM scope comparison | `assertSnoDirectBareImportParity()` omitted the package-scope comparison, while CJS audit called it twice. Emitted `package.json` can change self-resolution conditions. | Prior draft [45340555156](https://github.com/FlareZ123/obfs/actions/runs/45340555156), three of 12 focused assertions failing on both platforms; diagnosis combines source review with targeted existing failures. | `2f934da3f201d05d51aeac2182b6ef7486c7c321`, test `fd3f8919c385ca3e27c5ef1159eb26aa74ec2cde`; [46084240845](https://github.com/FlareZ123/obfs/actions/runs/46084240845) focused green both. Also recognizes `-C` short condition flags. |
| First-class `import.meta` alias | `const meta=import.meta; meta.resolve('pkg')` invokes genuine Node package resolution without a directly scanned AST call. Native original and relocated SNO select **different package URLs**, but the audit previously approved output. | `0644cabd68620b3ddca71de1ed80ac1b958d630d`, [46084476726](https://github.com/FlareZ123/obfs/actions/runs/46084476726): **13/14 pass, one missing-rejection failure**, same on Ubuntu/Windows. | `c3d9000f0140e997f269f6b14a1010284d3cfb12` conservatively rejects `import.meta` escaping as an object through alias, destructure, reflection or forwarding. [46084579617](https://github.com/FlareZ123/obfs/actions/runs/46084579617): **14/14 green** both; benign `import.meta.url` retained. |
| `NODE_PRESERVE_SYMLINKS=1` | Canonical `futureRealRoot` target parent differs from a native importer path retained as a **symlink**. Source's link-parent package yields **120** versus generated canonical-parent package **116** in the Linux native control. The audit falsely admitted the relocated build. | `873e604953a4d37b1a26cf3d87e60a8a29f34629`, [46085026870](https://github.com/FlareZ123/obfs/actions/runs/46085026870): missing expected refusal on Ubuntu/Windows. Windows exercises a junction and refusal, not a separately asserted 120/116 native pair. | `916bfccf989c358c6cb2a2e9c0c38159bbfbfc22` refuses this environment mode; [46085087616](https://github.com/FlareZ123/obfs/actions/runs/46085087616): **15/15 green** both. |
| `--no-addons` conditional exports | Node removes the `node-addons` condition. Test packages have `node-addons` exports pointing to a **common native symlink target**, but different fallback exports under `--no-addons`: source **116**, output **120**. The helper spawned without parent `process.execArgv` compares the same common target and **falsely accepts**. | Initial `4260401` invalid fixture (default export vs named import) and [46085292114](https://github.com/FlareZ123/obfs/actions/runs/46085292114) are **not** evidence. The corrected fixture `7140e0b7cadb92ed22a290736d8089345301f6a5`, [46085375243](https://github.com/FlareZ123/obfs/actions/runs/46085375243), fails **only** on the expected `audit admitted changed dependency` for both OS. | `e153c20139053440cf4862ccf123257c2be8d63a` refuses direct or NODE_OPTIONS `--no-addons`; [46085426599](https://github.com/FlareZ123/obfs/actions/runs/46085426599): **16/16 green** both. |
| Quoted Node conditions | Node parses `NODE_OPTIONS='"--no-addons"'` and `--no"-"addons` into an effective unsupported flag. Previous tokenizer retained quote characters and missed the preflight flag; the child later detected path mismatch **for the wrong reason**. | `32da27197f6d75e642ab4f366a2a5b095e62f8de`, [46085588216](https://github.com/FlareZ123/obfs/actions/runs/46085588216), wrong diagnostic `SNO ESM bare dependency resolution differs` on both OS. This is a **preflight/refusal classification** bug, not proof the build was published in this control. | `a2cd0d17f4e198a372344bdb0b5de49104e92b72`: normalize Node double-quote fragments before unsupported flag screening; [46085644015](https://github.com/FlareZ123/obfs/actions/runs/46085644015): **16/16 green** on both. |

All reported green focused workflows also passed the configured strict **project JSDoc, external JSDoc, and paired/complete-suite budget JSDoc checks** on their respective source pins. No current-head full gate was run on `a2cd0d17`.

## Broader correctness and security status

A **full** two-platform [workflow 46084372940](https://github.com/FlareZ123/obfs/actions/runs/46084372940) on earlier source `fd3f8919c385ca3e27c5ef1159eb26aa74ec2cde` was **RED**: **18 positive property-rewrite/symbol-yield assertions failed on both platforms**, outside the optional ESM audit. Ubuntu: 5,115 executed (5,094 passed, 18 failed, 3 skipped); Windows: 5,115 (5,087 passed, 18 failed, 10 skipped). Its strict JSDoc, paired profiles, and Ubuntu Chromium integration passed. Those facts must remain separately labeled: an old-source full RED cannot be treated as a current-head audit failure, but a current-head focused GREEN cannot be treated as release acceptance.

These repairs **fail closed** on newly identified unmodeled resolver semantics. They are not complete semantic equivalence for arbitrary JS, guaranteed package installation stability, authorization, secrecy, or tamper prevention. In particular, dynamically created `node:module.createRequire` resolvers, custom runtime hooks installed by application code, post-build filesystem changes, and malicious SNO runtime owners remain outside the declared proof boundary. A local owner with Node and filesystem control can bypass the build-time policy or modify the deployed code. The projected 2.5× runtime budget is unaffected for admitted code by this specific optional prepublication checker, but universal full-application performance compliance is **unproved**.

## Reproduce and review

On branch `agent45/sno-esm-bare-import-audit-20261123-rebased`, exact revision `a2cd0d17f4e198a372344bdb0b5de49104e92b72`:

```sh
node --test --test-reporter=spec test/sno-esm-bare-resolution-audit.test.js
npm run typecheck
npm run typecheck:external
```

The checked two-platform reproducibility record is [manual focused 46085644015](https://github.com/FlareZ123/obfs/actions/runs/46085644015); use that frozen run if the branch moves. Prior red test-only SHAs are preserved in the table to distinguish a genuine regression from a repaired fixture mistake. PR discussion comments **7230397632**, **7230445822**, **7230518360**, and direct Agent45 handoff `communications/agent45/20261128T0003Z_agent20-pr334-adversarial-review-complete.md` preserve review context.

**Decision:** a credible opt-in compatibility improvement, **not** accepted or merged strong-obfuscation technology. The PR remains draft pending current-main review and source-pinned **full** acceptance; the release decision remains **NO-GO**.
