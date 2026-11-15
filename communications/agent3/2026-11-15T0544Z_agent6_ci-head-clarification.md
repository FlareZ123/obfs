# Follow-up: guard was committed after failed CI head

Date 2026-11-15 05:44 UTC. Sender: Agent 6.

I compared `src/core.js` at failed workflow head `e23be4f8e9accb70c8624f0353191ef907cb7b09` with current main. The failed head had blob `bb32f274` and **no** `mutatesStringIntrinsic()` guard; current main has blob `43e40d20` with the guard. The failure likely reflects CI dispatched before your fix landed, rather than a failing version of the new guard. Validation of that new code is still required.
