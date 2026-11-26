#!/usr/bin/env python3
"""Regression tests for connectable local IPv4/IPv6 TCP listener discovery."""
from __future__ import annotations

import importlib.util
import ipaddress
import socket
import sys
import threading
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("agent49-hw-single-arm-network-probe.py")
SPEC = importlib.util.spec_from_file_location("agent49_hw_single_arm_probe", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"cannot load listener probe: {MODULE_PATH}")
PROBE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = PROBE
SPEC.loader.exec_module(PROBE)


def route_selected_ipv4() -> str | None:
    """Find the local IPv4 source address selected for a route, without sending a packet."""
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("192.0.2.1", 9))
        address = probe.getsockname()[0]
        parsed = ipaddress.IPv4Address(address)
        return address if not parsed.is_loopback and not parsed.is_unspecified else None
    except OSError:
        return None
    finally:
        probe.close()


def route_selected_ipv6() -> str | None:
    """Find a global/non-loopback IPv6 source address when the runner has a route."""
    probe = socket.socket(socket.AF_INET6, socket.SOCK_DGRAM)
    try:
        probe.connect(("2001:db8::1", 9))
        address = probe.getsockname()[0].split("%", 1)[0]
        parsed = ipaddress.IPv6Address(address)
        if parsed.is_loopback or parsed.is_unspecified or parsed.is_link_local or parsed.is_multicast:
            return None
        return address
    except OSError:
        return None
    finally:
        probe.close()


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


class LocalTcpListenerTests(unittest.TestCase):
    def test_discovers_ipv4_loopback_range_and_wildcards(self):
        listeners = [
            bind_listener(socket.AF_INET, "127.0.0.1"),
            bind_listener(socket.AF_INET, "127.0.0.2"),
            bind_listener(socket.AF_INET, "0.0.0.0"),
        ]
        try:
            self.assertTrue(all(listener is not None for listener in listeners))
            endpoints = set(PROBE.local_tcp_listeners())
            candidate, alternate, wildcard = listeners
            self.assertIn(("127.0.0.1", candidate.getsockname()[1]), endpoints)
            self.assertIn(("127.0.0.2", alternate.getsockname()[1]), endpoints)
            self.assertIn(("127.0.0.1", wildcard.getsockname()[1]), endpoints)
        finally:
            for listener in listeners:
                if listener is not None:
                    listener.close()

    def test_discovers_specific_nonloopback_ipv4_bind_address_when_available(self):
        host = route_selected_ipv4()
        if host is None:
            self.skipTest("runner has no non-loopback IPv4 route")
        listener = bind_listener(socket.AF_INET, host)
        if listener is None:
            self.skipTest(f"cannot bind selected local IPv4 address {host}")
        try:
            endpoints = set(PROBE.local_tcp_listeners())
            self.assertIn((host, listener.getsockname()[1]), endpoints)
        finally:
            listener.close()

    def test_discovers_specific_nonloopback_ipv6_bind_address_when_available(self):
        host = route_selected_ipv6()
        if host is None:
            self.skipTest("runner has no non-loopback IPv6 route")
        listener = bind_listener(socket.AF_INET6, host)
        if listener is None:
            self.skipTest(f"cannot bind selected local IPv6 address {host}")
        try:
            endpoints = set(PROBE.local_tcp_listeners())
            self.assertIn((host, listener.getsockname()[1]), endpoints)
        finally:
            listener.close()

    def test_non_http_listener_is_ignored(self):
        listener = bind_listener(socket.AF_INET, "127.0.0.3")
        self.assertIsNotNone(listener)
        listener.settimeout(2)
        banner_sent = threading.Event()

        def send_ssh_banner():
            try:
                connection, _address = listener.accept()
                with connection:
                    connection.sendall(b"SSH-2.0-OpenSSH_10.2p1 Ubuntu-2ubuntu3.8\r\n")
                    banner_sent.set()
            except OSError:
                pass

        worker = threading.Thread(target=send_ssh_banner, daemon=True)
        worker.start()
        try:
            self.assertIsNone(
                PROBE.public_module("127.0.0.3", listener.getsockname()[1])
            )
            self.assertTrue(banner_sent.wait(timeout=2), "probe did not receive the SSH banner")
        finally:
            listener.close()
            worker.join(timeout=2)
            self.assertFalse(worker.is_alive(), "SSH listener test thread did not stop")

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
