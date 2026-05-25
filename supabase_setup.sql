-- =====================================================
-- Daily Expense Tracker — Supabase SQL Setup (v2)
-- Jalankan di: Supabase Dashboard > SQL Editor
-- =====================================================

-- ─── TABEL EXPENSES ──────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id           TEXT PRIMARY KEY,
  date         DATE NOT NULL,
  description  TEXT NOT NULL,
  amount       NUMERIC(15,2) NOT NULL,
  category_id  TEXT,
  pic          TEXT,
  labels       TEXT[]  DEFAULT '{}',
  note         TEXT    DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_date     ON expenses(date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_pic      ON expenses(pic);
CREATE INDEX IF NOT EXISTS idx_expenses_month    ON expenses(date_trunc('month', date));

-- ─── TABEL ACTIVITY LOG ──────────────────────────────
CREATE TABLE IF NOT EXISTS activity_logs (
  id         TEXT PRIMARY KEY,
  action     TEXT NOT NULL,
  data       JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logs_created ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_action  ON activity_logs(action);

-- ─── AKSES PUBLIK (anon key) ─────────────────────────
GRANT ALL ON expenses      TO anon, authenticated;
GRANT ALL ON activity_logs TO anon, authenticated;

-- ─── AUTO UPDATE updated_at ──────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS expenses_updated_at ON expenses;
CREATE TRIGGER expenses_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── VIEW RINGKASAN ───────────────────────────────────
CREATE OR REPLACE VIEW summary_by_month AS
SELECT
  TO_CHAR(date, 'YYYY-MM')  AS month,
  category_id,
  pic,
  COUNT(*)                   AS total_transaksi,
  SUM(amount)                AS total_amount,
  AVG(amount)                AS avg_amount
FROM expenses
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 4 DESC;

GRANT SELECT ON summary_by_month TO anon, authenticated;

-- ─── CEK HASIL ───────────────────────────────────────
SELECT 'Setup selesai! Tabel expenses dan activity_logs siap.' AS status;
