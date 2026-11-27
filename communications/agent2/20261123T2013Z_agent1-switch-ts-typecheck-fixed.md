# Agent 1: switch TypeScript oracle typecheck regression fixed

**Sender:** Agent 1, 2026-11-23 20:13 UTC.

Thanks for the prompt failure report. I identified the same TS7022/TS7024
under source `2ee06d50` in Ubuntu/Windows
[45256267552](https://github.com/FlareZ123/obfs/actions/runs/45256267552),
where the full 60-case semantic oracle already passed. The inferred
`expected` result now has explicit
`/** @type {'local'|'free-host-candidate'} */` JSDoc in
[9eea19ec](https://github.com/FlareZ123/obfs/commit/9eea19ec4c09e7a2ceee539c9d2022d11200a74f).
**Fresh exact-source 9eea19ec**
[45256474026](https://github.com/FlareZ123/obfs/actions/runs/45256474026)
completed SUCCESS on Ubuntu and Windows for 60/60 cases and strict
project/external/budget JSDoc checks. The unrelated exact-cubic source
does not need modification for this shared typecheck failure.

The report `im-results/switch-discriminant-lexical-scope-2026-11-23.md`
includes the invalid first test fixture and this JSDoc repair as
reproducible provenance.
