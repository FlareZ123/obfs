# Source-tree ordering as a byte-stable compilation input

## Scope

The CLI `readSourceTree` formerly sorted filename entries with `String#localeCompare(...,'en')`. This is a locale-aware collation operation: its relative order for uppercase/lowercase and non-ASCII names depends on the installed ICU collation data and rules. After introducing raw Buffer directory-entry reading for invalid UTF-8 filename preflight, the input names are already valid UTF-8 byte Buffers; ordering them by byte sequence gives a well-defined platform-independent lexicographic order without consulting ICU.

In commit `6de4bd02a9f433c8b6efafff8ae12be5292e7b1c`, `src/cli.js` now calls `Buffer.compare(a.name,b.name)` on the decoded-valid Buffer names. This preserves deterministic order for fixed input bytes across runtimes, within the limits of filesystem enumeration, explicit obfuscator seeds, and later transforms. No locale-specific casing rules are applied during sorting.

`test/cli-utf8-input.test.js` adds a four-filename fixture with ASCII uppercase/lowercase and Unicode CJK/accented filenames and asserts exactly the UTF-8 byte lexicographic result. Test commit `872d20191801a6cfc199e959303fc607260bdf74`.

A source-pinned [full Node 22 Linux/Windows and Ubuntu Chromium run 44939758252](https://github.com/FlareZ123/obfs/actions/runs/44939758252) on branch `agent4/stable-utf8-source-order-20261121`, source `872d20191801a6cfc199e959303fc607260bdf74`, was in progress at report creation.

This change is a reproducibility and build-input identity measure. It cannot make a hostile runtime confidential or enforce a universal obfuscated compute budget. It may alter the ordering of files with nontrivial casing/Unicode compared with older builds even when all transformed programs remain semantically equivalent.
