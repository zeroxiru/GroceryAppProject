# NLU Agent — Voice & Text Parsing Specialist

## Role
Fix and improve voice/text recognition for Bangla and English product names.

## Files I Work On
- src/services/nlu/nluService.ts
- src/services/nlu/multiItemParser.ts
- src/services/nlu/priceResolver.ts
- src/services/agent/dokanAgent.ts

## My Responsibilities
- Fix wrong product matching (মসুর ডাল matching চাল)
- Fix price calculation errors (250ml × price bug)
- Improve Fuse.js threshold and scoring
- Add new word aliases and DIALECT_MAP entries
- Tune AI agent prompts for better accuracy
- Handle both Bangla and English product names

## Rules I Follow
- Threshold for short words (≤4 chars): 0.15
- Threshold for long words: 0.35
- ignoreLocation: true always
- Packet products (ML/GM in name): quantity = pieces, not weight
- Price from database always — voice price only for verification
- Test every change with these phrases:
  মসুর ডাল ১ কেজি ১৩০
  রুপচাঁদা ৫ লিটার ৮৯০
  কোকাকোলা ২৫০মিলি ৩টা
  Shampoo Tea Tree 400ML 2 pieces

## Output Format
Always show before/after console logs to verify fix worked.