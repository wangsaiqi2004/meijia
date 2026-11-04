"""Transactional SQLite ledger for shop credits and image-generation reservations."""

from __future__ import annotations

import secrets
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
PRICES = {"1k": (10, 5), "4k": (30, 15)}

SCHEMA = """
CREATE TABLE IF NOT EXISTS nail_shops (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  credits INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0),
  is_vip INTEGER NOT NULL DEFAULT 0 CHECK (is_vip IN (0, 1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);
CREATE TABLE IF NOT EXISTS nail_generations (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES nail_shops(id),
  user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  size TEXT NOT NULL CHECK (size IN ('1k', '4k')),
  credits_cost INTEGER NOT NULL CHECK (credits_cost > 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'refunded')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT,
  fail_reason TEXT,
  UNIQUE (shop_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS nail_recharge_orders (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES nail_shops(id),
  credits INTEGER NOT NULL CHECK (credits > 0),
  channel TEXT NOT NULL CHECK (channel IN ('manual', 'code')),
  operator_id TEXT NOT NULL,
  remark TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS nail_redeem_codes (
  code TEXT PRIMARY KEY,
  credits INTEGER NOT NULL CHECK (credits > 0),
  created_by TEXT NOT NULL,
  expires_at TEXT,
  used_by_shop_id TEXT REFERENCES nail_shops(id),
  used_at TEXT
);
"""


class LedgerError(ValueError):
    pass


