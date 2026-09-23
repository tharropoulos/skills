# Skill validation cases

These cases check the behavior behind step 4 of `SKILL.md` and claims in its references and "v30 vocabulary" section. Run them against a local server after editing the skill. If a case fails on a new Typesense version, update the affected guidance.

## Setup

```sh
docker run -d --name ts-validation -p 8108:8108 typesense/typesense:30.2 \
  --data-dir /tmp --api-key=xyz --enable-cors
export TS=http://localhost:8108 KEY=xyz
until curl -sf "$TS/health" >/dev/null; do sleep 1; done
curl -s "$TS/debug" -H "X-TYPESENSE-API-KEY: $KEY" | jq -r .version
```

Expected: the server version, for example `30.2`. This is how step 1 of `SKILL.md` pins the version.

## Test 1: The schema round-trips with the intended flags

```sh
curl -s "$TS/collections" -H "X-TYPESENSE-API-KEY: $KEY" -H 'Content-Type: application/json' -d '{
  "name": "products_v1",
  "fields": [
    {"name": "title", "type": "string"},
    {"name": "brand", "type": "string", "facet": true},
    {"name": "sku", "type": "string", "infix": true},
    {"name": "popularity", "type": "int32", "optional": true}
  ]
}' >/dev/null
curl -s "$TS/collections/products_v1" -H "X-TYPESENSE-API-KEY: $KEY" |
  jq -e 'any(.fields[]; .name == "brand" and .facet == true) and
         any(.fields[]; .name == "sku" and .infix == true) and
         any(.fields[]; .name == "popularity" and .optional == true)'
```

Expected exit code: 0.

## Test 2: Import returns HTTP 200 even when documents fail

```sh
printf '%s\n' \
  '{"id": "1", "title": "Mug", "brand": "Acme", "sku": "AC-100"}' \
  '{"id": "2", "title": "Cup", "brand": "Acme", "sku": "AC-200", "popularity": "high"}' \
  > /tmp/ts-import.jsonl
curl -s -o /tmp/ts-import.out -w '%{http_code}\n' \
  "$TS/collections/products_v1/documents/import?action=upsert" \
  -H "X-TYPESENSE-API-KEY: $KEY" -H 'Content-Type: text/plain' \
  --data-binary @/tmp/ts-import.jsonl
jq -s '[.[] | select(.success == false)] | length' /tmp/ts-import.out
jq -s -e '.[1].error != null and (.[1] | has("document") | not)' /tmp/ts-import.out
curl -s "$TS/collections/products_v1/documents/import?action=upsert&return_id=true&return_doc=true" \
  -H "X-TYPESENSE-API-KEY: $KEY" -H 'Content-Type: text/plain' \
  --data-binary @/tmp/ts-import.jsonl | jq -s -e '.[1].id == "2" and (.[1] | has("document"))'
```

Expected: `200`, `1`, `true`, `true`. The second document fails on its `popularity` type while the request as a whole still succeeds. The failed document appears only when `return_doc=true` is requested.

## Test 3: A search-only key is rejected on writes

```sh
SEARCH_KEY=$(curl -s "$TS/keys" -H "X-TYPESENSE-API-KEY: $KEY" -H 'Content-Type: application/json' \
  -d '{"description": "search-only", "actions": ["documents:search"], "collections": ["products_v1"]}' | jq -r .value)
curl -s -o /dev/null -w '%{http_code}\n' \
  "$TS/collections/products_v1/documents/search?q=mug&query_by=title" -H "X-TYPESENSE-API-KEY: $SEARCH_KEY"
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  "$TS/collections/products_v1/documents" -H "X-TYPESENSE-API-KEY: $SEARCH_KEY" \
  -H 'Content-Type: application/json' -d '{"id": "3", "title": "Bowl", "brand": "Acme", "sku": "AC-300"}'
```

Expected: `200`, then `401`.

## Test 4: A synonym set does nothing until a collection links it

```sh
curl -s -X PUT "$TS/synonym_sets/products-synonyms" -H "X-TYPESENSE-API-KEY: $KEY" \
  -H 'Content-Type: application/json' \
  -d '{"items": [{"id": "cup-mug", "synonyms": ["cup", "mug"]}]}' >/dev/null
search() {
  curl -s "$TS/collections/products_v1/documents/search?q=cup&query_by=title&num_typos=0" \
    -H "X-TYPESENSE-API-KEY: $KEY" | jq .found
}
search
curl -s -X PATCH "$TS/collections/products_v1" -H "X-TYPESENSE-API-KEY: $KEY" \
  -H 'Content-Type: application/json' -d '{"synonym_sets": ["products-synonyms"]}' >/dev/null
search
```

Expected: `0`, then `1`. The only document in the collection is the mug, and "cup" finds it only after the collection links the set.

## Teardown

```sh
docker rm -f ts-validation
```
