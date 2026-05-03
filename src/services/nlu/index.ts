import { parseWithClaude, claudeResultToSaleItems } from './claudeNLU';
import { NLUService, createNLUService } from './nluService';
import { MultiItemParser } from './multiItemParser';
import { Product, ParsedCommand, SaleItem } from '../../types';

// ============================================================
// Smart NLU Router
// 1. Try Claude API first (accurate, handles all edge cases)
// 2. Fall back to rule-based if no API key or API fails
// ============================================================

export async function smartParse(
  rawText: string,
  products: Product[],
  nluService: NLUService,
  multiParser: MultiItemParser
): Promise<{
  items: SaleItem[];
  commands: ParsedCommand[];
  isMulti: boolean;
  usedAI: boolean;
  action: 'sale' | 'purchase';
}> {
  // Try Claude first
  const claudeResult = await parseWithClaude(rawText);

  if (claudeResult && claudeResult.items.length > 0) {
    console.log('Using Claude NLU ✓');
    const saleItems = claudeResultToSaleItems(claudeResult);
    const commands: ParsedCommand[] = claudeResult.items.map(item => ({
      action: claudeResult.action,
      product_name: item.product_name,
      matched_product: products.find(p =>
        p.name_bangla === item.product_name || p.name_english === item.product_name
      ),
      quantity: item.quantity,
      unit: item.unit as any,
      price: item.unit_price,
      confidence: 0.95,
    }));

    return {
      items: saleItems,
      commands,
      isMulti: claudeResult.items.length > 1,
      usedAI: true,
      action: claudeResult.action,
    };
  }

  // Fall back to rule-based
  console.log('Using rule-based NLU (no API key or API failed)');
  const { items: parsedItems, isMulti } = multiParser.parse(rawText);
  const saleItems = multiParser.toSaleItems(parsedItems);

  return {
    items: saleItems,
    commands: parsedItems,
    isMulti,
    usedAI: false,
    action: parsedItems[0]?.action === 'purchase' ? 'purchase' : 'sale',
  };
}

export { createNLUService, NLUService } from './nluService';
export { MultiItemParser } from './multiItemParser';
