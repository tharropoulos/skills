# Running Typesense yourself

## Contents

- Is Typesense the right fit
- Local and CI
- Sizing
- High availability
- Backups
- Upgrades
- Monitoring and production settings

## Is Typesense the right fit

- **Secondary store.** Typesense holds a copy of data that lives in a primary database. It doesn't crawl anything, and it isn't meant to be the only copy.
- **Everything indexed sits in RAM** on every node, with no sharding. Data that won't fit in the RAM of one machine points to Elasticsearch or OpenSearch.
- **Log search** is usually a poor fit because of volume and RAM cost. Letting users browse their own logs inside an app can be fine.
- **Against Postgres full-text search.** Stay on Postgres when search is simple, secondary and low-traffic. Move when you need typo tolerance, search-as-you-type, synonyms, relevance tuning or high query volume.

## Local and CI

```sh
docker run -d -p 8108:8108 -v "$PWD/typesense-data:/data" \
  typesense/typesense:<version> --data-dir /data --api-key=<key> --enable-cors
```

- **Readiness.** Wait for `GET /health` to return 200 before running tests. In CI, run Typesense as a service container and poll `/health` in a loop.
- **Versions.** Pin the image tag to the version production runs, and take the latest version from the Typesense releases, not from older guides.
- **ARM machines** with 16K memory pages need the `-arm64-lg-page16` image tags.
- **macOS binaries** need macOS 13 or later. Older Macs use Docker.

## Sizing

- **RAM** is about 2 to 3 times the size of the indexed fields. Fields left out of the schema cost disk, not RAM. See `schema.md`.
- **Vectors** take about 7 bytes × dimensions × documents. For example, 384 dimensions × 1M documents is about 2.7 GB.
- **Built-in embedding models** add 2 to 6 GB. Remote embedding providers add nothing beyond the vectors themselves.
- **CPU.** Use at least 2 vCPUs, and 4 or more for heavy writes. Burstable instances slow down under sustained load.
- **Disk** must hold at least the raw data, preferably on SSD.
- **Headroom.** Alert when RAM passes about 85% or CPU passes about 90%.

## High availability

- **Node count.** Run 3 nodes to survive 1 failure, or 5 to survive 2. Every node holds all the data, so extra nodes add read capacity. All writes go through the leader.
- **Nodes file.** One line, identical on every node, listing `<peering address>:<peering port>:<api port>` for each node, comma separated. Every node starts with the same `--api-key`.
- **Peering address.** `--peering-address` must be a private IP, because traffic between nodes is not encrypted.
- **Checking the cluster.** `GET /debug` returns `state` 1 on the leader and 4 on followers. Two nodes both reporting 1 means the cluster didn't form.
- **HTTP 503 from `/health`** means the node isn't ready, for example while it catches up after a restart. It doesn't mean the node is dead.
- **Recovery.** A node that was down normally rejoins and catches up by itself. When quorum is lost, stop and follow the [high-availability recovery guide](https://typesense.org/docs/guide/high-availability.html#recovering-a-cluster-that-has-lost-quorum): identify the node with the latest data before choosing a survivor, then rebuild membership. Starting an arbitrary survivor can discard acknowledged writes.
- **Clients** list every node, so the client itself retries and spreads load. A load balancer is optional.

## Backups

1. **Snapshot.** Call `POST /operations/snapshot?snapshot_path=/path/on/server`. The path is on the Typesense server's disk, not on the machine making the request. Without `snapshot_path` the call only compacts the internal log and produces no backup.
2. **Archive** that directory and copy it off the machine. Never archive the live data directory directly.
3. **Restore.** Stop Typesense, empty the data directory, extract the snapshot into it, and start Typesense again.

## Upgrades

- **Read every release note** between the current and target version, and try the upgrade on staging with a fixed set of test queries.
- **Snapshot first.** The v30 upgrade migrates synonyms, overrides and analytics rules from that snapshot.
- **Single node.** Swap the binary or image and restart with the same arguments. No reindex is needed.
- **Clusters.** Upgrade one follower at a time and wait for `/health` 200 on each. The leader goes last and stays on the old version until then.

## Monitoring and production settings

- **Endpoints.** Watch `GET /health`, `GET /metrics.json` for memory, CPU and disk, and `GET /stats.json` for request rates and latency.
- **Internet-facing.** Typesense can face the internet directly with `--api-port 443` and the `--ssl-certificate` and `--ssl-certificate-key` flags.
- **Keys.** Reserve the bootstrap admin key for provisioning or emergency recovery; give routine callers narrower keys. See `keys.md`.
- **Configuration** comes from command-line flags, a config file or `TYPESENSE_*` environment variables, in that order of precedence. `--cors-domains` takes origins without trailing slashes.
- **Frequent collection drops.** When collections are often dropped and recreated, lower `--db-compaction-interval` from its 7-day default so disk space is reclaimed sooner.
