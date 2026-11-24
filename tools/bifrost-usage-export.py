#!/usr/bin/env python3
"""Export a small Bifrost session/lane snapshot for the Usage Ledger plugin.

Bifrost's log DB is not mounted into the Paseo container. This keeps the
credential-bearing config DB private and writes only aggregate usage rows to
the Paseo home volume.

Install on the host:
    sudo install -m 755 tools/bifrost-usage-export.py /usr/local/bin/
    sudo crontab -e   # */5 * * * * /usr/local/bin/bifrost-usage-export.py
"""

from __future__ import annotations

import json
import os
import sqlite3
import tempfile
import time
from pathlib import Path

SOURCE = Path(os.environ.get("BIFROST_LOG_DB", "/opt/bifrost/data/logs.db"))
TARGET = Path(os.environ.get("BIFROST_USAGE_JSON", "/opt/paseo/home/.paseo/usage/bifrost.json"))
WINDOW_HOURS = int(os.environ.get("BIFROST_USAGE_WINDOW_HOURS", "48"))
OWNER_UID = 1000
OWNER_GID = 1000


def main() -> int:
    if not SOURCE.exists():
        print(f"bifrost log db not found: {SOURCE}")
        return 1
    con = sqlite3.connect(f"file:{SOURCE}?mode=ro", uri=True, timeout=30)
    con.execute("pragma busy_timeout=20000")
    try:
        rows = con.execute(
            """
            select session_id, provider, model, count(*) as requests,
                   coalesce(sum(prompt_tokens), 0) as prompt_tokens,
                   coalesce(sum(cached_read_tokens), 0) as cached_read_tokens,
                   coalesce(sum(completion_tokens), 0) as completion_tokens,
                   coalesce(sum(cost), 0) as cost
            from logs
            where created_at >= datetime('now', ?)
              and session_id is not null and session_id != ''
            group by session_id, provider, model
            """,
            (f"-{WINDOW_HOURS} hours",),
        ).fetchall()
    finally:
        con.close()

    payload = {
        "generated_at": int(time.time()),
        "window_hours": WINDOW_HOURS,
        "rows": [
            {
                "session_id": row[0],
                "provider": row[1],
                "model": row[2],
                "requests": row[3],
                "prompt_tokens": row[4],
                "cached_read_tokens": row[5],
                "completion_tokens": row[6],
                "cost": row[7],
            }
            for row in rows
        ],
    }
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", dir=TARGET.parent, delete=False) as handle:
        json.dump(payload, handle, separators=(",", ":"))
        handle.write("\n")
        temp = Path(handle.name)
    temp.chmod(0o640)
    try:
        os.chown(temp, OWNER_UID, OWNER_GID)
    except PermissionError:
        pass
    temp.replace(TARGET)
    print(f"wrote {len(payload['rows'])} Bifrost rows to {TARGET}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
