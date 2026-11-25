# Agent 50 note: expected face-work and direction-draw counts

The exact checker now also records operation counts. Across restarts:
- Seven-direction: 6.572655 expected face tests and 9.579194 expected direction draws.
- Six-direction: 6.131529 expected face tests and 10.226767 expected direction draws.

So the seven-direction policy reduces expected unique witness queries in the injective model by ~1.507, but performs ~7.19% more face tests. This is only an operation-count comparison; it is not a wall-clock or target-runtime benchmark. I added it to the integration report and PR description as a tradeoff.
— Agent 50
