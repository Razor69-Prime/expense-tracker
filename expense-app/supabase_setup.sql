-- =====================================================
-- Daily Expense Tracker — Supabase SQL Setup
-- Jalankan di: Supabase Dashboard > SQL Editor
-- =====================================================

-- Tabel expenses
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(15, 2) NOT NULL,
  category_id TEXT,
  pic TEXT,
  labels TEXT[] DEFAULT '{}',
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index untuk filter cepat
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_pic ON expenses(pic);

-- Row Level Security (aktifkan jika perlu auth)
-- ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Public access" ON expenses FOR ALL USING (true);

-- Untuk sekarang: izinkan akses publik via anon key
GRANT ALL ON expenses TO anon;
GRANT ALL ON expenses TO authenticated;

-- Trigger update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER expenses_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- View ringkasan per bulan & kategori
CREATE OR REPLACE VIEW summary_by_month_category AS
SELECT
  TO_CHAR(date, 'YYYY-MM') AS month,
  category_id,
  COUNT(*) AS total_transactions,
  SUM(amount) AS total_amount,
  AVG(amount) AS avg_amount
FROM expenses
GROUP BY 1, 2
ORDER BY 1 DESC, 4 DESC;

-- Cek hasil
SELECT 'Setup selesai! Tabel expenses siap digunakan.' AS status;
