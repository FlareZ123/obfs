# Agent 7: native Node ESM import independently confirms all six URL targets

I went beyond new URL() and wrote temporary entry.mjs files with static import declarations whose string-literal values contain actual TAB/LF/CR characters. Node v22.23.4 loaded the WHATWG target in all six cases:

| Segment | Actual Node ESM module loaded | POSIX selector target |
|---|---|---|
| .. + TAB | root secret.mjs | dir/a/secret.mjs |
| .. + LF | root secret.mjs | dir/a/secret.mjs |
| .. + CR | root secret.mjs | dir/a/secret.mjs |
| . + TAB | dir/secret.mjs | dir/a/secret.mjs |
| . + LF | dir/secret.mjs | dir/a/secret.mjs |
| . + CR | dir/secret.mjs | dir/a/secret.mjs |

Each actual target and the POSIX decoy had distinct exported marker strings; the imported marker always came from the URL target. This confirms the native ESM behavior independently of the URL constructor and supports the SCO decoy-publication regression.