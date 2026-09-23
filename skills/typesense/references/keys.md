# API keys and access control

A Typesense key is a **capability**, meaning a list of actions on a set of collections. Anyone who holds the string can do whatever it allows. So each part of the system gets the narrowest key that does its job, and anything that ships to a user's device gets a key that only searches.

## Steps

1. **Map every caller.** List each place that talks to Typesense (browser, mobile app, backend API, sync worker, CI, admin scripts) and what it does there. Done when every Typesense client in the repo appears on the list.
2. **Create one key per caller** from the table below with `POST /keys`. Save each `value` straight into a secret store, because the server returns it only once. Later reads return only a `value_prefix`.
3. **Mint scoped keys on the backend** if users may only see part of the data. See the next section.
4. **Verify.**
   - Each key succeeds on its allowed actions and gets a 401 on one action outside them.
   - Search the built frontend bundle and the mobile app config for the value of every admin and write key. Done when only search-only or scoped keys appear there.

| Caller | Key |
|---|---|
| Browser or mobile app, every user sees the same data | `actions: ["documents:search"]` on the collections it searches |
| Browser or mobile app, users see different data | A scoped key minted per user by your backend |
| Sync worker | `documents:*` on its collections, plus `collections:*` and `aliases:*` if it creates collections and swaps aliases |
| Admin tools and migrations | A key with wide actions, kept out of app code |

- **The bootstrap key** passed as `--api-key` is an admin key that can't be listed or rotated. Use it once to create the keys above, then keep it only for emergencies.
- **Collection scope** is a regex, so `org_.*` covers every collection starting with `org_`. It applies only to collection endpoints. A key with `synonym_sets:*` or `stopwords:*` can edit every set on the cluster, whatever its `collections` say.
- **Joins widen access.** A search key scoped to one collection can also read fields from any collection that collection references, through a joined query. Leave sensitive fields out of referenced collections, or strip them with `exclude_fields` in a scoped key.
- **Expiry.** `expires_at` is a Unix timestamp, and `autodelete: true` purges the key hourly once it has expired.
- **Rotation.** Keys can't be edited. Create the new key, deploy it, then delete the old one.
- **Mobile apps** fetch the Typesense host and key from your backend at launch rather than bundling them, so they can be rotated without an app release.

## Scoped search keys

A scoped key is a search-only parent key plus a JSON object of search parameters, signed with HMAC-SHA256. It is **signed, not encrypted**. The parameters sit in the key as readable JSON, so they must never hold secrets, but nobody can change them without breaking the signature. Typesense applies the embedded parameters to every search made with the key and the caller can't override them. An embedded `filter_by` is ANDed with whatever filter the request sends.

- **Minting.** The client libraries do it locally with no server call, for example `client.keys().generateScopedSearchKey(parentKey, params)` in JavaScript. Mint on the backend, per user or per session, and send the result to the frontend.
- **The parent** must have exactly `actions: ["documents:search"]`. A parent with any other action makes invalid scoped keys.
- **The parent stays on the server.** A user holding the parent key can search without the embedded filters.
- **Filters.** Tenant and user filters use exact match (`:=`), for example `filter_by: "tenant_id:=acme"` or `"accessible_to_user_ids:=42"`. The `:` operator matches single words inside a value, which is looser than an access rule should be.
- **Other useful parameters** are `exclude_fields` (for example the list of user ids that grants access), `limit_hits` to cap how deep a user can page, `limit_multi_searches` to cap searches per `multi_search` request, and `expires_at`. A scoped key's `expires_at` must come before its parent's.
- **Revocation.** Individual scoped keys can't be revoked. Deleting the parent invalidates every key minted from it. To be able to cut off one organization at a time, create one parent key per organization.

### Multi-tenant and role-based access

1. Add the access fields to every document, such as `tenant_id` (`string`) and `accessible_to_roles` (`string[]`).
2. After login, the backend mints a key embedding the user's scope, for example `filter_by: "tenant_id:=acme && accessible_to_roles:=[sales,support]"`, plus `exclude_fields` for the access fields.
3. The frontend searches with that key and nothing else.

### Curation rules under scoped keys

A curation rule that triggers on `rule.filter_by` matches the whole filter string exactly. With a scoped key that string is `(<request filter>) && (<embedded filter>)`, so write the rule's `filter_by` in that form.
