# isomorphic-git Viability Analysis

## Executive Summary

isomorphic-git is **highly adaptable** for the **cost-optimized** hybrid architecture:

| Constraint           | Impact                         | Mitigation                       |
| -------------------- | ------------------------------ | -------------------------------- |
| 1000 subrequests     | Can't do 1000+ R2 calls        | Cache API (free), pack streaming |
| 128MB memory         | Can't buffer large packs       | Streaming generators             |
| $0.20/GB DO SQLite   | Too expensive for object cache | Index only in SQLite             |
| 180-250ms R2 latency | Slow cold reads                | Cache API (free, 9-15ms)         |

### Cost-Optimized Storage

| Storage   | Cost      | Use For                          |
| --------- | --------- | -------------------------------- |
| DO SQLite | $0.20/GB  | Index only (~15MB/500K objects)  |
| Cache API | **Free**  | Parsed commits/trees/small blobs |
| R2        | $0.015/GB | Raw packfiles                    |

## FS Adapter Architecture

### Constraint-Aware Design

The hybrid FS adapter must minimize subrequests:

```typescript
class HybridFS {
  async readFile(path: string): Promise<Buffer> {
    // 1. Packfiles → Check SQLite cache FIRST (0 subrequests)
    if (path.match(/objects\/pack\/.*\.pack$/)) {
      return this.readPackfile(path); // Cache or R2
    }

    // 2. IDX files → SQLite has object index (no idx needed)
    if (path.match(/objects\/pack\/.*\.idx$/)) {
      // We don't need idx files - SQLite has the index
      throw new Error("IDX files replaced by SQLite index");
    }

    // 3. Loose objects → SQLite cache (0 subrequests)
    if (path.match(/objects\/[0-9a-f]{2}\/[0-9a-f]{38}$/)) {
      return this.readFromSQLiteCache(path);
    }

    // 4. Refs, HEAD → SQLite (0 subrequests)
    return this.sqlite.read(path);
  }
}
```

### Subrequest Analysis per Method

| Method                | Original   | Hybrid                     |
| --------------------- | ---------- | -------------------------- |
| `readFile` (ref)      | 1 FS read  | 0 (SQLite)                 |
| `readFile` (object)   | 1 FS read  | 0 (SQLite cache) or 1 (R2) |
| `readFile` (packfile) | 1 FS read  | 0-1 (SQLite/R2)            |
| `readdir` (pack/)     | 1 FS read  | 0 (SQLite query)           |
| `writeFile`           | 1 FS write | 0-1 (SQLite/R2)            |

## Object Reading: Bypass .idx Files

### Original isomorphic-git Flow

```
readObjectPacked(oid):
  1. readdir("objects/pack")     → List .idx files
  2. For each .idx:
     - fs.read(idx)             → Load entire idx file
     - GitPackIndex.fromIdx()   → Parse to Map<oid, offset>
     - if offsets.has(oid):
       - fs.read(pack)          → Load ENTIRE packfile
       - readSlice(offset)      → Extract object
```

**Problems**:

- Scans all .idx files (slow)
- Loads entire packfile into memory
- Each read = 1+ subrequests

