/**
 * Query variants for the live product search (PRD FR-3: dialect / spelling tolerant).
 *
 * Fuse already forgives small typos. What it cannot know:
 *  - dialect / alternative spellings of PRODUCT words (চাউল = চাল, মুসুর = মসুর, সইরষা = সরিষা …)
 *  - digits: product names carry Bangla digits ("সরিষার তেল ৫০০ মি.লি") but shopkeepers type 500, and the other way round
 *
 * The search runs the typed text first, then each variant below, and appends only NEW matches after the direct ones — so a
 * variant can add results but can never push a direct match down. (nluService.normalizeDialect is for spoken commands: it
 * rewrites verbs and quantities like আইছে→কিনলাম, which would only add noise to a product search, so it is not reused here.)
 */

// Product-word spellings only. Left = what people type, right = how the catalogue may spell it. Pairs that go both ways
// are listed both ways; each rule is tried on its own (never chained), so a pair cannot undo itself.
const PRODUCT_WORD_VARIANTS: Array<[string, string]> = [
  ['চাউল', 'চাল'], ['চাইল', 'চাল'],
  ['সইরষা', 'সরিষা'], ['সরষে', 'সরিষা'], ['সর্ষে', 'সরিষা'],
  ['মুসুর', 'মসুর'], ['মুশুর', 'মসুর'], ['মাশুর', 'মসুর'], ['মশুর', 'মসুর'],
  ['লিটর', 'লিটার'], ['কিলো', 'কেজি'], ['কেজী', 'কেজি'],
  ['পিয়াজ', 'পেঁয়াজ'], ['পেয়াজ', 'পেঁয়াজ'], ['পেঁয়াজ', 'পিয়াজ'],
  ['রসুন', 'রশুন'], ['রশুন', 'রসুন'],
  ['লবন', 'লবণ'], ['লবণ', 'লবন'],
  ['চিনি', 'চিনী'], ['চিনী', 'চিনি'],
  ['বিস্কুট', 'বিসকুট'], ['বিসকুট', 'বিস্কুট'], ['বিস্কিট', 'বিস্কুট'],
];

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const toBangla = (s: string) => s.replace(/[0-9]/g, d => BN_DIGITS[Number(d)]);
const toArabic = (s: string) => s.replace(/[০-৯]/g, d => String(BN_DIGITS.indexOf(d)));

/** The typed query first, then distinct alternatives (never empty strings, never duplicates). */
export function queryVariants(raw: string): string[] {
  const q = raw.trim();
  if (!q) return [];
  const out: string[] = [q];
  const add = (v: string) => { const t = v.trim(); if (t && !out.includes(t)) out.push(t); };

  // spelling / dialect variants of product words — one rule at a time
  const spelled: string[] = [];
  for (const [from, to] of PRODUCT_WORD_VARIANTS) {
    if (q.includes(from)) spelled.push(q.split(from).join(to));
  }
  spelled.forEach(add);

  // digits both ways, on the typed text and on each spelling variant
  for (const base of [q, ...spelled]) {
    add(toBangla(base));
    add(toArabic(base));
  }
  return out;
}
