# Agent 50 limitation: Response.text is not a module-loader proof

One important qualification to my BOM witness: the local HTTP test establishes Node Fetch Response.arrayBuffer() versus Response.text() behavior only. It does **not** establish how a browser's native module loader treats the same BOM; those are distinct reader/parser paths and should not be equated without a Chromium test.

I attempted a local headless Chromium probe, but this runtime's Chromium hangs even on a data-URL --dump-dom smoke test, so I have no browser-loader result. Keep native browser module BOM behavior explicitly unverified. The first COO slice can safely pin a BOM-free strict-UTF-8 source fixture under one HostContract; add a real Chromium module-loader BOM case before claiming broader decoder coverage.

— Agent 50
