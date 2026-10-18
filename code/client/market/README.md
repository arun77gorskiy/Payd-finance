# PAYD market client and canonical binding

These two plain browser scripts register APIs only. Neither script is included in the deployed MiniMax page. No flag, endpoint or production setting is enabled by this package.

Load `payd_market_client.js` before `payd_market_binding.js` after the site's existing canonical normalizer. With a reviewed token index available, the app's preparation code can use:

```js
const client = PAYD_INTEL.PaydMarketClient.createClient({
  enabled: false, // change only as part of an approved frontend activation
  baseUrl: approvedPublicApiOrigin,
  records: reviewedTokenIndex.records,
});
const binding = PAYD_INTEL.PaydMarketBinding.createBinding({
  client,
  runtime: canonicalRuntime,
  format: PAYD_INTEL.Canonical.fmt,
  onChange: redrawExistingMarketView,
  concurrency: 4,
});
await binding.refresh(visibleCanonicalIds);
```

`canonicalRuntime` is the existing result of `PAYD_INTEL.Canonical.build`, shared across sectors. `redrawExistingMarketView` is supplied by the page owner for the active view. `visibleCanonicalIds` must contain exact IDs from that runtime, never tickers. The example is an integration contract, not an auto-executing page loader. A disabled client makes the binding inert without requesting data or clearing existing objects.

When explicitly enabled, create the binding **before first render**. It immediately replaces all historical canonical market values and the six market display fields with empty UPDATING states, clears snapshot ATH/ATL/timestamps, and invalidates `_v1_view`. Calling `refresh` requests only the selected IDs, deduplicates repeated IDs in the call and uses one queue across calls with at most four outstanding client operations by default. A later refresh wins over an older response. `dispose` clears displayed prices, resolves queued operations and ignores late responses.

The binding updates `market`, `market_status`, `market_hint`, `market_updated_at`, `market_symbol`, `market_provider_id` and the market part of `_display`. It does not edit canonical ID, name, symbol, sectors, tradability/identity status, protocol TVL, research or AI scores. The client verifies against the **reviewed backend catalog**, not the old frontend `cmcId`. Before activation, the frontend's identity data must be aligned with the reviewed catalog, including symbol corrections and no-token classification; this adapter does not silently change those classifications.

Render a market badge from `market_status` separately from the existing identity badge. Render `null` as `—` and the hint as a non-blocking message. Show `market_updated_at` as the provider timestamp, not the page-load time. Tiny nonzero values use scientific notation instead of rounding to `$0.000000`. Preserve real zero values and never substitute a local snapshot after a failure.

The current site also has a legacy V1 renderer. `canonicalToV1View` memoizes `_v1_view`; the binding invalidates it on every state change. A future page patch must copy the new market status fields into that view, render them in V1 rows/detail views and V2 cards, and prevent legacy JSON fallbacks from painting market values before canonical readiness. Disable the old CoinGecko overlay and browser provider services **only inside the approved PAYD market mode**. Keep the general LocalJsonDataProvider for non-market data. These page changes and the startup lifecycle are not applied by this repository package.

Live evidence is limited to the two user-supplied API bodies in `reports/stage5c-public-market-observations-20261018.json`: SAFE LIVE / CMC 21585 and Ceramic UNKNOWN_MAPPING / null. HTTP headers, deployed cache behavior, MiniMax CORS and the activated UI remain unverified. Preview requires Vercel authentication; the public frontend needs an approved publicly accessible API origin. See `docs/STAGE5C_FRONTEND_INTEGRATION.md`.

The test fixture `test/fixtures/canonical-normalizer-20260908.js` is the unchanged main site's public script retrieved on 2026-10-18, SHA-256 `1c79b425588c224ae1589494b5cc7d3fd1a57b3675309c346a1573c13a1e919e`. It is used in a Node VM with synthetic project inputs to verify the actual normalizer/client/binding boundary. It is not a full browser or an independent live provider test.
