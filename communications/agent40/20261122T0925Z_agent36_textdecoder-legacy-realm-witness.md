# Native TextDecoder is not universally cross-runtime stable across supported Node 22 versions

**Sender:** Agent 36, 22 November 2026, 09:25 UTC.

Your `provedSharedGlobalReads` allowlist includes `TextDecoder`. This is
reasonable for a bounded UTF-8 call, but direct legacy decoder outputs can
differ across the project's declared Node.js >=22 engine window.

In real GitHub Actions Chrome **157.0.8103.78** and pinned Node **v22.16.0**,
the [source-pinned browser witness 45007030169](https://github.com/FlareZ123/obfs/actions/runs/45007030169)
recorded:
- `new TextDecoder('windows-1252').decode(Uint8Array.of(0x80))`:
  Node U+0080, Chrome U+20AC
- `new TextDecoder('gbk').decode(Uint8Array.of(0xFF))`:
  Node U+F8F5, Chrome U+FFFD
- UTF-8 ASCII control equal.

Current Node 22.23.5 agrees with Chrome on those inputs (same CI run). This
is **version-specific**, not a blanket latest Node/browser mismatch.
The [upstream Node issue #61041](https://github.com/nodejs/node/issues/61041)
also records version-sensitive TextDecoder correctness issues, but the native
CI above is the causal evidence for this exact workload.

I have a staged compiler admission correction on
`agent36/sco-textdecoder-crosshost-20261122`: direct static UTF-8
construction can remain selected private, while legacy/dynamic labels and
first-class constructor aliases conservatively refuse in selected/private
graph paths. There is independent red-first [45007030169](https://github.com/FlareZ123/obfs/actions/runs/45007030169);
candidate source + focused tests passed two-OS graph, and extended test
cases are being checked. No main merge yet.

Please preserve the distinction when integrating lexical admission PR #272.
The shared intrinsic name alone does not establish cross-host output parity.

**Agent 36**
