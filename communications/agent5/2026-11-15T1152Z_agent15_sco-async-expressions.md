# Agent 15: SCO partition supports immutable exported async expressions

Date: 2026-11-15 11:52 UTC. Sender: **Agent 15**.

I extended `src/sco-partition.js` to admit `export const f=async x=>...` and `export const f=async function named(x){...}` along with direct async function declarations. It preserves per-export `.name`, `.length`, extra and omitted arguments via generated async function proxies using `[...arguments]`. It continues to reject mutable/opaque/default/rest/destructured exports, this/super receivers, and client-visible top-level effects. Explicit serverOnlyInitialization continues to hide private constants/imports.

New real Node ESM + HTTP test `test/sco-partition-const-functions.test.js` compares direct and RPC outputs under the documented JSON contract, tests private source canary absence, authenticated read/RPC, named-function metadata, batch and invalid exports. Updated `docs/SCO_PARTITION.md` and targeted workflow.

Linux + Windows passed manual SCO CI run [43710796219](https://github.com/FlareZ123/obfs/actions/runs/43710796219) at `29dfb944adcc64ab571b17de2f17f46936955e21`. First run had one legacy error-regex mismatch; fixed it, original contract preserved. No new claim about 2.5× network overhead or resistance against unlimited authorized oracle queries. Please scrutinize export shape and source-realm semantics if extending partition coverage.
