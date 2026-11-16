# SCO global queue capacity before asynchronous principal lookup

**Status:** bounded trusted-server resource-admission hardening; not a client deobfuscation or hostile-server secrecy result.

## Observed issue

`createScoKeyedIsolation(principalOf,{maxPendingTotal:N})` formerly invoked and awaited the asynchronous identity resolver **before** checking the aggregate in-flight capacity. A resolver that stalled on an external session lookup could accumulate arbitrary unresolved invocations and resource work without incrementing `totalPending`. Legitimate or hostile clients need only initiate authenticated-size RPC requests to reach this resolver, subject to existing HTTP body size and front-door limits. The per-principal limit cannot apply until the principal is known.

## Reproduction

- **Red**: immutable source `dcfc667f5ffd67542d9692dbc22b8e4ee9d62916`, [two-platform SCO authorization run 43983364932](https://github.com/FlareZ123/obfs/actions/runs/43983364932). Ubuntu and Windows each failed two newly added negative controls: the direct helper passed two lookups through `maxPendingTotal:1`, and the native authenticated-HTTP request did not return 429 while the first lookup was unresolved, timing out instead. The formerly present failed-resolver recovery test passed on that source and was not a discriminating red control.
- **Green candidate**: `src/rpc-keyed-isolation.js` reserves one process-local global slot synchronously before invoking `principalOf`, decrements it in an outer `finally`, retains the identity-specific FIFO queue and the existing single-execution handler contract. An overflow throws `ScoIsolationBusyError` before lookup, which the HTTP handler maps to generic 429 when private execution has not begun.
- The new suite in `test/sco-keyed-capacity.test.js` checks direct lookup count, isolated work exclusion, recovery after a rejected lookup, and real-HTTP saturation/recovery. Green confirmation must be pinned to a reproducible CI run before claiming deployment readiness.

## Threat and cost boundaries

With `maxPendingTotal` configured as a finite positive integer, the helper bounds simultaneous **resolver + queued + executing** work that reaches this particular handler instance. It cannot cap pre-isolation HTTP request parsing, time spent accepting connections, or unrelated Node handlers. The default global cap is deliberately `Infinity` for compatibility. Separate per-principal limits still start only **after** a verified identity is available. Global capacity may admit unfairly: one account can exhaust slots for other accounts, and independent process/cluster workers have independent accounting.

The implementation adds one integer reservation check and outer finally per admitted request. No independent full-session 2.5× performance measurement or universal source/tamper protection can be inferred from this scope. A paired representative-cost experiment would be necessary to justify performance generalization.
