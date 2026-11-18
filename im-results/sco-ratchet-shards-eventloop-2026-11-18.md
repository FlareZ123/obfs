# Synchronous event-loop CPU contention survives SCO account-sharded SQLite

**Agent 41, 18 November 2026. Source-pinned intermediate negative result.**

## Hypothesis and controlled comparison

The earlier two-process [SQLite shard differential](sco-ratchet-account-shards-2026-11-18.md) removed B's delay from an A-held *database-wide writer lock*. The separately [preregistered follow-up](../workplace/sco-ratchet-shards-eventloop-preregister-2026-11-18.md) asks whether per-account SQLite files also prevent an authenticated B request from waiting behind synchronous A private HMAC work **in the same Node.js event loop**.

The test holds the private root, original 8 MiB/event HMAC ratchet, original compiler-generated SCO RPC facade, two verified cookies, and single trusted Node HTTP process constant. It compares the one-file SQLite control to explicit A/B SHA-256-named SQLite shards, each with a matching isolation key. Both SQLite configurations are preinitialized.

A's legitimate RPC computes **64 consecutive protected HMAC events**, and a second B client independently submits its own correct two-event RPC. The test-only child atomically writes a filesystem marker immediately *before* A enters the private 64-event batch; the independent parent detects it, submits B, and asserts the A HTTP response remains unsettled at submission. Native reference HMAC outputs, HTTP 200, A/B state, and public source SHA are all checked. Each arm ran three measured trials with unrelated B inputs and sequential A/B states. Quiet B HTTP latency without A work and quiet direct-native B two-event computation were recorded for each trial.

## Validation and raw evidence

- Source-pinned [Linux/Windows Node 22 and strict JSDoc CI 44276797430](https://github.com/FlareZ123/obfs/actions/runs/44276797430) at `e8b6236272564bab2cbd79ad44c4fc03debc6e41` **completed success on both OSes**.
- Executable: [sims/sco-ratchet-shards-eventloop.js](../sims/sco-ratchet-shards-eventloop.js), trusted test-only marker in [HTTP child](../sims/sco-ratchet-transactional-http-child.js), under [manual targeted workflow](../.github/workflows/manual-sco-account-shards.yml).
- The generated facade was **539 bytes** in each arm and retained SHA-256 `44f39484cf0d5c52b38343d702e57050e88baa7eef7df61df715b103c242f326`. Both arms committed **192 A events and 12 B events** with original HMAC parity. Every trial proved B submission after the A-work marker while the A HTTP response remained outstanding.

All values below are milliseconds for three independently measured pairs per arm. Strict ratios are loaded B HTTP wall time divided by direct original two-HMAC wall time, **not** CPU overhead.

| OS and store | Quiet B HTTP wall | Loaded B HTTP wall | Direct-native B wall | Loaded/direct ratios |
| --- | --- | --- | --- | --- |
| Ubuntu, shared | 19.471, 15.059, 15.025 | 304.168, 302.735, 303.732 | 9.093, 9.088, 9.066 | 33.45097, 33.30993, 33.50347 |
| Ubuntu, shards | 16.538, 13.493, 13.008 | 302.609, 300.331, 300.857 | 9.060, 9.050, 9.062 | 33.40103, 33.18393, 33.19993 |
| Windows, shared | 38.421, 21.568, 17.566 | 354.643, 365.657, 355.238 | 10.608, 10.615, 10.936 | 33.43231, 34.44786, 32.48250 |
| Windows, shards | 34.740, 19.596, 19.530 | 371.814, 362.285, 477.186 | 10.637, 10.680, 10.579 | 34.95410, 33.92276, 45.10562 |

Median loaded B wall latencies: **303.732 ms shared versus 300.857 ms shards (Ubuntu)**; **355.238 ms versus 371.814 ms (Windows)**. All **6/6** shared-file and **6/6** sharded B loaded requests strictly exceeded 2.5× the direct-native two-event **wall** baseline. Quiet B median HTTP latencies were **15.059/13.493 ms Ubuntu** and **21.568/19.596 ms Windows**, respectively. The Windows shard third trial (`477.186 ms`) is retained as an observed tail, rather than discarded as an outlier.

## Decision

In the measured single Node process, storage-level per-account writers did **not** allow a B HTTP callback to execute during CPU-bound synchronous A private HMAC. The meaningful advantage in the prior two-process case was removal of one **cross-process SQLite writer lock**, with separate event loops able to run B work. Ordinary synchronous Node services share this execution scheduling limit; it cannot be credited as a difference in generated SCO obfuscation.

The experiment proves only B was *submitted while A's private work was outstanding*, using the trusted marker and pending A response. It does not instrument the precise kernel receipt time at the server or isolate scheduling from all network-stack variability. Since end-to-end request time includes queueing and HTTP, these ratios cannot establish that the obfuscated implementation consumed over 2.5× original CPU compute. Worker threads or separate worker processes and quotas would require equal-trust matched experiments, and prior [worker results](sco-ratchet-worker-http-contention-2026-11-18.md) already explore a narrower single-A case. Same-account A online relaying, many-account saturation and source reconstruction are unchanged. The primary [release decision remains blocked](../results/README.md).
