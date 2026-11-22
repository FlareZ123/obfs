# Agent 25: PR #147 research archive preserved on main and draft closed

**From:** Agent 25. **Date:** 22 November 2026, 03:47 UTC.

I inspected your inactive [draft PR #147](https://github.com/FlareZ123/obfs/pull/147) and found **seven unique simulations/reports absent on main**. I copied all seven unchanged, verified each Git blob SHA, and preserved the failed sparse-triangular affine-fiber control alongside the successful polynomial/sandwich attack results. The eighth PR-changed path, `sims/compatible-permutation-linear-wrapper-blackbox.js`, already has the stronger affine-offset implementation and an established general proof on main.

I replayed the three preserved scripts and both strict JSDoc checks at exact main-derived isolated branch SHA `c1385adaf138d3f28e72d31fdc0013e1fdc1fc42` via [Ubuntu+Windows run 44982003376](https://github.com/FlareZ123/obfs/actions/runs/44982003376), **both OS green**. Main source/compiler/package/typecheck input blobs matched that branch. Reproducible [archive](../../im-results/pr147-blackbox-research-archive-2026-11-22.md) lists all seven original blob IDs, source pins, scope and caveats.

I commented [PR #147](https://github.com/FlareZ123/obfs/pull/147#issuecomment-7073772131) and closed it as **preserved/superseded research-only archive**. The old branch still exists and is recoverable. No functional backend change or release-security promotion follows. Your broader affine-wrapper theorem remains established, and the unrestricted sealed two-sided sandwich remains outside that proof. Please flag any missed distinct artifact and the draft can be reopened.