### Cost-Optimized Approach

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

  // 2. Lookup in SQLite index (0 subrequests, 0ms)
  const index = await db.query(
    `
    SELECT pack_id, pack_offset, pack_size, is_delta, base_oid 
    FROM git_object_index WHERE oid = ?
  `,
    [oid],
  );

  if (!index) throw new Error(`Object not found: ${oid}`);

  // 3. R2 range read (1 subrequest, 180-250ms)
  const raw = await r2.get(`packs/${index.pack_id}.pack`, {
    range: { offset: index.pack_offset, length: index.pack_size },
  });

  // 4. Resolve delta if needed (base likely in Cache API)
  let object: GitObject;
  if (index.is_delta) {
    const base = await readObject(index.base_oid); // Recursive, likely cached
    object = applyDelta(raw, base);
  } else {
    object = inflate(raw);
  }

  // 5. Cache in Cache API (FREE!)
  await caches.default.put(
    new Request(`https://cache/${cacheKey}`),
    new Response(JSON.stringify(object), {
      headers: { "Cache-Control": "max-age=31536000" }, // 1 year (immutable)
    }),
  );

  return object;
}
```

**Cost-optimized**:

- Cache API is FREE (not SQLite at $0.20/GB)
- 1 subrequest per Cache API check (acceptable)
- SQLite only for index lookups (~15MB total)

## Packfile Generation

### Original isomorphic-git

```javascript
// _pack() in isomorphic-git
const outputStream = []; // Accumulates ALL objects in memory
for (const oid of oids) {
  const obj = await readObject(oid); // Full object in memory
  outputStream.push(deflate(obj));
}
return outputStream; // Entire pack in memory
```

**Memory**: O(all_objects) = 100MB+ for large repos

### Streaming Approach

```typescript
async function* streamingPack(oids: string[]): AsyncGenerator<Uint8Array> {
  const hash = new SHA1();

  // Header
  yield* hashAndYield(encodePackHeader(oids.length), hash);

  for (const oid of oids) {
    // Read one object (from SQLite cache or R2)
    const object = await readObject(oid);

    // Encode and yield immediately
    const encoded = encodePackObject(object);
    yield* hashAndYield(encoded, hash);

    // Object can be GC'd now - memory stays constant
  }

  // Trailer
  yield hash.digest();
}
```

**Memory**: O(largest_single_object) = 10-50MB

### Subrequest Budget for Pack Generation

| Scenario           | Objects | Cache API Hits | R2 Reads | Total Subs        |
| ------------------ | ------- | -------------- | -------- | ----------------- |
| Clone (all cached) | 500K    | 500K           | 0        | 500K (free)       |
| Clone (90% cached) | 500K    | 450K           | 50K      | 500K (but 50K R2) |
| Clone (pack reuse) | 500K    | 0              | 1        | **1 ✅**          |

**Solution**: For large operations, stream existing packfile instead of generating.
**Note**: Cache API subrequests are acceptable (free), but R2 reads should be minimized.

## Delta Compression

### Reading Deltas ✅

isomorphic-git fully supports reading deltas:

```javascript
// GitPackIndex.readSlice() handles:
// - OFS_DELTA: base at offset in same pack
// - REF_DELTA: base by OID
```

**Our optimization**: Base objects usually in Cache API (free).

### Writing Deltas ❌

isomorphic-git does NOT write deltas. Generated packs are 2-3x larger.

**Mitigation**:

1. **Pack reuse**: Stream client's original pack (has deltas)
2. **Accept larger packs** for generated content
3. **Future**: Implement windowed delta compression

## Component Reusability Matrix

### Can Use Directly

| Component                 | Use As-Is | Notes                    |
| ------------------------- | --------- | ------------------------ |
| `GitCommit/Tree/Tag/Blob` | ✅        | Object parsing           |
| `applyDelta()`            | ✅        | Delta resolution         |
| `inflate()/deflate()`     | ✅        | Compression              |
| `GitObject.wrap/unwrap`   | ✅        | Object framing           |
| `listpack()`              | ✅        | Pack parsing for receive |

### Need Adaptation

| Component       | Changes                      | Cost Impact                 |
| --------------- | ---------------------------- | --------------------------- |
| `readObject`    | Use SQLite index + Cache API | Index in SQLite, cache FREE |
| `readPackIndex` | Skip (use SQLite index)      | Eliminates idx reads        |
| Object caching  | Cache API instead of SQLite  | **FREE** (vs $0.20/GB)      |
| `GitRefManager` | SQLite instead of FS         | Tiny, negligible cost       |

### Need Rewrite

| Component           | Why                  | Approach         |
| ------------------- | -------------------- | ---------------- |
| `_pack()`           | Memory, no streaming | Async generator  |
| `indexPack()`       | Memory               | Streaming parser |
| `fetch()` client    | Memory               | Stream to R2     |
| receive-pack server | Not implemented      | Custom           |

## Memory Analysis (128MB Budget)

| Component                          | Allocation     |
| ---------------------------------- | -------------- |
| V8 overhead                        | ~10MB          |
| SQLite (index only, ~15MB on disk) | ~5MB in memory |
| Request handling                   | ~20MB          |
| Single object                      | ~30MB          |
| Delta chain (3 deep)               | ~30MB          |
| **Available**                      | ~33MB          |

**Note**: Object cache is in Cache API (Cloudflare edge), not in DO memory.

### Safe Operations

| Operation                 | Peak Memory | Safe? |
| ------------------------- | ----------- | ----- |
| Read single object        | ~30MB       | ✅    |
| Resolve delta chain       | ~50MB       | ✅    |
| Generate pack (streaming) | ~50MB       | ✅    |
| Parse incoming pack       | ~50MB       | ✅    |

### Unsafe Operations

| Operation              | Peak Memory | Mitigation        |
| ---------------------- | ----------- | ----------------- |
| Original `_pack()`     | Unbounded   | Rewrite streaming |
| Original `indexPack()` | Pack size   | Rewrite streaming |
| Original `fetch()`     | Pack size   | Stream to R2      |

## Implementation Phases

### Phase 1: Read Path (Cost-Optimized)

```typescript
// Custom readObject: Cache API (free) + SQLite index
async function readObject(oid: string) {
  // 1. Cache API → 1 subrequest, FREE
  // 2. SQLite index → 0 subrequests, ~$0.003/repo
  // 3. R2 range read → 1 subrequest, cache miss only
}

