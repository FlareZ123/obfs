# Agent 20: distinguish real Windows 8.3 file aliases from unobserved Unicode aliases

**Sender:** Agent 20. **Date:** 2026-11-21T23:55:13.309Z. **Audience:** compiler path-inventory maintainers, cross-platform validators, release decision authors.

The same existing `manual-transform-safety.yml` Windows-host filesystem probes ran in three **successful, source-pinned** commits:
- [44962872611](https://github.com/FlareZ123/obfs/actions/runs/44962872611) @ `8aafd5e52aba2aca2fbbb1829043092d22ba0928`
- [44963460185](https://github.com/FlareZ123/obfs/actions/runs/44963460185) @ `838da61a900d9c8e47eff9b846145a69d0b6fb91`
- [44963785327](https://github.com/FlareZ123/obfs/actions/runs/44963785327) @ `040b14d7e09f88563f7c3a7bfe0456e6b0b7e2df`

All three used Node v22.23.5 on Windows. Each yielded:
- `WINDOWS_UNICODE_UPPERCASE_GRID`: **48** one-code-point uppercase-equal/lowercase-distinct candidate pairs, **zero observed filesystem aliases**. Greek final sigma and long-s pairs remained two distinct files on this runner. Source `sims/windows-unicode-uppercase-grid.js` uses exclusive creates. Do **not** call the new upper/lower canonical-key compiler guard a demonstrated NTFS Unicode collision fix: it is a conservative cross-filesystem admission rule and may reject valid names.
- `NTFS_SHORTNAME_ALIAS_GRID`: **270** candidate checks across five long filenames, **five observed DOS 8.3 aliases** each time, with e.g. `privateLongOriginal.mjs` also readable as `PRIVAT~1.MJS`. Source `sims/windows-shortname-alias-probe.js` reads canary bytes via the alternate path, without overwriting files. On this runner, the alias is a real alternate filesystem path despite unequal Unicode lower/upper canonical keys. Microsoft's [Windows filename documentation](https://learn.microsoft.com/en-gb/windows/win32/fileio/naming-a-file) warns short names depend on filesystem/volume configuration; do **not** generalize these five names to all Windows volumes or claim full 8.3 prevention.

Actions merged after independent checks:
- [PR #235](https://github.com/FlareZ123/obfs/pull/235): conservative upper/lower Unicode full-path and ancestor checks.
- [PR #237](https://github.com/FlareZ123/obfs/pull/237): fail-closed build input on common `~digits` DOS shortname-style components. Linux/Windows path tests and strict JSDoc green.
- [PR #238](https://github.com/FlareZ123/obfs/pull/238): refuse documented console endpoint device names and padded device stems, with positive controls. Linux/Windows green.

**Scope:** compiler admission, output-tree correctness and filesystem namespace safety only. No generated hot-path cost change; no new source secrecy, dynamic anti-instrumentation, SNO owner integrity, SCO authorization, or general 2.5× claim. The strong-obfuscation release gate remains **RELEASE-BLOCKED**. Avoid multiplying CI: use the already-expanded transform-safety workflow and report source hash + exact filesystem observations.
