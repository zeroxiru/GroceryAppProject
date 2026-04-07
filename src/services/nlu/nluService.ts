import Fuse from 'fuse.js';
import { ParsedCommand, Product, Unit, TransactionType } from '../../types';
import { BANGLA_NUMBERS, NLU_SALE_KEYWORDS, NLU_PURCHASE_KEYWORDS, NLU_STOCK_KEYWORDS, NLU_SUMMARY_KEYWORDS } from '../../constants';

const DIALECT_MAP: Record<string, string> = {
  'চাউল': 'চাল', 'সইরষা': 'সরিষা', 'আইছে': 'কিনলাম',
  'গেছে': 'বিক্রি', 'গেল': 'বিক্রি', 'দিছি': 'বিক্রি করেছি',
  'লইছি': 'নিলাম', 'বেচছি': 'বেচলাম', 'কিনছি': 'কিনলাম',
  'দুইডা': 'দুই', 'তিনটা': 'তিন', 'চারটা': 'চার',
  'বোতল': 'লিটার', 'আধাআধি': 'আধা', 'হাফ': 'আধা',
  'কিলো': 'কেজি', 'লিটর': 'লিটার',
  'মিনিকেট': 'চাল', 'নাজিরশাইল': 'চাল', 'আতপ': 'চাল',
  'মুসুর': 'ডাল', 'মসুর': 'ডাল', 'ছোলা': 'ডাল',
  'রূপচাঁদা': 'সয়াবিন তেল', 'রুপচাঁদা': 'সয়াবিন তেল',
  'মাশুর': 'মসুর ডাল','মাশুর ডাল': 'মসুর ডাল',
'মুসুর ডাল': 'মসুর ডাল',
};

const UNIT_MAP: Array<[string, Unit]> = [
  ['কেজি', 'kg'], ['কিলোগ্রাম', 'kg'], ['kg', 'kg'],
  ['গ্রাম', 'gram'], ['gram', 'gram'],
  ['লিটার', 'litre'], ['লিটর', 'litre'], ['litre', 'litre'],
  ['মিলি', 'ml'], ['ml', 'ml'],
  ['ডজন', 'dozen'], ['dozen', 'dozen'],
  ['প্যাকেট', 'packet'], ['প্যাক', 'packet'], ['packet', 'packet'],
  ['বস্তা', 'bag'], ['bag', 'bag'],
  ['পিস', 'piece'], ['টি', 'piece'], ['টা', 'piece'],
];

const ACTION_KEYWORDS = [
  'বিক্রি', 'বেচলাম', 'বিক্রয়', 'দিলাম', 'বেচা', 'গেছে', 'গেল', 'দিছি',
  'কিনলাম', 'কিনেছি', 'আনলাম', 'নিলাম', 'ক্রয়', 'কিনছি', 'আইছে',
];

export function normalizeDialect(text: string): string {
  let normalized = text;
  const entries = Object.entries(DIALECT_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [dialect, standard] of entries) {
    normalized = normalized.replace(new RegExp(dialect, 'g'), standard);
  }
  return normalized;
}

function bengaliToArabic(bengali: string): number {
  const map: Record<string, string> = {
    '০':'0','১':'1','২':'2','৩':'3','৪':'4',
    '৫':'5','৬':'6','৭':'7','৮':'8','৯':'9',
  };
  return parseFloat(bengali.split('').map(c => map[c] ?? c).join(''));
}

function extractAllNumbers(text: string): number[] {
  const numbers: number[] = [];
  const bengaliMatches = text.match(/[০-৯]+(?:\.[০-৯]+)?/g) ?? [];
  bengaliMatches.forEach(m => numbers.push(bengaliToArabic(m)));
  const arabicMatches = text.match(/\d+(?:\.\d+)?/g) ?? [];
  arabicMatches.forEach(m => numbers.push(parseFloat(m)));
  const sortedKeys = Object.keys(BANGLA_NUMBERS).sort((a, b) => b.length - a.length);
  for (const word of sortedKeys) {
    if (text.includes(word)) numbers.push(BANGLA_NUMBERS[word]);
  }
  return [...new Set(numbers)];
}

export class NLUService {
  private productIndex: Fuse<Product>;
  private products: Product[] = [];

  constructor(products: Product[]) {
    this.products = products;
    this.productIndex = this.buildIndex(products);
  }

 private buildIndex(products: Product[]) {
  return new Fuse(products, {
    keys: [
      { name: 'name_bangla', weight: 2 },
      { name: 'aliases', weight: 3 },  // aliases get highest weight
      { name: 'name_english', weight: 1 },
    ],
    threshold: 0.35,        // relaxed from 0.15
    includeScore: true,
    minMatchCharLength: 2,  // reduced from 3
    shouldSort: true,
    useExtendedSearch: false,
    ignoreLocation: true,   // KEY: ignores where in string match occurs
    distance: 200,          // allows match anywhere in string
  });
}

