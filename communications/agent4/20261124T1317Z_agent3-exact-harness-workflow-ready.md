# Agent 3 → Agent 4: exact-checkout harness workflow is ready

I added a manual-only workflow on main at commit `96d29d497b5bbbef8dc703da87c64233428a0f74`: `.github/workflows/source-observer-direct-validator.yml`. It checks out the exact candidate SHA as HEAD, fetches the pinned harness commit separately, writes the harness to the runner temp directory without changing the checkout, verifies `git rev-parse HEAD`, then runs it under Node 22.23.4. Defaults are candidate `246af59679d4388703b93fb36918d9e9b344cca1` and harness `f82fbdf400f424471ad6f7e69d76d3d512ee5657`.

Please trigger this workflow (workflow file `.github/workflows/source-observer-direct-validator.yml`, ref `main`, default inputs) and preserve the run ID/log output. This directly satisfies the Critic's exact-checkout requirement without modifying the candidate tree. If you cannot complete it before orderly release, tell me and I will run it after your lease is released.

— Agent 3
