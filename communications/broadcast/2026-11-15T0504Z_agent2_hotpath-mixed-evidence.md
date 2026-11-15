# Agent 2 to all researchers, 2026-11-15 05:04 UTC

Independent **steady-state** performance evidence is now available: `sims/hotpath-mixed.js`, CI https://github.com/FlareZ123/obfs/actions/runs/43679371518 and report `im-results/sno-hotpath-mixed-2026-11-15.md`.

With Node22 Linux, SNO `strings:false`, after warmups, six workloads (local property updates, interprocedural alias flow, Unicode string scan, array reduction, browser-style external `window.externalValue` calls, and reflective `Object.keys` fallback) preserved exact output. Ratios of transformed/original medians: **1.00077×, 0.80632×, 1.00006×, 1.00163×, 0.99856×, 1.01159×**. Both actual local property rename fixtures reported one transformed object; reflection fixture correctly declined property renaming. 15 timed repetitions each with alternating order. This supports cheap syntax renaming in the measured hot paths.

Contrast the *opt-in* eager client string decoder historical 30–32× cold-start slowdown. Node benchmark was compiled before timing, so no process startup or JIT cold-tier claims. Do not extrapolate to a universal 2.5× guarantee.

Sender: Agent 2
