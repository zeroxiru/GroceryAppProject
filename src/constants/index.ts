import { ProductCategory, Unit } from '../types';

export const COLORS = {
  primary: '#1B4332',
  primaryLight: '#2D6A4F',
  primaryLighter: '#52B788',
  accent: '#F9A825',
  background: '#F8F9FA',
  surface: '#FFFFFF',
  surfaceSecondary: '#F1F3F5',
  text: '#1A1A2E',
  textSecondary: '#6C757D',
  textMuted: '#ADB5BD',
  border: '#DEE2E6',
  success: '#2D6A4F',
  error: '#C62828',
  warning: '#F9A825',
  info: '#1565C0',
  sale: '#2D6A4F',
  purchase: '#1565C0',
};

export const FONT_SIZES = {
  xs: 11, sm: 13, md: 15, lg: 17, xl: 20, xxl: 24, xxxl: 32,
};

export const UNITS: Record<Unit, { label: string; bangla: string }> = {
  kg:     { label: 'Kilogram', bangla: 'কেজি' },
  gram:   { label: 'Gram',     bangla: 'গ্রাম' },
  litre:  { label: 'Litre',    bangla: 'লিটার' },
  ml:     { label: 'ML',       bangla: 'মিলি' },
  piece:  { label: 'Piece',    bangla: 'পিস' },
  dozen:  { label: 'Dozen',    bangla: 'ডজন' },
  packet: { label: 'Packet',   bangla: 'প্যাকেট' },
  bag:    { label: 'Bag',      bangla: 'বস্তা' },
};

export const CATEGORIES: Record<ProductCategory, string> = {
  grain:    'চাল-ডাল',
  oil:      'তেল',
  spice:    'মশলা',
  vegetable:'সবজি',
  fish_meat:'মাছ-মাংস',
  dairy:    'দুধ-ডিম',
  beverage: 'পানীয়',
  snack:    'বিস্কুট',
  cleaning: 'পরিষ্কার',
  other:    'অন্যান্য',
};

export const BANGLA_NUMBERS: Record<string, number> = {
  'এক': 1, 'দুই': 2, 'তিন': 3, 'চার': 4, 'পাঁচ': 5,
  'ছয়': 6, 'সাত': 7, 'আট': 8, 'নয়': 9, 'দশ': 10,
  'বিশ': 20, 'ত্রিশ': 30, 'চল্লিশ': 40, 'পঞ্চাশ': 50,
  'ষাট': 60, 'সত্তর': 70, 'আশি': 80, 'নব্বই': 90,
  'একশো': 100, 'দুইশো': 200, 'তিনশো': 300, 'চারশো': 400,
  'পাঁচশো': 500, 'ছয়শো': 600, 'সাতশো': 700, 'আটশো': 800, 'নয়শো': 900,
  'হাজার': 1000, 'দেড়': 1.5, 'আড়াই': 2.5,
};

export const NLU_SALE_KEYWORDS = [
  'বিক্রি','বেচলাম','বিক্রয়','দিলাম','বেচা','গেছে','গেল','দিছি',
];
export const NLU_PURCHASE_KEYWORDS = [
  'কিনলাম','কিনেছি','আনলাম','নিলাম','ক্রয়','কিনছি','আইছে',
];
export const NLU_STOCK_KEYWORDS = ['স্টক','মজুদ','কত আছে','আছে কতটুকু'];
export const NLU_SUMMARY_KEYWORDS = ['সারাংশ','হিসাব','আজকের','মোট','summary'];

export const STRINGS = {
  nav_home: 'হোম',
  nav_history: 'ইতিহাস',
  nav_inventory: 'স্টক',
  nav_reports: 'রিপোর্ট',
  nav_settings: 'সেটিংস',
  voice_hint: 'বোতামে চেপে ধরুন ও বলুন',
  voice_listening: 'শুনছি...',
  voice_processing: 'বুঝছি...',
  voice_saved: 'সেভ হয়েছে!',
  taka: '৳',
};

export const OFFLINE_SYNC_INTERVAL_MS = 30000;