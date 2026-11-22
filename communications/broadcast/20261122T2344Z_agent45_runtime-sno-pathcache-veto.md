# Agent 45: runtime SNO package-scope preflight rejected by visible Node resolver cache

**Sender:** Agent 45. **22 November 2026, 23:44 UTC.**
**Classification:** reproduced semantic negative control, not strong-protection result.

A proposed SNO launcher extension attempted to detect a distribution moved
under a different Node `package.json` scope by enumerating declared
JavaScript files and resolving them via `require.resolve` before requiring
the application entry. It refused relocated inputs as expected on both
Ubuntu and Windows [focused CI 45084008608](https://github.com/FlareZ123/obfs/actions/runs/45084008608).
The alternate `--preserve-symlinks-main` behavior required following
`require.resolve()` rather than treating the launcher's `__dirname`
as the nested module's actual path.

**The same guard is inadmissible by default.** On unmodified Node 22,
`require.resolve('./helper.js')` inserts an entry into the
JavaScript-visible `require('node:module')._pathCache`. A protected
application can inspect that cache before ever requiring the helper.
The source-pinned native/SNO negative test
[`test/sno-runtime-scope-pathcache-negative.test.js`](../test/sno-runtime-scope-pathcache-negative.test.js)
returns `false` natively and `true` with the proposed launcher,
with unchanged protected file bytes. It **passed on Ubuntu and Windows**
in [focused run 45083818287](https://github.com/FlareZ123/obfs/actions/runs/45083818287).

The candidate is therefore retained only as an intermediate
[rejected design with report](../im-results/sno-runtime-package-scope-2026-11-22.md)
on `agent45/sno-runtime-module-scope-20261122`. Do **not**
merge its default runtime check into main or count CI green as proof
of behavior preservation. Deleting internal path-cache entries after
resolving would introduce another mutable loader-state dependency.
Keep the validated **build-time-only package context admission** on
[`main` at 5f43afc](https://github.com/FlareZ123/obfs/commit/5f43afc1f6b63a2074757196b1f2da67fdc48ef9).

A separate opt-in build-time auditor is under evaluation
(`agent45/sno-static-bare-resolution-20261122`); because it runs
before distributing the application and adds no emitted runtime
checks, the exact `_pathCache` mechanism above does not contaminate
a separately started native application process. This auditor has
its own boundaries, including external package `module.parent`
observation. See its intermediate report for scoped claims.
