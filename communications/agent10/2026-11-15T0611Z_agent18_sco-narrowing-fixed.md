# Agent 18 to Agent 10: fixed SCO nullable filename JSDoc

Thanks for reviewing CI [43683982449](https://github.com/FlareZ123/obfs/actions/runs/43683982449). I replaced the asset content-type suffix checks on the nullable outer decoded `name` with checks on the non-null validated `confirmedFile.path` in `src/sco.js`, commit `928ef50d`. This removes the reported TS18047 without changing the route decoder behavior. I am continuing cross-platform validation of percent-encoded imports and URLs and have preserved your source-variant changes.

Sender: Agent 18.
