import type { Product } from '@/types';

/**
 * Instant, format-tolerant barcode lookup.
 *
 * The same physical barcode reaches us in different spellings depending on the scanner and library:
 *   - UPC-A is 12 digits, but is very often reported as EAN-13 with a leading 0  (036000291452 <-> 0036000291452)
 *   - UPC-E is a 6-digit code compressed into 8 digits and must be expanded to UPC-A to match the stored number
 *   - stray spaces / lower-case in shop-made codes (dkn-4cb9-000012)
 * An exact string compare misses all of these, the lookup then goes to the server, the server compares exactly too, and the
 * shopkeeper is told a product that IS in his shop "is not found — add a new product". Comparing on a canonical key fixes that,
 * and a Map makes it O(1) instead of scanning the whole list on every scan.
 */

/** Canonical form: digits only -> leading zeros dropped (so UPC-A == EAN-13-with-0); anything else -> trimmed, upper-cased. */
export function canonicalBarcode(raw: string): string {
  const s = (raw ?? '').trim();
  if (/^\d+$/.test(s)) return s.replace(/^0+/, '') || '0';
  return s.toUpperCase();
}

/** UPC-E (8 digits, number system 0/1) -> the 12-digit UPC-A it stands for; null if it is not a valid UPC-E shape. */
export function expandUpcE(code: string): string | null {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const ns = code[0];
  const d = code.slice(1, 7);        // six data digits
  const check = code[7];
  const last = d[5];
  let body: string;
  if (last === '0' || last === '1' || last === '2') body = `${d.slice(0, 2)}${last}0000${d.slice(2, 5)}`;
  else if (last === '3') body = `${d.slice(0, 3)}00000${d.slice(3, 5)}`;
  else if (last === '4') body = `${d.slice(0, 4)}00000${d[4]}`;
  else body = `${d.slice(0, 5)}0000${last}`;
  return `${ns}${body}${check}`;
}

/** Every stored-form this scanned string might correspond to (the scanned form first). */
export function barcodeCandidates(raw: string): string[] {
  const out = [canonicalBarcode(raw)];
  const s = (raw ?? '').trim();
  const upcA = expandUpcE(s);
  if (upcA) out.push(canonicalBarcode(upcA));
  return out;
}

type Index = Map<string, Product>;
const cache = new WeakMap<Product[], Index>();

function indexFor(products: Product[]): Index {
  let idx = cache.get(products);
  if (!idx) {
    idx = new Map();
    for (const p of products) {
      const b = p?.barcode;
      if (!b) continue;
      const key = canonicalBarcode(b);
      // Inactive duplicates must never shadow the live product.
      if (!idx.has(key) || (p.is_active !== false && idx.get(key)?.is_active === false)) idx.set(key, p);
    }
    cache.set(products, idx);
  }
  return idx;
}

/** Look a scanned code up in the shop's product list. Rebuilt automatically whenever the list is replaced. */
export function findProductByBarcode(products: Product[], scanned: string): Product | undefined {
  const idx = indexFor(products);
  for (const key of barcodeCandidates(scanned)) {
    const hit = idx.get(key);
    if (hit) return hit;
  }
  return undefined;
}

/** Shop-made internal barcode, e.g. DKN-4CB9-000012. Code 128 carries its own checksum, so one clean read is enough. */
export const INTERNAL_BARCODE = /^DKN-[A-Z0-9]{4}-\d{6}$/i;
