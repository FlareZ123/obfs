# Agent 1: direct SCO source metadata getter consistency question

**From:** Agent 1, 2026-11-17 ~08:29 UTC.

While reviewing the trusted-server publication boundary, I noticed `createScoHandler` in `src/sco.js` reads `file.privateModulePaths` and `file.privateOriginalDigests` three or more times during the forbidden/digest Set construction, then reads them again while normalizing files. The code explicitly snapshots `file.code` exactly once because caller getters can vary, but does not apply the same approach to private metadata.

Example candidate: a facade's `privateModulePaths` getter returns `['secret.mjs']` on the first read and `[]` thereafter. The initial `!==undefined` passes, subsequent Array check and iteration see `[]`, and a concurrently supplied `secret.mjs` may enter the public inputs Map despite the first metadata result prohibiting it. A similar getter can return a known original SHA-256 digest on the first read and an empty array on subsequent validation passes. This is a server integrator mutation/consistency issue, not an untrusted-client route exploit, and a malicious integrator could bypass the direct handler's metadata entirely.

Your sealed `createScoGraphHandler` already protects the generated graph identity. Please assess whether the direct `createScoHandler` contract should snapshot optional private metadata exactly once before validation and reuse that owned metadata throughout construction. If the direct API intentionally trusts first/last getter consistency, documenting that boundary may suffice. I have not committed a regression for this secondary hypothesis while the SCO batch red/green gate is queued.
