# Barcode scanning — why it felt slow, what was wrong, what was fixed (2026-09-25)

Reported by the shopkeeper: (1) scanning a **generated barcode** (our `DKN-…` labels) takes a long time, (2) sometimes a product that **is** in the shop is reported as "not found — add a new product", (3) he wants scanning **faster**.

Status: fixes are in the code and type-check clean. **Not yet measured on a phone** (the phone was not connected when this was written) — see §5 for how to confirm.

---

## 1. The three causes (found by reading the scan code and the shop's data)

### Cause A — every generated label waited for a second read plus a timer  → symptom (1)
`BarcodeScanSheet.handleScan` committed a scan immediately only for EAN-13 / UPC-A. Anything else, including **all our Code 128 labels (`DKN-4CB9-nnnnnn`)**, went through a "confirm" path: it needed the **same code read twice** and then waited a fixed **600 ms** timer before it would act.
- Best case: ≥ 0.6 s of dead time on every label, on top of the camera time.
- Worse: a slightly blurry label rarely gives two identical reads in a row, so the shopkeeper hears nothing and re-aims.
- Who is hit: the **81** generated-barcode products in Jabir General Store (every loose item and every repaired barcode).

### Cause B — the barcode was compared as an exact string  → symptom (2)
`lookupBarcode` did `products.find(p => p.barcode === scanned)`. The same physical barcode reaches the app in different spellings:
- **UPC-A (12 digits) is often reported as EAN-13 with a leading 0** (or the reverse). **108 of the shop's 467 manufacturer barcodes (23 %) are 12-digit UPC-A.**
- UPC-E (8 digits) is a compressed UPC-A.
- Shop-made codes with a stray space or lower case.
An exact compare misses all of these. The app then asked the server, the server also compares exactly, found nothing, and the screen said **"না-চেনা বারকোড — নতুন পণ্য যোগ করুন"** for a product that was already in the shop.

### Cause C — a local miss waited on the network with no time limit  → both symptoms
After a miss the scanner froze on a spinner (`busy`) until the server answered, and there was **no timeout**. On a slow connection, or the first request after the backend sleeps (Railway can take 10+ s), the wait was long — and if it eventually failed, the same "add a new product" screen appeared, indistinguishable from "really not in the shop". Even a **successful local hit** also went through this busy state.

### Not causes (checked)
- The camera scanning 5 code types at once: ML Kit handles this well; it is not the bottleneck.
- Searching the list: even 2,000 products is instant (now 0.001 ms per lookup after a one-time 2 ms index build).

---

## 2. Fixes made

| # | Fix | Effect |
|---|---|---|
| 1 | **One clean read is enough for our own labels.** A code matching `DKN-XXXX-NNNNNN` is committed at once (Code 128 has its own checksum, so a false read is very unlikely). | Removes the 2-read requirement and the 0.6 s timer for all generated barcodes. |
| 2 | **Format-tolerant lookup through an index** (`barcodeIndex.ts`): compares a canonical form — digits without leading zeros (so UPC-A = EAN-13-with-0), UPC-E expanded to UPC-A, shop codes trimmed and upper-cased. A `Map` gives O(1) lookup, rebuilt only when the product list changes; an inactive duplicate never hides the live product. | Products already in the shop are found regardless of how the scanner spelled the code. Unit-tested: 7/7 cases including UPC-E expansion against known values. |
| 3 | **Local hit = instant.** The scan sheet answers from the phone's own list with no spinner and the camera stays live for the next pack. | Scanning a basket is limited by the shopkeeper's hand, not the app. |
| 4 | **Server fallback is bounded**: 6 s timeout, then one retry with the alternate spelling (12 ↔ 13 digits). | No more open-ended freeze. |
| 5 | **"Don't know" is no longer shown as "not in the shop".** If the server could not be reached, the screen says **"যাচাই করা যায়নি — ইন্টারনেট ধীর বা নেই… আবার স্ক্যান করুন; নতুন পণ্য হিসেবে যোগ করার আগে নিশ্চিত হয়ে নিন"**. | Stops accidental duplicate products created on a bad connection. |

Files: `src/services/barcode/barcodeIndex.ts` (new), `barcodeService.ts`, `src/components/pos/BarcodeScanSheet.tsx`.

---

## 3. What can still make a scan slow (and is not code)

1. **The label itself.** Generated labels must be printed at **50 × 30 mm minimum**, black, 2 printer dots per bar (already the default). A grey or faint print, a small 40 mm label, or a curled label on a jar is hard for any camera.
2. **Distance and light.** Hold the phone about **10–15 cm** from the barcode, steady for half a second. Use the **flash button** (top-right of the scanner) in dim shops. Glare from plastic wrap is the most common failure.
3. **Camera focus on cheap phones.** Low-end phones focus slowly on close objects; moving back a little helps.
4. **Slow internet at the shop** now only affects products that are NOT already on the phone (new products, or ones added on the web a minute ago).
5. **A stale phone list.** A product added on the web POS reaches the phone the next time the app opens or refreshes; until then it goes through the server lookup (correct, but slower).

---

## 4. If the shopkeeper needs to be faster than a phone camera allows

The phone camera decodes one barcode in about a third of a second when well lit and steady — good, but it needs aiming. For a counter with a queue, the fastest option is a **cheap Bluetooth / USB barcode scanner (~ ৳2,000–3,500)**: scan is instant, no aiming, the pack can be held anywhere. On the web POS it works today as a keyboard (types the code + Enter into the search box). For the phone app it would need a small build (a scan input that accepts the scanner's keystrokes) — not built yet; say if wanted.

---

## 5. How to confirm on the shopkeeper's phone (10 minutes)

Install the new APK, log in, then:
1. Scan **5 generated labels** (loose items). Each should add within about a second of the frame settling, with no spinner.
2. Scan **5 manufacturer packs**, at least two of them 12-digit (UPC-A) ones. Each should be found; none should say "না-চেনা বারকোড".
3. Turn **mobile data off** and scan a pack that is in the shop → still found (local list). Scan a pack that is not → the screen now says "যাচাই করা যায়নি".
4. Any pack that still says "না-চেনা বারকোড" while the product exists: send the **number printed under the barcode** and the product name — that is a data problem (wrong stored barcode) and can be fixed for good with the "আগে থেকে দোকানে আছে?" option on that screen.

## 6. Honest limits
- The improvement is in the app's decision time (removed ~0.6 s + retries + freezes, and false "not found"). The **camera's own decode time** depends on the phone, light and label print quality and was not changed.
- Not yet measured on a device; the expectation above comes from reading the code and unit tests, not from a stopwatch.
