# Relevance

Ranking in Typesense is a chain of **tie-breakers**. Text match comes first, then whatever `sort_by` lists after it. Most tuning is deciding where relevance should end and a business signal should take over.

## Tuning loop

1. **Collect test queries.** Write down 10 to 20 real queries with the results each should put on top. Take them from search logs, the analytics popular-queries collection, or ask. Include the queries people complain about.
2. **Record the baseline.** Run each one and save the top results.
3. **Change one thing,** using the levers below.
4. **Rerun every query.** Done when the target queries improve and none of the others got worse. Keep the queries and expected results in the repo so the next change can be checked the same way.

## Text match

- **Field order.** Fields earlier in `query_by` rank higher. `query_by_weights` sets explicit weights, one per field in the same order.
- **`text_match_type`.** `max_score` (the default) takes the best-matching field and uses weights only to break ties. `max_weight` favours matches in the highest-weighted field. `sum_score` adds up matches across fields, which rewards documents that match weakly in many places.
- **`prioritize_exact_match`** (default true) ranks a verbatim match first. `prioritize_token_position` ranks documents whose matching words appear earlier. `prioritize_num_matching_fields` (default true) rewards matches in more fields.

## Mixing relevance with popularity, recency or stock

- **Buckets.** `sort_by=_text_match(buckets: 10):desc,popularity:desc` splits the results into 10 relevance bands, treats everything in a band as tied, and ranks each band by popularity. Fewer buckets give popularity more say. `bucket_size: 5` makes bands of a fixed size instead. Use a timestamp in place of `popularity` for recency.
- **Hard sort with relevance as tie-breaker.** `sort_by=price:asc,_text_match:desc`.
- **Boost or bury by condition.** `_eval(in_stock:true):desc` puts matching documents first without excluding the rest. `_eval([ (brand:Nike):3, (brand:Adidas):2 ]):desc` gives tiered boosts. The expressions use `filter_by` syntax.
- **Popularity from clicks.** An analytics counter rule can keep a popularity field up to date from click and conversion events. See [analytics.md](analytics.md).
- **`default_sorting_field`** is the tie-breaker when `sort_by` is empty, and it also picks which prefix and typo expansions get searched. See [schema.md](schema.md).

## Typos, prefixes and dropped words

These settings relax a query only when it finds too few results, so they explain most "why did this match" and "why didn't this match" questions.

- **Typos.** `num_typos` allows up to 2 per word, set per field in `query_by` order, for example `num_typos=2,0,0` to turn typos off for identifier fields. Words shorter than `min_len_1typo` (default 4) or `min_len_2typo` (default 7) get no typos. `typo_tokens_threshold` (default 1) sets how few results trigger typo correction. Turn typos off completely with `num_typos=0` and `typo_tokens_threshold=0`.
- **Prefix search** applies to the last word of the query only.
- **Candidate limit.** A short prefix or a typo can match hundreds of words, and only the top `max_candidates` (default 4) are searched. That is why "ap" can miss the obvious results, and why adding a filter can return more results than no filter. Raise `max_candidates` or set a popularity `default_sorting_field`.
- **Dropping words.** When a multi-word query finds `drop_tokens_threshold` (default 1) results or fewer, Typesense drops words from the right and searches again. Set it to 0 to require every word. `drop_tokens_mode` changes which end words are dropped from.
- **Split and joined words.** `split_join_tokens` (default `fallback`) tries "smart phone" as "smartphone" and the reverse when nothing matches.

## Synonyms

- **Multi-way** synonyms make every word in the group find the others. **One-way** synonyms have a `root`, and searching the root also finds the synonyms, not the reverse.
- **Sets.** From v30, synonyms live in a set at `PUT /synonym_sets/<name>` as `{"items": [{"id": ..., "synonyms": [...], "root": ...}]}`. The set does nothing until the collection lists it in `synonym_sets`, set with `PATCH /collections/<name>`. A search can add sets with the `synonym_sets` parameter.
- **Scope.** Synonyms apply to the words in `q` only. Phrase queries in double quotes and `filter_by` ignore them.
- **Locale.** A synonym with a `locale` applies only when the highest-weighted searched field has that locale.
- **Symbols.** Special characters are dropped from synonyms unless listed in the item's `symbols_to_index`.

## Curation (pinning, hiding and merchandising rules)

From v30, rules live in a curation set at `PUT /curation_sets/<name>` as `{"items": [...]}`, and the collection must list the set in `curation_sets`. Each item has a `rule` plus what to do when it matches.

- **Triggers.** A rule matches on `rule.query`, which needs `rule.match` of `exact` or `contains`, or on `rule.filter_by`, which must equal the request's `filter_by` string exactly, spaces and backticks included. Placeholders like `{brand}` in a query rule capture words for use in the item's `filter_by` or `sort_by`, and the placeholder field should be faceted.
- **Actions.** `includes` pins documents at positions (`[{"id": "42", "position": 1}]`). `excludes` hides them. `filter_by`, `sort_by` and `replace_query` rewrite the search. `metadata` returns a custom object, for example a banner. `effective_from_ts` and `effective_to_ts` time-box the rule.
- **Defaults to know.** `remove_matched_tokens` is true, so the matched words are removed from the query. `filter_curated_hits` is false, so pinned documents ignore the user's filters, a sold-out item included. `stop_processing` is true, so only the first matching rule applies, in alphabetical order of item `id`.
- **Tags.** A search that sends no `curation_tags` considers only untagged rules. With tags, rules matching all the tags run first, then rules matching any of them.
- **Order.** Curation runs first and can rewrite the query, then synonyms apply to the result. Per-request `pinned_hits` and `hidden_hits` parameters apply after that, and suit pins computed by the app, such as per-category merchandising pulled from a CMS.

## Stemming and stopwords

- **Stemming** is set per field in the schema. `"stem": true` uses the field's `locale`, and changing it means a schema change. The algorithmic stemmer mangles brand and place names, so product catalogs do better with a `stem_dictionary` such as a plurals dictionary, imported with `POST /stemming/dictionaries/import?id=<name>`.
- **Stopwords** are removed from queries only, never at indexing, and apply only when a search passes `stopwords=<set name>`. A set is stored at `PUT /stopwords/<name>`. Phrases are split into single words, so adding "united states" also drops "states" on its own.
