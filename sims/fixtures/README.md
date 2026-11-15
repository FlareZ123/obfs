# Local TLS benchmark fixtures

The localhost certificate and matching RSA private key are **public test material** used only by `sims/sco-tls-boundary.js`. The self-signed certificate is valid for localhost/127.0.0.1. The test pins this specific certificate as trusted and deliberately verifies that an otherwise untrusted client fails the TLS handshake.

**Never reuse this private key, certificate, or the benchmark authentication policy in any real service.** The benchmark's protected application key and bearer credential are freshly randomized per invocation and are separate from the published certificate private key.
