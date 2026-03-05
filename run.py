from __future__ import annotations

import argparse
import getpass
import os
import shutil
import signal
import subprocess
import sys
import threading
from pathlib import Path
from typing import Optional

ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"
ENV_FILES = [ROOT_DIR / ".env", BACKEND_DIR / ".env"]
MIGRATIONS_DIR = BACKEND_DIR / "migrations"

MANDATORY_MIGRATIONS = [
    "000_init_schema.sql",
    "001_users.sql",
    "001_robots.sql",
    "002_measurements_robot_id.sql",
]
OPTIONAL_MIGRATIONS = [
    "003_continous_aggregations.sql",
    "004_compression_retention.sql",
]


def load_env_file(file_path: Path) -> None:
    if not file_path.exists():
        return

    try:
        lines = file_path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return

    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def stream_output(process: subprocess.Popen[str], prefix: str) -> None:
    if process.stdout is None:
        return
    for line in process.stdout:
        print(f"[{prefix}] {line.rstrip()}")


def run_command(command: list[str], env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        env=env,
        text=True,
        capture_output=True,
        encoding="utf-8",
        errors="replace",
    )


def check_postgres(psql_path: Path, host: str, user: str, database: str, password: str) -> bool:
    if not psql_path.exists():
        print(f"[postgres] psql not found at: {psql_path}")
        return False

    env = os.environ.copy()
    env["PGPASSWORD"] = password

    result = run_command(
        [str(psql_path), "-h", host, "-U", user, "-d", database, "-c", "SELECT 1"],
        env,
    )

    if result.returncode != 0:
        print("[postgres] Connection check failed.")
        if result.stdout.strip():
            print(result.stdout.strip())
        if result.stderr.strip():
            print(result.stderr.strip())
        return False

    print("[postgres] Connection OK.")
    return True


def apply_migration_file(
    psql_path: Path,
    host: str,
    user: str,
    database: str,
    password: str,
    migration_name: str,
    required: bool,
) -> bool:
    migration_path = MIGRATIONS_DIR / migration_name
    if not migration_path.exists():
        message = f"[postgres] Missing migration file: {migration_name}"
        print(message)
        return not required

    env = os.environ.copy()
    env["PGPASSWORD"] = password

    result = run_command(
        [
            str(psql_path),
            "-h",
            host,
            "-U",
            user,
            "-d",
            database,
            "-v",
            "ON_ERROR_STOP=1",
            "-f",
            str(migration_path),
        ],
        env,
    )

    if result.returncode != 0:
        stderr = result.stderr.strip()
        if (
            migration_name == "000_init_schema.sql"
            and "create_hypertable" in stderr
            and "does not exist" in stderr
        ):
            print("[postgres] TimescaleDB not available; continuing with plain PostgreSQL table mode.")
            return True

        if (
            migration_name == "002_measurements_robot_id.sql"
            and "column \"robot_id\" of relation \"measurements\" already exists" in stderr
        ):
            print("[postgres] Migration 002 already applied (robot_id column exists); continuing.")
            return True

        level = "Failed" if required else "Skipped"
        print(f"[postgres] {level} migration {migration_name}")
        if result.stderr.strip():
            print(result.stderr.strip())
        return not required

    print(f"[postgres] Applied migration: {migration_name}")
    return True


def ensure_backend_schema(psql_path: Path, host: str, user: str, database: str, password: str) -> bool:
    print("[postgres] Applying migrations...")

    for migration in MANDATORY_MIGRATIONS:
        if not apply_migration_file(psql_path, host, user, database, password, migration, required=True):
            return False

    for migration in OPTIONAL_MIGRATIONS:
        apply_migration_file(psql_path, host, user, database, password, migration, required=False)

    return True


def start_service(
    name: str,
    command: list[str],
    cwd: Path,
    env_overrides: Optional[dict[str, str]] = None,
) -> subprocess.Popen[str]:
    env = os.environ.copy()
    if env_overrides:
        env.update(env_overrides)

    creation_flags = 0
    if os.name == "nt":
        creation_flags = subprocess.CREATE_NEW_PROCESS_GROUP

    process = subprocess.Popen(
        command,
        cwd=str(cwd),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
        creationflags=creation_flags,
    )

    threading.Thread(target=stream_output, args=(process, name), daemon=True).start()
    return process


