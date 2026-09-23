# Vector, hybrid and AI search

## Contents

- Choosing an approach
- Embedding fields
- Vector queries
- Hybrid search
- RAG (conversational search)
- Natural language search
- Image and voice search

## Choosing an approach

- **Keyword** search handles exact terms, SKUs, names and filters. Keep it as the base for any search bar.
- **Hybrid** search adds meaning to keyword search and is the default for a search bar that should also understand intent.
- **Pure vector** search suits "more like this", recommendations, long natural-language questions and cross-language matching.
- **Where embeddings come from.**
  - Built-in models (`ts/...`) run on the Typesense node. There is no per-call cost, but they use its CPU and RAM (2 to 6 GB), and indexing is slow without a GPU.
  - Remote models (OpenAI, Gemini, Azure) add a network call and a per-token cost to indexing and to every query.
  - Your own vectors fit when an embedding pipeline already exists. Hybrid search then needs the query embedded by your code too.

## Embedding fields

An auto-embedding field is a **derived column**. Typesense computes it from the source fields when a document is written.

```json
{"name": "embedding", "type": "float[]",
 "embed": {"from": ["name", "description"], "model_config": {"model_name": "ts/all-MiniLM-L12-v2"}}}
```

- **Sources.** `from` takes `string`, `string[]` or `image` fields, and their values are joined with spaces. The embedding is recomputed only when one of those fields changes. Changing the model means a new field.
- **Model name prefixes** choose the provider.
  - `ts/` is a built-in model.
  - `openai/` is OpenAI, and also any OpenAI-compatible server when you add a `url`.
  - `azure/` needs a `url` to the deployment.
  - `gcp/` is Vertex AI.
  - `google/` is the older PaLM API.
  - A plain directory name is a custom ONNX model placed under the data directory's `models` folder.
- **E5 models** need `"indexing_prefix": "passage:"` and `"query_prefix": "query:"` in `model_config`. Without them results quietly get worse.
- **Rotating a provider key.** `PATCH` the collection with the field's full `embed` block, meaning `from` and the whole `model_config`, not just `api_key`.
- **Remote retry settings.** `remote_embedding_timeout_ms` and `remote_embedding_num_tries` are per-request parameters on searches and imports, and `remote_embedding_batch_size` applies to imports. Some doc samples misspell the second one as `remote_embedding_num_try`, which is silently ignored.
- **GPUs** speed up generating embeddings with built-in models. The nearest-neighbour search itself runs on CPU either way.
- **Your own vectors.** Declare `{"name": "embedding", "type": "float[]", "num_dim": 384}`, sized to your model. `vec_dist` is `cosine` by default, or `ip` for inner product.

## Vector queries

- **Send them through `POST /multi_search`,** because a vector in a GET query string overflows URL limits. The same goes for base64 images and audio.
- **Exclude the embedding field.** Put it in `exclude_fields` on every search, or every hit returns the whole vector. In RAG it also fills the model's context.
- **Grammar.** `vector_query: "embedding:([0.1, 0.2, ...], k: 100)"`.
  - An empty `[]` means "work it out for me". Typesense embeds `q` with the field's model, or uses a document's vector with `id: 123`, which is "find similar" and excludes that document itself.
  - Other options are `distance_threshold`, `alpha`, `flat_search_cutoff`, `ef`, and `queries` with `query_weights` for blending several texts.
- **`k` is the pool and `per_page` the window.** When both are set the larger one wins. To paginate vector results, set `k` to the most you will ever page through and use `page` and `per_page` as usual.
- **Distance.** Cosine distance runs from 0 (identical) to 2 and sorts ascending. `distance_threshold` drops weak matches in a vector search. Inside `sort_by` it gives them the maximum distance but keeps them in the results.
- **Filtered vector search.** When a filter leaves only a few documents, `flat_search_cutoff` makes Typesense compare them all directly instead of walking the index. The default search-time `ef` of 10 is low, so raise it when recall matters.

