# Search analytics

Analytics in Typesense works through **rules**. A rule names a source collection and an event type, and it aggregates matching events into a destination. That destination is a collection of popular or no-hit queries, a counter field on the documents, or a log. Events are sent to a rule by its name.

## Enabling it

- **Self-hosted** servers need `--enable-search-analytics=true` and `--analytics-dir=<path>`. Without them no rule does anything.
- **Flush interval.** Aggregates are written to their destinations every `--analytics-flush-interval` seconds, 3600 by default and 60 at the least. Typesense Cloud uses 300. Nothing shows up in the destination until a flush, so test by waiting for one or by lowering the interval.
- **Rate limit.** Events are capped by `--analytics-minute-rate-limit`, 5 per minute by default. Raise it before a load test or before sending events from a backend on behalf of many users.
- **Test traffic.** Add `enable_analytics: false` to searches from tests and scripts to keep them out of the numbers.

## Rules (v30 format)

Create or replace a rule with `POST /analytics/rules`, or the client's `analytics.rules().upsert(name, rule)`.

```json
{
  "name": "product_queries",
  "type": "popular_queries",
  "collection": "products",
  "event_type": "search",
  "params": {"destination_collection": "product_queries", "limit": 1000, "expand_query": false, "capture_search_requests": true}
}
```

- **Types.** `popular_queries` and `nohits_queries` write to a query collection. `counter` adds `weight` to `counter_field` on the document an event names. `log` stores raw events for later retrieval.
- **Query collections** need a `q` string field and a `count` int32 field. Extra fields listed in `meta_fields` must also exist in the destination schema, or they are silently dropped.
- **Counter rules** need the counter field to exist on the collection as an optional numeric field, and each event's `doc_id` must be the document `id`. Use the counter field in `sort_by` with buckets to rank by popularity. See `relevance.md`.
- **Log rules** are the only ones whose events can be read back, with `GET /analytics/events?user_id=<id>&name=<rule>&n=<up to 1000>`.
- **Older format.** Rules written for v29 used `params.source.collections` and `params.destination.collection`. They migrate automatically on upgrade, but new code uses the format above.
- **Deleting a rule** stops collection but leaves the already aggregated data in place.

## Recording searches

- **Automatic capture.** With `capture_search_requests: true` (the default), the server records searches itself. A query counts only after the user pauses typing for about 4 seconds, so prefixes typed along the way aren't counted. `expand_query: true` stores the full word the user settled on instead of a prefix.
- **Users.** Searches are grouped by the `X-TYPESENSE-USER-ID` header or `x-typesense-user-id` parameter, and by client IP when neither is sent. Behind a backend proxy or server-side rendering, every user shares one IP, so forward a user id.
- **Only searches with results** count toward popular queries. No-hit queries go to a `nohits_queries` rule.
- **Recording from the backend.** Set `capture_search_requests: false` and send search events yourself when searches are proxied, when only submitted searches should count, or when real user ids matter.

## Sending events

```
POST /analytics/events
{"event_type": "click", "name": "product_clicks", "data": {"doc_id": "1024", "user_id": "u-42"}}
```

- `name` is the rule the event feeds, and `event_type` must match that rule's.
- Older code sent `"type": "click"`. v30 uses `event_type`.
- Send clicks and conversions from wherever the user acted. Most apps also send the same events to their existing product analytics tool, and Typesense's analytics complement that rather than replace it.

## Query suggestions

Search a popular-queries collection alongside the main one in a single `multi_search` and show its `q` values as suggestions. For small sites, searching the main collection as the user types often works just as well without any rules.
