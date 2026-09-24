/**
 * The 12 approved grocery shop categories. `key` is what is stored in products.category (English, stable);
 * `bn` is what the shopkeeper sees. One list, used by the POS category rail and the product forms, so a category
 * chosen when adding a product is exactly the one the rail shows.
 */
export const GROCERY_CATEGORIES: { key: string; bn: string }[] = [
  { key: 'Rice & Grains', bn: 'চাল ও শস্য' },
  { key: 'Dal & Pulses', bn: 'ডাল' },
  { key: 'Oil & Ghee', bn: 'তেল ও ঘি' },
  { key: 'Spices', bn: 'মসলা' },
  { key: 'Onion, Garlic & Veg', bn: 'পেঁয়াজ, রসুন ও সবজি' },
  { key: 'Sugar, Salt & Tea', bn: 'চিনি, লবণ ও চা' },
  { key: 'Dairy & Eggs', bn: 'দুধ ও ডিম' },
  { key: 'Snacks & Biscuits', bn: 'বিস্কুট ও স্ন্যাকস' },
  { key: 'Drinks', bn: 'পানীয়' },
  { key: 'Personal Care', bn: 'প্রসাধনী' },
  { key: 'Cleaning & Household', bn: 'পরিষ্কার ও গৃহস্থালি' },
  { key: 'Baby & Misc', bn: 'শিশু ও অন্যান্য' },
];

/** Where a product goes when the shopkeeper does not pick a category. */
export const DEFAULT_GROCERY_CATEGORY = 'Baby & Misc';
