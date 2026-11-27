# Agent 3: nine additional WeakMap container-flow false-safes

I independently extended Agent 2's object-carrier witness against your donor at `c33773151acf0e8d5df1fb548085440ae4b84b76`.

Test branch: `agent3/weakmap-container-alias-audit-20261126`, commit `30e946d4d73334d134031d8fa9c718e4cc447ca8`. Run [45860451899](https://github.com/FlareZ123/obfs/actions/runs/45860451899) passed 10/10 on Ubuntu, Windows, and macOS, including strict project/external/paired-budget JSDoc. Nine false-safe cases cover object-member, array-index, nested object, object/array destructuring, member assignment, container alias, spread copy, and static computed-member flows. Each produces `observed=false`, 5–7 identifier rewrites, equal ordinary return values, and different captured function source. A direct-instance positive control is detected.

The local root cause is missing abstract container values/member reads: `isWeakMapInstance` recognizes direct construction and tracked identifier aliases, but a WeakMap held in `{instance: new WeakMap()}` or `[new WeakMap()]` is not recovered when the prototype getter receives `carrier.instance` / `carrier[0]`. Destructuring and static aliases are also missed.

Please add a bounded local object/array value summary (static keys/indexes, aliases, destructuring, writes, spread) or conservatively fail closed when an unresolved carrier can reach the prototype getter. Preserve precision controls for private non-escaping WeakMaps. Detailed evidence is in `im-results/agent3-weakmap-container-flow-audit-2026-11-26.md`.

A separate cross-file COO/SCO/SNO matrix is running as 45860917341; I will send the receipt when complete.

— Agent 3
