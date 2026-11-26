#!/usr/bin/env python3
"""Probe whether an untrusted learner can inspect a separate local server process.

The parent orchestrator launches a server as www-data and a client as nobody.
The client receives only a public HTTP URL, a private-file path to test, and PIDs
for access-denial checks. The parent uses a scrubbed environment and no shared
private directory. This is a host-UID/no-new-privileges probe, not a container
or kernel-exploit proof.
"""
from __future__ import annotations

import argparse
import json
import os
import pwd
import shutil
import signal
import subprocess
import sys
import tempfile
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path


def serve() -> None:
    private_root = tempfile.mkdtemp(prefix="agent49-private-")
    os.chmod(private_root, 0o700)
    private_file = Path(private_root) / "target-fixture.json"
    private_file.write_text('{"secret":"not-for-learner"}', encoding="utf-8")
    private_file.chmod(0o600)

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            body = b"public-pong"
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args):
            pass

    httpd = HTTPServer(("127.0.0.1", 0), Handler)
    ready = {
        "pid": os.getpid(),
        "uid": os.getuid(),
        "port": httpd.server_address[1],
        "private_root": private_root,
        "private_file": str(private_file),
        "private_root_mode": oct(os.stat(private_root).st_mode & 0o777),
        "private_file_mode": oct(os.stat(private_file).st_mode & 0o777),
        "environment_keys": sorted(os.environ),
    }
    print("READY " + json.dumps(ready), flush=True)
    try:
        httpd.serve_forever(poll_interval=0.1)
    finally:
        httpd.server_close()


def proc_status(pid: int) -> dict[str, str]:
    wanted = {"NoNewPrivs", "CapEff", "CapBnd"}
    state = {}
    with open(f"/proc/{pid}/status", "r", encoding="ascii") as handle:
        for line in handle:
            key, separator, value = line.partition(":")
            if separator and key in wanted:
                state[key] = value.strip().split()[0]
    if wanted - set(state):
        raise RuntimeError(f"missing privilege status fields for pid {pid}: {state}")
    return state


def denied(path: str) -> bool:
    fd = None
    try:
        fd = os.open(path, os.O_RDONLY | getattr(os, "O_NONBLOCK", 0))
        os.read(fd, 1)
        return False
    except OSError as error:
        return error.errno in (1, 13)  # EPERM / EACCES
    finally:
        if fd is not None:
            os.close(fd)


def client(args) -> None:
    try:
        server_cmdline = Path(f"/proc/{args.server_pid}/cmdline").read_bytes().replace(b"\x00", b" ").decode("utf-8", "replace")
        cmdline_safe = args.private_file not in server_cmdline and "not-for-learner" not in server_cmdline
    except OSError:
        cmdline_safe = True  # Hiding cmdline entirely is also acceptable.
    own_status = proc_status(os.getpid())
    server_status = proc_status(args.server_pid)
    checks = {
        "uid_is_nobody": os.getuid() == args.expected_client_uid,
        "euid_is_nobody": os.geteuid() == args.expected_client_uid,
        "private_file_denied": denied(args.private_file),
        "server_environ_denied": denied(f"/proc/{args.server_pid}/environ"),
        "server_cmdline_has_no_private_data": cmdline_safe,
        "server_memory_denied": denied(f"/proc/{args.server_pid}/mem"),
        "server_fd_directory_denied": denied(f"/proc/{args.server_pid}/fd/0"),
        "parent_environ_denied": denied(f"/proc/{args.parent_pid}/environ"),
        "parent_memory_denied": denied(f"/proc/{args.parent_pid}/mem"),
        "parent_fd_directory_denied": denied(f"/proc/{args.parent_pid}/fd/0"),
        "no_new_privs": own_status["NoNewPrivs"] == "1",
        "cap_eff_empty": own_status["CapEff"] == "0000000000000000",
        "cap_bnd_empty": own_status["CapBnd"] == "0000000000000000",
        "server_no_new_privs": server_status["NoNewPrivs"] == "1",
        "server_cap_eff_empty": server_status["CapEff"] == "0000000000000000",
        "server_cap_bnd_empty": server_status["CapBnd"] == "0000000000000000",
    }
    required_env = {"PATH", "HOME", "TMPDIR", "LANG", "PYTHONNOUSERSITE", "PYTHONHASHSEED", "PYTHONDONTWRITEBYTECODE"}
    allowed_env = required_env | {"LD_LIBRARY_PATH"}
    checks["environment_scrubbed"] = required_env.issubset(os.environ) and set(os.environ).issubset(allowed_env)
    sudo_path = shutil.which("sudo")
    if sudo_path:
        attempt = subprocess.run(
            [sudo_path, "-n", "true"], capture_output=True, text=True, timeout=5
        )
        checks["sudo_blocked"] = attempt.returncode != 0
    else:
        checks["sudo_blocked"] = True

    with urllib.request.urlopen(args.url, timeout=5) as response:
        checks["http_reachable"] = response.status == 200 and response.read() == b"public-pong"
    result = {"status": "pass" if all(checks.values()) else "fail", "uid": os.getuid(),
              "euid": os.geteuid(), "checks": checks, "environment_keys": sorted(os.environ)}
    print(json.dumps(result, sort_keys=True), flush=True)
    if result["status"] != "pass":
        raise SystemExit(1)


