# Hybrid Storage Architecture: DO SQLite + R2

## Overview

Gitflare uses a **cost-optimized** hybrid storage strategy:

- **DO SQLite**: Packfile indices + refs only (minimal, expensive)
- **R2**: Raw packfiles + blobs (bulk, cheap)
- **Cache API**: Parsed commits/trees (free, warm cache)

## Pricing Reality

| Storage   | Cost/GB/month | Latency   | Subrequests |
| --------- | ------------- | --------- | ----------- |
| DO SQLite | **$0.20**     | ~0ms      | 0           |
| R2        | **$0.015**    | 180-250ms | 1           |
| Cache API | **Free**      | 9-15ms    | 1           |

**DO SQLite is 13x more expensive than R2!**

## Cost Comparison

| Strategy                | 1000 Repos Cost/month | Notes         |
| ----------------------- | --------------------- | ------------- |
| Everything in DO SQLite | **$100+**             | Too expensive |
| Index-only in DO SQLite | **$8.50**             | Recommended   |

**92% cost savings** with the optimized strategy.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Request Flow                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐    HIT     ┌──────────────┐                       │
│  │  Cache API   │───────────▶│   Response   │  9-15ms, FREE         │
│  │(parsed data) │            └──────────────┘  1 subrequest         │
│  └──────┬───────┘                                                   │
│         │ MISS                                                      │
│         ▼                                                           │
│  ┌──────────────┐            ┌──────────────┐                       │
│  │  DO SQLite   │───────────▶│  Get offset  │  ~0ms, $0.20/GB       │
│  │ (index only) │            │  from index  │  0 subrequests        │
│  └──────┬───────┘            └──────┬───────┘                       │
│         │                           │                               │
│         │                           ▼                               │
│         │                    ┌──────────────┐                       │
│         │                    │  R2 Range    │  180-250ms, $0.015/GB │
│         │                    │  Request     │  1 subrequest         │
│         │                    └──────┬───────┘                       │
│         │                           │                               │
│         │                           ▼                               │
│         │                    ┌──────────────┐                       │
│         │                    │ Parse + Store│  Store in Cache API   │
│         │                    │ in Cache API │  for next time        │
│         │                    └──────────────┘                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## What to Store Where

### DO SQLite (Expensive - Minimize!)

| Data                        | Size             | Cost       | Why Here                  |
| --------------------------- | ---------------- | ---------- | ------------------------- |
| Packfile index (oid→offset) | ~28 bytes/object | $0.20/GB   | Required for O(1) lookups |
| Refs (HEAD, branches, tags) | ~1KB total       | Negligible | Tiny, always needed       |
| Pack registry               | ~100B/pack       | Negligible | Track packfiles           |

**Total per repo**: ~15-20MB for 500K objects = **$0.003-0.004/repo/month**

### R2 (Cheap - Bulk Storage)

| Data                  | Size       | Cost      | Why Here           |
| --------------------- | ---------- | --------- | ------------------ |
| Raw packfiles (.pack) | Variable   | $0.015/GB | Cheap bulk storage |
| Backup index (.idx)   | ~14MB/500K | Cheap     | Disaster recovery  |

### Cache API (Free - Parsed Objects)

| Data                | TTL      | Max Size | Why Here                       |
| ------------------- | -------- | -------- | ------------------------------ |
| Parsed commits      | 1 year   | 1KB      | Immutable, frequently accessed |
| Parsed trees        | 1 year   | 50KB     | Immutable, frequently accessed |
| Small blobs (<10KB) | 1 week   | 10KB     | Moderate frequency             |
| Ref resolution      | 1 minute | 100B     | Mutable, short-lived           |

## SQLite Schema (Minimal - Index Only)

```sql
-- Packfile index: The ONLY large data in SQLite
-- Size: ~28 bytes per object
CREATE TABLE git_object_index (
  oid TEXT PRIMARY KEY,           -- 40-char SHA
  pack_id TEXT NOT NULL,          -- which packfile
  pack_offset INTEGER NOT NULL,   -- byte offset in .pack
  pack_size INTEGER NOT NULL,     -- compressed size in pack
  type INTEGER NOT NULL,          -- 1=commit, 2=tree, 3=blob, 4=tag
  is_delta INTEGER DEFAULT 0,
  base_oid TEXT
);

CREATE INDEX idx_object_pack ON git_object_index(pack_id);

-- Pack registry: tiny
CREATE TABLE git_packs (
  pack_id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL,           -- R2 location
  object_count INTEGER,
  size_bytes INTEGER,
  created_at INTEGER
);

-- Refs: tiny
CREATE TABLE git_refs (
  name TEXT PRIMARY KEY,          -- 'refs/heads/main', 'HEAD'
  value TEXT NOT NULL,
  updated_at INTEGER
);
```

