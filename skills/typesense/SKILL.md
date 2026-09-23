---
name: typesense
description: Typesense v30 API rules and recipes. Use before writing or editing any code, config, CI workflow or script that uses Typesense, including collection schemas, importing or syncing data, search and filter_by queries, API keys, relevance tuning, vector search, and running a cluster.
---

# Typesense

Typesense changes fast and several APIs were renamed in v30, so much of what you remember about it is out of date. The live server and the versioned docs are the source of truth. This skill carries what they leave out.

## Steps

1. **Pin the version.** Read `version` from `GET /debug`. If there is no server to call, use the Docker image tag or the Cloud console. For client code, check the lockfile's client version too. Done when you can name the server version, since features and parameter names depend on it.

2. **Open the references for the task** from the table below, before writing any code. A task often touches several rows, for example a search page touches both UI and keys. Done when you have read every reference whose row matches part of the task.

3. **Look up exact parameters for that version.** Fetch `https://typesense.org/docs/<version>/api/<page>.md`, or `<page>.<lang>.md` for one language's samples (`javascript`, `python`, `php`, `ruby`, `go`, `java`, `dart`, `swift`, `shell`). The page index is `https://typesense.org/docs/llms.txt`. Guides live at `https://typesense.org/docs/guide/<page>.md` and describe the latest version. Exact request and response schemas are in `https://raw.githubusercontent.com/typesense/typesense-api-spec/master/openapi.yml`. For client method names and signatures, trust the installed client's types over doc samples.

4. **Verify against the server when one is available.** If no server is reachable, state which behavior remains unverified and use the source, tests and versioned docs to check it. Done when each changed behavior has evidence or an explicit verification gap.
   - Schema. `GET /collections/<name>` shows each field with the flags you intended.
   - Import. Every line of the import response has `"success": true`.
   - Search. The query returns the hits you expected, in the order you expected.
   - Keys. The new key succeeds on the actions it should allow and gets a 401 on the rest.

| Task | Read |
|---|---|
| Designing or changing a collection, choosing field types, finding SKUs, phone numbers, emails or URLs by fragments | `references/schema.md` |
| Importing data, keeping Typesense in sync with a database or with app writes, reindexing, 503 errors | `references/sync.md` |
| Filters, facets and their counts, grouping, pagination, searching several collections at once, geo search | `references/search.md` |
| Result order, boosting by popularity or stock, typos, pinning or hiding results, synonyms, stemming | `references/relevance.md` |
| API keys for browsers, apps, CI or services, per-user or per-tenant access | `references/keys.md` |
| Search by meaning, semantic or hybrid search, embeddings, RAG or chat over data, natural-language queries, image and voice search | `references/ai.md` |
| Data spread over several collections, per-customer prices or permissions, related records, JOINs | `references/joins.md` |
| Popular searches, query suggestions, tracking clicks and conversions, ranking by clicks | `references/analytics.md` |
| Search pages and components, InstantSearch, framework setup, keys in frontend builds | `references/ui.md` |
| Running Typesense locally, in CI or self-hosted, sizing, high availability, backups, upgrades | `references/ops.md` |
| Typesense Cloud clusters, the Cloud Management API, Terraform | `references/cloud.md` |

## Typesense Cloud MCP server

When the MCP server (`https://cloud.typesense.org/mcp/v1`) is connected, use it to provision, resize and clone clusters and to mint API keys. It delivers key values to a local file and keeps them out of the conversation. App code such as sync workers, key endpoints and search UI still goes in the repo. Headless MCP sessions only get cluster tools, so data operations there go through the Server API. MCP imports are capped at 1,000 documents or 10 MB per call, and larger jobs belong in code.

## v30 vocabulary

Typesense v30 moved synonyms and overrides out of collections into standalone sets, and overrides are now called curations. Code on the left of this table targets the old API.

| Before v30 | v30 and later |
|---|---|
| `/collections/{c}/synonyms/{id}` | `/synonym_sets/{name}` holding `items`, linked through the collection's `synonym_sets` |
| `/collections/{c}/overrides/{id}` | `/curation_sets/{name}` holding `items`, linked through the collection's `curation_sets` |
| `override_tags` search param | `curation_tags` |
| `enable_overrides` search param | `enable_curations` |
| `synonyms:*` and `overrides:*` key actions | `synonym_sets:*` and `curation_sets:*`, on newly created keys since keys can't be edited |
| Analytics rule `params.source.collections` and `params.destination.collection` | Top-level `collection` and `event_type`, plus `params.destination_collection` |
| Analytics event `"type": "click"` | `"event_type": "click"` |

A synonym or curation set does nothing until a collection links it. Upgrades auto-migrate old definitions into sets named `<collection>_synonyms_index` and `<collection>_curations_index`, so list `/synonym_sets` and `/curation_sets` to find them.

## Shared rules

- **Document ids.** Derive a stable string `id` from the primary key in your database so retries target the same document. Use URL-safe ids where possible; encode the id when it appears in a URL path.
- **Keys.** Browsers and mobile apps get a search-only key or a scoped key minted by your backend. The admin key and the bootstrap `--api-key` stay on the server.
- **Source of truth.** Typesense is a secondary index. The primary database owns the data, and anything in Typesense can be rebuilt from it.
