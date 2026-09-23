# Schema design

A collection's schema is its **RAM budget**. Every field listed in the schema is indexed in memory. Fields left out of the schema are still stored on disk and returned with each hit, but they cost no RAM. So the schema lists only what is searched, filtered, faceted, sorted or grouped on, and everything else rides along unlisted.

## Steps

1. **List the queries.** Write down what the app will do with this collection. That means the search box, each filter, each facet, each sort order and any grouping. Look at the UI or ask if it isn't clear.
2. **Give every field a role.** Take a real sample document and assign each field one or more roles from the table below. Done when every field in the sample has a role, including the ones that end up unlisted.
3. **Derive the schema** from the roles, then apply the tokenization recipes to identifier-like fields.
4. **Create it versioned and alias it.** Create `products_v1` and point the `products` alias at it. Then check `GET /collections/products_v1` against your intended flags.

| Role | Schema |
|---|---|
| Searched as text | `string` or `string[]`, listed in `query_by` |
| Filtered on | Any indexed type. Filtering needs no `facet` flag |
| Faceted (counts shown in the UI) or grouped on | `"facet": true` |
| Sorted on | Numbers sort by default. Strings need `"sort": true`, which costs memory |
| Range filters on a big numeric field | `"range_index": true`, which costs memory |
| Substring (infix) search | `"infix": true` plus `infix` at query time. Costs significant memory, so try the tokenization recipes first |
| Display only | Leave it out of the schema |
| Popularity signal | Numeric field set as `default_sorting_field` |

## Types and flags

- **Dates** are `int64` Unix timestamps. There is no date type.
- **Integers** above 2,147,483,647 need `int64`.
- **Geo points** are `geopoint` with the value `[lat, lng]`, in that order. Auto schema detection can't infer them, so declare them. A `geopolygon` is one flat array `[lat1, lng1, lat2, lng2, ...]`.
- **Optional fields.** A field the data legitimately lacks needs `"optional": true`. `"index": false` also requires `"optional": true`. A field that holds a bad value, like a price of `"N/A"`, stays required so the document fails and gets reported. See [sync.md](sync.md).
- **`default_sorting_field`** is the default tie-breaker. It also decides which prefix and typo expansions count as the "top" candidates (only `max_candidates`, default 4, are kept). A popularity field here fixes short queries like "ap" missing the obvious results.
- **Locale.** Set `locale` on fields in languages that don't split words on spaces, such as `ja`, `zh`, `ko` and `th`, and on fields where diacritics must be kept. The default `en` locale strips diacritics.
- **Stemming.** `"stem": true` stems using the field's locale. For product catalogs full of brand names, a `stem_dictionary` such as a plurals dictionary is safer than the algorithmic stemmer.

## Auto schema detection

`{"name": ".*", "type": "auto"}` indexes every field it sees, and the first document to contain a field fixes that field's type. Explicit field definitions win over the wildcard. Wildcard fields are searchable and filterable but never faceted, so every faceted field is declared by name or by a regex name like `.*_facet` with `"facet": true`. Auto detection also indexes fields nobody queries and spends RAM on them. In production, prefer an explicit schema, or pair the wildcard with `{"name": "<pattern>", "index": false, "optional": true}` for fields to skip. With a wildcard or regex field in the schema, writes default to `dirty_values: coerce_or_reject`, otherwise to `reject`.

## Nested objects

Set `"enable_nested_fields": true` on the collection and declare `object` or `object[]` fields. Sub-fields are addressed with dots, like `address.city`. A sub-field inside an `object[]` is itself an array type, so `addresses.zip` is `string[]`. A broad parent field definition takes precedence over a narrower child definition; declare only the children you need indexed when the other properties are display-only. To filter on several properties of the same array element, scope them with braces, as in `ingredients.{name:=cheese && amount:<30}`. Dotted conditions joined with `&&` can match across different elements.

## Tokenization recipes

By default Typesense strips special characters and joins what's left, so `K83913.39F29.59444AT` is indexed as one token, `K8391339F2959444AT`. Search matches word prefixes, so fragments from the middle of a token never match. The fixes below are cheaper than infix. `token_separators` and `symbols_to_index` can be set per field from v28 onward, and the field setting wins over the collection setting.

- **Part numbers and SKUs.** Set `"token_separators": ["."]` (or `-`, whatever the format uses) so each segment is its own token. To also match from the middle of a segment, make the field `string[]` and index every suffix of the identifier. For example `K83913.39F29.59444AT`, `83913.39F29.59444AT`, and so on down to `AT`.
- **Phone numbers.** Set `"token_separators": ["(", ")", "-"]` and make the field `string[]`. Store the formatted number plus digit-only variants, meaning with country code, without it, and the local part alone. Search it with `num_typos` 0 for that field.
- **Emails.** Set `"token_separators": ["+", "-", "@", "."]`.
- **URLs and file paths.** Set `"token_separators": [":", "/", "."]`.
- **Symbols that carry meaning**, like `c++` or `#hashtag`, go in `symbols_to_index`.
- **Long text.** Split articles into one document per section or paragraph. Keyword matches spread across a very long body swamp relevance.
- **HTML.** Index a plain-text copy and keep the raw HTML unlisted for display.
- **Filtering on empty values.** Add a companion `bool` such as `has_tags` and filter on it, because null values can't be filtered directly.

## Organizing collections

- **One collection per record type**, the way you'd use one table. Heterogeneous products can share a collection with optional fields.
- **Multi-tenant.** Put all tenants in one collection with a tenant field, and hand each tenant a scoped search key that embeds `filter_by: tenant_id:=<id>`. Move a large tenant to its own collection only when it outgrows the shared one and filtering adds latency. See [keys.md](keys.md).
- **Environments.** Separate clusters give real isolation and let you test upgrades. Suffixed collections like `products_staging` on one cluster are cheaper when staging is small.
- **One ranked list across record types.** Use a `multi_search` with `union: true` (v28 and later). Every search in the union must sort by fields of the same types, in the same order.

## Changing a schema

`PATCH /collections/<name>` adds and drops fields. To change a field, drop it and add it back in the same request. The `id` field can't be changed. Before picking this route, know that the change

- blocks writes to that collection on every node until it finishes, while reads keep working
- runs one at a time per cluster, so give the client a timeout long enough to cover it, because a retry after a short timeout collides with the alter still in flight
- is validated against the documents on disk, including unlisted fields. Numeric strings like `"12.50"` are coerced into a new numeric field, but a stored value that can't be converted fails the whole change. The stored JSON keeps the old string until each document is rewritten
- leaves a dropped field's data in the stored documents. Purge it by updating each document with that field set to `null`
- reports progress at `GET /operations/schema_changes`

Reference fields can't be added by alter. See [joins.md](joins.md).

For big collections, busy hours or type changes, reindex into a new versioned collection and swap the alias instead, as described in [sync.md](sync.md).

## Moving an existing collection behind an alias

An alias can't share a name with a collection, so an app that queries a collection called `products` directly takes two steps to move behind an alias.

1. Build `products_v2` with the new schema and import everything into it.
2. Pick one of these.
   - **No gap.** Create an alias with a new name, such as `products_live`, pointing at `products_v2`. Switch the app to `products_live` and deploy. Then drop `products`.
   - **Same name.** Delete the `products` collection and immediately create the alias `products` pointing at `products_v2`, in back-to-back calls. Searches fail for the moment between the two calls, but the app code doesn't change.

Either way, every later schema change is an alias swap.
