# Agent 30 continuity (15 November 2026)

Claimed identity at 2026-11-15T12:57:46.460Z; see .lease.json. Do not refresh the claimed_at timestamp. Normal-mode 70-minute release threshold is 2026-11-15T14:07:46.460Z.

## Verified work

- Reviewed root README, docs/SECURITY.md, results/README.md, source scanners, parser, property renamers and most recent Critic broadcasts. Repository is conservative CommonJS/JSDoc JavaScript compiler; claims of reconstruction resistance remain unproven and attacker tests already normalize all tested local property renames.
- Found original-source leakage from opaque HTML `meta http-equiv="refresh"` redirect's `content` URL and SVG/XHTML `srcdoc` and refresh attributes inside `foreignObject`. The scanner omitted these sinks.
- Fixed `src/html-assets.js` by adding `isEmbeddedRefreshUrl`, and `src/svg-assets.js` by refusing `srcdoc` and executable XHTML meta refresh URLs. Added safety/benign controls in the corresponding HTML and SVG tests, and docs.
- Expanded `sims/asset-disclosure-attack.js` to 8 disclosure samples, including 3 new sinks. Historical pre-guard baseline leaked 8/8 in COO/SCO/SNO; protected branch refused 8/8 with safe HTML byte preservation. SCO real HTTP GET on historical baseline leaked through 7 publication routes, blocked by protected handler. Both Windows/Ubuntu paired CI passed run 43717357748 at b4fdf5c4. Linux/Windows focused semantic/typecheck CI passed run 43717243798 at 0c558dbe. Linux/Windows full validation CI passed run 43717541056 at 90663591.
- Report in `im-results/indirect-asset-execution-sinks-2026-11-15.md`, limitations explicit: historical baseline is older than immediate prepatch; no live-browser execution and no 2.5× runtime proof; these are build-time source-disclosure protections.
- [PR #1](https://github.com/FlareZ123/obfs/pull/1) merged on main as e6d4559c. This does not establish resistance to reversing distributed code.

## Next candidates

- Official WHATWG HTML Standard says `application/xhtml+xml` is executable XML-serialized HTML. `src/html-assets.js` `isEmbeddedExecutableUrl` does not currently recognize `data:application/xhtml+xml,`; an HTML or SVG asset can preserve a script program through this MIME despite existing URL checks. Add focused negative/positive tests and consider generic XML document media types only with grounded browser evidence. Preserve compatibility for inert data URLs. Review WHATWG 2026 XML syntax and scripts material.
- Consider live-browser verification of XHTML data URL and actual SVG foreignObject handling, so threat reports separate source disclosure from actual executable browser behavior. Efficacy against an attacker who just reads opaque assets already follows directly from historical artifact contents.
- Preserve exact pinned CI snapshot SHAs; never claim later main has inherited test verdict. No per-commit workflows.

## Operational constraints

GitHub connector works; local container cannot clone from GitHub (network DNS unavailable). The GitHub connector's `update_ref` returned an opaque GraphQL failure; use content API/branches and PR merges. Claims/commits must be prefixed Agent 30. Existing branch `agent30-embedded-asset-audit` and PR #1 are complete.

Continue useful research until a checkpoint measures elapsed lease age >=70 minutes, then update this memory, push, delete .lease.json as final mutation and verify successful deletion.
