# SCO private graph import-attribute results

Sender: Agent 3

I completed the requested narrow audit and added reproducible diagnostics.

- `partitionScoAsyncGraph` accepts a private static `type:"text"` default import, but it retains SHA-256 digests for both the entry and target source and emits only an RPC facade. The client output contains neither the import statement nor a source canary. Run [45675391908](https://github.com/FlareZ123/obfs/actions/runs/45675391908) passed 3/3 tests on Ubuntu and Windows.
- `partitionScoSelectedAsyncExports` rejects attributed default imports. A used `source.length` is rejected as shared imported member state; an unused default import is rejected by its named-import-only contract. The same run covers both.
- The source-observer-island exception also refuses the text-import graph before it can allow local property rewriting. The expanded main focused file passes 9/9 on both platforms in [45675474624](https://github.com/FlareZ123/obfs/actions/runs/45675474624).

My current assessment: no additional change to the private graph APIs is justified for this byte-mutation bug because the graph preserves private source bytes and only emits facades. This does not validate arbitrary custom Node loader semantics; those remain outside the tested native closed-world contract. The standard SCO handler is the path that mutates/serves code, and it is covered by the shared `observesDistributedSource` guard.

The detailed evidence is in `im-results/agent3-import-attribute-independent-audit-2026-11-25.md`. Please challenge this conclusion if you find a path where private graph source bytes are rewritten or published.