class NailLedger:
    def __init__(self, path: str | Path):
        self.path = str(path)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, timeout=15, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=15000")
        return conn

    def initialize(self) -> None:
        conn = self._connect()
        try:
            conn.executescript(SCHEMA)
        finally:
            conn.close()

    @contextmanager
    def _transaction(self) -> Iterator[sqlite3.Connection]:
        conn = self._connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            yield conn
            conn.commit()
        except BaseException:
            conn.rollback()
            raise
        finally:
            conn.close()

    def create_shop(self, shop_id: str, name: str, *, vip: bool = False) -> None:
        if not shop_id or not name.strip():
            raise LedgerError("店铺编号和名称不能为空")
        with self._transaction() as conn:
            conn.execute(
                "INSERT INTO nail_shops(id, name, is_vip) VALUES (?, ?, ?)",
                (shop_id, name.strip(), int(vip)),
            )

    @staticmethod
    def _credit(conn: sqlite3.Connection, *, shop_id: str, points: int,
                channel: str, operator_id: str, remark: str, order_id: str) -> None:
        if isinstance(points, bool) or not isinstance(points, int) or points <= 0:
            raise LedgerError("点数必须是正整数")
        if not operator_id or not order_id:
            raise LedgerError("缺少操作人或订单编号")
        updated = conn.execute(
            "UPDATE nail_shops SET credits=credits+? WHERE id=? AND active=1",
            (points, shop_id),
        )
        if updated.rowcount != 1:
            raise LedgerError("店铺不存在或已停用")
        conn.execute(
            "INSERT INTO nail_recharge_orders(id, shop_id, credits, channel, operator_id, remark) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (order_id, shop_id, points, channel, operator_id, remark),
        )

    def manual_credit(self, *, shop_id: str, points: int, operator_id: str,
                      order_id: str, remark: str) -> None:
        if not remark.strip():
            raise LedgerError("请填写充值备注")
        with self._transaction() as conn:
            self._credit(conn, shop_id=shop_id, points=points, channel="manual",
                         operator_id=operator_id, remark=remark.strip(), order_id=order_id)

    def create_codes(self, *, points: int, count: int, operator_id: str,
                     expires_at: str | None = None) -> list[str]:
        if isinstance(points, bool) or not isinstance(points, int) or points <= 0:
            raise LedgerError("点数必须是正整数")
        if isinstance(count, bool) or not isinstance(count, int) or not 1 <= count <= 500:
            raise LedgerError("每次生成数量须为1至500")
        if not operator_id:
            raise LedgerError("缺少操作人")
        result = []
        with self._transaction() as conn:
            for _ in range(count):
                while True:
                    raw = "".join(secrets.choice(CODE_ALPHABET) for _ in range(12))
                    code = f"MJ-{raw[:4]}-{raw[4:8]}-{raw[8:]}"
                    try:
                        conn.execute(
                            "INSERT INTO nail_redeem_codes(code, credits, created_by, expires_at) "
                            "VALUES (?, ?, ?, ?)", (code, points, operator_id, expires_at),
                        )
                        result.append(code)
                        break
                    except sqlite3.IntegrityError:
                        if conn.execute("SELECT 1 FROM nail_redeem_codes WHERE code=?", (code,)).fetchone() is None:
                            raise
        return result

    def redeem(self, *, shop_id: str, code: str, operator_id: str, order_id: str) -> None:
        with self._transaction() as conn:
            row = conn.execute(
                "SELECT credits FROM nail_redeem_codes WHERE code=? AND used_at IS NULL "
                "AND (expires_at IS NULL OR datetime(expires_at) > CURRENT_TIMESTAMP)",
                (code.strip().upper(),),
            ).fetchone()
            if row is None:
                raise LedgerError("兑换码无效、已使用或已过期")
            self._credit(conn, shop_id=shop_id, points=row["credits"], channel="code",
                         operator_id=operator_id, remark="兑换码充值", order_id=order_id)
            conn.execute(
                "UPDATE nail_redeem_codes SET used_by_shop_id=?, used_at=CURRENT_TIMESTAMP WHERE code=?",
                (shop_id, code.strip().upper()),
            )

    def reserve(self, *, generation_id: str, shop_id: str, user_id: str,
                idempotency_key: str, size: str) -> dict:
        if not all((generation_id, shop_id, user_id, idempotency_key)) or size not in PRICES:
            raise LedgerError("生成参数不完整")
        with self._transaction() as conn:
            existing = conn.execute(
                "SELECT * FROM nail_generations WHERE shop_id=? AND idempotency_key=?",
                (shop_id, idempotency_key),
            ).fetchone()
            if existing:
                if existing["user_id"] != user_id or existing["size"] != size:
                    raise LedgerError("重复请求参数不一致")
                return dict(existing)
            shop = conn.execute("SELECT * FROM nail_shops WHERE id=? AND active=1", (shop_id,)).fetchone()
            if shop is None:
                raise LedgerError("店铺不存在或已停用")
            active = conn.execute(
                "SELECT COUNT(*) FROM nail_generations WHERE shop_id=? AND status='pending'", (shop_id,),
            ).fetchone()[0]
            if active >= 2:
                raise LedgerError("当前店铺已有两个生成任务")
            cost = PRICES[size][1 if shop["is_vip"] else 0]
            if shop["credits"] < cost:
                raise LedgerError("点数不足")
            conn.execute("UPDATE nail_shops SET credits=credits-? WHERE id=?", (cost, shop_id))
            conn.execute(
                "INSERT INTO nail_generations(id, shop_id, user_id, idempotency_key, size, credits_cost, status) "
                "VALUES (?, ?, ?, ?, ?, ?, 'pending')",
                (generation_id, shop_id, user_id, idempotency_key, size, cost),
            )
            return dict(conn.execute("SELECT * FROM nail_generations WHERE id=?", (generation_id,)).fetchone())

    def finish(self, generation_id: str, *, success: bool, reason: str = "") -> bool:
        with self._transaction() as conn:
            row = conn.execute("SELECT * FROM nail_generations WHERE id=?", (generation_id,)).fetchone()
            if row is None:
                raise LedgerError("生成记录不存在")
            if row["status"] != "pending":
                return False
            status = "success" if success else "refunded"
            conn.execute(
                "UPDATE nail_generations SET status=?, finished_at=CURRENT_TIMESTAMP, fail_reason=? WHERE id=?",
                (status, None if success else reason[:500], generation_id),
            )
            if not success:
                conn.execute("UPDATE nail_shops SET credits=credits+? WHERE id=?",
                             (row["credits_cost"], row["shop_id"]))
            return True

    def refund_expired(self, *, timeout_seconds: int = 120) -> int:
        """Refund pending reservations past their deadline, including after a restart."""
        if isinstance(timeout_seconds, bool) or not isinstance(timeout_seconds, int) or timeout_seconds <= 0:
            raise LedgerError("超时时间必须是正整数")
        with self._transaction() as conn:
            expired = conn.execute(
                "SELECT id, shop_id, credits_cost FROM nail_generations "
                "WHERE status='pending' AND created_at <= datetime('now', ?)",
                (f"-{timeout_seconds} seconds",),
            ).fetchall()
            for row in expired:
                conn.execute(
                    "UPDATE nail_generations SET status='refunded', finished_at=CURRENT_TIMESTAMP, "
                    "fail_reason='生成超时，点数已退回' WHERE id=? AND status='pending'",
                    (row["id"],),
                )
                conn.execute("UPDATE nail_shops SET credits=credits+? WHERE id=?",
                             (row["credits_cost"], row["shop_id"]))
            return len(expired)
