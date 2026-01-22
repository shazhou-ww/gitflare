# Repository Maintenance

## Overview

Git repositories require periodic maintenance to:

- Merge small packfiles into larger ones
- Remove unreachable objects (garbage collection)
- Optimize storage costs

This document covers maintenance operations with **cost-optimized** storage in mind.

## Cost-Aware Architecture Recap

| Storage   | Cost/GB/mo | Use For                         |
| --------- | ---------- | ------------------------------- |
| DO SQLite | $0.20      | Index only (~15MB/500K objects) |
| Cache API | Free       | Parsed commits/trees            |
| R2        | $0.015     | Packfiles                       |

**Key**: No object data in SQLite! Only index + refs.

## Constraint-Aware Maintenance

| Constraint  | Limit        | Maintenance Impact                   |
| ----------- | ------------ | ------------------------------------ |
| Subrequests | 1000/request | Batch R2 operations                  |
| DO CPU      | 30s-300s     | Use alarms for long tasks            |
| DO memory   | 128MB        | Stream large operations              |
| DO storage  | 10GB         | Index only, no cache eviction needed |

## Pack Management

### Pack Accumulation Problem

Each push creates a new packfile:

```
Push 1 → pack-001.pack (100 objects)
Push 2 → pack-002.pack (50 objects)
...
```

**Problems**:

- Many packs = more R2 reads for cache misses
- Object index grows with duplicate entries
- Clone may need multiple pack streams

### Merge Strategy

**Thresholds**:

| Pack Count | Action                    |
| ---------- | ------------------------- |
| 1-5        | No action                 |
| 6-10       | Schedule background merge |
| 11+        | Immediate merge, alert    |

### Merge Implementation

```typescript
async function mergeSmallPacks() {
  // 1. Find packs to merge (0 subrequests - SQLite)
  const packsToMerge = await db.query(`
    SELECT pack_id, size_bytes FROM git_packs
    WHERE status = 'active'
    ORDER BY size_bytes ASC
    LIMIT 5
  `)

  if (packsToMerge.length < 2) return

  // 2. Collect all OIDs (0 subrequests - SQLite)
  const allOids = await db.query(`
    SELECT oid FROM git_objects
    WHERE pack_id IN (${packsToMerge.map(() => '?').join(',')})
  `, packsToMerge.map(p => p.pack_id))

  // 3. Read objects - prefer SQLite cache (minimize R2)
  const objects = await batchReadObjectsForMerge(allOids)

  // 4. Generate new pack (streaming, memory-safe)
  const newPackId = `pack-${Date.now()}`
  const packStream = generatePackStream(objects)

  // 5. Upload to R2 (1 subrequest)
  await r2.put(`packs/${newPackId}.pack`, packStream)

  // 6. Build and upload idx (1 subrequest)
  const idx = await buildPackIndex(newPackId)
  await r2.put(`packs/${newPackId}.idx`, idx)

  // 7. ATOMIC SWITCH (0 subrequests - SQLite transaction)
  await db.transaction(async () => {
    // Insert new pack
    await db.exec(`INSERT INTO git_packs ...`, [newPackId, ...])

    // Update object index to new pack
    // (offsets recalculated from new pack)

    // Mark old packs as deprecated
    await db.exec(`
      UPDATE git_packs
      SET status = 'deprecated', deprecated_at = ?
      WHERE pack_id IN (...)
    `, [Date.now(), ...])
  })

  // 8. Schedule cleanup (5 min grace period)
  await ctx.storage.setAlarm(Date.now() + 5 * 60 * 1000)
}

// Total subrequests: 2 (R2 writes) + some R2 reads for uncached objects
```

### Subrequest Budget for Merge

| Step                      | Subrequests          |
| ------------------------- | -------------------- |
| Query packs (SQLite)      | 0                    |
| Query objects (SQLite)    | 0                    |
| Read from Cache API       | N (free, 1 sub each) |
| R2 reads for cache misses | M (batched)          |
| Upload new pack           | 1                    |
| Upload new idx            | 1                    |
| Update index (SQLite)     | 0                    |
| **Total**                 | **2 + N + M**        |

