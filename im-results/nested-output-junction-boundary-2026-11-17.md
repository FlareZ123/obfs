# Nested output symlink and Windows junction can redirect generated files into input

**Date:** 17 November 2026. **Classification:** trusted-build filesystem provenance and source-integrity safety result. This is a bounded repair under a non-hostile build filesystem; it does not establish source confidentiality against an owner with runtime and filesystem control.

## Native negative control and failure mechanism

Before this repair, the COO/SNO CLI checked only that `--out` was lexically and transitively outside `--root` via `src/cli.js::assertOutputOutsideInput(absRoot,absOut)`. The CLI then wrote every output as `atomicWrite(path.join(absOut,file.path),file.code)`. A nested directory inside `--out` could be a POSIX symlink or Windows junction whose destination was inside `--root`, despite the root being safely outside the input. Node's `fs.mkdir` and `fs.rename` follow intermediate directory symlinks on the path, so the writer could mutate input files.

A local **Node 22.16.0 Linux filesystem control** created `in/nested/private.cjs` containing `ORIGINAL`, `out/nested -> in/nested`, then wrote through `out/nested/private.cjs`. The output root was lexically outside input, yet `fs.realpathSync(out/nested/private.cjs)` resolved to the original input file; after the write, its contents were `OVERWRITTEN`. This is direct alias evidence, not merely a string-path hypothesis. The reproduction did not invoke the old CLI; the prepatch writer's call pattern and preflight scope explain why the old path allowed the same redirection.

## Repair and executable test

The CLI now checks **every eventual output directory chain before emitting any file**:

1. `assertNoOutputJunctions(absOut,file.path)` walks existing intermediate parents under the chosen root using `fs.lstat`, refusing a directory symlink/junction or non-directory component. Windows relative separators are normalized before iteration.
2. `assertOutputOutsideInput(absRoot,path.join(absOut,file.path))` also applies the existing realpath containment policy to each generated target; the SNO launcher path is checked independently.
3. Only after all generated paths and any launcher have passed does the existing atomic writer begin emission.

`test/nested-output-junction-boundary.test.js` constructs actual symlinks/junctions into input and an unrelated output tree. It checks COO/SNO refusal **before** any artifact is emitted, preserves two original source files byte-exact, and retains positive ordinary nested-output behavior. On a platform that does not permit junction creation, the test explicitly skips rather than reporting unsupported filesystem behavior as passed. Both new test and strict external JSDoc are wired into `manual-transform-safety.yml`.

Code and tests:
- [Nested ancestor preflight](https://github.com/FlareZ123/obfs/commit/25dd63ed9cd459234cb9a758ffc3383015b343e3)
- [Windows separator normalization](https://github.com/FlareZ123/obfs/commit/6e9e69bfc637eeaf747ff79551fe961dbbcc1748)
- [Real-filesystem negative and positive controls](https://github.com/FlareZ123/obfs/commit/9ba534fa8cdd06ce944fb9cbd52269a02f2bfee9)
- [Cross-platform workflow step](https://github.com/FlareZ123/obfs/commit/45dd64cd1438eb5ed2e3287aa621878fe05eb51e)
- [External strict JSDoc inclusion](https://github.com/FlareZ123/obfs/commit/6e5921978745bfce26a5bb128c7380e8749a812b)

## Limits and evidence state

**Native alias reproduction is verified locally; the patched CLI tests are pending exact-SHA CI.** This report must be updated after a pinned Ubuntu/Windows run. The repair relies on preflight and therefore has a time-of-check/time-of-use window if an adversary can replace directory entries during the build; it cannot sandbox an intentionally hostile filesystem owner. The top-level output root's behavior remains governed by the existing `assertOutputOutsideInput` check. The change is build-time only and emits no additional client JS instructions, though no universal original-versus-emitted 2.5× performance bound follows.
