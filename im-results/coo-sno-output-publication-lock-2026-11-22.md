# COO/SNO multi-file publication interleaving and canonical lock identity

**Status: engineering soundness witness, 22 November 2026.** This is a reproducible build-publication consistency improvement. It does not demonstrate strong obfuscation, secret source confidentiality, tamper prevention under a filesystem-controlling attacker, or whole-directory atomic visibility to external readers.

## Failure and expected contract

Prior to this change, `src/cli.js` wrote each emitted file with an independently correct `atomicWrite`. Two separate, cooperating COO or SNO compiler processes publishing to the **same output directory** could nonetheless interleave file generations. The SNO launcher manifest could also be written between different generations, leaving an internally inconsistent published application. An individual atomic rename does not provide a multi-file transaction.

The frozen `sims/output-publication-lock-sft.js` adversarial schedule forks A and B. A writes the first file and pauses. B writes both files; A then resumes its second write. On local Linux Node v22.16.0:

```text
ungrouped: A published first.js and is paused
ungrouped: B published both files while A is paused
ungrouped: final pair {"first":"B","second":"A"}
grouped: A published first.js and is paused
grouped: B attempted publication and is waiting for A
grouped: final pair {"first":"B","second":"B"}
PASS: deterministic cross-process baseline red, directory-lock green
```

The new `src/atomic.js::withDirectoryLock` provides an exclusive cooperating-publisher lock for the whole COO/SNO CLI output operation, including the existing nested-output preflight and subsequent per-file writes. The lock file is adjacent to the output directory, rather than inside it. The original atomic per-file writes remain. Normal completion and ordinary thrown errors release the lock. A killed process can leave a stale lock, requiring operator inspection.

## Alias counterexample and repair

An initial lexical `path.resolve(directory)+'.obfs.lock'` key was insufficient: a symbolic-link alias could designate the same output directory while acquiring a distinct lock. The local pre-repair alias probe acquired the alias lock concurrently with a held real-path lock. The updated implementation canonicalizes the existing directory using `fs.realpath`. For an absent final directory component it canonicalizes its existing parent and appends the basename. This handles the tested Unix symlink alias and, when the operating system permits junction creation, Windows directory junctions.

Local Node v22.16.0 `test/atomic-directory-publication.test.js` results:

- 3 passed, 0 failed: callback rejection cleanup, blocking across two Node processes, and lock-key aliasing including a missing child.
- JSDoc checked via TypeScript against installed Node declarations without errors.
- A separate 64-publisher local stress profile retained a consistent two-file final generation, with no leftover per-file or directory lock file. This is exploratory, not a correctness proof.

## Integration and limits

The first source-pinned Ubuntu/Windows manual validation, [run 44971698307](https://github.com/FlareZ123/obfs/actions/runs/44971698307) at `47fbe89678363f17100bb4d692cfcae821d2d26b`, passed its behavioral/adversarial suites, normal JSDoc checker, selected benchmarks, and Ubuntu Chromium checks. Its overall jobs failed solely at the **unchanged** `sims/jsimplifier-static-attacker.js` external JSDoc step with TS2322, TS2339 and TS2345. This is a baseline toolchain failure, not a green full validation and not evidence of a defect in the publication change. Agent 39 was notified in `communications/agent39/2026-11-22T0140Z_agent6_jsimplifier-external-jdoc-red.md`.

The second [source-pinned workflow 44972244745](https://github.com/FlareZ123/obfs/actions/runs/44972244745), source `6b8bedec882f391f1eb2ff0f255b73f85fd38385`, includes the new filesystem alias regression. Its status must be inspected before calling it green.

The lock coordinates **cooperating publisher processes** only. It does not enforce safe behavior for direct writes, compromised or adversarial runtime/filesystem access, aliases introduced by a concurrent symlink swap, mount aliases, or network filesystems without reliable exclusive-create semantics. Non-participating readers may see a partial generation during publication, and stale files may persist from previous builds. Atomic snapshot publication would require a different output-tree versioning and reader-switch architecture.

## Reproduction

- `sims/output-publication-lock-sft.js`: deterministic ungrouped and grouped interleaving, native multi-process Node.
- `test/atomic-directory-publication.test.js`: closure cleanup, waiting child publisher and symlink/junction lock canonicalization.
- `src/atomic.js`, `src/cli.js`: production code.
- [PR #250](https://github.com/FlareZ123/obfs/pull/250): candidate patch and review.
