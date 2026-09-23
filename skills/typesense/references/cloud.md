# Typesense Cloud

## Choosing the tool

- **Interactive work** goes through the Typesense Cloud MCP server when it is connected. It handles creating, resizing and cloning clusters and minting keys, and it keeps key values out of the conversation. See `SKILL.md`.
- **Automation** such as scripts, CI and infrastructure code uses the Cloud Management API at `https://cloud.typesense.org/api/v1`. Its full schema is at `https://cloud.typesense.org/api/v1/openapi.json`.
- **Searching and indexing** always go through the Typesense Server API on the cluster's own hostnames. The Management API only manages clusters.

## Cloud Management API

- **Auth.** Send the key in `X-TYPESENSE-CLOUD-MANAGEMENT-API-KEY`, a different header from the Server API's. The key is shown once at creation, and it belongs to the account rather than to the person who made it.
- **Permissions.** Keys carry capabilities. The `read-only`, `provision`, `operate` and `admin` presets cover most needs. `cluster_credentials:issue` can mint admin keys for clusters, so grant it only where needed.
- **Rate limit.** 30 requests per minute per key, and a 429 means wait a minute. Poll cluster status every 30 seconds or slower. The Server API has no such limit.
- **Status codes.** A 404 can also mean the key isn't allowed to see the resource. A 402 means the account needs a payment method for anything beyond the free tier.

## Creating a cluster

1. **Check options.** `GET /cluster-options` lists the valid memory sizes, the vCPU choices for each size, and the regions. Only some combinations are allowed, and it also shows which regions are currently unavailable.
2. **Create** with `POST /clusters`.
   - `regions` and `region_node_counts` can't both be set.
   - `high_availability_node_count` (3 to 7) needs high availability on, a single region, and no Search Delivery Network.
   - A Search Delivery Network needs `high_availability: "yes"`.
   - High-performance disk needs high availability and a non-burst CPU.
3. **Wait** until `GET /clusters/<id>` shows `status: in_service`, which takes a few minutes.
4. **Mint keys** with `POST /clusters/<id>/api-keys`. This only works once the cluster is in service.
5. **Connect clients** to the cluster hostnames from the response. For high availability or a Search Delivery Network, use the load-balanced endpoint as `nearestNode` and list the individual node hostnames as fallbacks, because node rotation drains connections for about 30 seconds.

## Changing a cluster

- **Scheduling.** `POST /clusters/<id>/configuration-changes` takes a required `perform_change_at` Unix timestamp. Only one pending change or clone can exist at a time, and a change can be cancelled only while it's pending.
- **Field names differ** from creation, for example `new_typesense_server_version`, `new_region_node_counts` and `new_high_availability_node_count`.
- **What a change can do.** It covers the server version, memory, CPU, high-performance disk, GPU, turning on high availability, and the Search Delivery Network. High availability can't be turned off again. Anything else means a new cluster and a reindex.
- **Downtime.** Upgrading a single-node cluster takes it down for between 5 minutes and an hour. Clusters with high availability upgrade without downtime when clients list every node.
- **Server parameters** like `cors-domains` or `max-per-page` are set through the parameters endpoints. They take effect only after a restart, which you trigger by posting a configuration change that contains only `perform_change_at`. `cors-domains` accepts HTTPS origins only, without wildcards.
- **Cloning** a cluster, optionally into a new region or onto a new server version, makes a safe place to test an upgrade.
- **Terminating** a cluster deletes its data for good.

## Terraform

There is no official Terraform provider. A community one exists (`CookiesCo/typesense`), so check that it's maintained before relying on it.
