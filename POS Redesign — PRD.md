# DokanAI Mobile — POS Screen Redesign PRD

**Status:** Draft for review
**Owner:** Ibrahim Rahamathullah
**Scope:** `DokanAI` mobile app (Expo/React Native) only. **Backend is frozen** — this PRD proposes zero backend/schema changes unless explicitly marked ⚠️ in [§9](#9-api-surface--what-already-exists).
**Reference evidence:** `../Requirements/GroceryShopsRequirment/*.jpeg` (12 shop-floor photos), `../Requirements/posScreenDisplay1.png`, `posScreenDisplay2.png` (current app), `../Requirements/AppSessionError.png` (session bug), `../Requirements/WhatsApp Image 2026-09-22 at 00.41.0*.jpeg` (handwritten khata ledger pages).

---

## 1. Problem Statement

The current mobile POS (`app/(tabs)/home.tsx`) is voice-first: a shopkeeper holds a mic button and speaks the sale. This works for a solo owner narrating one item at a time, but it breaks down under real Bangladeshi grocery shop conditions documented in the reference photos:

- **The shop floor has no fixed organization.** Shelves are packed floor-to-ceiling by whatever fits, not by category (see `14.35.28.jpeg`, `14.35.30.jpeg`). Spices and nuts are sold loose from unlabeled jars weighed on a mechanical scale (`14.35.28.jpeg`). The shopkeeper's mental map of "where a product is" doesn't translate into "how fast can I find it in the app."
- **The counter is one cash box serving several customers who arrive together.** Nothing in the app today lets the shopkeeper start ringing up customer B while customer A's bill is still open.
- **Most inventory has no printed barcode at all** — loose snacks hung on wire racks (`14.35.32.jpeg`), open biscuits, weighed spices, produce. Only branded packaged goods (Lays, Kurkure, soap) carry a manufacturer barcode.
- **The shopkeeper still keeps a parallel paper ledger (khata)** — see the handwritten pages — because it's faster than fighting the app for uncommon items. Any redesign has to beat pen-and-paper on speed, or shopkeepers will keep bypassing it.
- **A confirmed bug compounds all of this:** mid-bill, the app throws `Session expired` and drops the draft (`AppSessionError.png` — 2 items, ৳110, wiped). A faster POS is worthless if it can lose a live sale.

This PRD redesigns the mobile POS around **fast product discovery** (search + browse + scan, not voice-only) and **shop-floor reality** (loose items, shared cash box, no barcodes), while keeping voice entry as one of several input paths rather than the only one.

---

## 2. Goals

1. **Instant, indexed product search.** Typing a single character — Bangla or English — immediately narrows a live list of matching products directly under the search bar; tapping a result adds it. No "press search," no waiting on a network round trip. This is the single most important mechanic in this redesign — see the headline requirement at the top of §6.A.
2. Cut the time to add a known item to a bill to **under 2 seconds** from POS-open (search-and-tap or scan), for both barcoded and non-barcoded items.
3. Let the shopkeeper **serve more than one customer's bill concurrently** without losing either one.
4. Give every physical item a **scannable identity**, including loose/weighed/unbranded goods, by generating and printing the shop's own barcode labels.
5. **Never lose an in-progress bill** to a session/auth failure, network drop, or app backgrounding.
6. Keep the app **Bangla-first, one-handed, low-literacy-friendly** (large tap targets, icons + text, minimal typing required for the common path) — per existing `CLAUDE.md` rules, which this PRD does not override.

## Non-Goals

- No backend/API changes beyond what's listed in [§9](#9-api-surface--what-already-exists) as already existing but unused.
- No change to the pricing model (price always from DB — unchanged).
- No redesign of History, Reports, Settings, or Inventory tabs (only touched where the POS needs a new shared primitive, e.g. barcode generation UI, which naturally lives in Inventory too — noted where relevant).
- Not attempting full planogram/shelf-mapping software — the fix for "disorganized shelves" is *findability in the app*, not reorganizing the physical shop.

---

## 3. Personas

| Persona | Context | Primary need |
|---|---|---|
| **Shop owner** | Runs the register most of the day, knows their stock by feel, not by app category | Fastest possible entry for items they sell 50×/day |
| **Helper/staff** | Younger, may not know every product's location or price by heart | Search/scan must work *without* relying on memory |
| **Waiting customer** | Not an app user, but their patience is the metric that matters | Indirect: queue time per transaction |

---

## 4. Scenario → Requirement Mapping

| # | Real-world scenario (from you) | Design response | Requirements |
|---|---|---|---|
| 1 | Shops aren't organized by category; shopkeeper can't rely on physical layout | Search-first POS: instant, locally-indexed search that matches on every keystroke in Bangla or English (not a "search then wait" pattern), always-visible category rail as a *secondary* browse path, "recently sold" and "frequent items" surfaced without searching | FR-1 to FR-6 |
| 2 | Multiple customers, one cash box, queue must move fast | Multi-bill "hold & switch" — park an in-progress cart, start a new one, switch back, all without losing state | FR-10 to FR-13 |
| 3 | Barcode-less items — generate a sticker per item, scan it at sale time | Surface the **already-existing but unused** `POST /products/:id/generate-barcode` endpoint in Inventory + a printable label sheet; inline scan-to-add in POS | FR-14 to FR-18 |
| 4 | Open/loose chocolates, biscuits, snacks need the same barcode treatment | Same mechanism as #3, plus a "quick custom item" entry for one-off loose sales that never get a permanent barcode (e.g., ৳20 of loose chanachur) | FR-17, FR-19 |

---

## 5. Current State Audit (grounding for implementation)

What exists today in the repo, so Claude Code builds on top of it instead of duplicating it:

- **POS screen:** `app/(tabs)/home.tsx` (1241 lines) — single file mixing voice capture, a text-entry modal, category chips that reveal a "top 5 products" grid, and the draft-bill panel. This file will be decomposed, not deleted wholesale (see §8 for the extraction plan).
- **Barcode scan:** `app/barcode-scanner.tsx` — a **separate full-screen route** (not inline in POS), using `expo-camera`'s `CameraView` with `barcodeTypes: ['ean13','ean8','upc_a','upc_e','code128']` (line 561). Navigating to it and back currently loses POS context unless explicitly wired.
- **Barcode lookup:** `src/services/barcode/barcodeService.ts` — checks local product cache first (offline-friendly), falls back to `productApi.barcodeLookup()`, and can create a shop product from the global catalog (`createFromGlobal`).
- **Barcode generation:** `src/services/api/productApi.ts:82` — `generateBarcode(id)` calling `POST /products/:id/generate-barcode`. **This endpoint already exists on the backend and is fully wired in the API client — nothing in the app UI calls it today.** This is the key unlock for scenarios 3 and 4 at zero backend cost.
- **Search:** No dedicated product search UI exists. `src/services/nlu/nluService.ts` builds a weighted `Fuse.js` index (`aliases` weight 3, `name_bangla` weight 2, `name_english` weight 1) purely to parse voice/typed commands like "চাল ২ কেজি বিক্রি". There's also a server-side `productApi.search(q)` (`GET /products/search`) that's defined but unused. Neither powers a live "type to filter products" experience.
- **Cart/draft state:** Lives as component state inside `home.tsx`; there is exactly one draft bill at a time. `useTransactionStore.pendingBills` is an **offline sync queue for completed sales**, not an in-progress multi-cart mechanism — don't conflate the two.
- **Session bug:** `src/services/api/client.ts` — `refreshAccessToken()` (line 36) clears both tokens on *any* non-OK refresh response, with no mutex, so two concurrent 401s can race and log the user out even when the refresh token was still valid. Downstream, `apiRequest` throws `ApiError(401, 'Session expired')` and **nothing catches it to redirect to login or preserve the cart** — the modal in `AppSessionError.png` is `Alert.alert` on an uncaught rejection, and the draft bill is gone once dismissed.

---

## 6. Functional Requirements

### A. Search & Discovery (Scenario 1)

> **Headline requirement — instant indexed search.** This is the core mechanic the whole redesign is built around: the shopkeeper types into the search bar, and on **every single character** — Bangla or English, from the first letter — a list of matching products appears live, directly underneath the search bar, ranked best-match-first. No search button, no submit, no loading spinner for the common case. Tapping any row in that list adds the product. This has to feel instantaneous (see §10 performance target), which is only possible because it runs against a **local, pre-built index** on the device — never a network request per keystroke (shop connectivity is unreliable; see offline-first requirement). The detailed requirements below (FR-1–FR-6) are how this gets built.

- **FR-1.** The `/pos` screen shows a persistent search bar at the top, always visible (not behind a modal — replaces the current `textModalVisible` flow in `home.tsx`).
- **FR-2.** Every keystroke — including the first single character typed — re-queries the local index and re-renders the result list beneath the search bar (debounced ~150ms purely to avoid redundant re-renders mid-keystroke-burst; this must not be perceptible as lag). Matches against `name_bangla`, `name_english`, `aliases`, and `brand`, reusing the existing weighted Fuse.js approach from `nluService.ts` (extract into a shared `productSearchIndex` module, built once per product-list load and kept in memory, used by both voice/text-command parsing *and* this live search — don't fork the logic, and don't rebuild the index on every keystroke).
- **FR-3.** Search is **typo- and dialect-tolerant** for Bangla input (reuse `normalizeDialect()` from `nluService.ts`) and works identically whether the shopkeeper types in Bangla script or English/Romanized product names.
- **FR-4.** Empty search state shows: (a) a category grid (all categories derived from the shop's own products, as today's `quickCategories` does), and (b) a horizontal "সাম্প্রতিক" (recent) strip of the last ~10 distinct products sold, and (c) a "জনপ্রিয়" (frequent) strip ranked by 30-day sale count. Both rely only on data already in `useProductStore`/`useTransactionStore` — no new API calls.
- **FR-5.** Tapping a category filters the product list to that category (replaces the current "chip toggles a top-5 grid" pattern with a full filtered list, scrollable).
- **FR-6.** Each result row shows: product image placeholder/initial, Bangla name (primary) + English/brand (secondary), unit price, current stock, and a single large "+" tap target that adds 1 unit directly to the active cart — no confirmation dialog for the common case (matches "faster than paper" goal).

### B. Barcode Scan-to-Add (Scenarios 3 & 4)

- **FR-7.** A scan icon sits inside the search bar itself (not a separate nav item). Tapping it opens the camera **inline**, as a bottom sheet or overlay over the POS screen — the draft cart underneath must remain mounted and intact (fixes the "navigate away and lose context" issue in the current `barcode-scanner.tsx` flow).
- **FR-8.** A successful decode: (a) haptic + short sound feedback, (b) looks up via the existing `barcodeService.lookupBarcode()` (local cache → API → global catalog fallback, unchanged), (c) adds 1 unit to the active cart, (d) sheet stays open for the next scan (rapid multi-item scanning for a full basket) until the shopkeeper dismisses it.
- **FR-9.** Unknown barcode (not in shop products or global catalog): sheet shows "নতুন পণ্য?" with a one-tap shortcut into product creation pre-filled with the scanned code — reuses `barcodeService.createFromGlobal` pattern where a global match exists, or opens the existing add-product form with `barcode` pre-populated otherwise.

### C. Multi-Bill / Hold (Scenario 2)

- **FR-10.** A new **local-only** `useCartStore` (Zustand, AsyncStorage-persisted) replaces the single draft-bill state inside `home.tsx`. It holds a list of open carts, each with an id, optional customer label, items, and `created_at`. This is *not* the same as `pendingBills` (which stays as the post-payment sync queue) — no backend schema involved.
- **FR-11.** A "হোল্ড" (Hold) action parks the current cart and clears the entry surface for a new customer, without navigating away from `/pos`.
- **FR-12.** A horizontal strip of held-cart chips (e.g., "কাস্টমার ১ · ৳300 · 3 items") sits above the active cart. Tapping one swaps it back to active. Cap at a sane limit (recommend 5 — open question, see §12) with a clear affordance when full.
- **FR-13.** Held carts persist across app restarts and are unaffected by auth/session state (they never touch the network until checkout) — this directly protects against the session bug wiping a parked sale.

### D. Loose/Unbarcoded Items (Scenarios 3 & 4)

- **FR-14.** Inventory screen (`app/(tabs)/inventory.tsx`) gains a "বারকোড তৈরি করুন" (Generate barcode) action per product that has no `barcode` — calls the existing `productApi.generateBarcode(id)`, no new backend work.
- **FR-15.** Generated codes use **Code128** (already in the scanner's supported `barcodeTypes`, so zero scanner changes needed) with an internal, non-EAN format so it never collides with real manufacturer barcodes — see §12 for the exact format decision needed from you.
- **FR-16.** A "Print labels" flow renders one or many generated barcodes as a printable sheet via `expo-print` (already a project dependency — no new native module), sized for either a common thermal label printer or A4 sheet-of-stickers layout (decision needed, §12).
- **FR-17.** Bulk path: select multiple no-barcode products in Inventory (e.g., all loose-jar spices) → "Generate + print all" in one pass, for the shop's initial catch-up labeling session.
- **FR-18.** Once labeled and scanned once, a loose item behaves exactly like any barcoded product from then on (FR-7–FR-9 apply unchanged).
- **FR-19.** For truly one-off loose sales that will never get a permanent label (e.g., a single customer's ৳15 of loose biscuits from an open tin), the POS search bar supports a **"custom item"** fallback: type an amount, no catalog match needed, added to cart as a non-inventory line (mirrors what the paper khata does today) — does not decrement any product's stock.

### E. Reliability (blocking prerequisite)

- **FR-20 (P0 — do first, see §8 Phase 0).** No open cart (active or held) is ever lost to a `Session expired` error. `apiRequest`'s 401 handling must: (a) serialize concurrent refresh attempts behind a single in-flight promise instead of racing, (b) on genuine refresh failure, redirect to `pin-login` *without* clearing `useCartStore`, and (c) resume the pending action automatically after re-login where the API contract allows it (billing submission is retried, not discarded).

---

## 7. UX / Information Architecture — `/pos` Screen

This is the layout spec for the redesigned screen (for both your Claude-design mockup work and direct implementation reference — keep them in sync).

```
┌─────────────────────────────────────────────┐
│  Shop name · date          [☰] [👤]          │  ← unchanged header
├─────────────────────────────────────────────┤
│  🔍  পণ্য খুঁজুন / বারকোড স্ক্যান করুন    [📷][🎙] │  ← FR-1, FR-7; mic kept, demoted from
├─────────────────────────────────────────────┤     sole entry point to one option among three
│ [কাস্টমার ১ ৳300] [কাস্টমার ২ ৳90] [+ হোল্ড] │  ← FR-12, only shown when ≥1 held cart exists
├─────────────────────────────────────────────┤
│  EMPTY SEARCH STATE            SEARCH RESULTS │
│  ┌─ সাম্প্রতিক ────────────►   ┌─────────────┐ │
│  ┌─ জনপ্রিয় ──────────────►   │ product row │+│ │
│  │ [চাল-ডাল][তেল][মশলা][…]     │ product row │+│ │
│  └─ category grid            │ product row │+│ │
│                               └─────────────┘ │
├─────────────────────────────────────────────┤
│  ব্যাকট বিল (3 items)                   ৳300  │  ← existing draft-bill panel, unchanged
│  item · qty · price · [–][qty][+] [🗑]        │     visual language, now fed by useCartStore
│  ...                                          │
│  [হোল্ড]         [পেমেন্ট নিন ও বিল করুন]     │  ← Hold added alongside existing checkout CTA
└─────────────────────────────────────────────┘
```

**States to design/implement explicitly:**
1. **Idle / empty search** — categories + recent + frequent (FR-4).
2. **Searching** — live filtered list, one row per match, sorted by relevance then by 30-day sale frequency as a tiebreaker.
3. **Scanning** — camera overlay, cart visible/dimmed underneath, running tally of items just scanned this session (FR-8).
4. **Cart with held bills** — chip strip visible, active cart clearly distinguished (border/color) from held ones.
5. **Unknown barcode** — inline prompt, not a full-screen redirect (FR-9).
6. **Offline** — existing offline-first badge/behavior preserved; search/cart/hold all work offline since they're local-first; only checkout sync and barcode-lookup-of-unknown-code degrade (falls back to "not found, add manually").
7. **Session-refresh-in-flight** — no modal, no cart disruption; at most a subtle non-blocking indicator (FR-20).

**Interaction rules:**
- Every primary action (add item, scan, hold, checkout) must be reachable with one thumb on a phone held in the other hand — large tap targets (current design's ≥44px pattern, keep it), bottom-anchored controls.
- No item add requires a confirmation dialog. Mistakes are corrected via the existing qty stepper / delete-row icon in the cart panel, which already exists in `home.tsx` today — keep that pattern.
- Bangla is the primary label language throughout, per `CLAUDE.md` Key Rules (unchanged).

---

## 8. Phased Implementation Roadmap

Each phase is independently shippable and testable on the emulator before moving to the next. File paths are relative to `DokanAI/`.

### Phase 0 — Session reliability hardening (P0, blocks nothing else but must land first)
- Fix `src/services/api/client.ts`: mutex the refresh call; on hard failure, route to `pin-login` instead of throwing an uncaught alert; never clear cart state as a side effect.
- Introduce `useCartStore` now (empty of multi-bill logic yet) purely so cart state is already decoupled from `home.tsx` component state and from auth state before anything else builds on top of it.
- **Acceptance:** force a 401 mid-bill on the emulator (kill/replace the access token) and confirm the draft is intact after re-login.

### Phase 1 — Unified search + scan shell
- Extract `productSearchIndex` (shared Fuse config) out of `nluService.ts` into `src/services/search/productSearch.ts`; both NLU parsing and the new live search consume it.
- Build the persistent search bar + result list + empty-state (recent/frequent/category grid) as new components under `app/(tabs)/pos/` (or refactor in place in `home.tsx` — implementer's call, but extract into components regardless of file location).
- Convert barcode scanning from a full navigation (`router.push('/barcode-scanner')`) to an inline bottom-sheet component reusing the existing `CameraView` config from `app/barcode-scanner.tsx`.
- **Acceptance:** from a cold POS screen, find and add a known product via typed Bangla search, via English/brand search, and via barcode scan, each in under 2 seconds; old voice flow still works unchanged.

### Phase 2 — Multi-bill hold/switch
- Flesh out `useCartStore` with the held-carts array, hold/switch/resume actions, and the chip strip UI.
- Wire checkout to operate on whichever cart is currently active; held carts untouched.
- **Acceptance:** start bill A, hold it, start and complete bill B, switch back to A, confirm all items and running total are exactly as left; kill and reopen the app between steps to confirm persistence.

### Phase 3 — Barcode generation & printing for loose items
- Add "Generate barcode" action to `app/(tabs)/inventory.tsx` per product, calling the existing `productApi.generateBarcode`.
- Build the print-label view using `expo-print` (layout decision per §12).
- Add bulk select + bulk generate/print for a catch-up labeling pass.
- Add the "custom item" quick-add path in the POS search bar (FR-19).
- **Acceptance:** pick a real no-barcode product from your Inventory (e.g., a loose spice jar), generate its label, print/export it, scan the printed output with the Phase 1 scanner, confirm it adds the correct product to cart.

### Phase 4 — Polish & metrics
- Add lightweight client-side timing (time from POS-open to first item added) logged locally for you to sample, so FR-goal (<2s) is measurable rather than assumed.
- Visual pass to match whatever the parallel Claude-design mockup produced, reconciling against §7's IA.

---

## 9. API Surface — what already exists

No new backend endpoints are required by this PRD. Everything below already exists and is either already wired or trivially callable:

| Capability | Client call | Backend route | Status |
|---|---|---|---|
| List/paginate products | `productApi.listAll()` | `GET /products` | ✅ in use |
| Server-side search | `productApi.search(q)` | `GET /products/search` | ✅ exists, unused — optional fallback for very large catalogs beyond local cache |
| Barcode lookup | `productApi.barcodeLookup(code)` | `GET /products/barcode/:code` | ✅ in use |
| Create product | `productApi.create()` | `POST /products` | ✅ in use |
| Update product | `productApi.update()` | `PATCH /products/:id` | ✅ in use |
| **Generate barcode** | `productApi.generateBarcode(id)` | `POST /products/:id/generate-barcode` | ✅ **exists, fully unused in UI — this PRD's key unlock** |
| Submit bill | `billingApi` (per Phase 1.4 migration) | `POST /billing` | ✅ in use, unchanged |

If, during implementation, something in this PRD turns out to genuinely need a new/changed backend route, stop and flag it explicitly rather than working around it silently — the "backend frozen" constraint is load-bearing for this project's current phase.

---

## 10. Non-Functional Requirements

- **Offline-first, unchanged:** search, browse, cart, and hold all operate on locally cached data; only checkout submission and unknown-barcode lookups need connectivity, matching existing `CLAUDE.md` rule 4.
- **Performance:** local, indexed search must filter a shop's full product list (assume up to ~2,000 SKUs) with no perceptible lag (<100ms per keystroke) on a low-end Android device, from the very first character typed — Fuse.js over an in-memory index, built once at product-list load rather than per keystroke, comfortably meets this at this scale.
- **No new native dependencies** beyond what's already installed (`expo-camera`, `expo-print`, `expo-haptics` all already present).
- **Accessibility of the physical action:** every control usable one-handed, thumb-reachable, on a ~6" phone screen (matches shop-photo context of a shopkeeper standing at a crowded counter, not seated with two hands free).

---

## 11. Success Metrics

1. Median time from POS-open to first item added: search path and scan path each < 2s (measured per Phase 4).
2. Zero cart-loss incidents from session/auth errors (Phase 0 acceptance test, then monitored).
3. % of shop SKUs with a barcode (self-generated or manufacturer) trending toward 100% after the labeling catch-up pass (Phase 3).
4. Qualitative: shopkeeper reports the app is faster than reaching for the khata for a routine sale.

---

## 12. Open Questions — need your decision before/while building

1. **Held-cart limit:** how many concurrent parked bills should the app support (FR-12)? Recommend starting at 5.
2. **Generated barcode format:** confirm the internal Code128 payload scheme, e.g. `DKN{shop_short_id}{5-digit product seq}` — needs to be short enough to print legibly on a small label and not collide with real EAN/UPC codes.
3. **Label media:** what will you actually print on — a thermal label roll (common cheap 50×30mm printer), or A4 sticker sheets on a regular printer? This decides the `expo-print` layout in Phase 3.
4. **"Frequent items" window:** 30-day sale count assumed for FR-4/FR-6 tiebreak — confirm or adjust.
5. **Custom/loose one-off items (FR-19):** should these appear anywhere in Reports (as an "other/loose" bucket) or stay purely bill-line items with no inventory linkage at all?
6. **Parallel design work:** you mentioned Claude-design has already started on this — should Phase 1's implementation wait for that visual output, or proceed against §7's textual IA now and reconcile visuals in Phase 4?

---

## Appendix — Evidence Referenced

- `Requirements/GroceryShopsRequirment/*.jpeg` — 12 shop-floor photos showing dense, uncategorized shelving; loose spice/nut jars on a mechanical scale; hanging loose-snack strings with no barcodes; a cluttered checkout counter with a personal phone doubling as the POS device.
- `Requirements/posScreenDisplay1.png`, `posScreenDisplay2.png` — current POS screen: voice-first entry, category-chip quick-add, draft bill panel.
- `Requirements/AppSessionError.png` — reproduced `Session expired` error dismissing an in-progress ৳110 / 2-item bill, confirming FR-20's priority.
- `Requirements/WhatsApp Image 2026-09-22 at 00.41.08 (1).jpeg`, `00.41.09.jpeg` — handwritten khata ledger pages still in active parallel use, the speed bar this redesign must clear.
