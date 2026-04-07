import { NLUService } from './nluService';
import { ParsedCommand, Product, SaleItem } from '../../types';

// ============================================================
// Multi-Item Voice Parser
// Splits one long voice command into multiple sale items
//
// Input:  "পিয়াজ এক কেজি সত্তর ময়দা দুই কেজি একশো পঞ্চাশ তেল পাঁচ লিটার আটশো"
// Output: [
//   { product: পেঁয়াজ, qty: 1, unit: kg, price: 70 },
//   { product: ময়দা,  qty: 2, unit: kg, price: 150 },
//   { product: তেল,   qty: 5, unit: litre, price: 800 },
// ]
// ============================================================

// Separator patterns that indicate a new product is starting
const PRODUCT_SEPARATORS = [
  ',',           // comma
  '،',           // Arabic comma
  ' এবং ',      // and
  ' আর ',       // and (informal)
  ' তারপর ',    // then
  ' পরে ',      // after
];

// Price ending indicators — after price, next word starts new product
const PRICE_ENDINGS = [
  'টাকা', 'টাকায়', '৳', 'taka',
];

export class MultiItemParser {
  private nlu: NLUService;

  constructor(nlu: NLUService) {
    this.nlu = nlu;
  }

  // Main entry — try multi-item first, fall back to single
  parse(rawText: string): { items: ParsedCommand[]; isMulti: boolean } {
    const segments = this.splitIntoSegments(rawText);

    if (segments.length <= 1) {
      // Single item
      const single = this.nlu.parse(rawText);
      return { items: [single], isMulti: false };
    }

    // Multiple items
    const items = segments
      .map(seg => this.nlu.parse(seg))
      .filter(cmd => cmd.action !== 'unknown' && cmd.product_name);

    if (items.length === 0) {
      const single = this.nlu.parse(rawText);
      return { items: [single], isMulti: false };
    }

    return { items, isMulti: items.length > 1 };
  }

  // Split raw text into product segments
  private splitIntoSegments(text: string): string[] {
    let workingText = text;

    // Step 1 — split by explicit separators
    for (const sep of PRODUCT_SEPARATORS) {
      if (workingText.includes(sep)) {
        return workingText
          .split(sep)
          .map(s => s.trim())
          .filter(s => s.length > 2);
      }
    }

    // Step 2 — split by price endings followed by new product
    // Pattern: [product][qty][unit][price টাকা] [new product]...
    const segments: string[] = [];
    let current = '';
    const words = workingText.split(/\s+/);

    for (let i = 0; i < words.length; i++) {
      current += (current ? ' ' : '') + words[i];

      // If current word is a price ending AND next word looks like a product
      // (not a number, not a unit word) — split here
      const isPriceEnding = PRICE_ENDINGS.some(p => words[i].includes(p));
      const nextIsNewProduct = i + 1 < words.length &&
        !this.isNumberWord(words[i + 1]) &&
        !this.isUnitWord(words[i + 1]) &&
        !this.isPriceWord(words[i + 1]);

      if (isPriceEnding && nextIsNewProduct) {
        segments.push(current.trim());
        current = '';
      }
    }

    if (current.trim()) segments.push(current.trim());

    // Step 3 — if still one segment, try splitting by price pattern
    // Look for: [number টাকা] gaps between items
    if (segments.length <= 1) {
      return this.splitByPricePattern(workingText);
    }

    return segments.filter(s => s.length > 2);
  }

  // Split using numeric pattern detection
  // "পিয়াজ ১ কেজি ৭০ ময়দা ২ কেজি ১৫০" 
  // Numbers after units are prices, next word after price starts new item
  private splitByPricePattern(text: string): string[] {
    const words = text.split(/\s+/);
    const segments: string[] = [];
    let current: string[] = [];
    let lastWasNumber = false;
    let unitFound = false;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const isNum = this.isNumberWord(word) || /^[\d০-৯]+$/.test(word);
      const isUnit = this.isUnitWord(word);

      // If we have [unit][number] or [number] after unit, 
      // and next word is NOT a number/unit → this number is a price → split
      if (isNum && unitFound && lastWasNumber) {
        current.push(word);
        // Price found, next item starts
        if (i + 1 < words.length && !this.isUnitWord(words[i + 1]) && !this.isNumberWord(words[i + 1])) {
          segments.push(current.join(' '));
          current = [];
          unitFound = false;
          lastWasNumber = false;
          continue;
        }
      } else {
        current.push(word);
      }

      if (isUnit) unitFound = true;
      lastWasNumber = isNum;
    }

    if (current.length > 0) segments.push(current.join(' '));

    return segments.length > 1 ? segments : [text];
  }

  private isNumberWord(word: string): boolean {
    const numberWords = [
      'এক','দুই','তিন','চার','পাঁচ','ছয়','সাত','আট','নয়','দশ',
      'বিশ','ত্রিশ','চল্লিশ','পঞ্চাশ','ষাট','সত্তর','আশি','নব্বই',
      'একশো','দুইশো','তিনশো','চারশো','পাঁচশো','ছয়শো','সাতশো','আটশো','নয়শো',
      'হাজার','দেড়','আড়াই',
    ];
    return numberWords.includes(word) || /^[\d০-৯]+$/.test(word);
  }

  private isUnitWord(word: string): boolean {
    return ['কেজি','কিলো','লিটার','লিটর','গ্রাম','পিস','ডজন','প্যাকেট','বস্তা','kg','litre','gram'].includes(word);
  }

  private isPriceWord(word: string): boolean {
    return ['টাকা','টাকায়','৳','taka'].includes(word);
  }

  // Convert parsed commands to sale items for session
  toSaleItems(commands: ParsedCommand[]): SaleItem[] {
    return commands
      .filter(cmd => cmd.product_name && cmd.quantity && cmd.price)
      .map(cmd => ({
        product_name: cmd.product_name!,
        product_id: cmd.matched_product?.id,
        quantity: cmd.quantity!,
        unit: cmd.unit ?? cmd.matched_product?.unit ?? 'kg',
        unit_price: cmd.price!,
        total: +(cmd.quantity! * cmd.price!).toFixed(2),
      }));
  }

  // Generate multi-item confirmation text for TTS
  generateMultiConfirmation(items: SaleItem[]): string {
    if (items.length === 0) return 'কিছু বুঝতে পারিনি। আবার বলুন।';
    if (items.length === 1) {
      const item = items[0];
      return `${item.product_name}, ${item.quantity} ${item.unit}, ${item.unit_price} টাকা। সঠিক?`;
    }
    const total = items.reduce((s, i) => s + i.total, 0);
    const names = items.map(i => i.product_name).join(', ');
    return `${items.length} টি পণ্য: ${names}। মোট ${Math.round(total)} টাকা। সঠিক?`;
  }
}
