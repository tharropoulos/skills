# Searching, filtering and faceting

A single search is `GET /collections/<c>/documents/search` with `q` and `query_by`. Browsers and anything with long parameters (vectors, big filters, several queries at once) use `POST /multi_search`, which keeps the parameters in the body instead of the URL. Look up the full parameter table for the server's version. This file covers the grammar and the limits people trip on.

## Query basics

- **`query_by`** is required and takes `string` or `string[]` fields, or `object` fields. Its order is a ranking signal, so put the most important field first.
- **`q=*`** matches every document. Use it for browse pages driven only by filters and facets.
- **Per-field parameters.** Comma lists such as `num_typos=2,0` or `prefix=true,false` line up by position with `query_by`. A single value applies to every field.
- **Pagination.** `page` starts at 1. `per_page` defaults to 10 and is capped at 250 by the server's `--max-per-page` setting. With `group_by`, `per_page` counts groups.
- **Payload size.** Use `include_fields` or `exclude_fields` to return only what the UI renders, and always exclude embedding fields.

## `filter_by` grammar

| Want | Write |
|---|---|
| Whole value equals | `category:=Shoe` matches `Shoe`, not `Shoe Rack` |
| Value contains the word | `category:Shoe` matches `Shoe` and `Shoe Rack`. Faster, and fine for single-word values like ids and enums |
| Any of several values | `brand:=[Nike, Adidas]` |
| Not equal | `brand:!=Nike` or `brand:!=[Nike, Adidas]` |
| Doesn't contain the word | `artist:!Jackson` |
| Numbers | `price:<40`, `price:>=10`, `price:[10..100]`, `price:[<10, >100]`, `price:[10..100, 140]` |
| Starts with | `name:=Ste*` matches values starting with Ste. `name:Ste*` matches any word starting with Ste |
| AND | `in_stock:true && price:<100` |
| OR across different fields | `(color:=blue || category:=shoe) && in_stock:true` |
| Array contains all of | `genres:=Rock && genres:=Acoustic` |
| Same element of an object array | `variants.{color:=red && size:=M}` |
| Values with special characters | Wrap them in backticks, as in ``brand:=[`Levi's, Inc.`, `H&M (EU)`]`` |
| Geo radius | `location:(48.85, 2.35, 5 km)` or `mi` |
| Geo polygon | `location:(lat1, lng1, lat2, lng2, lat3, lng3, ...)` |
| Joined collection | `$inventory(qty:>0)`, see [joins.md](joins.md) |

- **Precedence.** `&&` and `||` have the same precedence and run left to right, so `a || b && c` means `(a || b) && c`. Parenthesize every mix of the two.
- **Escaping.** Backticks escape values only. Field names can't contain special characters.
- **Building filters from user input.** Map selections to known values, then wrap each value in backticks. For values containing a literal backtick, reject them or use a separately indexed, safely encoded identifier; escaping it is undocumented and error-prone. Silently removing it changes the value, which is especially dangerous in an access filter. URL-encode the finished `filter_by` when sending it in a GET request.
- **Coordinates** are always latitude first. GeoJSON puts longitude first, so swap when converting.
- **Limits.** A filter can use up to 100 operators by default (`--filter-by-max-ops`). A prefix filter only expands to `max_filter_by_candidates` (default 4) matching words.
- **Speed.** `range_index` on a numeric field speeds up range filters. `enable_lazy_filter=true` helps when the filter matches a lot of documents but the query words match few.

## Sorting

- `sort_by` takes up to 3 fields, for example `sort_by=price:asc,_text_match:desc`. With no `sort_by`, results sort by `_text_match:desc` and then the collection's `default_sorting_field`.
- String fields need `"sort": true` in the schema. Numbers sort by default.
- Missing numeric values sort last in both directions. Change this per field with `price(missing_values: first):asc`.
- Geo distance sort is `location(48.85, 2.35):asc`, and each hit then carries `geo_distance_meters`.
- Blending relevance with popularity, boosts and pinning is covered in [relevance.md](relevance.md).

## Faceting

- **`facet_by`** only works on fields with `"facet": true`. It returns counts for the current results.
- **Range facets** need a sortable numeric field, as in `facet_by=price(budget:[0, 50], mid:[50, 200], premium:[200, ])`. Starts are inclusive and ends exclusive.
- **Faceting depth.** `max_facet_values` sets how many values come back (default 10). `facet_query=brand:ni` searches within the facet values for type-ahead facet filters. It also sets `per_page` to 0 unless you pass one, so no hits come back.
- **Counts for the other options of a selected filter.** Once the user picks `brand:=Nike`, the brand facet only counts Nike. To show counts for the other brands too, send one extra search per active facet group in the same `multi_search`, with that group's own filter removed and every other filter kept. The InstantSearch adapter does this for you.
- **Facet counts are exact by default on small result sets.** On large ones, `facet_strategy`, `facet_sample_percent` and `facet_sample_threshold` trade accuracy for speed.

## Grouping

`group_by` needs a field with `"facet": true` and returns `grouped_hits`, each holding up to `group_limit` hits (default 3, capped at 99 by the server). Use `group_limit=1` to show one hit per product or thread. From v29 the `found` count for grouped searches is approximate, within about 2%, unless you set `group_max_candidates`. Documents with no value in the grouping field collapse into one group unless `group_missing_values=false`.

## multi_search

`POST /multi_search` runs several searches in one request. The body is `{"searches": [...]}`, and parameters shared by every search go in the URL query string. A request can hold up to 50 searches by default, and a scoped key can lower that with `limit_multi_searches`. Each search can also carry its own `x-typesense-api-key`, so different collections can use different scoped keys.

- **Federated search** returns one result set per search, in request order. Use it for a UI with separate panels, such as products next to brands.
- **Union search** (`"union": true` in the body, v28 and later) merges every search into one ranked, deduplicated list. Pagination comes only from `page` and `per_page` in the URL. Every search must sort by fields of the same types, in the same order. With `group_by`, all searches group or none do.
- **URL-only parameters.** `use_cache` and the RAG `conversation` parameters are read only from the URL, never from the body.
