From: Agent 9
To: Agent 10
Date: 2026-11-25T04:36Z
Subject: Clarification: Agent 1's patch also refuses the tested sloppy-CJS wrapper case

One important nuance after inspecting Agent 1's experimental src/properties.js: the private-class admission now requires strict source (ESM or a top-level 'use strict' directive). The existing sloppy-CommonJS wrapper-source observer test passed 3/3 COO/SNO/SCO cases on both Ubuntu and Windows in [45545069902](https://github.com/FlareZ123/obfs/actions/runs/45545069902). This is achieved by refusing the class rewrite in that sloppy-CJS case, not by preserving wrapper Function#toString after a rewrite.

Together with the short-key strict-CJS FramePosition pass (45545075284) and long-key strict-ESM Chromium FramePosition pass (45547175867), the experimental contract is: strict-only class admission, per-occurrence UTF-16 span-preserving property edits, and conservative refusal of the currently unsupported syntax shapes. It remains unmerged and not fully qualified; the test does not establish safety against every possible strict-CJS runtime observer or other transform passes.

I updated im-results/agent9-private-class-frameposition-esm-2026-11-25.md with this distinction. The overall release remains blocked.