  updateProducts(products: Product[]) {
    this.products = products;
    this.productIndex = this.buildIndex(products);
  }

  parse(rawText: string): ParsedCommand {
    const text = normalizeDialect(rawText.trim().toLowerCase());
    console.log('NLU parsing:', text);
    const action = this.detectAction(text);
    console.log('Action detected:', action);
    if (action === 'unknown') return { action: 'unknown', confidence: 0 };
    if (action === 'stock_check') {
      const product = this.extractProduct(text);
      return { action, matched_product: product ?? undefined, confidence: 0.8 };
    }
    if (action === 'daily_summary') return { action, confidence: 0.9 };
  const product = this.extractProduct(text);

// ── KEY FIX: If product has size in name, treat as piece ──
// "কোকাকোলা ২৫০মিলি", "ইস্পাহানি চা ২০০গ্রাম", "আটা ২ কেজি"
// These are PACKET/PIECE products — quantity = how many pieces
const productHasSizeInName = product && this.productHasSizeInName(product.name_bangla);

const unit = productHasSizeInName ? 'piece' : this.extractUnit(text, product?.unit);
const allNumbers = extractAllNumbers(text);

// For packet products, price MUST come from database
const dbPrice = product?.sale_price ?? 0;

let quantity: number | null = null;
let price: number | null = null;

if (productHasSizeInName && dbPrice > 0) {
  // Price from DB, quantity = how many pieces mentioned
  price = dbPrice;
  quantity = this.extractPieceQuantity(text, product!.name_bangla);
} else {
  const extracted = this.smartExtractQtyPrice(text, allNumbers, unit as any);
  quantity = extracted.quantity;
  price = extracted.price;
  // If DB price available and makes sense, prefer it
  if (dbPrice > 0 && price && Math.abs(price - dbPrice) / dbPrice > 0.5) {
    price = dbPrice;
  }
}
    console.log('Parsed result:', { product: product?.name_bangla ?? 'NOT MATCHED', quantity, unit, price });
    const rawName = product?.name_bangla ?? this.extractRawProductName(text);
    const confidence = this.calculateConfidence({ product, quantity, price });
    // Resolve price correctly
let resolvedPrice = price;
let resolvedQuantity = quantity;
let resolvedTotal = price && quantity ? price * quantity : undefined;

if (price && quantity && unit) {
  const { resolvePrice } = require('./priceResolver');
  const dbUnitPrice = product?.sale_price;
  const resolution = resolvePrice(price, quantity, unit, dbUnitPrice);
  resolvedPrice = resolution.unit_price;
  resolvedQuantity = resolution.quantity;
  resolvedTotal = resolution.total_price;
  console.log('Price resolved:', { original: price, unit_price: resolvedPrice, total: resolvedTotal, is_total: resolution.is_total });
}

return {
  action: action as TransactionType,
  product_name: rawName,
  matched_product: product ?? undefined,
  quantity: resolvedQuantity ?? undefined,
  unit: unit ?? undefined,
  price: resolvedPrice ?? undefined,
  total: resolvedTotal ?? undefined,
  confidence,
};
  }

  private extractRawProductName(text: string): string {
    let cleaned = text;
    for (const kw of ACTION_KEYWORDS) cleaned = cleaned.replace(new RegExp(kw, 'g'), '');
    for (const [kw] of UNIT_MAP) cleaned = cleaned.replace(new RegExp(kw, 'g'), '');
    cleaned = cleaned.replace(/[০-৯\d]+/g, '');
    cleaned = cleaned.replace(/টাকা|টাকায়|৳|taka/g, '');
    const sortedKeys = Object.keys(BANGLA_NUMBERS).sort((a, b) => b.length - a.length);
    for (const word of sortedKeys) cleaned = cleaned.replace(new RegExp(word, 'g'), '');
    const words = cleaned.split(/\s+/).filter(w => w.length > 1);
    return words.join(' ').trim() || 'অজানা পণ্য';
  }

