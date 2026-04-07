CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS shops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  pin TEXT NOT NULL,
  role TEXT DEFAULT 'helper' CHECK (role IN ('owner','helper')),
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name_bangla TEXT NOT NULL,
  name_english TEXT,
  aliases TEXT[] DEFAULT '{}',
  unit TEXT NOT NULL CHECK (unit IN ('kg','gram','litre','ml','piece','dozen','packet','bag')),
  current_stock DECIMAL(10,3) DEFAULT 0,
  min_stock_alert DECIMAL(10,3) DEFAULT 0,
  sale_price DECIMAL(10,2) DEFAULT 0,
  purchase_price DECIMAL(10,2) DEFAULT 0,
  category TEXT DEFAULT 'other',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  user_name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('sale','purchase')),
  product_id UUID REFERENCES products(id),
  product_name TEXT NOT NULL,
  quantity DECIMAL(10,3) NOT NULL,
  unit TEXT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  notes TEXT,
  voice_raw_text TEXT,
  is_synced BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_sales DECIMAL(12,2) DEFAULT 0,
  total_purchases DECIMAL(12,2) DEFAULT 0,
  gross_profit DECIMAL(12,2) DEFAULT 0,
  transaction_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(shop_id, date)
);

CREATE OR REPLACE FUNCTION update_daily_summary()
RETURNS TRIGGER AS $$
DECLARE txn_date DATE;
BEGIN
  txn_date := DATE(NEW.created_at);
  INSERT INTO daily_summaries (shop_id, date, total_sales, total_purchases, gross_profit, transaction_count)
  VALUES (
    NEW.shop_id, txn_date,
    CASE WHEN NEW.type = 'sale' THEN NEW.total_amount ELSE 0 END,
    CASE WHEN NEW.type = 'purchase' THEN NEW.total_amount ELSE 0 END,
    CASE WHEN NEW.type = 'sale' THEN NEW.total_amount ELSE -NEW.total_amount END,
    1
  )
  ON CONFLICT (shop_id, date) DO UPDATE SET
    total_sales = daily_summaries.total_sales + CASE WHEN NEW.type = 'sale' THEN NEW.total_amount ELSE 0 END,
    total_purchases = daily_summaries.total_purchases + CASE WHEN NEW.type = 'purchase' THEN NEW.total_amount ELSE 0 END,
    gross_profit = daily_summaries.gross_profit + CASE WHEN NEW.type = 'sale' THEN NEW.total_amount ELSE -NEW.total_amount END,
    transaction_count = daily_summaries.transaction_count + 1,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_transaction_insert
  AFTER INSERT ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_daily_summary();

CREATE OR REPLACE FUNCTION adjust_stock()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    IF NEW.type = 'sale' THEN
      UPDATE products SET current_stock = current_stock - NEW.quantity, updated_at = NOW() WHERE id = NEW.product_id;
    ELSE
      UPDATE products SET current_stock = current_stock + NEW.quantity, updated_at = NOW() WHERE id = NEW.product_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_transaction_stock
  AFTER INSERT ON transactions
  FOR EACH ROW EXECUTE FUNCTION adjust_stock();

ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_shops" ON shops FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "allow_all_users" ON users FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "allow_all_products" ON products FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "allow_all_transactions" ON transactions FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "allow_all_summaries" ON daily_summaries FOR ALL USING (TRUE) WITH CHECK (TRUE);