from __future__ import annotations

import concurrent.futures
import sqlite3
import tempfile
import unittest
from pathlib import Path

from services.nail_ledger import LedgerError, NailLedger


class NailLedgerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "ledger.sqlite"
        self.ledger = NailLedger(self.path)
        self.ledger.initialize()
        self.ledger.create_shop("shop", "测试店")

    def query(self, sql, args=()):
        conn = sqlite3.connect(self.path)
        try:
            return conn.execute(sql, args).fetchall()
        finally:
            conn.close()

    def credit(self, points=100):
        self.ledger.manual_credit(shop_id="shop", points=points, operator_id="admin",
                                  order_id="order-1", remark="手动充值")

    def reserve(self, key, size="1k"):
        return self.ledger.reserve(generation_id="generation-" + key, shop_id="shop",
                                   user_id="user", idempotency_key=key, size=size)

    def test_credit_and_duplicate_order_rollback(self):
        self.credit()
        with self.assertRaises(sqlite3.IntegrityError):
            self.ledger.manual_credit(shop_id="shop", points=20, operator_id="admin",
                                      order_id="order-1", remark="重复")
        self.assertEqual(self.query("SELECT credits FROM nail_shops"), [(100,)])
        self.assertEqual(self.query("SELECT COUNT(*) FROM nail_recharge_orders"), [(1,)])

    def test_duplicate_request_and_refund_only_once(self):
        self.credit()
        first = self.reserve("same")
        self.assertEqual(first["id"], self.reserve("same")["id"])
        self.assertEqual(self.query("SELECT credits FROM nail_shops"), [(90,)])
        self.assertTrue(self.ledger.finish(first["id"], success=False, reason="上游错误"))
        self.assertFalse(self.ledger.finish(first["id"], success=False, reason="重复"))
        self.assertFalse(self.ledger.finish(first["id"], success=True))
        self.assertEqual(self.query("SELECT credits FROM nail_shops"), [(100,)])

    def test_insufficient_and_concurrency_limit(self):
        self.credit(20)
        self.reserve("a")
        self.reserve("b")
        with self.assertRaises(LedgerError):
            self.reserve("c")
        self.assertEqual(self.query("SELECT credits FROM nail_shops"), [(0,)])
        self.ledger.finish("generation-a", success=True)
        with self.assertRaisesRegex(LedgerError, "点数不足"):
            self.reserve("d")
        self.assertEqual(self.query("SELECT COUNT(*) FROM nail_generations"), [(2,)])

    def test_vip_price(self):
        self.ledger.create_shop("vip", "VIP店", vip=True)
        self.ledger.manual_credit(shop_id="vip", points=15, operator_id="admin",
                                  order_id="vip-order", remark="充值")
        row = self.ledger.reserve(generation_id="vip-gen", shop_id="vip", user_id="u",
                                  idempotency_key="vip-key", size="4k")
        self.assertEqual(row["credits_cost"], 15)

    def test_concurrent_redemption_only_one_success(self):
        code = self.ledger.create_codes(points=30, count=1, operator_id="admin")[0]

        def redeem(index):
            try:
                self.ledger.redeem(shop_id="shop", code=code, operator_id="owner", order_id=f"r-{index}")
                return True
            except LedgerError:
                return False

        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(redeem, range(8)))
        self.assertEqual(sum(results), 1)
        self.assertEqual(self.query("SELECT credits FROM nail_shops"), [(30,)])
        self.assertEqual(self.query("SELECT COUNT(*) FROM nail_recharge_orders"), [(1,)])

    def test_concurrent_same_key_only_deducts_once(self):
        self.credit()
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            ids = list(pool.map(lambda _: self.reserve("shared")["id"], range(8)))
        self.assertEqual(len(set(ids)), 1)
        self.assertEqual(self.query("SELECT credits FROM nail_shops"), [(90,)])
        self.assertEqual(self.query("SELECT COUNT(*) FROM nail_generations"), [(1,)])

    def test_expired_refund_is_idempotent_and_late_success_is_ignored(self):
        self.credit()
        self.reserve("old")
        self.reserve("new")
        conn = sqlite3.connect(self.path)
        try:
            conn.execute("UPDATE nail_generations SET created_at=datetime('now','-3 minutes') WHERE id=?",
                         ("generation-old",))
            conn.commit()
        finally:
            conn.close()
        self.assertEqual(self.ledger.refund_expired(), 1)
        self.assertEqual(self.ledger.refund_expired(), 0)
        self.assertFalse(self.ledger.finish("generation-old", success=True))
        self.assertEqual(self.query("SELECT credits FROM nail_shops"), [(90,)])
        self.assertEqual(self.query("SELECT status FROM nail_generations WHERE id='generation-old'"), [("refunded",)])

    def test_invalid_refund_timeout(self):
        for value in (0, -1, True):
            with self.assertRaises(LedgerError):
                self.ledger.refund_expired(timeout_seconds=value)


if __name__ == "__main__":
    unittest.main()