  private smartExtractQtyPrice(text: string, allNumbers: number[], unit: Unit | null): { quantity: number | null; price: number | null } {
    if (allNumbers.length === 0) return { quantity: null, price: null };
    if (allNumbers.length === 1) return { quantity: null, price: allNumbers[0] };
    let unitPos = -1;
    for (const [keyword] of UNIT_MAP) {
      const idx = text.indexOf(keyword);
      if (idx !== -1) { unitPos = idx; break; }
    }
    const takaPos = text.indexOf('টাকা');
    let actionPos = text.length;
    for (const kw of ACTION_KEYWORDS) {
      const idx = text.indexOf(kw);
      if (idx !== -1 && idx < actionPos) actionPos = idx;
    }
    if (takaPos !== -1) {
      const beforeTaka = text.substring(0, takaPos);
      const priceNums = extractAllNumbers(beforeTaka);
      const price = priceNums.length > 0 ? priceNums[priceNums.length - 1] : null;
      const beforeAction = text.substring(0, actionPos);
      const qtyNums = extractAllNumbers(beforeAction).filter(n => n !== price);
      const quantity = qtyNums.length > 0 ? qtyNums[0] : null;
      return { quantity, price };
    }
    if (unitPos !== -1) {
      const beforeUnit = text.substring(0, unitPos);
      const afterUnit = text.substring(unitPos);
      const qtyNums = extractAllNumbers(beforeUnit);
      const priceNums = extractAllNumbers(afterUnit);
      const quantity = qtyNums.length > 0 ? qtyNums[qtyNums.length - 1] : null;
      const priceAfterUnit = priceNums.filter(n => n !== quantity);
      const price = priceAfterUnit.length > 0 ? priceAfterUnit[0] : null;
      if (quantity !== null && price !== null) return { quantity, price };
    }
    if (allNumbers.length >= 2) return { quantity: allNumbers[0], price: allNumbers[allNumbers.length - 1] };
    return { quantity: allNumbers[0], price: null };
  }

  private detectAction(text: string): ParsedCommand['action'] {
    if (NLU_STOCK_KEYWORDS.some(k => text.includes(k))) return 'stock_check';
    if (NLU_SUMMARY_KEYWORDS.some(k => text.includes(k))) return 'daily_summary';
    if (NLU_SALE_KEYWORDS.some(k => text.includes(k))) return 'sale';
    if (NLU_PURCHASE_KEYWORDS.some(k => text.includes(k))) return 'purchase';
    return 'sale';
  }

//   private extractProduct(text: string): Product | null {
//     if (this.products.length === 0) return null;
//     const words = text.split(/\s+/);
//     for (let len = 3; len >= 1; len--) {
//       for (let i = 0; i <= words.length - len; i++) {
//         const phrase = words.slice(i, i + len).join(' ');
//         if (/^[০-৯\d]+$/.test(phrase)) continue;
//         if (UNIT_MAP.some(([kw]) => kw === phrase)) continue;
//         if (ACTION_KEYWORDS.includes(phrase)) continue;
//         if (phrase.length < 2) continue;
//        const results = this.productIndex.search(phrase);
// if (results.length > 0 && results[0].score! < 0.35) {
//   console.log(`Matched: "${phrase}" → "${results[0].item.name_bangla}" score:${results[0].score?.toFixed(3)}`);
//   return results[0].item;
// }



// // Also try direct alias match
// const aliasMatch = this.products.find(p =>
//   p.aliases && p.aliases.some(alias =>
//     alias.toLowerCase().includes(phrase.toLowerCase()) ||
//     phrase.toLowerCase().includes(alias.toLowerCase())
//   )
// );
// if (aliasMatch) {
//   console.log(`Alias matched: "${phrase}" → "${aliasMatch.name_bangla}"`);
//   return aliasMatch;
// }
//       }
//     }
//     return null;
//   }


private extractProduct(text: string): Product | null {
  if (this.products.length === 0) return null;
  const words = text.split(/\s+/);

  for (let len = 3; len >= 1; len--) {
    for (let i = 0; i <= words.length - len; i++) {
      const phrase = words.slice(i, i + len).join(' ');
      if (/^[০-৯\d]+$/.test(phrase)) continue;
      if (UNIT_MAP.some(([kw]) => kw === phrase)) continue;
      if (ACTION_KEYWORDS.includes(phrase)) continue;
      if (phrase.length < 2) continue;

      // NEW: Skip if phrase is a number word alone
      if (Object.keys(BANGLA_NUMBERS).includes(phrase)) continue;

      const results = this.productIndex.search(phrase);
      const scoreLimit = phrase.length <= 4 ? 0.15 : 0.35;
if (results.length > 0 && results[0].score! < scoreLimit) {

        // NEW: Verify the match makes sense
        // "আদা" should NOT match "আটা ২ কেজি" 
        const matchedName = results[0].item.name_bangla;
        const similarity = this.basicSimilarity(phrase, matchedName);

        if (similarity < 0.3 && phrase.length <= 3) {
          console.log(`Rejected weak match: "${phrase}" → "${matchedName}"`);
          continue;
        }

        console.log(`Matched: "${phrase}" → "${matchedName}" score:${results[0].score?.toFixed(3)}`);
        return results[0].item;
      }

      // Direct alias check
      const aliasMatch = this.products.find(p =>
        p.aliases && p.aliases.some(alias =>
          alias.toLowerCase() === phrase.toLowerCase()
        )
      );
      if (aliasMatch) return aliasMatch;
    }
  }
  return null;
}

// Basic character similarity
private basicSimilarity(a: string, b: string): number {
  const shorter = a.length < b.length ? a : b;
  let matches = 0;
  for (const char of shorter) {
    if (b.includes(char)) matches++;
  }
  return matches / Math.max(a.length, b.length);
}
  private extractUnit(text: string, productDefaultUnit?: Unit): Unit {
    for (const [keyword, unit] of UNIT_MAP) {
      if (text.includes(keyword)) return unit;
    }
    return productDefaultUnit ?? 'kg';
  }

