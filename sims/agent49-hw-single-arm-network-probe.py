#!/usr/bin/env python3
"""Assert that one active arm has no alternate local service oracle."""
from __future__ import annotations

import argparse
import hashlib
import http.client
import ipaddress
import json
import os
import shutil
import subprocess
from urllib.parse import urlsplit

from agent2_hw_process_isolation import process_security_state

# The probe contacts every discoverable local TCP listener, including unrelated
# services. Bound reads from services that mimic SCO headers.
MAX_PUBLIC_MODULE_BYTES = 1024 * 1024


def _connect_host_v4(address_hex: str) -> str | None:
    """Decode a connectable local IPv4 bind address from /proc/net/tcp."""
    address = ipaddress.IPv4Address(bytes.fromhex(address_hex)[::-1])
    if address.is_unspecified:
        return "127.0.0.1"
    if address.is_multicast:
        return None
    return str(address)


def _connect_host_v6(address_hex: str) -> str | None:
    """Decode a connectable local IPv6 bind address from /proc/net/tcp6."""
    raw = bytes.fromhex(address_hex)
    if len(raw) != 16:
        return None
    network_order = b"".join(raw[offset:offset + 4][::-1] for offset in range(0, 16, 4))
    address = ipaddress.IPv6Address(network_order)
    mapped = address.ipv4_mapped
    if mapped is not None:
        if mapped.is_unspecified:
            return "127.0.0.1"
        if mapped.is_multicast:
            return None
        return str(mapped)
    if address.is_unspecified:
        return "::1"
    if address.is_multicast or address.is_link_local:
        # /proc/net/tcp6 does not provide the interface scope ID required by
        # link-local IPv6 connect() calls. Do not invent one.
        return None
    return str(address)


def local_tcp_listeners() -> list[tuple[str, int]]:
    """List connectable local IPv4/IPv6 TCP listener endpoints, including interface binds."""
    endpoints: set[tuple[str, int]] = set()
    sources = (
        ("/proc/net/tcp", _connect_host_v4),
        ("/proc/net/tcp6", _connect_host_v6),
    )
    for path, decode_host in sources:
        try:
            handle = open(path, "r", encoding="ascii")
        except FileNotFoundError:
            continue
        with handle:
            next(handle, None)
            for line in handle:
                fields = line.split()
                if len(fields) < 4 or fields[3] != "0A":
                    continue
                address_hex, separator, port_hex = fields[1].partition(":")
                if not separator:
                    continue
                host = decode_host(address_hex)
                if host is not None:
                    endpoints.add((host, int(port_hex, 16)))
    return sorted(endpoints)


def public_module(host: str, port: int):
    """Return metadata only for a matching SCO module; ignore unrelated local TCP services."""
    connection = http.client.HTTPConnection(host, port, timeout=0.5)
    try:
        connection.request("GET", "/obfs/client.mjs", headers={"Cache-Control": "no-store"})
        response = connection.getresponse()
        cookie_header = response.getheader("Set-Cookie")
        method_name = response.getheader("X-SCO-Method")
        # Ignore unrelated endpoints before reading any body at all.
        if response.status != 200 or not cookie_header or not method_name:
            return None
        cookie = cookie_header.split(";", 1)[0]
        if not cookie.startswith("session="):
            return None
        metadata = {
            "cookie_sha256": hashlib.sha256(cookie.encode()).hexdigest(),
            "method_name": method_name,
        }
        # Content-Length is only a preliminary shortcut. An endpoint may omit
        # or lie about it; always limit the actual read to MAX + 1 bytes.
        declared = response.length
        if declared is not None and declared > MAX_PUBLIC_MODULE_BYTES:
            return {
                **metadata, "module_sha256": None, "module_bytes": declared,
                "module_oversized": True,
            }
        body = response.read(MAX_PUBLIC_MODULE_BYTES + 1)
        if len(body) > MAX_PUBLIC_MODULE_BYTES:
            return {
                **metadata, "module_sha256": None, "module_bytes": len(body),
                "module_oversized": True,
            }
        if declared is not None and len(body) != declared:
            return None
        return {
            **metadata,
            "module_sha256": hashlib.sha256(body).hexdigest(),
            "module_bytes": len(body),
        }
    except (OSError, http.client.HTTPException, ValueError):
        return None
    finally:
        connection.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--origin", required=True, help="only the currently active service origin")
    args = parser.parse_args()
    parsed = urlsplit(args.origin)
    if parsed.scheme != "http" or parsed.hostname != "127.0.0.1" or parsed.port is None:
        raise ValueError("expected an explicit 127.0.0.1 HTTP origin")
    candidate_host = parsed.hostname
    candidate_port = parsed.port
    candidate_endpoint = (candidate_host, candidate_port)

    security = process_security_state(os.getpid())
    sudo = shutil.which("sudo")
    sudo_result = (
        subprocess.run([sudo, "-n", "/usr/bin/id", "-u"], capture_output=True, text=True, timeout=5)
        if sudo else None
    )
    sudo_blocked = sudo_result is None or sudo_result.returncode != 0
    candidate = public_module(candidate_host, candidate_port)
    if candidate is None:
        raise RuntimeError("active service did not issue a usable public module")
    if candidate.get("module_oversized"):
        raise RuntimeError("active SCO module exceeds bounded local-probe read limit")

    visible_endpoints = local_tcp_listeners()
    if candidate_endpoint not in visible_endpoints:
        raise RuntimeError("active service listener was not visible in /proc/net/tcp or tcp6")

    alternate_services = []
    for host, port in visible_endpoints:
        if (host, port) == candidate_endpoint:
            continue
        alternate = public_module(host, port)
        if alternate is not None:
            alternate_services.append({"host": host, "port": port, **alternate})

    result = {
        "status": "single_arm_isolated" if not alternate_services else "alternate_local_oracle_found",
        "uid": os.getuid(),
        "euid": os.geteuid(),
        "environment_keys": sorted(os.environ.keys()),
        "no_new_privs": security["NoNewPrivs"],
        "cap_eff": security["CapEff"],
        "cap_bnd": security["CapBnd"],
        "sudo_blocked": sudo_blocked,
        "candidate_host": candidate_host,
        "candidate_port": candidate_port,
        "visible_local_listeners": [
            {"host": host, "port": port} for host, port in visible_endpoints
        ],
        "visible_local_listener_ports": sorted({port for _host, port in visible_endpoints}),
        "candidate_module": candidate,
        "alternate_services": alternate_services,
    }
    print(json.dumps(result, sort_keys=True), flush=True)
    if alternate_services:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
