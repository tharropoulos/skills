# Search UI

Most Typesense frontends use Algolia's InstantSearch widgets through `typesense-instantsearch-adapter`, which translates InstantSearch requests into Typesense searches. The adapter setup is the same everywhere. Only the framework glue changes.

## Steps

1. **Get a browser-safe key.** Create it with `POST /keys` and `{"actions": ["documents:search"], "collections": ["products"]}`, using the real collection or alias name. The action is `documents:search`, not `search`. When users see different data, the backend mints a scoped key instead (see `keys.md`). Done when a search with the key succeeds and a write with it gets a 401.
2. **Configure the adapter.**

   ```js
   import TypesenseInstantSearchAdapter from 'typesense-instantsearch-adapter'

   const adapter = new TypesenseInstantSearchAdapter({
     server: {
       apiKey: SEARCH_ONLY_KEY,
       nodes: [{ host, port, protocol }],
       cacheSearchResultsForSeconds: 120,
     },
     additionalSearchParameters: { query_by: 'name,brand' },
   })
   const searchClient = adapter.searchClient
   ```

   `query_by` is required and the adapter sends nothing without it. `collectionSpecificSearchParameters` sets different parameters per collection for federated search.
3. **Render widgets** with `searchClient` and `indexName` set to the collection or alias name. Attributes used by `refinementList`, `menu` and similar widgets must be faceted in the schema. `sortBy` items are named `<collection>/sort/<field>:<direction>`, for example `products/sort/price:asc`.
4. **Build and check the bundle.** Done when the built output contains only the intended search key and no admin, parent scoped-key or write key.

## Keys in frontend builds

Bundlers inline environment variables that carry a public prefix into the shipped JavaScript. Only the search-only or scoped key goes in those variables, never the admin key.

| Tool | Public prefix |
|---|---|
| Vite, Solid, vanilla | `VITE_` |
| Next.js | `NEXT_PUBLIC_` |
| Nuxt | `NUXT_PUBLIC_`, read through `runtimeConfig.public` |
| Astro, Qwik, SvelteKit | `PUBLIC_` |
| Expo / React Native | `EXPO_PUBLIC_` |

Mobile apps are better off fetching the host and key from the backend at launch, so they can be rotated without an app release.

## Framework notes

| Framework | Binding and gotchas |
|---|---|
| React | `react-instantsearch` |
| Next.js App Router | `react-instantsearch-nextjs` with `InstantSearchNext` for server rendering. Widget components need `'use client'` |
| Vue / Nuxt | `vue-instantsearch`. In Nuxt, register it in a plugin and handle server rendering there |
| Angular | No maintained Angular InstantSearch for recent versions. Use `instantsearch.js` connectors and run updates inside `NgZone` |
| SvelteKit | `instantsearch.js` connectors in `onMount`, with `export const ssr = false` on the page or a `typeof window` guard |
| Solid, Qwik, Astro, vanilla | `instantsearch.js` widgets or connectors, started in the client-only lifecycle hook (`onMount`, `useVisibleTask$`, an Astro `<script>`) |
| React Native | `react-instantsearch-core`, not `react-instantsearch`. The Android emulator reaches the host machine at `10.0.2.2`, and release builds block plain HTTP |
| Swift, Kotlin | No adapter. Call the Typesense client directly |

## Client settings

- **Several nodes.** List every node in `nodes`, or put the load-balanced or Search Delivery Network endpoint in `nearestNode` and list the individual nodes as fallbacks.
- **Timeouts.** Browser clients do well with a connection timeout of about 2 seconds and a few retries. Imports need much longer timeouts. See `sync.md`.
- **Caching.** `cacheSearchResultsForSeconds` caches repeat searches in the browser. The server-side cache is the `use_cache` search parameter.
- **Counts for other options of a selected facet.** The adapter already sends the extra searches this needs, inside one `multi_search`.

## Examples to copy from

- Next.js App Router with server rendering: `github.com/typesense/showcase-nextjs-instantsearch-next-app-router-ssr-steam-games-search`
- InstantSearch.js widgets and URL routing: `github.com/typesense/showcase-ecommerce-store`
- One small app per framework: `github.com/typesense/showcase-guitar-chords-search-<framework>`, for `next-js`, `nuxt-js`, `angular`, `vanilla-js`, `astro`, `solid-js`, `remix`, `svelte-kit`, `qwik` and `react-native`