## Hybrid search

- **Query.** List the text fields and the auto-embedding field together in `query_by`, as in `query_by=name,description,embedding`. Results from the keyword and vector searches are fused by rank.
- **`alpha`** inside `vector_query` is the vector share of the fused score, default 0.3, so `embedding:([], alpha: 0.7)` leans semantic.
- **Sorting.** In a hybrid search `_text_match` in `sort_by` means the fused score. Use `_vector_distance:asc` to sort by vector distance alone.
- **Weights.** `query_by_weights` needs one weight per `query_by` field, so give the embedding field a placeholder `0`.
- **Long conversational queries** make keyword token dropping expensive. Set `drop_tokens_threshold: 0` for them.
- **`rerank_hybrid_matches: true`** computes both scores for every hit instead of only the side that found it. It is more accurate and costs more.
- **Hybrid with your own vectors.** Put only the text fields in `query_by` and pass the vector in `vector_query`. The vector field stays out of `query_by`.
- **Re-ranking keyword results by meaning.** `sort_by=_text_match:desc,_vector_query(embedding:([...])):asc` keeps keyword recall and uses the vector only to reorder, which suits per-user personalisation.

## RAG (conversational search)

1. **Create the history collection** with exactly these fields: `conversation_id` string, `model_id` string, `timestamp` int32, `role` string with `index: false`, and `message` string with `index: false`.
2. **Create a conversation model** with `POST /conversations/models`, giving `model_name` (`openai/`, `azure/`, `google/`, `cloudflare/@cf/...` or `vllm/...`), its credentials, `history_collection`, and optionally `system_prompt`, `ttl` (default 86400 s) and `max_bytes`.
3. **Search** with `POST /multi_search`. Put `q`, `conversation=true`, `conversation_model_id` and, for follow-ups, `conversation_id` in the **URL query string**, not the body. Each search in the body queries an auto-embedding field and excludes it from the results.
4. **Read the answer** from `conversation.answer`. Pass its `conversation_id` on the next turn, and Typesense rewrites the follow-up into a standalone question. Several searches in one request produce one combined answer.
5. **Stream** by adding `conversation_stream=true`. The response is server-sent events ending in `data: [DONE]`.

`max_bytes` is the budget for history plus retrieved documents, after the system prompt.

## Natural language search

Natural language search is a **filter compiler**. An LLM turns "red shirts under 50" into `q`, `filter_by` and `sort_by` using the collection's schema and facet values.

- **Setup.** Create a model with `POST /nl_search_models`, then search with `nl_query=true` and `nl_model_id=<id>`.
- **Filters.** A `filter_by` you send is ANDed with the generated one, so hard rules like a tenant or stock filter stay enforced.
- **Debugging.** `parsed_nl_query` in the response shows what the model generated. Add `nl_query_debug=true` for more. When generation fails the search falls back to the plain query and reports an `error`.
- **First query is slow.** The first search per collection builds the prompt from facet queries and can take seconds. The prompt is cached for `nl_query_prompt_cache_ttl` seconds (default 86400).
- **Custom instructions.** A model's `system_prompt` is added to the generated prompt, not a replacement for it.
- **Choosing.** Natural language search fits structured intent over facet-like fields. Hybrid search fits fuzzy intent. The two can be combined.

## Image and voice search

- **Images.** Declare an `image` field holding base64 image data, usually with `"store": false`, and embed it with `ts/clip-vit-b-p32`. Search by text with `q`, by an existing image with `vector_query: "embedding:([], id: 123)"`, or by an uploaded image with `vector_query: "embedding:([], image: <base64>)"`.
- **Voice.** Set `voice_query_model: {"model_name": "ts/whisper/base.en"}` on the collection, not on a field. Send `voice_query` as base64 WAV, 16 kHz, 16-bit, mono (`ffmpeg -ar 16000 -ac 1 -c:a pcm_s16le`), through `multi_search`.
