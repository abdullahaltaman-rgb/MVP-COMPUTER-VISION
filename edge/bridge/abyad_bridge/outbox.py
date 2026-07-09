"""طابور صادر offline-first على SQLite.

كل حدث/لقطة يدخل الطابور أولًا ثم يُرفع؛ عند انقطاع الإنترنت تبقى السجلات
وتُعاد المحاولة بتراجع أُسّي (حتى ساعة) إلى أن تنجح — لا فقدان أدلة.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from typing import Any, Callable


class Outbox:
    def __init__(self, db_path: str, clock: Callable[[], float] = time.time):
        self.db_path = db_path
        self.clock = clock
        self._lock = threading.Lock()
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=30)
        conn.execute('PRAGMA journal_mode=WAL')
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                '''CREATE TABLE IF NOT EXISTS outbox (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    kind TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    next_attempt_at REAL NOT NULL DEFAULT 0
                )''',
            )

    def enqueue(self, kind: str, payload: dict[str, Any]) -> int:
        with self._lock, self._connect() as conn:
            cur = conn.execute(
                'INSERT INTO outbox (kind, payload, created_at) VALUES (?, ?, ?)',
                (kind, json.dumps(payload, ensure_ascii=False), self.clock()),
            )
            return int(cur.lastrowid or 0)

    def pending_count(self) -> int:
        with self._connect() as conn:
            row = conn.execute('SELECT COUNT(*) FROM outbox').fetchone()
            return int(row[0])

    def flush(self, sender: Callable[[str, dict[str, Any]], bool], batch: int = 20) -> int:
        """يحاول إرسال الدفعات المستحقة. sender يعيد True عند النجاح.

        يعيد عدد السجلات التي أُرسلت بنجاح.
        """
        now = self.clock()
        with self._lock, self._connect() as conn:
            rows = conn.execute(
                'SELECT id, kind, payload, attempts FROM outbox '
                'WHERE next_attempt_at <= ? ORDER BY id LIMIT ?',
                (now, batch),
            ).fetchall()

        sent = 0
        for row_id, kind, payload_json, attempts in rows:
            payload = json.loads(payload_json)
            try:
                ok = sender(kind, payload)
            except Exception:
                ok = False

            with self._lock, self._connect() as conn:
                if ok:
                    conn.execute('DELETE FROM outbox WHERE id = ?', (row_id,))
                    sent += 1
                else:
                    backoff = min(5 * (2 ** min(attempts, 10)), 3600)
                    conn.execute(
                        'UPDATE outbox SET attempts = ?, next_attempt_at = ? WHERE id = ?',
                        (attempts + 1, self.clock() + backoff, row_id),
                    )
                    # انقطاع غالبًا — لا معنى لمحاولة بقية الدفعة الآن
                    break
        return sent
