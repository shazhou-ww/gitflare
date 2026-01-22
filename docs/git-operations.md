# Git Operations in Hybrid Architecture

## Overview

This document details how core git operations work with the **cost-optimized** hybrid architecture:

- **DO SQLite**: Index only (cheap lookups, ~$0.003/repo/month)
- **Cache API**: Parsed commits/trees (free, warm cache)
- **R2**: Raw packfiles (cheap bulk storage)

## Platform Constraints Recap

| Constraint  | Limit        | Critical For            |
| ----------- | ------------ | ----------------------- |
| Subrequests | 1000/request | Clone, fetch operations |
| Memory      | 128MB        | Packfile generation     |
| CPU (DO)    | 30s-300s     | Index building, GC      |

### Latency & Cost Reference

| Operation | Latency   | Subrequests | Cost      |
| --------- | --------- | ----------- | --------- |
| DO SQLite | ~0ms      | 0           | $0.20/GB  |
| Cache API | 9-15ms    | 1           | **Free**  |
| R2 read   | 180-250ms | 1           | $0.015/GB |

## Operation Flows

### 1. Clone (Full)

**Strategy**: Stream existing packfile from R2 (1 subrequest) instead of individual object reads (impossible at scale).

```
┌─────────┐    ┌─────────────────┐    ┌─────────────┐
│ Client  │───▶│ upload-pack     │───▶│ R2 Stream   │
│ Request │    │ (check refs)    │    │ (1 subreq)  │
└─────────┘    └────────┬────────┘    └─────────────┘
                        │
               SQLite: refs, pack info
               (0 subrequests)
```

**Subrequest Analysis**:

| Step                   | Subrequests |
| ---------------------- | ----------- |
| Read refs (SQLite)     | 0           |
| Get pack info (SQLite) | 0           |
| Stream packfile (R2)   | 1           |
| **Total**              | **1**       |

**Why this works for 500K objects**:

- Individual reads: 500K subrequests ❌
- Stream pack: 1 subrequest ✅

### 2. Fetch (Incremental)

Client has some commits, wants only new ones.

```
┌─────────┐    ┌─────────────────┐    ┌─────────────┐
│ Client  │───▶│ Negotiation     │───▶│ SQLite walk │
│ want/have    │ (find common)   │    │ (0 subreqs) │
└─────────┘    └────────┬────────┘    └─────────────┘
                        │
                        ▼
               ┌─────────────────┐
               │ Generate pack   │
               │ from cache/R2   │
               └─────────────────┘
```

**Subrequest Analysis** (fetch 100 new commits):

| Step                               | Subrequests     |
| ---------------------------------- | --------------- |
| Walk commit graph (SQLite cache)   | 0               |
| Collect object list (SQLite index) | 0               |
| Read objects from cache            | 0               |
| R2 reads for cache misses          | 10-50 (batched) |
| **Total**                          | **10-50**       |

**Optimization**: Batch R2 reads by pack, use range requests.

### 3. Push (Receive Pack)

Client sends new objects to server.

```
┌─────────┐    ┌─────────────────┐    ┌─────────────┐
│ Client  │───▶│ Stream to R2    │───▶│ R2 Storage  │
│ Packfile│    │ (1 subrequest)  │    │             │
└─────────┘    └────────┬────────┘    └─────────────┘
                        │
                        ▼ Parse & Index (0 subreqs)
               ┌─────────────────┐
               │ SQLite Updates  │
               │ - Object index  │
               │ - Hot cache     │
               │ - Refs          │
               └─────────────────┘
```

**Subrequest Analysis** (push 5MB, 1000 objects):

| Step                        | Subrequests |
| --------------------------- | ----------- |
| Stream pack to R2           | 1           |
| Parse pack (in-memory)      | 0           |
| Build object index (SQLite) | 0           |
| Populate hot cache (SQLite) | 0           |
| Upload idx to R2            | 1           |
| Update refs (SQLite)        | 0           |
| **Total**                   | **2**       |

### 4. git.log (Commit History)

**Best case**: All commits in Cache API (free).

```
┌─────────┐    ┌─────────────────┐    ┌─────────────┐
│ Request │───▶│ Cache API       │───▶│ Return      │
│ log(20) │    │ (9-15ms, FREE)  │    │ fast        │
└─────────┘    └─────────────────┘    └─────────────┘
```

**Subrequest Analysis**:

| Scenario           | Subrequests | Latency    |
| ------------------ | ----------- | ---------- |
| All in Cache API   | 20          | ~180-300ms |
| 50% cache miss     | 30          | ~2-3s      |
| Cold (none cached) | 40          | ~4-5s      |

**Why Cache API**: Commits are cached after first access. Free storage, acceptable latency.

### 5. git.readBlob (View File)

Path: commit → tree → subtree(s) → blob

**Subrequest Analysis** (read src/index.ts):

