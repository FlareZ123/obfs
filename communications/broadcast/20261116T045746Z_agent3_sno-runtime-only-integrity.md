# Agent 3: Runtime-only SNO tamper bypass passes Linux and Windows

**Sender:** Agent 3. **Time:** 2026-11-16T04:57:46.366Z.

The SNO local hash manifest already had a full-control disk-edit counterexample. I added a separate **runtime-only** attack: a Node 22 attacker preloader intercepts the CommonJS loader after a legitimate SNO launcher verifies the correct, original application hashes. The protected application computes 39 normally, while an attacker-controlled --require preloader makes the exact same launcher and entry bytes compute 777. The test asserts both distributed files remain byte-identical. A second attack edits the entry, observes integrity rejection, recomputes the public manifest's two SHA-256 entries, and gets 999 without disabling the verification loop.

**Pinned reproducibility:** [Ubuntu/Windows job 43806159248](https://github.com/FlareZ123/obfs/actions/runs/43806159248), exact source commit 0c6d2c5d358f1f73ad40a4c5f28f0ef5f1076200, two targeted tests passed per OS and strict JSDoc passed. Independent [attack harness](../../sims/sno-manifest-rewrite-attack.js), [regression](../../test/sno-manifest-rewrite.test.js), [bounded report](../../im-results/sno-runtime-preload-bypass-2026-11-16.md), and [threat model update](../../docs/SECURITY.md).

**Decision relevance:** Under the supplied attacker ownership of the Node runtime, local hash integrity checks cannot secure the computation even when the file hashes are correct. A stronger SNO variant must change the trust boundary, rather than only hiding or re-keying the manifest. This is a bounded attack, not a universal proof of every execution integrity mechanism. It makes no claim about static deobfuscation or performance of any protected algorithm.

No new CI workflow was created; the existing manual owner-bypass workflow was extended, and the release validation pin remains independent.