**No object data stored in SQLite! Only the index.**

## Size & Cost Estimates

### Per-Repo Storage Costs

| Repo Size    | Objects | DO SQLite | R2    | DO Cost/mo | R2 Cost/mo | Total    |
| ------------ | ------- | --------- | ----- | ---------- | ---------- | -------- |
| Small (1K)   | 1,000   | 30KB      | 8MB   | $0.000006  | $0.00012   | ~$0.0001 |
| Medium (50K) | 50,000  | 1.4MB     | 700MB | $0.00028   | $0.0105    | ~$0.011  |
| Large (500K) | 500,000 | 14MB      | 1.8GB | $0.0028    | $0.027     | ~$0.030  |

### Platform at Scale (1000 repos)

| Component                | Size   | Cost/month |
| ------------------------ | ------ | ---------- |
| DO SQLite (indices only) | ~5GB   | $1.00      |
| R2 (packfiles)           | ~500GB | $7.50      |
| Cache API                | N/A    | Free       |
| **Total**                |        | **$8.50**  |

vs $100+/month if storing everything in DO SQLite.

## Read Path

```typescript
async function readObject(oid: string): Promise<GitObject> {
  // 1. Check Cache API FIRST (FREE, 9-15ms, 1 subrequest)
  const cacheKey = `obj:${repoId}:${oid}`;
  const cached = await caches.default.match(
    new Request(`https://cache/${cacheKey}`),
  );
  if (cached) {
    return cached.json();
  }

  // 2. Lookup offset in DO SQLite (0ms, 0 subrequests)
  const index = await db.query(
    `
    SELECT pack_id, pack_offset, pack_size, type, is_delta, base_oid
    FROM git_object_index WHERE oid = ?
  `,
    [oid],
  );

  if (!index) throw new Error(`Object not found: ${oid}`);

  // 3. R2 range request (180-250ms, 1 subrequest)
  const packKey = `${repoId}/packs/${index.pack_id}.pack`;
  const raw = await env.R2.get(packKey, {
    range: { offset: index.pack_offset, length: index.pack_size },
  });

  // 4. Decompress and parse
  const data = await inflate(await raw.arrayBuffer());
  const object = parseObject(data, index.type);

  // 5. Resolve delta if needed (base likely in Cache API)
  if (index.is_delta) {
    const base = await readObject(index.base_oid);
    object.data = applyDelta(object.data, base.data);
  }

  // 6. Store in Cache API (FREE) for future reads
  if (shouldCache(object)) {
    await caches.default.put(
      new Request(`https://cache/${cacheKey}`),
      new Response(JSON.stringify(object), {
        headers: { "Cache-Control": `max-age=${getCacheTTL(object.type)}` },
      }),
    );
  }

  return object;
}
```

## Write Path (Push)

```typescript
async function receivePack(packStream: ReadableStream) {
  const packId = `pack-${Date.now()}`;

  // 1. Stream directly to R2 (1 subrequest, cheap storage)
  await env.R2.put(`${repoId}/packs/${packId}.pack`, packStream);

  // 2. Parse pack to build index (fetch from R2 for parsing)
  const packData = await env.R2.get(`${repoId}/packs/${packId}.pack`);
  const index = await parsePackIndex(packData.body);

  // 3. Store index in DO SQLite (small, fast lookups)
  await db.transaction(async () => {
    for (const obj of index.objects) {
      await db.exec(
        `
        INSERT INTO git_object_index 
        (oid, pack_id, pack_offset, pack_size, type, is_delta, base_oid)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
        [
          obj.oid,
          packId,
          obj.offset,
          obj.size,
          obj.type,
          obj.isDelta,
          obj.baseOid,
        ],
      );
    }

    await db.exec(
      `
      INSERT INTO git_packs (pack_id, r2_key, object_count, size_bytes, created_at)
      VALUES (?, ?, ?, ?, ?)
    `,
      [
        packId,
        `${repoId}/packs/${packId}.pack`,
        index.objects.length,
        packData.size,
        Date.now(),
      ],
    );
  });

  // 4. Warm Cache API with commits/trees (FREE)
  ctx.waitUntil(warmCache(index.objects));

  // Total: 2-3 R2 subrequests (PUT + GET for parsing)
}

async function warmCache(objects: PackObject[]) {
  for (const obj of objects) {
    if (obj.type === "commit" || obj.type === "tree") {
      // Parse and cache in Cache API
      const parsed = await readObject(obj.oid);
      // Already cached by readObject
    }
  }
}
```

## Caching Configuration

```typescript
const CACHE_CONFIG = {
  // What to cache in Cache API (FREE)
  cacheTypes: ["commit", "tree"], // Always cache these
  maxBlobSize: 10 * 1024, // Only cache blobs <10KB

  // TTLs (objects are immutable by SHA)
  ttl: {
    commit: 365 * 24 * 60 * 60, // 1 year
    tree: 365 * 24 * 60 * 60, // 1 year
    blob: 7 * 24 * 60 * 60, // 1 week
    ref: 60, // 1 minute (mutable)
  },
};

function shouldCache(object: GitObject): boolean {
  if (object.type === "commit" || object.type === "tree") {
    return true; // Always cache - small and frequently accessed
  }
  if (object.type === "blob" && object.data.length < CACHE_CONFIG.maxBlobSize) {
    return true; // Cache small blobs
  }
  return false; // Don't cache large blobs
}
```

## Latency Analysis

### Common Operations

| Operation                | Cache Hit | Cache Miss | Subrequests |
| ------------------------ | --------- | ---------- | ----------- |
| Browse repo (4 objects)  | 36-60ms   | 720-1000ms | 4-8         |
| View commit history (20) | 180-300ms | 3.6-5s     | 20-40       |
| View file                | 9-30ms    | 200-300ms  | 1-3         |
| Clone (full)             | N/A       | 200-500ms  | 1           |

### Expected Cache Hit Rates

| Object Type    | Hit Rate | Reasoning                    |
| -------------- | -------- | ---------------------------- |
| Recent commits | 80-95%   | Users browse recent history  |
| Root tree      | 90%+     | README, root always accessed |
| Deep paths     | 30-50%   | Less frequent                |
| Large blobs    | N/A      | Never cached                 |

**After warmup**: Most operations hit Cache API (free, fast).

## Subrequest Budget

| Operation       | Max Subrequests |
| --------------- | --------------- |
| Browse repo     | 4-8             |
| Log 100 commits | 100-200         |
| View file       | 1-5             |
| Clone (stream)  | 1-2             |
| Push            | 2-3             |

All well under the 1000 limit.

## Cost Optimization Summary

1. **DO SQLite**: Index only (~28 bytes/object) - no object data!
2. **R2**: All packfiles and raw object data
3. **Cache API**: Parsed commits/trees/small blobs (FREE)

| What           | Where     | Why                        |
| -------------- | --------- | -------------------------- |
| Object index   | DO SQLite | Required for lookups, tiny |
| Refs           | DO SQLite | Tiny, always needed        |
| Packfiles      | R2        | Cheap bulk storage         |
| Parsed objects | Cache API | Free, fast, immutable      |

## Comparison: Old vs New

| Metric          | Old (All SQLite) | New (Hybrid)    | Improvement     |
| --------------- | ---------------- | --------------- | --------------- |
| DO SQLite/repo  | ~500MB           | ~15MB           | **97% smaller** |
| Cost (1K repos) | ~$100/mo         | ~$8.50/mo       | **92% cheaper** |
| Browse latency  | ~0ms             | ~15ms cache hit | Acceptable      |
| Clone latency   | N/A              | ~200ms R2       | Same            |

## Memory Considerations

Workers/DO have 128MB memory limit:

| Component            | Allocation |
| -------------------- | ---------- |
| V8 overhead          | ~10MB      |
| SQLite (index only)  | ~5MB       |
| Request handling     | ~20MB      |
| Object decompression | ~30MB      |
| Delta resolution     | ~30MB      |
| Safety margin        | ~33MB      |

**Key**: SQLite only holds index (~15MB), not object data. Safe within limits.
