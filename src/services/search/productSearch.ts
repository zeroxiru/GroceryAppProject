import Fuse, { IFuseOptions } from 'fuse.js';
import { Product } from '../../types';
import { queryVariants } from './searchNormalize';

/**
 * Shared product search index — the single Fuse.js config used everywhere a
 * shopkeeper's typed/spoken text needs to match a product: the NLU voice/text
 * parser (nluService.ts) AND the POS screen's live search bar
 * (InstantSearchBar.tsx). One index, two consumers — do not fork this config.
 *
 * Built once per product-list load (see ProductSearchIndex.update), never
 * rebuilt per keystroke — that's what makes the live search bar feel instant.
 */
const FUSE_OPTIONS: IFuseOptions<Product> = {
  keys: [
    { name: 'name_bangla', weight: 2 },
    { name: 'aliases', weight: 3 }, // aliases get the highest weight
    { name: 'name_english', weight: 1 },
    { name: 'brand', weight: 1 },
  ],
  threshold: 0.35,
  includeScore: true,
  minMatchCharLength: 1, // a single typed character must already narrow results
  shouldSort: true,
  useExtendedSearch: false,
  ignoreLocation: true, // matches anywhere in the string, not just the start
  distance: 200,
};

/**
 * The one place this Fuse config is defined. `nluService.ts` (voice/text
 * command parsing, which needs raw Fuse results for its own score thresholds)
 * and `ProductSearchIndex` below (the POS search bar's live results) both
 * build their index through this factory instead of each declaring their own
 * options — that's the "don't fork the logic" requirement from the PRD.
 */
export function buildProductFuseIndex(products: Product[]): Fuse<Product> {
  return new Fuse(products, FUSE_OPTIONS);
}

export class ProductSearchIndex {
  private fuse: Fuse<Product>;
  private products: Product[] = [];

  constructor(products: Product[] = []) {
    this.products = products;
    this.fuse = buildProductFuseIndex(products);
  }

  /** Rebuild the index — call this when the product list changes, not per keystroke. */
  update(products: Product[]) {
    this.products = products;
    this.fuse = buildProductFuseIndex(products);
  }

  /**
   * Live search — safe to call on every keystroke (including the first
   * character). Returns products ranked best-match-first. An empty/blank
   * query returns [] so callers can fall back to their own empty-state
   * (category grid, recent, frequent) rather than dumping the whole catalog.
   */
  search(query: string, limit = 30): Product[] {
    const variants = queryVariants(query);
    if (variants.length === 0) return [];
    // Direct matches first, in Fuse's own ranking; matches found only through a spelling/digit variant are appended after.
    const out: Product[] = [];
    const seen = new Set<string>();
    for (const v of variants) {
      for (const r of this.fuse.search(v, { limit })) {
        if (!seen.has(r.item.id)) { seen.add(r.item.id); out.push(r.item); }
      }
    }
    return out.slice(0, limit);
  }

  /** Exact barcode/SKU match, ranked first by the search bar's own ordering rule. */
  findByBarcode(code: string): Product | undefined {
    return this.products.find(p => p.barcode === code);
  }
}
