# DokanAI — Claude Code Project Configuration

## Project Overview
DokanAI is a React Native (Expo) billing app for Bangladeshi shops.
Supports grocery, cosmetics, and imported food shop types.
Uses Bangla voice input, barcode scanning, and AI-powered NLU.

## Tech Stack
- React Native + Expo SDK 52
- TypeScript
- Supabase (PostgreSQL + Auth)
- Zustand (state management)
- Expo Router (navigation)
- expo-speech-recognition (voice)
- Fuse.js (fuzzy matching)

## Project Structure
app/               → screens (Expo Router)
(tabs)/          → home, history, inventory, reports, settings
src/
services/
supabase/      → database operations
nlu/           → voice/text parsing
agent/         → Claude AI agent
voice/         → speech recognition
store/           → Zustand state
types/           → TypeScript interfaces
constants/       → colors, fonts
utils/           → helpers
## Supabase Config
- URL: https://dunmxxoeulhezufzawbk.supabase.co
- Shop ID: 8e14aea6-76cb-41d9-b025-f34ac77213e6
- Tables: shops, users, products, transactions, global_products

## Shop Types
- grocery: Bangla voice, Bangla products
- cosmetics: English products, barcode, expiry tracking
- imported: Barcode primary, English, country of origin
- mixed: All features

## Key Rules
1. Always use TypeScript with proper types
2. All UI text in Bangla (buttons, labels, messages)
3. Product names in English for cosmetics/imported shops
4. Offline-first: save locally first, sync to Supabase later
5. Never break existing grocery shop functionality
6. Price is ALWAYS from database — never calculate from voice
7. Packet products (ML/GM in name) = price per piece, not per unit

## Environment Variables
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
EXPO_PUBLIC_ANTHROPIC_API_KEY

## Build Commands
- Dev: npx expo start
- APK: eas build --platform android --profile preview
- Local APK: cd android && ./gradlew assembleRelease