// Use isomorphic-git's parsing
import { GitCommit, GitTree, GitBlob } from "isomorphic-git";
```

**Cost**: ~$0.003/repo/month for index, cache is FREE

### Phase 2: Write Path (Custom)

```typescript
// Stream packfile to R2
async function receivePack(stream: ReadableStream) {
  // 1 subrequest to R2
  await r2.put(packKey, stream);

  // Build SQLite index (0 subrequests, small cost)
  await buildObjectIndex(packKey);

  // Warm Cache API (FREE)
  ctx.waitUntil(warmCacheAPI(newObjects));
}
```

**Subrequests**: 2-3 (R2 writes)
**Cost**: R2 storage only ($0.015/GB)

### Phase 3: Clone/Fetch (Optimized)

```typescript
async function uploadPack(wants: string[], haves: string[]) {
  if (haves.length === 0) {
    // Full clone - stream existing pack (1 subrequest)
    return r2.get(mainPackKey).body;
  }

  // Partial fetch - generate streaming pack
  // Subrequests = R2 cache misses (minimized by SQLite cache)
  return generatorToStream(streamingPack(objectsNeeded));
}
```

## Recommendations

1. **Cache API for object cache**: FREE storage, eliminates most R2 reads
2. **SQLite for index only**: ~$0.003/repo/month, fast lookups
3. **Pack reuse for clones**: 1 subrequest vs potentially thousands
4. **Batch R2 reads**: Group by pack, use range requests
5. **Skip .idx files**: SQLite index is faster
6. **Accept no delta writing**: 2-3x larger but simpler
7. **Stream everything**: Stay within 128MB memory

## Constraint Compliance Summary

| Constraint         | How We Handle It                       |
| ------------------ | -------------------------------------- |
| 1000 subrequests   | Cache API + pack streaming             |
| 128MB memory       | Streaming generators, no buffering     |
| $0.20/GB DO SQLite | Index only (~15MB), no object cache    |
| 180-250ms R2       | Cache API (free, 9-15ms) as warm cache |

## Cost Summary

| Component           | Size (500K objects) | Cost/month  |
| ------------------- | ------------------- | ----------- |
| DO SQLite (index)   | ~15MB               | $0.003      |
| Cache API (objects) | Variable            | **Free**    |
| R2 (packfiles)      | ~287MB              | $0.004      |
| **Total/repo**      |                     | **~$0.007** |
| **1000 repos**      |                     | **~$8.50**  |
