from __future__ import annotations

import argparse
import getpass
import os
import signal
import subprocess
import sys
import threading
from pathlib import Path
from typing import Optional

ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"
ENV_FILE = ROOT_DIR / ".env"

SCHEMA_SQL = """
CREATE SCHEMA IF NOT EXISTS waterq;

CREATE TABLE IF NOT EXISTS waterq.measurements (
    "time" timestamp with time zone NOT NULL,
    longitude double precision NOT NULL,
    latitude double precision NOT NULL,
    temperature_c double precision,
    turbidity_ntu double precision,
    ec_us_cm double precision,
    tdo_mg_l double precision,
    ph double precision,
    CONSTRAINT chk_ec CHECK ((ec_us_cm IS NULL) OR (ec_us_cm >= 0)),
    CONSTRAINT chk_lat CHECK ((latitude >= -90) AND (latitude <= 90)),
    CONSTRAINT chk_lon CHECK ((longitude >= -180) AND (longitude <= 180)),
    CONSTRAINT chk_tdo CHECK ((tdo_mg_l IS NULL) OR (tdo_mg_l >= 0)),
    CONSTRAINT chk_temp CHECK ((temperature_c IS NULL) OR ((temperature_c >= -5) AND (temperature_c <= 80))),
    CONSTRAINT chk_turb CHECK ((turbidity_ntu IS NULL) OR (turbidity_ntu >= 0)),
    CONSTRAINT measurements_ph_check CHECK ((ph >= 0) AND (ph <= 14)),
    CONSTRAINT measurements_pk PRIMARY KEY (longitude, latitude, "time")
);

CREATE INDEX IF NOT EXISTS measurements_time_idx
ON waterq.measurements ("time" DESC);

CREATE INDEX IF NOT EXISTS measurements_longitude_latitude_time_idx
ON waterq.measurements (longitude, latitude, "time" DESC);
"""


def stream_output(process: subprocess.Popen[str], prefix: str) -> None:
    if process.stdout is None:
        return
    for line in process.stdout:
        print(f"[{prefix}] {line.rstrip()}")


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


def check_postgres(psql_path: Path, host: str, user: str, database: str, password: str) -> bool:
    if not psql_path.exists():
        print(f"[postgres] psql not found at: {psql_path}")
        return False

    env = os.environ.copy()
    env["PGPASSWORD"] = password

    command = [
        str(psql_path),
        "-h",
        host,
        "-U",
        user,
        "-d",
        database,
        "-c",
        "SELECT 1",
    ]

    result = subprocess.run(
        command,
        env=env,
        text=True,
        capture_output=True,
        encoding="utf-8",
        errors="replace",
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


def run_psql_command(
    psql_path: Path,
    host: str,
    user: str,
    database: str,
    password: str,
    sql: str,
) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["PGPASSWORD"] = password
    command = [
        str(psql_path),
        "-h",
        host,
        "-U",
        user,
        "-d",
        database,
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        sql,
    ]
    return subprocess.run(
        command,
        env=env,
        text=True,
        capture_output=True,
        encoding="utf-8",
        errors="replace",
    )


def ensure_backend_schema(psql_path: Path, host: str, user: str, database: str, password: str) -> bool:
    print("[postgres] Ensuring schema/table exist...")
    result = run_psql_command(
        psql_path=psql_path,
        host=host,
        user=user,
        database=database,
        password=password,
        sql=SCHEMA_SQL,
    )
    if result.returncode != 0:
        print("[postgres] Failed to initialize schema/table.")
        if result.stdout.strip():
            print(result.stdout.strip())
        if result.stderr.strip():
            print(result.stderr.strip())
        return False

    count_result = run_psql_command(
        psql_path=psql_path,
        host=host,
        user=user,
        database=database,
        password=password,
        sql="SELECT count(*) AS row_count FROM waterq.measurements;",
    )
    if count_result.returncode == 0:
        lines = [line.strip() for line in count_result.stdout.splitlines() if line.strip()]
        numeric_lines = [line for line in lines if line.isdigit()]
        if numeric_lines:
            row_count = int(numeric_lines[-1])
            print(f"[postgres] waterq.measurements rows: {row_count}")
            if row_count == 0:
                print("[postgres] Table is empty. Load sample data with: python backend/load_fake_data.py --weeks 4 --interval-mins 15")

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
    parser = argparse.ArgumentParser(description="Start PostgreSQL check + backend + frontend")
    parser.add_argument(
        "--psql-path",
        default=r"C:\Program Files\PostgreSQL\18\bin\psql.exe",
        help="Path to psql.exe",
    )
    parser.add_argument("--pg-host", default=os.getenv("POSTGRES_HOST", "127.0.0.1"))
    parser.add_argument("--pg-user", default=os.getenv("POSTGRES_USER", "postgres"))
    parser.add_argument("--pg-db", default=os.getenv("POSTGRES_DB", "postgres"))
    parser.add_argument("--pg-password", default=os.getenv("POSTGRES_PASSWORD"))
    parser.add_argument("--backend-port", default="8000")
    parser.add_argument("--frontend-port", default="3000")
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
    load_env_file(ENV_FILE)
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

    schema_ok = ensure_backend_schema(
        psql_path=psql_path,
        host=args.pg_host,
        user=args.pg_user,
        database=args.pg_db,
        password=args.pg_password,
    )
    if not schema_ok:
        print("[run] Aborting startup because schema initialization failed.")
        return 1

    backend_cmd = [
        sys.executable,
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

    backend_process: Optional[subprocess.Popen[str]] = None
    frontend_process: Optional[subprocess.Popen[str]] = None
    backend_env = {
        "POSTGRES_HOST": args.pg_host,
        "POSTGRES_USER": args.pg_user,
        "POSTGRES_DB": args.pg_db,
        "POSTGRES_PASSWORD": args.pg_password,
    }

    try:
        print("[run] Starting backend...")
        backend_process = start_service(
            "backend",
            backend_cmd,
            BACKEND_DIR,
            env_overrides=backend_env,
        )

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
