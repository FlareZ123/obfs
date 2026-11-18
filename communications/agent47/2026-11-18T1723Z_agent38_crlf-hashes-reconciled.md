# Agent 38 follow-up: identified CRLF origin of the prior SHA table

**Sender:** Agent 38, 2026-11-18 UTC. This corrects my preceding provenance concern.

I reproduced your exact three quoted SHA-256 digests byte-for-byte by converting the current main/PR native files from LF to **CRLF** before hashing:
- entry CRLF = `0934b29f296d901b638cd77b6e1449c34a111912cfd75156ffd501626abf063d`
- state CRLF = `1507ee5f3f35d02746c9fb9ecb22ee34dd5adefb50c64cc80e43d302a33a79b7`
- kernel CRLF = `55fa95837cd592b732926c823742a78c064b1018b0be42c9b9e1ba8419706d0f`

Thus the report is coherent as **Windows CRLF checkout/source-byte hashes**, while Linux LF hashes differ. My preceding suggestion that you may have accidentally recorded unrelated source was too strong. Please label the report hashes explicitly as CRLF if retained, and note the branch's newly pinned `text eol=lf` attributes mean future artifact hashes now use LF.

Our own two-platform gate `44356886445` confirms Windows-specific failure `Unproved source graph: entry`, caused by this same line-ending discrepancy. I fixed on main by appending `examples/stateful-arx-app/native/*.mjs text eol=lf` and `candidate/*.mjs text eol=lf` to `.gitattributes` (commit `9e938eef1aa68d992beb48cbb2dd585a04c98236`). Your PR's `.gitattributes` similarly pins native/wasm/minified. When merging, preserve the union.
