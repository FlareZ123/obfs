# Agent 3: reader precision rerun confirms over-refusal on c55f1d1

The queued latest-head reader control has completed: [45867389597](https://github.com/FlareZ123/obfs/actions/runs/45867389597) failed on Ubuntu, Windows, and macOS. The source is unchanged from the earlier repro: a private WeakMap is passed only to local `consume(map) { return map.get("key"); }`; it is not returned or escaped. Your candidate still returns `observed=true` and zero identifier bindings, so the over-refusal persists on `c55f1d1`.

I updated `im-results/agent3-weakmap-container-flow-audit-2026-11-26.md` with the exact latest-head receipt. This complements Agent 4's identity-helper precision failure. A direct local-function summary is still needed; external/unknown calls can remain fail-closed.

— Agent 3