def terminate_process(process: Optional[subprocess.Popen[str]], label: str) -> None:
    if process is None or process.poll() is not None:
        return

    print(f"[run] Stopping {label}...")

    if os.name == "nt":
        try:
            subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=10,
            )
            process.wait(timeout=3)
            return
        except (subprocess.TimeoutExpired, subprocess.SubprocessError):
            pass

    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Start PostgreSQL check + migrations + backend + frontend")
    if os.name == "nt":
        _default_psql = os.getenv("PSQL_PATH", r"C:\Program Files\PostgreSQL\18\bin\psql.exe")
    else:
        _default_psql = os.getenv("PSQL_PATH", shutil.which("psql") or "/usr/local/bin/psql")
    parser.add_argument(
        "--psql-path",
        default=_default_psql,
        help="Path to psql binary",
    )
    parser.add_argument("--pg-host", default=os.getenv("POSTGRES_HOST", "127.0.0.1"))
    parser.add_argument("--pg-user", default=os.getenv("POSTGRES_USER", "postgres"))
    parser.add_argument("--pg-db", default=os.getenv("POSTGRES_DB", "aquas"))
    parser.add_argument("--pg-password", default=os.getenv("POSTGRES_PASSWORD"))
    parser.add_argument("--backend-port", default="8000")
    parser.add_argument("--frontend-port", default="3000")
    parser.add_argument("--skip-migrations", action="store_true", help="Skip SQL migration execution")
    return parser.parse_args()


def prompt_password(user: str) -> Optional[str]:
    prompt = f"PostgreSQL password for user '{user}' (leave blank to cancel): "
    try:
        entered = getpass.getpass(prompt)
    except (KeyboardInterrupt, EOFError):
        print("\n[run] Password entry canceled.")
        return None
    return entered or None


def main() -> int:
    for env_file in ENV_FILES:
        load_env_file(env_file)
    args = parse_args()
    psql_path = Path(args.psql_path)

    if not args.pg_password:
        entered_password = prompt_password(args.pg_user)
        if not entered_password:
            print("[run] Aborting startup because no PostgreSQL password was provided.")
            return 1
        args.pg_password = entered_password

    postgres_ok = check_postgres(
        psql_path=psql_path,
        host=args.pg_host,
        user=args.pg_user,
        database=args.pg_db,
        password=args.pg_password,
    )

    if not postgres_ok:
        entered_password = prompt_password(args.pg_user)
        if entered_password:
            postgres_ok = check_postgres(
                psql_path=psql_path,
                host=args.pg_host,
                user=args.pg_user,
                database=args.pg_db,
                password=entered_password,
            )
            if postgres_ok:
                args.pg_password = entered_password

    if not postgres_ok:
        print("[run] Aborting startup because PostgreSQL is not reachable.")
        return 1

    if not args.skip_migrations:
        migrations_ok = ensure_backend_schema(
            psql_path=psql_path,
            host=args.pg_host,
            user=args.pg_user,
            database=args.pg_db,
            password=args.pg_password,
        )
        if not migrations_ok:
            print("[run] Aborting startup because migration setup failed.")
            return 1

    venv_dir = BACKEND_DIR / "venv"
    if os.name == "nt":
        venv_python = venv_dir / "Scripts" / "python.exe"
    else:
        venv_python = venv_dir / "bin" / "python"
    backend_python = str(venv_python) if venv_python.exists() else sys.executable

    backend_cmd = [
        backend_python,
        "-m",
        "uvicorn",
        "main:app",
        "--reload",
        "--host",
        "0.0.0.0",
        "--port",
        str(args.backend_port),
    ]

    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
    frontend_cmd = [npm_cmd, "run", "dev", "--", "--port", str(args.frontend_port)]

    backend_env = {
        "POSTGRES_HOST": args.pg_host,
        "POSTGRES_USER": args.pg_user,
        "POSTGRES_DB": args.pg_db,
        "POSTGRES_PASSWORD": args.pg_password,
        "NEXTAUTH_SECRET": os.getenv("NEXTAUTH_SECRET", "aquas_test_secret"),
    }

    backend_process: Optional[subprocess.Popen[str]] = None
    frontend_process: Optional[subprocess.Popen[str]] = None

    try:
        print("[run] Starting backend...")
        backend_process = start_service("backend", backend_cmd, BACKEND_DIR, env_overrides=backend_env)

        print("[run] Starting frontend...")
        frontend_process = start_service("frontend", frontend_cmd, FRONTEND_DIR)

        print("[run] Services started.")
        print(f"[run] Frontend: http://localhost:{args.frontend_port}")
        print(f"[run] Backend:  http://localhost:{args.backend_port}")
        print("[run] Press Ctrl+C to stop both services.")

        while True:
            if backend_process.poll() is not None:
                print(f"[run] Backend exited with code {backend_process.returncode}.")
                return backend_process.returncode or 0
            if frontend_process.poll() is not None:
                print(f"[run] Frontend exited with code {frontend_process.returncode}.")
                return frontend_process.returncode or 0
    except KeyboardInterrupt:
        print("\n[run] Ctrl+C received.")
        return 0
    finally:
        terminate_process(frontend_process, "frontend")
        terminate_process(backend_process, "backend")


if __name__ == "__main__":
    raise SystemExit(main())
