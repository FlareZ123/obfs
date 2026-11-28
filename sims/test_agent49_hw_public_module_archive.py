#!/usr/bin/env python3
"""Exact-byte, fail-closed public SCO module archive preflight regressions."""
from __future__ import annotations

import base64
import hashlib
import importlib.util
import io
import sys
import unittest
import urllib.error
from pathlib import Path
from unittest import mock

BASE_PATH = Path(__file__).with_name("agent2-hw-live-sco-benchmark.py")
sys.path.insert(0, str(BASE_PATH.parent))
SPEC = importlib.util.spec_from_file_location("agent2_hw_archive_benchmark", BASE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"cannot load live preflight: {BASE_PATH}")
BASE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = BASE
SPEC.loader.exec_module(BASE)

ORIGIN = "http://127.0.0.1:40123"
METHOD = "public-step-identifier"
SESSION = "public-session-value"
CANARY = "private-canary-marker"


class FakeResponse:
    """HTTP module reply exposing only a finite byte slice per read."""

    status = 200

    def __init__(self, body: bytes):
        self.body = body
        self.headers = {
            "Set-Cookie": f"session={SESSION}; HttpOnly; SameSite=Strict",
            "X-SCO-Method": METHOD,
        }
        self.requested_read_sizes = []

    def __enter__(self):
        return self

    def __exit__(self, _exc_type, _exc_value, _traceback):
        return False

    def read(self, size: int = -1):
        self.requested_read_sizes.append(size)
        return self.body if size < 0 else self.body[:size]


class PublicModuleArchiveTests(unittest.TestCase):
    def preflight(self, module: bytes, *, archive: bool = True):
        response = FakeResponse(module)
        requests = []

        def open_url(request, timeout=10):
            url = request if isinstance(request, str) else request.full_url
            requests.append(url)
            if url == ORIGIN + "/obfs/client.mjs":
                return response
            if url == ORIGIN + "/obfs/rpc":
                status = 403
            elif url == ORIGIN + "/obfs/reset":
                status = 404
            else:
                raise AssertionError(f"unexpected request: {url}")
            raise urllib.error.HTTPError(
                url, status, "expected negative", {}, io.BytesIO(b"denied")
            )

        with mock.patch.object(BASE.urllib.request, "urlopen", side_effect=open_url):
            result = BASE.preflight(
                ORIGIN, "/obfs/client.mjs", "/obfs/rpc",
                CANARY, SESSION, METHOD,
                archive_public_module=archive,
            )
        return result, response, requests

    def test_archives_exact_public_utf8_bytes_without_normalizing(self):
        raw = "export const café='🧪';\n".encode("utf-8")
        result, response, requests = self.preflight(raw)
        self.assertEqual(
            base64.b64decode(result["public_module_base64"], validate=True), raw
        )
        self.assertEqual(result["source_bytes"], len(raw))
        self.assertEqual(result["source_sha256"], hashlib.sha256(raw).hexdigest())
        self.assertFalse(result["source_disclosed"])
        self.assertEqual(response.requested_read_sizes, [1024 * 1024 + 1])
        self.assertEqual(requests, [
            ORIGIN + "/obfs/client.mjs",
            ORIGIN + "/obfs/rpc",
            ORIGIN + "/obfs/reset",
        ])

    def test_nonarchive_consumer_keeps_old_summary_contract(self):
        result, response, _requests = self.preflight(b"export const a=2;", archive=False)
        self.assertNotIn("public_module_base64", result)
        self.assertEqual(result["source_bytes"], len(b"export const a=2;"))
        self.assertEqual(response.requested_read_sizes, [1024 * 1024 + 1])

    def test_oversized_public_body_refused_before_rpc(self):
        raw = b"X" * (1024 * 1024 + 1)
        response = FakeResponse(raw)
        calls = []

        def open_url(request, timeout=10):
            calls.append(request if isinstance(request, str) else request.full_url)
            return response

        with mock.patch.object(BASE.urllib.request, "urlopen", side_effect=open_url):
            with self.assertRaisesRegex(AssertionError, "exceeds one-MiB"):
                BASE.preflight(
                    ORIGIN, "/obfs/client.mjs", "/obfs/rpc",
                    CANARY, SESSION, METHOD, archive_public_module=True
                )
        self.assertEqual(calls, [ORIGIN + "/obfs/client.mjs"])
        self.assertEqual(response.requested_read_sizes, [1024 * 1024 + 1])

    def test_invalid_utf8_refused(self):
        with self.assertRaises(UnicodeDecodeError):
            self.preflight(b"\xff")

    def test_private_marker_in_public_bytes_refused(self):
        with self.assertRaisesRegex(AssertionError, "private source marker"):
            self.preflight(("const leaked='" + CANARY + "'").encode("utf-8"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
