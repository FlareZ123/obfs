# WHATWG IPv4 alias consistency for COO and SCO host policy

22 November 2026. **Intermediate correctness and routing-policy hardening**, not an execution-authentication or anti-cloning result.

## Failure mode and repair

An ASCII allowlist entry such as `127.1` or `1.2.3.004` passed the earlier `src/hosts.js` grammar unchanged, while a browser's `location.hostname` uses the WHATWG URL host parser and yields `127.0.0.1` or `1.2.3.4`. An otherwise authorized COO/SCO client could therefore reject execution. The server-side SCO `Host` filter also compared raw, uncanonicalized DNS/IPv4 spelling against the allowlist.

The repair preserves the existing ASCII character grammar for declarative hosts, then canonicalizes accepted host names with the Node WHATWG `URL` parser. Both the browser guard's embedded list and the SCO HTTP routing filter now agree on normalized IPv4 aliases. Invalid numeric hosts that fail URL parsing are rejected before output or server startup. Nonbracketed incoming `Host` fields reject malformed ports, userinfo, paths and extra colon suffixes rather than silently splitting at the first colon.

Representative cases:

| Input | Browser-equivalent canonical hostname | Policy behavior |
| --- | --- | --- |
| `127.1` | `127.0.0.1` | allow when declared |
| `0x7f000001` | `127.0.0.1` | same allowlist entry |
| `1.2.3.004` | `1.2.3.4` | allow when declared |
| `ExAmPlE.cOm` | `example.com` | unchanged case-folding |
| `1.2.3.999` | invalid numeric host | reject configuration / route |
| `127.1:invalid` | invalid port | reject incoming route |
| `127.1@evil.example` | userinfo suffix | reject incoming route |

WHATWG canonicalization is defined by the [URL Standard](https://url.spec.whatwg.org/); MDN documents that the browser [`URL.hostname`](https://developer.mozilla.org/en-US/docs/Web/API/URL/hostname) normalizes IPv4, IPv6 and IDN hostnames.

## Reproduction and scope

Source commit [`86f9ecb636f77ccdf3b8010fd1f9995218c046b1`](https://github.com/FlareZ123/obfs/commit/86f9ecb636f77ccdf3b8010fd1f9995218c046b1) contains the changes to `src/hosts.js` and the three deterministic regressions in `test/sco-host-ipv4-alias.test.js`.

The source-pinned [two-platform focused run 45042333383](https://github.com/FlareZ123/obfs/actions/runs/45042333383) **passed on Ubuntu and Windows**, Node 22.23.4. All three tests passed with zero failures on both runners, alongside strict project and external JSDoc checks. The tests verify canonicalization and negative malformed inputs, a COO generated execution guard inside a VM context, and real SCO HTTP read routing with requester-supplied `Host` fields. The two runners used the exact same source SHA.

A separately dispatched full validation of this exact source is [run 45042417793](https://github.com/FlareZ123/obfs/actions/runs/45042417793); its final outcome must be checked independently before claiming full-suite passage.

## Limitations and operational impact

This change is a compatibility improvement for equivalent URL hostnames and a stricter parsing rule for malformed routing headers. Integrations relying on an invalid port suffix being ignored by SCO may need to correct their reverse proxy configuration.

**HTTP `Host` remains fully requester-controlled.** A matching host header does not authenticate a caller, verify the actual browser origin, or constrain an attacker in control of the client runtime. SCO deployments still require trusted `authorizeRead`, `authorizeRpc` and `authorizeOperation` policies. COO remains subject to the prompt's fully controllable browser attacker.

The change only affects hostname preflight and generated guard constants, so no hot-path obfuscated compute transformation is added. No universal 2.5× bound, runtime-extraction resistance, or strong protection claim follows.
