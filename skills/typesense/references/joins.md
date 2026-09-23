# JOINs and reference fields

A reference field links a document to documents in another collection. Joins filter on, include and sort by fields of the linked collection. They do not search it, so text you want matched by `q` belongs in the collection being searched.

## Join or denormalize

- **Join** when the related data changes on its own schedule or would multiply the index if copied into every document. Examples are per-customer prices, inventory levels, access lists and many-to-many relations.
- **Denormalize** by copying the related fields into each document when they rarely change, or when users search or facet on them.

## Declaring a reference

```json
{"name": "product_id", "type": "string", "reference": "products.id"}
```

- **Types.** One-to-one references are `string`, `int32` or `int64`. A document pointing at several others uses the array types.
- **Plan them at creation.** A reference field can't be added with an alter, so adding one means a new collection and a reindex.
- **Import order.** Without `async_reference: true` (plus `optional: true`), indexing a document whose referenced document doesn't exist yet fails. Set it when the two collections are loaded independently.
- **Cascade delete** is on by default. A document is deleted when every document it references is deleted. Turning it off with `cascade_delete: false` requires `async_reference: true`.
- **Reindex together.** References store internal ids that depend on indexing order. Swapping one collection behind an alias means reindexing every collection joined to it at the same time.
- **Access.** A search key scoped to one collection can read fields of every collection it references, through joins. See `keys.md`.
- **No mutual references.** From v30, two collections that reference each other leave the reference fields unindexed.

## Querying

References point one way, and the query shape depends on which side you search.

- **From the side that holds the reference,** include linked fields with `include_fields: "$authors(first_name,last_name)"`.
- **From the referenced side,** include alone returns nothing. Join first with `filter_by: "$books(id:*)"`, then `include_fields: "$books(*)"`. `id:*` matches every document.
- **Filter** with `filter_by: "$inventory(qty:>0 && store_id:=berlin)"`. Joins are inner by default, so documents with no match drop out.
- **Left join.** `filter_by: "id:* || $user_prices(tier:=VIP)"` keeps documents that have no match.
- **Anti-join.** `filter_by: "!$deny_list(user_id:=u11)"` keeps documents with no matching row. Pair it with `exclude_fields: "$deny_list(*)"`.
- **Sort** by a joined field with `sort_by: "$user_prices(price:asc)"`. When a product has several joined rows this uses the lowest price, or the highest with `:desc`. Other ways of sorting on a one-to-many join fail with "Multiple references found to sort by".
- **Nested joins** chain inside each other, as in `$variants($inventory(qty:>0))`, in both `filter_by` and `include_fields`.
- **Controlling joined documents.** `$books(*, sort_by: published_at: desc, limit: 5)` inside `include_fields` sorts and caps them. `related_docs_count` returns how many matched.
- **Facets.** `facet_by: "$brands(name)"` facets on a joined field.

## Result shape

A joined field comes back as an object when one document matched and an array when several did, so code that reads it breaks on the first product with two matches.

- `strategy: nest_array`, as in `include_fields: "$prices(*, strategy: nest_array)"`, always returns an array.
- `strategy: merge` flattens the joined fields into the parent document.
- Array reference fields always return arrays.