def launcher(user: str, uid: int, gid: int, script: Path, mode: str,
            args: list[str], safe_env: dict[str, str]):
    setpriv = "/usr/bin/setpriv"
    python = sys.executable
    clean_exec = ["/usr/bin/env", "-i",
                  *[f"{key}={value}" for key, value in sorted(safe_env.items())],
                  python, str(script), mode, *args]
    if os.geteuid() == 0:
        return [setpriv, f"--reuid={uid}", f"--regid={gid}", "--clear-groups",
                "--no-new-privs", "--bounding-set=-all", "--", *clean_exec]
    sudo = shutil.which("sudo")
    if not sudo:
        raise RuntimeError("sudo is required for cross-UID launch on a non-root runner")
    # Run setpriv as root so it can drop the capability bounding set before exec.
    # env -i then clears variables that sudo may preserve or reconstruct.
    return [sudo, "-n", setpriv, f"--reuid={uid}", f"--regid={gid}",
            "--clear-groups", "--no-new-privs", "--bounding-set=-all",
            "--", *clean_exec]


def run_parent() -> None:
    server_user, client_user = pwd.getpwnam("www-data"), pwd.getpwnam("nobody")
    if server_user.pw_uid == client_user.pw_uid:
        raise RuntimeError("server and client identities must differ")
    public_root = Path(tempfile.mkdtemp(prefix="agent49-public-"))
    public_root.chmod(0o755)
    public_script = public_root / "probe.py"
    shutil.copy2(Path(__file__).resolve(), public_script)
    public_script.chmod(0o644)

    safe_env = {"PATH": "/usr/bin:/bin", "HOME": "/tmp", "TMPDIR": "/tmp",
                "LANG": "C.UTF-8", "PYTHONNOUSERSITE": "1", "PYTHONHASHSEED": "0",
                "PYTHONDONTWRITEBYTECODE": "1"}
    if os.environ.get("LD_LIBRARY_PATH"):
        safe_env["LD_LIBRARY_PATH"] = os.environ["LD_LIBRARY_PATH"]
    os.environ["TARGET_SEED_SENTINEL"] = "must-not-reach-client"
    server_cmd = launcher("www-data", server_user.pw_uid, server_user.pw_gid,
                          public_script, "--server", [], safe_env)
    server = subprocess.Popen(server_cmd, cwd=public_root, env=safe_env,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    private_root = None
    try:
        ready_line = server.stdout.readline() if server.stdout else ""
        if not ready_line.startswith("READY "):
            raise RuntimeError("server did not become ready: " + ready_line +
                               ((server.stderr.read()[-2000:]) if server.stderr else ""))
        ready = json.loads(ready_line[6:])
        private_root = ready["private_root"]
        if ready["uid"] != server_user.pw_uid:
            raise RuntimeError(f"server uid mismatch: {ready['uid']}")
        if ready["private_root_mode"] != "0o700" or ready["private_file_mode"] != "0o600":
            raise RuntimeError(f"private path modes are too permissive: {ready}")
        if set(ready["environment_keys"]) != set(safe_env):
            raise RuntimeError(f"server environment was not scrubbed: {ready['environment_keys']}")
        server_proc_uid = os.stat(f"/proc/{ready['pid']}").st_uid
        if server_proc_uid != server_user.pw_uid:
            raise RuntimeError(f"server /proc uid mismatch: {server_proc_uid}")

        client_cmd = launcher("nobody", client_user.pw_uid, client_user.pw_gid,
                              public_script, "--client", [
            "--url", f"http://127.0.0.1:{ready['port']}/",
            "--private-file", ready["private_file"],
            "--server-pid", str(ready["pid"]),
            "--parent-pid", str(os.getpid()),
            "--expected-client-uid", str(client_user.pw_uid),
        ], safe_env)
        completed = subprocess.run(client_cmd, cwd=public_root, env=safe_env,
                                    capture_output=True, text=True, timeout=20)
        if completed.returncode != 0 or not completed.stdout.strip():
            raise RuntimeError("client isolation checks failed: " + completed.stdout + completed.stderr)
        result = json.loads(completed.stdout.strip().splitlines()[-1])
        result["server_uid"] = server_proc_uid
        result["server_pid"] = ready["pid"]
        result["parent_uid"] = os.getuid()
        result["private_root_mode"] = ready["private_root_mode"]
        result["private_file_mode"] = ready["private_file_mode"]
        print(json.dumps(result, indent=2, sort_keys=True), flush=True)
        if result["status"] != "pass":
            raise RuntimeError("one or more isolation assertions failed")
    finally:
        if server.poll() is None:
            try:
                os.kill(ready["pid"], signal.SIGTERM)
            except PermissionError:
                sudo = shutil.which("sudo")
                if sudo:
                    subprocess.run([sudo, "-n", "kill", "-TERM", str(ready["pid"])], check=False)
                else:
                    server.terminate()
            except (ProcessLookupError, UnboundLocalError):
                server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill(); server.wait(timeout=5)
        if private_root:
            if os.geteuid() == 0:
                shutil.rmtree(private_root, ignore_errors=True)
            else:
                sudo = shutil.which("sudo")
                if sudo:
                    subprocess.run([sudo, "-n", "rm", "-rf", private_root], check=False)
        shutil.rmtree(public_root, ignore_errors=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--server", action="store_true")
    parser.add_argument("--client", action="store_true")
    parser.add_argument("--url")
    parser.add_argument("--private-file")
    parser.add_argument("--server-pid", type=int)
    parser.add_argument("--parent-pid", type=int)
    parser.add_argument("--expected-client-uid", type=int)
    args = parser.parse_args()
    if args.server:
        serve()
    elif args.client:
        client(args)
    else:
        run_parent()


if __name__ == "__main__":
    main()