  // Detects if product name contains size like "250মিলি", "২০০গ্রাম", "১ লিটার", "২ কেজি"
private productHasSizeInName(name: string): boolean {
  const sizePatterns = [
    /\d+\s*(মিলি|ml|গ্রাম|gram|লিটার|litre|কেজি|kg)/i,
    /[০-৯]+\s*(মিলি|গ্রাম|লিটার|কেজি)/,
  ];
  return sizePatterns.some(p => p.test(name));
}

// Extract how many PIECES are being sold
// "কোকাকোলা ২৫০মিলি ৩টা" → 3
// "কোকাকোলা ২৫০মিলি দুইটা" → 2
// "কোকাকোলা ২৫০মিলি" → 1 (default)
private extractPieceQuantity(text: string, productName: string): number {
  // Remove the product name from text to avoid confusion
  const cleanText = text.replace(productName.toLowerCase(), '').trim();

  // Look for piece indicators
  const pieceWords: Record<string, number> = {
    'একটা': 1, 'একটি': 1, 'এক পিস': 1, 'এক পিচ': 1,
    'দুইটা': 2, 'দুটো': 2, 'দুই পিস': 2, 'দুটি': 2,
    'তিনটা': 3, 'তিনটি': 3, 'তিন পিস': 3,
    'চারটা': 4, 'চারটি': 4, 'চার পিস': 4,
    'পাঁচটা': 5, 'পাঁচটি': 5, 'পাঁচ পিস': 5,
    'ছয়টা': 6, 'সাতটা': 7, 'আটটা': 8, 'নয়টা': 9, 'দশটা': 10,
  };

  for (const [word, val] of Object.entries(pieceWords)) {
    if (cleanText.includes(word)) return val;
  }

  // Look for number + টা/টি/পিস pattern
  const match = cleanText.match(/([০-৯\d]+)\s*(টা|টি|পিস|পিচ|piece)/);
  if (match) {
    const num = bengaliToArabic ? bengaliToArabic(match[1]) : parseFloat(match[1]);
    if (num > 0 && num < 100) return num;
  }

  // Plain number in text (but not the product's own size number)
  const numbers = extractAllNumbers(cleanText);
  const smallNumbers = numbers.filter(n => n > 0 && n < 100 && n !== 250 && n !== 500 && n !== 200 && n !== 400);
  if (smallNumbers.length > 0) return smallNumbers[0];

  return 1; // default 1 piece
}

  private calculateConfidence(p: { product: Product | null; quantity: number | null; price: number | null }): number {
    let score = 0;
    if (p.product) score += 0.4;
    if (p.quantity) score += 0.3;
    if (p.price) score += 0.3;
    return score;
  }

  generateConfirmation(cmd: ParsedCommand): string {
    if (cmd.action === 'sale' || cmd.action === 'purchase') {
      const actionWord = cmd.action === 'sale' ? 'বিক্রয়' : 'ক্রয়';
      const product = cmd.product_name ?? 'পণ্য';
      const qty = cmd.quantity ?? '?';
      const unitMap: Record<string, string> = {
        kg: 'কেজি', gram: 'গ্রাম', litre: 'লিটার', ml: 'মিলি',
        piece: 'টি', dozen: 'ডজন', packet: 'প্যাকেট', bag: 'বস্তা',
      };
      const unit = cmd.unit ? (unitMap[cmd.unit] ?? '') : '';
      const price = cmd.price ? `${cmd.price} টাকায়` : '';
      return `${actionWord}: ${product}, ${qty} ${unit} ${price}। কি সঠিক?`;
    }
    if (cmd.action === 'stock_check') {
      return `${cmd.matched_product?.name_bangla ?? 'পণ্য'} এর স্টক দেখাচ্ছি।`;
    }
    return 'আপনার অনুরোধ বুঝতে পারিনি। আবার বলুন।';
  }
}

export const createNLUService = (products: Product[]) => new NLUService(products);
