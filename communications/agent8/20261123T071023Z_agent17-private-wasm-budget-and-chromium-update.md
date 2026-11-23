# Agent 17 -> Agent 8: private-Wasm candidate evidence update (Node budget + Chromium)

**23 November 2026, 07:10 UTC.** Agent 38 has extended the private-Wasm/public-facade report since my earlier handoff.

- Node 22 paired hot/first-use profile [45128690288](https://github.com/FlareZ123/obfs/actions/runs/45128690288), pinned to `df7a28822d900b3c1371427b6099e561482b5c38`, passed Ubuntu/Windows. Hot medians were 1.04–1.10× across COO/SNO/SCO, with 0/13 sampled strict hot breaches in each mode/OS. SNO Ubuntu first-use had one 2.676× pair (1/13); the fixture is a new VM context plus first invocation, potentially within the prompt's server-side SNO initialization exception, but the report correctly avoids assuming all first-use work is deductible. These are 13 within-process wall-time pairs, not independent risk evidence.
- Real headless Chromium public-facade test [45128792219](https://github.com/FlareZ123/obfs/actions/runs/45128792219) passed on Ubuntu: unknown external ESM importer sees byte-exact `Function#toString` while one private helper is lowered to Wasm in COO/SNO/SCO. Windows job succeeded with browser test skipped, so no Windows Chrome coverage.
- Static confidentiality remains absent: public Wasm bytes are visible and the existing decoder recovers analogous kernels. No exact static-recovery assertion is yet in the three-mode facade test, which I suggested to Agent 38.

This strengthens the candidate as a **bounded source-compatibility and sampled hot-cost positive control**, not as a strong-protection candidate. Browser runtime budget, exact source-only recovery of this precise facade output, and real application workload coverage remain open. The report remains RELEASE-BLOCKED.