**Optimization**: Objects likely in Cache API (free), so M is small.

## No SQLite Cache - Use Cache API Instead!

### Why No Cache in SQLite?

| Storage   | Cost/GB/mo | For 500MB cache   |
| --------- | ---------- | ----------------- |
| DO SQLite | $0.20      | **$0.10/repo/mo** |
| Cache API | Free       | **$0**            |

**Cache API is free!** Don't store object data in SQLite.

### SQLite Contains Only:

| Data          | Size       | Cost (500K objects) |
| ------------- | ---------- | ------------------- |
| Object index  | ~14MB      | $0.0028/mo          |
| Refs          | ~1KB       | Negligible          |
| Pack registry | ~100B/pack | Negligible          |
| **Total**     | ~15MB      | **~$0.003/mo**      |

### Cache API Handles:

| Data                | TTL    | Cost |
| ------------------- | ------ | ---- |
| Parsed commits      | 1 year | Free |
| Parsed trees        | 1 year | Free |
| Small blobs (<10KB) | 1 week | Free |

**No eviction strategy needed** - Cache API handles its own eviction.

## Concurrent GC Safety

### Problem

During GC, reads must continue without errors:

- Old packs being merged still valid
- New pack becomes valid after atomic switch
- Old packs deleted after grace period

### Solution: Pack Status States

```sql
CREATE TABLE git_packs (
  ...
  status TEXT DEFAULT 'active',  -- 'active', 'deprecated'
  deprecated_at INTEGER
);
```

**Read flow during GC**:

```typescript
async function readObject(oid: string) {
  // Object index always points to correct pack
  // - Before switch: old pack (still in R2)
  // - After switch: new pack
  const index = await db.query(`SELECT * FROM git_objects WHERE oid = ?`, [
    oid,
  ]);

  // Pack status doesn't matter - R2 data still exists
  return fetchFromR2(index.pack_id, index.pack_offset);
}
```

### Grace Period

Deprecated packs kept 5 minutes before deletion:

```typescript
async alarm() {
  // Delete packs deprecated >5 min ago (2 subrequests per pack)
  const oldPacks = await db.query(`
    SELECT * FROM git_packs
    WHERE status = 'deprecated'
    AND deprecated_at < ?
  `, [Date.now() - 5 * 60 * 1000])

  for (const pack of oldPacks) {
    await r2.delete(pack.r2_pack_key)   // 1 subrequest
    await r2.delete(pack.r2_idx_key)    // 1 subrequest
    await db.exec(`DELETE FROM git_packs WHERE pack_id = ?`, [pack.pack_id])
  }
}
```

## Garbage Collection

### Unreachable Objects

Objects not reachable from any ref:

- Abandoned commits from force pushes
- Orphaned blobs from amended commits

### GC Algorithm

```typescript
async function garbageCollect() {
  // 1. Mark reachable (SQLite index + Cache API)
  const reachable = new Set<string>();

  const refs = await db.query(`SELECT value FROM git_refs`);
  for (const ref of refs) {
    await walkObject(ref.value, reachable);
  }

  // 2. Find unreachable
  const allObjects = await db.query(`SELECT oid FROM git_object_index`);
  const unreachable = allObjects.filter((o) => !reachable.has(o.oid));

  // 3. Mark for pruning (2 week delay)
  await db.exec(
    `
    UPDATE git_object_index 
    SET prune_at = ?
    WHERE oid IN (...)
    AND prune_at IS NULL
  `,
    [Date.now() + 14 * 24 * 60 * 60 * 1000, ...unreachable],
  );
}

async function walkObject(oid: string, reachable: Set<string>) {
  if (reachable.has(oid)) return;
  reachable.add(oid);

  // Get type from index (0 subrequests)
  const index = await db.query(
    `SELECT type FROM git_object_index WHERE oid = ?`,
    [oid],
  );

  if (index?.type === 1) {
    // commit
    // Try Cache API first (FREE, 1 subrequest)
    const cached = await caches.default.match(
      new Request(`https://cache/obj:${repoId}:${oid}`),
    );
    if (cached) {
      const commit = await cached.json();
      await walkObject(commit.tree, reachable);
      for (const parent of commit.parents) {
        await walkObject(parent, reachable);
      }
    }
  } else if (index?.type === 2) {
    // tree
    const cached = await caches.default.match(
      new Request(`https://cache/obj:${repoId}:${oid}`),
    );
    if (cached) {
      const tree = await cached.json();
      for (const entry of tree.entries) {
        await walkObject(entry.oid, reachable);
      }
    }
  }
}
```

**Subrequests**: N (Cache API reads, but FREE).

## Scheduling Maintenance

### Using DO Alarms

```typescript
class RepoDO extends DurableObject {
  async receivePack(...) {
    // ... handle push ...

    // Check if maintenance needed (0 subrequests)
    const packCount = await db.query(`SELECT COUNT(*) FROM git_packs WHERE status = 'active'`)

    if (packCount > 5) {
      // Schedule maintenance
      await ctx.storage.setAlarm(Date.now() + 60_000)
    }
  }

