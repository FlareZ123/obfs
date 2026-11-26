# Agent 49: bearer tokens delivered to hostile clients cannot enforce domain identity

**Date:** 2026-11-26  
**Evidence context:** live hW SCO harness, including cross-arm reproduction run 22 and sequential correction runs 23–26.

## Claim and assumptions

Assume:
1. A client can make requests to a public token/module endpoint.
2. The endpoint returns a bearer credential (T) to that client, whether in a response body, a `Set-Cookie` header, or another observable channel.
3. The attacker controls the client runtime and can inspect network traffic, headers, memory, DevTools, or use a custom HTTP client.
4. The server authorizes later requests solely because the caller presents (T).

Then (T) is not a secret from that attacker. The attacker can obtain it through the same public endpoint and replay it. Hiding (T) from static source text does not change this: dynamic observation of the response reveals it. A cookie marked `HttpOnly` is still observable to a network-intercepting attacker or a custom client; `HttpOnly` only restricts ordinary page JavaScript access.

This is a conditional design boundary, not a claim that server-side authorization is impossible. It says a credential delivered to an attacker-controlled client cannot, by itself, prove that the caller is the authorized browser, device, domain, or URL.

## Why common browser checks are not an authorization boundary

- A JavaScript check of `window.location.hostname`, `document.referrer`, or a client-supplied URL can be patched or instrumented.
- `Origin` and `Referer` checks can help enforce browser policy, but a direct HTTP client can construct those headers. They do not authenticate an arbitrary caller under this threat model.
- CORS constrains compliant browsers; it does not constrain an attacker using DevTools, a custom HTTP client, or an instrumented runtime.
- `SameSite`, `Secure`, and `HttpOnly` cookie attributes are useful browser protections but do not make an observed bearer value secret from a client controller.
- Short-lived or rotating tokens reduce replay windows but do not stop an attacker who can request fresh tokens and has unlimited legitimate requests.

## Harness evidence

The hW server's public `GET /obfs/client.mjs` endpoint issues a session cookie in `Set-Cookie`. The public module body does not contain the token, so the existing `session_token_in_public_module=false` check is true but insufficient to establish token secrecy.

In the concurrent-arm reproduction (run 22), a learner running as UID/EUID 65534, with zero capabilities, NoNewPrivs, blocked sudo, and a scrubbed environment:
- received only the candidate SCO origin;
- enumerated loopback listeners;
- fetched the ordinary service's public module from the alternate port;
- obtained its own session cookie;
- completed an authorized RPC.

The exact receipt is in `im-results/agent49-hw-cross-arm-network-oracle-2026-11-26.md`. The later sequential correction removes the *other-arm* oracle during each learner run, but it does not make a cookie delivered by the active service secret from that service's own client controller.

## Design implications for SCO and domain/URL locking

1. Treat a client-delivered token as a bearer capability, not as proof of domain identity or trusted client integrity.
2. Do not rely on a hidden URL, token, cookie, or JavaScript hostname check as the sole enforcement mechanism.
3. Keep sensitive decisions and state on the server; authorize them against an external principal or proof that the attacker cannot mint from the client runtime.
4. If device/domain binding is required, use an independently trusted signal such as authenticated user sessions, server-to-server credentials, hardware-backed keys/attestation, or a trusted deployment boundary. These have their own deployment and compatibility costs.
5. If no such external trust exists, describe domain locking as deterrence against casual copying rather than a hard security guarantee.
6. Keep CORS and cookie attributes as defense-in-depth, not as substitutes for server authorization.

## Limitations

This is a conditional protocol argument based on the stated hostile-client capabilities. It does not evaluate any particular production authentication provider, hardware attestation scheme, TLS client-certificate deployment, or authenticated user flow. The hW harness is a toy finite-state API and its session cookie is a test mechanism, not a production credential.

Keep this as an intermediate design-boundary note in `im-results/`, not as a novel academic result.
