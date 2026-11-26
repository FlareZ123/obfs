#!/usr/bin/env python3
"""Regression tests for IPv4/IPv6 loopback and wildcard listener discovery."""
from __future__ import annotations

import importlib.util
import socket
import sys
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("agent49-hw-single-arm-network-probe.py")
SPEC = importlib.util.spec_from_file_location("agent49_hw_single_arm_probe", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"cannot load listener probe: {MODULE_PATH}")
PROBE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = PROBE
SPEC.loader.exec_module(PROBE)


def bind_listener(family: int, host: str):
    listener = socket.socket(family, socket.SOCK_STREAM)
    if family == socket.AF_INET6:
        listener.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
    try:
        listener.bind((host, 0))
        listener.listen(1)
        return listener
    except OSError:
        listener.close()
        return None


class LoopbackListenerTests(unittest.TestCase):
    def test_discovers_ipv4_loopback_range_and_wildcards(self):
        listeners = [
            bind_listener(socket.AF_INET, "127.0.0.1"),
            bind_listener(socket.AF_INET, "127.0.0.2"),
            bind_listener(socket.AF_INET, "0.0.0.0"),
        ]
        try:
            self.assertTrue(all(listener is not None for listener in listeners))
            endpoints = set(PROBE.loopback_listeners())
            candidate, alternate, wildcard = listeners
            self.assertIn(("127.0.0.1", candidate.getsockname()[1]), endpoints)
            self.assertIn(("127.0.0.2", alternate.getsockname()[1]), endpoints)
            self.assertIn(("127.0.0.1", wildcard.getsockname()[1]), endpoints)
        finally:
            for listener in listeners:
                if listener is not None:
                    listener.close()

    def test_discovers_ipv6_loopback_and_wildcard_when_available(self):
        loopback = bind_listener(socket.AF_INET6, "::1")
        wildcard = bind_listener(socket.AF_INET6, "::")
        if loopback is None or wildcard is None:
            for listener in (loopback, wildcard):
                if listener is not None:
                    listener.close()
            self.skipTest("IPv6 loopback listeners are unavailable on this runner")
        try:
            endpoints = set(PROBE.loopback_listeners())
            self.assertIn(("::1", loopback.getsockname()[1]), endpoints)
            self.assertIn(("::1", wildcard.getsockname()[1]), endpoints)
        finally:
            loopback.close()
            wildcard.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
