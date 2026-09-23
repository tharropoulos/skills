# Importing and syncing data

Upserts keyed by a stable `id` are **idempotent**, so sending a row twice costs nothing but missing a row is silent. Every sync design here leans toward re-sending.

## Writing documents

| Action | Sends | When the id exists | When the id is new |
|---|---|---|---|
| `create` (default) | Whole document | Fails | Creates |
| `upsert` | Whole document | Replaces it. Fields you left out are gone | Creates |
| `update` | Some fields | Merges them | Fails |
| `emplace` | Whole or partial | Merges them | Creates |

Sync code uses `upsert` with whole documents, or `emplace` when it only has some fields. Event-driven handlers never use `create`, because a redelivered event then fails.

- **Batch writes.** Anything above roughly (number of threads + 2) writes per second goes through `POST /collections/<c>/documents/import` in batches. The body is JSONL with one document per line and `Content-Type: text/plain`. Client libraries also accept an array. With curl, send the file with `--data-binary @docs.jsonl`, because `-d` strips the newlines.
- **Per-line results.** The response has one JSON line per input line, in order. Treat the call as failed if any line has `"success": false`. Failures carry `error` and `code`; by default they omit the document and id. `return_id=true` adds the id when the input had a parseable one, and `return_doc=true` adds the input document at a payload cost. Keep the input line number so malformed rows can still be traced.
- **Timeouts.** Writes are synchronous. A client timeout shorter than the import makes the client retry work the server is still doing, which piles on load. Give import clients a timeout of several minutes, up to 60 minutes for very large batches.
- **Batch size.** Size batches on the client and run several import calls in parallel, keeping the number of workers a couple below the server's CPU cores. The `batch_size` query parameter is a different thing. It controls how often the server pauses an import to serve searches, and the default is right. A single import request is capped at 10 GB.
- **Mapping rows to documents.** Convert every value to the schema type before sending. That means the primary key to a string `id`, dates to `int64` timestamps, and nulls in required fields to a default or to a field declared optional.
- **Values that still don't fit** are a data problem for the developer to decide on. Let those documents fail, then report the count and every failed `id` with its `error`, or write them to a file the developer can fix. An explicit schema already rejects them (`dirty_values: reject`). Setting `coerce_or_drop` or `drop`, or making a field optional to get bad values past validation, hides the problem behind a successful import, so do that only when the developer asks for it.
- **Deleting.** Delete by id, or many at once with `DELETE /collections/<c>/documents?filter_by=id:[a,b,c]`. Add `ignore_not_found=true` so deleting an already-deleted row isn't an error. Empty a collection with `?truncate=true`.
- **Exporting.** `GET /collections/<c>/documents/export` streams JSONL that can be imported again as is. From v30, a document that fails to load shows up as an error line in the stream, so check for those lines.

## Keeping Typesense in sync with a database

### Steps

1. **Pick the change source.**
   - **Polling** on an `updated_at` column every few seconds to a minute. This is the simplest option and works on any database.
   - **Change data capture** from the database log or triggers, pushed through a queue and flushed in batches every few seconds.
   - **ORM hooks or model observers** in the app, which only see writes made through the app.

   Prefer polling unless the app needs changes in search within seconds.
2. **Write the mapper** from a database row to a Typesense document, following the mapping rules above.
3. **Build the watermark loop** (polling) or the event handler (change data capture), as described below.
4. **Handle deletes** in one of three ways, described below.
5. **Add reconciliation.** Compare source and index counts and sampled ids, then repair drift or rebuild through an alias. Schedule a full rebuild only if its cost and freshness window fit the workload.
6. **Walk the failure scenarios.** Done when you can point to the line of code that handles each of these.
   - The process crashes in the middle of a run.
   - A row is updated while a run is in progress.
   - A row is soft-deleted, and a row is hard-deleted.
   - One document in a batch fails while the rest succeed.
   - The process restarts after being down for an hour.
   - Two instances of the worker run at once.

### The watermark loop

The watermark is the point in time up to which every change is known to be in Typesense. Persist it outside the process, in a database table or a key-value store.