  async alarm() {
    // Run maintenance (within 30s CPU budget)
    await this.mergeSmallPacks()
    // No cache eviction needed - Cache API handles itself
    await this.garbageCollect()

    // Check if more needed
    const packCount = await db.query(`SELECT COUNT(*) FROM git_packs WHERE status = 'active'`)
    if (packCount > 5) {
      await ctx.storage.setAlarm(Date.now() + 60_000)
    }
  }
}
```

### Alarm Budget

| Task                 | Est. Time | CPU Safe?      |
| -------------------- | --------- | -------------- |
| Pack merge (5 packs) | 5-10s     | ✅             |
| GC mark phase        | 5-15s     | ✅             |
| **Total**            | 10-25s    | ✅ (30s limit) |

**Note**: No cache eviction needed - Cache API manages itself.

## Migration from DOFS

### Phase 1: Add Hybrid Storage

Deploy new schema alongside DOFS. New pushes go to R2 + SQLite.

### Phase 2: Migrate Existing Data

```typescript
async function migrateRepository() {
  // 1. Read packfiles from DOFS
  const packs = await dofs.readdir("objects/pack");

  for (const packFile of packs.filter((f) => f.endsWith(".pack"))) {
    // Stream to R2 (1 subrequest per pack)
    const data = await dofs.readFile(`objects/pack/${packFile}`);
    await r2.put(`packs/${packFile}`, data);

    // Build idx and upload (1 subrequest)
    const idx = await buildPackIndex(data);
    await r2.put(`packs/${packFile.replace(".pack", ".idx")}`, idx);

    // Populate object index (0 subrequests)
    await populateObjectIndex(packFile, idx);

    // Populate SQLite cache with commits/trees (0 subrequests)
    await populateCache(packFile);
  }

  // 2. Migrate refs (0 subrequests)
  for (const ref of await listRefs()) {
    const value = await dofs.readFile(ref);
    await db.exec(`INSERT INTO git_refs (name, value) VALUES (?, ?)`, [
      ref,
      value,
    ]);
  }
}
```

### Phase 3: Remove DOFS

1. Verify all repos migrated
2. Remove DOFS read fallback
3. Delete DOFS data

## Monitoring

### Key Metrics

| Metric               | Warning | Critical |
| -------------------- | ------- | -------- |
| Pack count           | > 5     | > 10     |
| Index size           | > 50MB  | > 100MB  |
| Unreachable objects  | > 5%    | > 15%    |
| Deprecated packs age | > 10min | > 30min  |

**Note**: No cache size monitoring - Cache API is free and self-managing.

### Health Check Endpoint

```typescript
async function healthCheck() {
  return {
    packs: {
      active: await db.query(
        `SELECT COUNT(*) FROM git_packs WHERE status = 'active'`,
      ),
      deprecated: await db.query(
        `SELECT COUNT(*) FROM git_packs WHERE status = 'deprecated'`,
      ),
    },
    index: {
      objects: await db.query(`SELECT COUNT(*) FROM git_object_index`),
      pendingPrune: await db.query(
        `SELECT COUNT(*) FROM git_object_index WHERE prune_at IS NOT NULL`,
      ),
    },
    // Cache API metrics not available - it's managed by Cloudflare
  };
}
```
