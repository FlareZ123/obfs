#!/usr/bin/env python3
"""Prove whether an isolated learner can reach the simultaneously running control arm."""
from __future__ import annotations

import argparse
import hashlib
import http.client
import importlib.util
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit

from agent2_hw_process_isolation import process_security_state


def loopback_listeners() -> list[int]:
    """Enumerate IPv4 loopback LISTEN ports visible in this network namespace."""
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


def get_public_cookie(port: int):
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
            "cookie": cookie,
            "method_name": method_name,
            "module_sha256": hashlib.sha256(body).hexdigest(),
            "module_bytes": len(body),
        }
    finally:
        connection.close()


def authorized_step(port: int, cookie: str, method_name: str):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=2)
    try:
        body = json.dumps({"method": method_name, "args": [0]}, separators=(",", ":"))
        connection.request(
            "POST",
            "/obfs/rpc",
            body=body,
            headers={
                "Content-Type": "application/json",
                "Cookie": cookie,
                "Cache-Control": "no-store",
            },
        )
        response = connection.getresponse()
        raw = response.read()
        payload = json.loads(raw)
        return response.status, payload
    finally:
        connection.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--origin", required=True, help="only the candidate SCO origin")
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

    candidate = get_public_cookie(candidate_port)
    if candidate is None:
        raise RuntimeError("candidate public module did not issue a usable session cookie")

    visible_ports = loopback_listeners()
    if candidate_port not in visible_ports:
        raise RuntimeError("candidate listener was not visible in /proc/net/tcp")

    for port in visible_ports:
        if port == candidate_port:
            continue
        alternate = get_public_cookie(port)
        if alternate is None:
            continue
        status, payload = authorized_step(port, alternate["cookie"], alternate["method_name"])
        if status == 200 and payload.get("ok") is True:
            result = {
                "status": "cross_arm_oracle_reproduced",
                "uid": os.getuid(),
                "euid": os.geteuid(),
                "environment_keys": sorted(os.environ.keys()),
                "no_new_privs": security["NoNewPrivs"],
                "cap_eff": security["CapEff"],
                "cap_bnd": security["CapBnd"],
                "sudo_blocked": sudo_blocked,
                "candidate_port": candidate_port,
                "visible_loopback_listener_ports": visible_ports,
                "alternate_port": port,
                "candidate_cookie_sha256": hashlib.sha256(candidate["cookie"].encode()).hexdigest(),
                "alternate_cookie_sha256": hashlib.sha256(alternate["cookie"].encode()).hexdigest(),
                "cookies_equal": candidate["cookie"] == alternate["cookie"],
                "method_names_equal": candidate["method_name"] == alternate["method_name"],
                "candidate_module_sha256": candidate["module_sha256"],
                "alternate_module_sha256": alternate["module_sha256"],
                "alternate_module_bytes": alternate["module_bytes"],
                "alternate_authorized_status": status,
                "alternate_rpc_value": payload.get("value"),
            }
            print(json.dumps(result, sort_keys=True), flush=True)
            return

    raise RuntimeError(
        "no alternate local listener issued a public module and accepted an authorized step"
    )


if __name__ == "__main__":
    main()
