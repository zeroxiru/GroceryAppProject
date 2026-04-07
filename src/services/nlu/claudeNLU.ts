import { SaleItem } from '../../types';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM_PROMPT = `You are an expert Bangladeshi grocery shop assistant with deep knowledge of local products and pricing.

Extract ALL products from the voice input and return ONLY valid JSON.

CRITICAL PRICING RULES:
1. When someone says "5 litre oil 890" → 890 is the TOTAL price for 5 litres, unit_price = 890/5 = 178
2. When someone says "oil 178 taka per litre, 5 litre" → unit_price = 178, total = 890
3. When someone says "200 gram morich gura 120 taka" → 120 is the PACKET price, unit = "packet", quantity = 1, unit_price = 120
4. When weight is mentioned with a fixed price → treat as packet/fixed price item
5. When no unit mentioned but price given → assume it is total price

PRODUCT KNOWLEDGE:
- Spices sold by weight (open): মরিচ গুঁড়া, হলুদ গুঁড়া, ধনে গুঁড়া → unit = gram/kg, calculate per-unit price
- Spices sold as packets (branded): Fresh, Radhuni, Pran → unit = packet, price is fixed per packet
- Drinks: always sold per piece/bottle → unit = piece
  - Coca-Cola 250ml, 500ml, 1L, 1.25L, 2L are different products
  - 7Up, Fanta, Sprite, RC Cola, Mojo, Speed similarly
- Oil: sold by litre → if total given, divide by quantity for unit_price
- Rice, Dal, Sugar, Salt: sold by kg → if total given, divide by quantity for unit_price
- Eggs: sold by piece or dozen

BRAND RECOGNITION:
- Fresh, Radhuni, Pran, BD Foods, Aarong → branded packets, fixed price
- "খোলা" or "loose" = open/unbranded → priced by weight

MULTI-PRODUCT PARSING:
- Parse ALL products mentioned, even 15+ items
- Each item separated by comma, "আর", "এবং", pause indicators
- If product name unclear, use best guess and set confidence below 0.7

Return this EXACT JSON (no markdown, no explanation):
{
  "action": "sale",
  "items": [
    {
      "product_name": "exact bangla name",
      "brand": "brand name or null",
      "variant": "size/type variant or null",
      "quantity": number,
      "unit": "kg|gram|litre|ml|piece|dozen|packet|bag",
      "unit_price": number,
      "total_price": number,
      "price_type": "unit|total|packet",
      "confidence": 0.0 to 1.0,
      "notes": "any ambiguity explanation"
    }
  ]
}

Examples:
Input: "5 litre tel 890"
Output: {"action":"sale","items":[{"product_name":"সয়াবিন তেল","brand":null,"variant":"5 litre","quantity":5,"unit":"litre","unit_price":178,"total_price":890,"price_type":"total","confidence":0.85,"notes":"890 treated as total for 5L"}]}

Input: "fresh moricher gura 200 gram 45 taka"
Output: {"action":"sale","items":[{"product_name":"মরিচ গুঁড়া","brand":"Fresh","variant":"200g packet","quantity":1,"unit":"packet","unit_price":45,"total_price":45,"price_type":"packet","confidence":0.95,"notes":"branded packet, price is per packet"}]}

Input: "cocola 1 litre 3 ta 180 taka"  
Output: {"action":"sale","items":[{"product_name":"Coca-Cola","brand":"Coca-Cola","variant":"1L","quantity":3,"unit":"piece","unit_price":60,"total_price":180,"price_type":"total","confidence":0.9,"notes":"3 bottles of 1L Coca-Cola, 180/3=60 each"}]}`;

export interface ClaudeItem {
  product_name: string;
  brand: string | null;
  variant: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  price_type: 'unit' | 'total' | 'packet';
  confidence: number;
  notes?: string;
}

export interface ClaudeNLUResult {
  action: 'sale' | 'purchase';
  items: ClaudeItem[];
  raw_text: string;
  used_ai: boolean;
}

export async function parseWithClaude(text: string): Promise<ClaudeNLUResult> {
  const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';
  if (!apiKey || apiKey.length < 10) throw new Error('NO_API_KEY');

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: text }],
    }),
  });

  if (!response.ok) throw new Error(`API error: ${response.status}`);

  const data = await response.json();
  const content = data.content[0]?.text ?? '';
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Invalid response');

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    action: parsed.action ?? 'sale',
    items: parsed.items ?? [],
    raw_text: text,
    used_ai: true,
  };
}

export function claudeResultToSaleItems(result: ClaudeNLUResult): SaleItem[] {
  return result.items
    .filter(item => item.product_name && item.quantity && item.unit_price)
    .map(item => {
      // Build display name including brand and variant
      let displayName = item.product_name;
      if (item.brand && item.brand !== item.product_name) {
        displayName = `${item.brand} ${item.product_name}`;
      }
      if (item.variant) {
        displayName = `${displayName} (${item.variant})`;
      }

      return {
        product_name: displayName,
        product_id: undefined,
        quantity: item.quantity,
        unit: item.unit as any ?? 'piece',
        unit_price: item.unit_price,
        total: item.total_price || +(item.quantity * item.unit_price).toFixed(2),
      };
    });
}

export function claudeResultToParsedCommand(result: ClaudeNLUResult, matchedProduct?: any) {
  const first = result.items[0];
  if (!first) return { action: 'unknown' as const, confidence: 0 };
  return {
    action: result.action,
    product_name: first.product_name,
    matched_product: matchedProduct,
    quantity: first.quantity,
    unit: first.unit as any,
    price: first.unit_price,
    confidence: first.confidence,
  };
}
