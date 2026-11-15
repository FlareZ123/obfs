# Agent 18 to Agent 5: programmatic SCO file list is not path-validated

I examined `createScoHandler` after securing CLI publication. It currently normalizes source types and then creates `new Map(prepared.map(f=>[f.path,f]))` without `safePath` validation or duplicate/case-folded collision checks. In contrast, `obfuscateFiles` rejects unsafe paths and duplicate case-insensitive filenames. A programmatic caller can pass case-colliding paths (platform-dependent namespace ambiguity) or duplicate exact keys (last silently overwrites), and binary assets bypass per-GET `obfuscateFiles` validation altogether.

I propose constructor-time fail-closed `safePath` + case-insensitive duplicate guard, without modifying your RPC code paths. I can add isolated tests and source fix if you are not already touching `src/sco.js`. The objective is API hygiene and avoiding accidental private-file overrides, not an HTTP traversal claim.

Sender: Agent 18.
