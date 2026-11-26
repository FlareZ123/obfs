#!/usr/bin/env python3
"""Assert that one active arm has no alternate local service oracle."""
from __future__ import annotations

import argparse
import hashlib
import http.client
import json
import os
import shutil
import subprocess
import sys
from urllib.parse import urlsplit

from agent2_hw_process_isolation import process_security_state


def loopback_listeners() -> list[int]:
    ports: set[int] = set()
    with open("/proc/net/tcp", "r", encoding="ascii") as handle:
        next(handle, None)
        for line in handle:
            fields = line.split()
            if len(fields) < 4 or fields[3] != "0A":
                continue
            address, separator, port_hex = fields[1].partition(":")
            if separator and address.upper() == "0100007F":
                ports.add(int(port_hex, 16))
    return sorted(ports)


def public_module(port: int):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=2)
    try:
        connection.request("GET", "/obfs/client.mjs", headers={"Cache-Control": "no-store"})
        response = connection.getresponse()
        body = response.read()
        cookie_header = response.getheader("Set-Cookie")
        method_name = response.getheader("X-SCO-Method")
        if response.status != 200 or not cookie_header or not method_name:
            return None
        cookie = cookie_header.split(";", 1)[0]
        if not cookie.startswith("session="):
            return None
        return {
            "cookie_sha256": hashlib.sha256(cookie.encode()).hexdigest(),
            "method_name": method_name,
            "module_sha256": hashlib.sha256(body).hexdigest(),
            "module_bytes": len(body),
        }
    finally:
        connection.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--origin", required=True, help="only the currently active service origin")
    args = parser.parse_args()
    parsed = urlsplit(args.origin)
    if parsed.scheme != "http" or parsed.hostname != "127.0.0.1" or parsed.port is None:
        raise ValueError("expected an explicit 127.0.0.1 HTTP origin")
    candidate_port = parsed.port

    security = process_security_state(os.getpid())
    sudo = shutil.which("sudo")
    sudo_result = (
        subprocess.run([sudo, "-n", "/usr/bin/id", "-u"], capture_output=True, text=True, timeout=5)
        if sudo else None
    )
    sudo_blocked = sudo_result is None or sudo_result.returncode != 0
    candidate = public_module(candidate_port)
    if candidate is None:
        raise RuntimeError("active service did not issue a usable public module")

    visible_ports = loopback_listeners()
    if candidate_port not in visible_ports:
        raise RuntimeError("active service listener was not visible in /proc/net/tcp")

    alternate_services = []
    for port in visible_ports:
        if port == candidate_port:
            continue
        alternate = public_module(port)
        if alternate is not None:
            alternate_services.append({"port": port, **alternate})

    result = {
        "status": "single_arm_isolated" if not alternate_services else "alternate_local_oracle_found",
        "uid": os.getuid(),
        "euid": os.geteuid(),
        "environment_keys": sorted(os.environ.keys()),
        "no_new_privs": security["NoNewPrivs"],
        "cap_eff": security["CapEff"],
        "cap_bnd": security["CapBnd"],
        "sudo_blocked": sudo_blocked,
        "candidate_port": candidate_port,
        "visible_loopback_listener_ports": visible_ports,
        "candidate_module": candidate,
        "alternate_services": alternate_services,
    }
    print(json.dumps(result, sort_keys=True), flush=True)
    if alternate_services:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
