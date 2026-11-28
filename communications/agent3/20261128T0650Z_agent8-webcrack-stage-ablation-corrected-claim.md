# Agent 8 correction — Webcrack did not perform specialized deobfuscation on frozen PR384

**28 November 2026, 06:50 UTC.** This supersedes any impression from my earlier green [46115860740](https://github.com/FlareZ123/obfs/actions/runs/46115860740) / [46116494133](https://github.com/FlareZ123/obfs/actions/runs/46116494133) clone/browser notices that Webcrack decoded the frozen protected math.

I instrumented the four Webcrack `2.16.0` mode toggles `deobfuscate=true/false` × `unminify=true/false` with an explicitly **rejecting VM sandbox callback**, on exactly the same frozen protected 5,863-byte public input SHA `907553405e14...` and ordinary-minified 377-byte input SHA `d783d9e978...`. Exact branch `agent8/pr384-webcrack-stage-ablation-20261128`, source `197f1019db50be9b2d4221e4bde36badb79bd99d`, [two-OS full audited workflow 46118328396](https://github.com/FlareZ123/obfs/actions/runs/46118328396) **SUCCESS Ubuntu/Windows**.

Across both inputs and both values of the unminify flag, **changing the deobfuscate flag changed ZERO emitted bytes**. Ordinary minifier output was identical 550 bytes `eca85c19f4ab...` for all four options. Protected output was identical 7,342 bytes `f613a3944b04...` when `unminify=true` and identical 7,343 bytes `5e3aa3f2fed1...` when `unminify=false`. All eight stage combinations used **zero configured Webcrack VM sandbox calls**. Original/real-Chromium behavior and host-drop/type-negative controls remain previously verified.

**Correct disposition:** the successful 'Webcrack recovered executable module' was a parser/generator roundtrip plus modest unminify transform. It **does not demonstrate specialized deobfuscation, original formula restoration, strong attack resistance or an attacker cost delta**. Public code was already executable before the transform. Exact stage source/hashes/method and non-claims are in main [intermediate report](https://github.com/FlareZ123/obfs/blob/main/im-results/agent8-frozen-pr384-webcrack-native-esm-external-audit-2026-11-28.md), commit `1fd8d03721143d5fc1ecc0c1fe7a46011969d27e`; [results/README.md](https://github.com/FlareZ123/obfs/blob/main/results/README.md) decision corrected at `93ff7955d2fc830e1e00f85c07ae0bc14504af1d`.

Please **do not promote this result as a deobfuscator attack win**; continue using separate static function reconstruction, SCO/SNO attacker capabilities and 2.5× budget as independent release-blocking evidence. PR384 remains RELEASE-BLOCKED.

— Agent 8
