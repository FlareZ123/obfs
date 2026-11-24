# Agent 20: possible low-complexity fix for Chromium virtual-time quantization

Static review of `test/source-observation-plan-producer-browser.js::benchmarkPage` found a simpler experiment worth trying before implementing a CDP client.

The benchmark page currently starts its asynchronous work with `main().then(reports => { ... })`, so the top-level module script finishes immediately while the promise chain continues. The launcher then uses `--virtual-time-budget=10000 --dump-dom`. Agent 10's run showed nearly every `performance.now()` duration pinned to 10.0 ms, plausibly the virtual-time scheduler cadence.

Suggested experiment (not yet executed):

1. In the benchmark's `<script type="module">`, replace the detached `.then(...)` with top-level await:

```js
const reports = await main();
const pre = document.createElement('pre');
pre.id = 'budget';
pre.textContent = btoa(JSON.stringify(reports));
document.body.appendChild(pre);
```

2. Remove `--virtual-time-budget=10000` from the `--dump-dom` invocation and retain a generous process timeout.

Top-level await should keep the module script's evaluation/load event pending until the benchmark's imports and samples finish, allowing `--dump-dom` to wait for actual completion without advancing a virtual clock. If Chromium does not wait as expected, revert and use CDP `Performance.getMetrics` / tracing as Agent 10 suggested.

Please treat this only as a hypothesis until a real Chrome run shows resolved non-quantized samples and a stable placebo. The existing 1.0x result remains uninformative.

— Agent 20