| Object        | Cached?             | Subrequests |
| ------------- | ------------------- | ----------- |
| Commit        | Yes (always cached) | 0           |
| Root tree     | Yes (always cached) | 0           |
| src/ tree     | Yes (likely cached) | 0           |
| index.ts blob | Maybe               | 0-1         |
| **Total**     |                     | **0-1**     |

**Latency**:

- Cached: ~1ms (all SQLite)
- Uncached blob: ~200ms (1 R2 read)

### 6. git.readTree (Browse Directory)

```
┌─────────┐    ┌─────────────────┐
│ Request │───▶│ SQLite cache    │
│ /src    │    │ (commits/trees) │
└─────────┘    └─────────────────┘
                        │
               All trees cached
                        │
                        ▼
               ┌─────────────────┐
               │ Return tree     │
               │ entries         │
               └─────────────────┘
```

**Subrequest Analysis**: Typically **0** (trees always cached).

### 7. Pull Requests

PRs are application-level. Git operations involved:

**Create PR**:

| Step                  | Subrequests |
| --------------------- | ----------- |
| Push branch           | 2           |
| Create PR in D1       | 0 (not DO)  |
| Compute diff (cached) | 0           |
| **Total**             | **2**       |

**Merge PR**:

| Step                           | Subrequests |
| ------------------------------ | ----------- |
| Check merge conflicts (SQLite) | 0           |
| Create merge commit            | 0-2         |
| Update ref (SQLite)            | 0           |
| Close PR (D1)                  | 0           |
| **Total**                      | **0-2**     |

## Subrequest Budget Summary

| Operation           | Typical | Worst Case | Limit   |
| ------------------- | ------- | ---------- | ------- |
| Clone (full)        | 1       | 3          | 1000 ✅ |
| Fetch (100 commits) | 10-50   | 200        | 1000 ✅ |
| Push (5MB)          | 2       | 4          | 1000 ✅ |
| Log (20 commits)    | 0       | 20         | 1000 ✅ |
| Read file           | 0-1     | 4          | 1000 ✅ |
| Browse tree         | 0       | 10         | 1000 ✅ |

## Streaming Packfile Generation

For large repos, we can't buffer entire packfile in memory.

### Memory-Efficient Approach