1. Read the watermark `W`. On the first run `W` is the epoch, which makes the first run a full backfill.
2. Take `T` from the database clock before fetching anything. Use a consistent snapshot if the database supports one.
3. Fetch rows with `W - margin < updated_at <= T`. Page through the rows with a keyset on `(updated_at, id)`, not with `OFFSET`. Pick a margin larger than the longest transaction and timestamp precision gap you expect.
4. Map each page, import it with `action=upsert`, and check every result line.
5. Only if every page succeeded, save `T` as the new watermark. If anything failed, leave the watermark where it was so the next run retries the same window. Re-sending those rows is harmless.

Keep `updated_at` current with a database trigger rather than in app code, so writes made outside the app (migrations, admin scripts, other services) get synced too. On restart, resume from the saved watermark. Seeding it from `MAX(updated_at)` in Typesense skips everything that changed while the worker was down.

An `updated_at` poll cannot guarantee capture of a transaction that commits after its timestamp has fallen outside the overlap window. Use a transactional outbox or log-based change capture when missing a change is unacceptable. Process its events in source order per id, and checkpoint only after Typesense acknowledges every write or delete; a late older event must not overwrite a newer document.

Run exactly one worker. A web server with several processes or replicas starts one scheduler per process, so run the sync as its own job or take a lock (for example a Postgres advisory lock) before each run.

If the app also upserts to Typesense right after a user edit, that is only a latency shortcut. It leaves the watermark alone, and the loop still re-sends the row later.

### Deletes

Polling on `updated_at` can't see a row that no longer exists. Use one of these approaches.

- **Soft deletes.** A `deleted_at` column bumps `updated_at` too. The loop deletes those ids from Typesense instead of upserting them.
- **Tombstone table.** A database trigger writes the id of each hard-deleted row to a tombstone table, and the loop drains it.
- **Change data capture.** Delete events arrive with the id.

### Change data capture notes

- **Postgres.** Debezium on the write-ahead log, or on Supabase, triggers that call `pg_net`. `pg_net` is asynchronous and safe inside triggers.
- **MySQL.** Maxwell or Debezium on the binlog.
- **MongoDB.** Change streams need a replica set. Persist the resume token after each flushed batch and resume from it on restart. Open the stream with `fullDocument: "updateLookup"` so updates carry the whole document, and convert `_id` to a string for `id`.
- **DynamoDB.** Use Streams with `NEW_AND_OLD_IMAGES`. Unmarshall the typed attribute values (`{"S": "..."}`) before sending, and treat `REMOVE` events as deletes.
- **Firestore.** Use triggers or the official Firebase extension. Take the id from the document path, not from the document data.

Buffer events and flush them through the import endpoint every few seconds rather than writing one document per event.

## Reindexing

**Zero-downtime reindex with an alias.** Use this when the schema changes or for a full rebuild.
1. Create a new collection, such as `products_v4`.
2. Import everything into it and check the results.
3. Compare its document count with the source.
4. Repoint the alias with `PUT /aliases/products` and `{"collection_name": "products_v4"}`.
5. Drop the old collection once nothing reads from it.

Alias swapping requires adequate memory. Do not try to copy a whole collection when its size would overload the server's RAM.

Writes that land during the rebuild must reach the new collection too. Either write to both collections until the swap, or re-run the incremental sync from the rebuild's start time after swapping. If other collections hold reference fields pointing at this one, reindex them together. See [joins.md](joins.md).

**In-place reindex.** Use this when the schema is unchanged. Stamp every document with a `last_synced_at` of the run's start time `T` and upsert everything. Then delete the stale documents with `filter_by=last_synced_at:<T`.

## When writes fail

- **HTTP 503 "Not Ready or Lagging"** is backpressure, meaning writes are arriving faster than the node can apply them. Retry with backoff and jitter of tens of seconds, switch any single-document writes to batched imports, and check the client timeout. Each client has an equivalent timeout value on its Client instance, check for the type definitions or examples. After that, remove display-only fields from the schema and add CPU cores (at least 4 for heavy writes). A 503 right after a restart means the node is still loading its data into memory.
- **`OUT_OF_MEMORY`** means the indexed data no longer fits in RAM. Unlist fields that are only displayed, or add RAM.
- **`OUT_OF_DISK`** means add disk. On Typesense Cloud, disk grows with the RAM tier.
