// ============================================================
// Smart Price Resolver
// Determines if a spoken price is UNIT price or TOTAL price
// ============================================================

export interface PriceResolution {
  unit_price: number;
  total_price: number;
  quantity: number;
  is_total: boolean;
  confidence: number;
}

export function resolvePrice(
  spokenPrice: number,
  quantity: number,
  unit: string,
  dbUnitPrice?: number
): PriceResolution {

  // ── Rule 1: Database price exists ──
  // If we know the unit price from DB, verify against spoken price
  if (dbUnitPrice && dbUnitPrice > 0) {
    const expectedTotal = +(quantity * dbUnitPrice).toFixed(2);
    const priceDiff = Math.abs(spokenPrice - expectedTotal) / expectedTotal;

    if (priceDiff < 0.05) {
      // Spoken price matches expected total (within 5%)
      return {
        unit_price: dbUnitPrice,
        total_price: expectedTotal,
        quantity,
        is_total: true,
        confidence: 0.95,
      };
    }

    const priceDiff2 = Math.abs(spokenPrice - dbUnitPrice) / dbUnitPrice;
    if (priceDiff2 < 0.05) {
      // Spoken price matches unit price from DB
      return {
        unit_price: dbUnitPrice,
        total_price: +(quantity * dbUnitPrice).toFixed(2),
        quantity,
        is_total: false,
        confidence: 0.95,
      };
    }
  }

  // ── Rule 2: Gram/ml units → ALWAYS packet price ──
  // "50 gram holuder gura 20 taka" → 20 is packet price
  // Nobody prices spices per gram in Bangladesh
  if (unit === 'gram' || unit === 'ml') {
    return {
      unit_price: spokenPrice,
      total_price: spokenPrice, // treat as 1 packet
      quantity: 1,
      is_total: true,
      confidence: 0.9,
      // Note: quantity becomes 1 (packet), original quantity was weight
    };
  }

  // ── Rule 3: Check if price ÷ quantity = round number ──
  // 890 ÷ 5 = 178.0 → likely total
  // 178 ÷ 5 = 35.6 → likely unit price
  if (quantity > 1) {
    const divided = spokenPrice / quantity;
    const isRound = Number.isInteger(divided) || divided % 5 === 0 || divided % 10 === 0;

    if (isRound && divided >= 10) {
      // Likely total price
      return {
        unit_price: divided,
        total_price: spokenPrice,
        quantity,
        is_total: true,
        confidence: 0.8,
      };
    }
  }

  // ── Rule 4: Price range logic ──
  // If price > 500 and quantity > 1 → almost certainly total
  if (spokenPrice > 500 && quantity > 1) {
    const unitP = +(spokenPrice / quantity).toFixed(2);
    return {
      unit_price: unitP,
      total_price: spokenPrice,
      quantity,
      is_total: true,
      confidence: 0.75,
    };
  }

  // ── Default: treat as unit price ──
  return {
    unit_price: spokenPrice,
    total_price: +(spokenPrice * quantity).toFixed(2),
    quantity,
    is_total: false,
    confidence: 0.6,
  };
}

// Special handling for product categories
export function getProductPriceType(
  productName: string,
  unit: string
): 'always_total' | 'always_unit' | 'check' {

  // Packet goods — price is always per packet
  const packetGoods = ['বিস্কুট', 'চিপস', 'নুডলস', 'সেমাই', 'সাবান', 'শ্যাম্পু', 'তেল', 'ঘি'];
  if (packetGoods.some(p => productName.includes(p)) && unit === 'packet') {
    return 'always_unit';
  }

  // Gram/ml sold items — price is always packet total
  if (unit === 'gram' || unit === 'ml') return 'always_total';

  // Drinks — price is per piece
  const drinks = ['কোকাকোলা', 'সেভেনআপ', 'ফান্টা', 'স্প্রাইট', 'মোজো', 'পেপসি'];
  if (drinks.some(d => productName.includes(d))) return 'always_unit';

  return 'check';
}

// Use this whenever product has a known DB price
export function resolvePacketPrice(
  dbPrice: number,
  quantity: number
): PriceResolution {
  return {
    unit_price: dbPrice,
    total_price: +(dbPrice * quantity).toFixed(2),
    quantity,
    is_total: false,
    confidence: 0.99,
  };
}