```typescript
async function* streamingPack(oids: string[]): AsyncGenerator<Uint8Array> {
  const hash = new SHA1();

  // 1. Header (12 bytes)
  const header = encodePackHeader(oids.length);
  hash.update(header);
  yield header;

  // 2. Objects one at a time
  for (const oid of oids) {
    // Check Cache API first (FREE, 1 subrequest)
    const cacheKey = `obj:${repoId}:${oid}`;
    let object = await caches.default.match(
      new Request(`https://cache/${cacheKey}`),
    );

    if (!object) {
      // Cache miss - lookup index (0 subrequests) then R2 read (1 subrequest)
      const index = await db.query(
        `SELECT * FROM git_object_index WHERE oid = ?`,
        [oid],
      );
      object = await fetchFromR2(
        index.pack_id,
        index.pack_offset,
        index.pack_size,
      );

      // Cache for next time (FREE)
      ctx.waitUntil(
        caches.default.put(
          new Request(`https://cache/${cacheKey}`),
          new Response(object),
        ),
      );
    }

    // Encode and yield
    const encoded = encodeObject(object.type, object.data);
    hash.update(encoded);
    yield encoded;

    // Object can be GC'd now
  }

  // 3. Checksum
  yield hash.digest();
}
```

**Memory**: O(largest_single_object) ≈ 10-50MB

### Pack Reuse (Optimal for Clone)

If most objects are in one packfile, stream it directly:

```typescript
async function uploadPack(wants: string[], haves: string[]) {
  // Check if full clone (no haves)
  if (haves.length === 0) {
    // Find pack containing all/most objects
    const mainPack = await db.query(`
      SELECT pack_id, COUNT(*) as coverage
      FROM git_objects
      GROUP BY pack_id
      ORDER BY coverage DESC
      LIMIT 1
    `);

    if (mainPack.coverage > totalObjects * 0.9) {
      // Stream existing pack directly (1 subrequest!)
      return r2.get(mainPack.r2_pack_key).body;
    }
  }

  // Partial fetch - generate new pack
  const objectsNeeded = await collectObjects(wants, haves);
  return generatorToStream(streamingPack(objectsNeeded));
}
```

## Batching R2 Reads

When Cache API misses occur, batch R2 reads to minimize subrequests:

```typescript
async function batchReadObjects(
  oids: string[],
): Promise<Map<string, GitObject>> {
  const results = new Map();
  const toFetch: Array<{
    oid: string;
    packId: string;
    offset: number;
    size: number;
  }> = [];

  // 1. Check Cache API first (FREE, 1 subrequest per check)
  for (const oid of oids) {
    const cacheKey = `obj:${repoId}:${oid}`;
    const cached = await caches.default.match(
      new Request(`https://cache/${cacheKey}`),
    );
    if (cached) {
      results.set(oid, await cached.json());
    } else {
      // Get index from SQLite (0 subrequests)
      const index = await db.query(
        `SELECT * FROM git_object_index WHERE oid = ?`,
        [oid],
      );
      toFetch.push({ oid, ...index });
    }
  }

  if (toFetch.length === 0) return results;

  // 2. Group by pack
  const byPack = groupBy(toFetch, "packId");

  // 3. Batch read each pack (1 subrequest per pack)
  for (const [packId, objects] of byPack) {
    // Sort by offset for sequential access
    objects.sort((a, b) => a.offset - b.offset);

    // Calculate range covering all objects
    const start = objects[0].offset;
    const end =
      objects[objects.length - 1].offset + objects[objects.length - 1].size;

    // Single range read (1 subrequest)
    const data = await r2.get(packId, {
      range: { offset: start, length: end - start },
    });

    // Extract individual objects from response
    for (const obj of objects) {
      const slice = data.slice(
        obj.offset - start,
        obj.offset - start + obj.size,
      );
      results.set(obj.oid, parseObject(slice));

      // Populate cache for future reads
      await cacheObject(obj.oid, slice);
    }
  }

  return results;
}
```

**Example**: Reading 100 objects from 2 packs = 2 subrequests (not 100).

## Delta Resolution

When reading delta-compressed objects:

```typescript
async function resolveObject(oid: string): Promise<GitObject> {
  // 1. Check Cache API (FREE)
  const cacheKey = `obj:${repoId}:${oid}`;
  const cached = await caches.default.match(
    new Request(`https://cache/${cacheKey}`),
  );
  if (cached) return cached.json();

  // 2. Get index from SQLite (0 subrequests)
  const index = await db.query(`SELECT * FROM git_object_index WHERE oid = ?`, [
    oid,
  ]);

  // 3. Fetch from R2 (1 subrequest)
  const raw = await fetchFromR2(
    index.pack_id,
    index.pack_offset,
    index.pack_size,
  );

  let object: GitObject;
  if (!index.is_delta) {
    object = parseObject(raw);
  } else {
    // Delta - resolve base (likely in Cache API)
    const base = await resolveObject(index.base_oid); // Recursive
    object = applyDelta(raw, base);
  }

  // 4. Cache resolved object in Cache API (FREE)
  await caches.default.put(
    new Request(`https://cache/${cacheKey}`),
    new Response(JSON.stringify(object)),
  );

  return object;
}
```

**Typical delta chain**: 1-3 levels, bases usually cached.

## Error Handling

### Subrequest Limit Exceeded

```typescript
async function safeFetch(objectCount: number) {
  if (objectCount > 500) {
    // Risk of hitting limit - use pack streaming
    return streamEntirePack();
  }

  // Safe to do individual reads
  return batchReadObjects(oids);
}
```

### Push Conflicts

```typescript
async function receivePack(packfile: ReadableStream, refs: RefUpdate[]) {
  // 1. Validate refs BEFORE accepting packfile (0 subrequests)
  for (const ref of refs) {
    const current = await db.query(
      `SELECT value FROM git_refs WHERE name = ?`,
      [ref.name],
    );
    if (current?.value !== ref.oldOid) {
      throw new Error(`ref ${ref.name} conflict`);
    }
  }

  // 2. Stream packfile to R2 (1 subrequest)
  const packId = await streamToR2(packfile);

  // 3. Atomic ref update (0 subrequests)
  await db.transaction(async () => {
    for (const ref of refs) {
      await db.exec(`UPDATE git_refs SET value = ? WHERE name = ?`, [
        ref.newOid,
        ref.name,
      ]);
    }
  });
}
```

## Latency Optimization Summary

| Optimization                 | Impact                            |
| ---------------------------- | --------------------------------- |
| Cache API for parsed objects | FREE storage, eliminates R2 reads |
| SQLite for index only        | Fast lookups, minimal cost        |
| Batch R2 reads               | N objects → 1-2 subrequests       |
| Stream pack for clone        | 500K objects → 1 subrequest       |
| Cache on push                | New objects immediately fast      |

## Cost vs Latency Tradeoff

| Approach                    | Cost               | Latency | Subrequests |
| --------------------------- | ------------------ | ------- | ----------- |
| All in DO SQLite            | **$100/1K repos**  | ~0ms    | 0           |
| Index in SQLite + Cache API | **$8.50/1K repos** | ~15ms   | 1/object    |
| All in R2                   | **$7.50/1K repos** | ~200ms  | 1/object    |

**Chosen**: Index in SQLite + Cache API (best balance)

## Comparison: Cost-Optimized Architecture

| Operation               | Cache Hit             | Cache Miss     |
| ----------------------- | --------------------- | -------------- |
| Browse repo (4 objects) | ~60ms, 4 subs, FREE   | ~800ms, 8 subs |
| Log 20 commits          | ~300ms, 20 subs, FREE | ~4s, 40 subs   |
| View file               | ~15ms, 1 sub, FREE    | ~250ms, 2 subs |
| Clone                   | N/A                   | ~200ms, 1 sub  |

After warmup, most operations hit Cache API → fast and free.
