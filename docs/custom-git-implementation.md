# Custom Git Implementation Scope

Complete list of everything needed for a GitHub-compatible git hosting platform.

## Legend

- **P0**: Must have for MVP (clone, push, basic web UI)
- **P1**: Required for usable product (PRs, diff, blame)
- **P2**: GitHub parity (advanced features)
- **P3**: Nice to have (optimization, edge cases)
- [x] Already implemented in Gitflare
- [ ] Not implemented

---

## 1. Object Model

### 1.1 Object Types

| Item                | Priority | Status | Notes              |
| ------------------- | -------- | ------ | ------------------ |
| Blob (file content) | P0       | [x]    | via isomorphic-git |
| Tree (directory)    | P0       | [x]    | via isomorphic-git |
| Commit              | P0       | [x]    | via isomorphic-git |
| Tag (annotated)     | P0       | [x]    | via isomorphic-git |

### 1.2 Object Operations

| Item                   | Priority | Status | Notes                       |
| ---------------------- | -------- | ------ | --------------------------- |
| SHA-1 hashing          | P0       | [ ]    | Object ID generation        |
| SHA-256 hashing        | P3       | [ ]    | Future git version          |
| Object serialization   | P0       | [ ]    | `type size\0content` format |
| Object deserialization | P0       | [ ]    | Parse git object format     |
| Zlib compression       | P0       | [ ]    | For loose objects           |
| Zlib decompression     | P0       | [ ]    | For reading objects         |
| Object validation      | P0       | [ ]    | Verify format, hash         |

---

## 2. Pack Files

### 2.1 Pack Format Reading

| Item                         | Priority | Status | Notes                |
| ---------------------------- | -------- | ------ | -------------------- |
| Pack header parsing          | P0       | [ ]    | PACK, version, count |
| OBJ_COMMIT (type 1)          | P0       | [ ]    | Commit objects       |
| OBJ_TREE (type 2)            | P0       | [ ]    | Tree objects         |
| OBJ_BLOB (type 3)            | P0       | [ ]    | Blob objects         |
| OBJ_TAG (type 4)             | P0       | [ ]    | Annotated tags       |
| OBJ_OFS_DELTA (type 6)       | P0       | [ ]    | Offset delta         |
| OBJ_REF_DELTA (type 7)       | P0       | [ ]    | Reference delta      |
| Variable-length int decoding | P0       | [ ]    | Size encoding        |
| Pack checksum verification   | P1       | [ ]    | SHA-1 trailer        |

### 2.2 Delta Resolution

| Item                        | Priority | Status | Notes                   |
| --------------------------- | -------- | ------ | ----------------------- |
| Delta instruction parsing   | P0       | [ ]    | Copy + insert ops       |
| Copy instruction            | P0       | [ ]    | Copy from base          |
| Insert instruction          | P0       | [ ]    | Insert literal data     |
| Delta chain resolution      | P0       | [ ]    | Recursive base lookup   |
| Delta chain depth limit     | P1       | [ ]    | Prevent DoS             |
| Cross-pack delta resolution | P1       | [ ]    | REF_DELTA to other pack |

### 2.3 Pack Index (.idx)

| Item              | Priority | Status | Notes                 |
| ----------------- | -------- | ------ | --------------------- |
| IDX v2 parsing    | P3       | [ ]    | We use SQLite instead |
| IDX v2 generation | P3       | [ ]    | For R2 backup only    |
| Fanout table      | P3       | [ ]    | Part of IDX format    |

### 2.4 Pack Generation (for clone/fetch)

| Item                        | Priority | Status | Notes                  |
| --------------------------- | -------- | ------ | ---------------------- |
| Pack header writing         | P0       | [ ]    | PACK + version + count |
| Non-delta object writing    | P0       | [ ]    | Simple case first      |
| OFS_DELTA writing           | P2       | [ ]    | Space optimization     |
| REF_DELTA writing           | P2       | [ ]    | For thin packs         |
| Delta generation algorithm  | P2       | [ ]    | Find similar objects   |
| Object ordering (for delta) | P2       | [ ]    | Group similar objects  |
| Thin pack generation        | P2       | [ ]    | For fetch efficiency   |
| Pack checksum writing       | P0       | [ ]    | SHA-1 trailer          |
| Streaming pack generation   | P0       | [ ]    | 128MB memory limit     |

### 2.5 Multi-Pack (Optional)

| Item             | Priority | Status | Notes                      |
| ---------------- | -------- | ------ | -------------------------- |
| Multi-pack index | P3       | [ ]    | Single index for all packs |
| Pack selection   | P3       | [ ]    | Which pack has object      |

---

## 3. References

### 3.1 Ref Types

| Item                     | Priority | Status | Notes                   |
| ------------------------ | -------- | ------ | ----------------------- |
| HEAD                     | P0       | [x]    | Symbolic or direct      |
| Branches (refs/heads/\*) | P0       | [x]    | Branch refs             |
| Tags (refs/tags/\*)      | P0       | [x]    | Tag refs                |
| Symbolic refs            | P0       | [x]    | HEAD -> refs/heads/main |

### 3.2 Ref Operations

| Item                | Priority | Status | Notes                  |
| ------------------- | -------- | ------ | ---------------------- |
| Ref resolution      | P0       | [x]    | Follow symbolic refs   |
| Ref listing         | P0       | [x]    | List all refs          |
| Ref creation        | P0       | [x]    | Create branch/tag      |
| Ref update          | P0       | [x]    | Fast-forward           |
| Ref deletion        | P0       | [x]    | Delete branch/tag      |
| Atomic ref updates  | P0       | [x]    | Multiple refs at once  |
| Ref name validation | P0       | [ ]    | Disallow invalid names |
| Reflog              | P2       | [ ]    | Ref history            |

### 3.3 Ref Constraints

| Item                | Priority | Status | Notes                    |
| ------------------- | -------- | ------ | ------------------------ |
| Fast-forward check  | P0       | [x]    | Reject non-ff by default |
| Force push handling | P1       | [ ]    | Allow with flag          |
| Protected branches  | P2       | [ ]    | Reject certain updates   |
| Default branch      | P1       | [ ]    | Configurable HEAD        |

---

## 4. Git Protocol

### 4.1 Packet Line Format

| Item                | Priority | Status | Notes                   |
| ------------------- | -------- | ------ | ----------------------- |
| Pkt-line encoding   | P0       | [x]    | 4-hex length prefix     |
| Pkt-line decoding   | P0       | [x]    | Parse length + data     |
| Flush packet (0000) | P0       | [x]    | End of section          |
| Delim packet (0001) | P0       | [x]    | Protocol v2             |
| Sideband demux      | P1       | [x]    | Progress/error channels |
| Sideband mux        | P1       | [x]    | Send progress/errors    |

### 4.2 Protocol Discovery

| Item                                    | Priority | Status | Notes                 |
| --------------------------------------- | -------- | ------ | --------------------- |
| GET /info/refs?service=git-upload-pack  | P0       | [x]    | Clone/fetch discovery |
| GET /info/refs?service=git-receive-pack | P0       | [x]    | Push discovery        |
| Capability advertisement                | P0       | [x]    | List capabilities     |
| Protocol v1 support                     | P0       | [x]    | Legacy clients        |
| Protocol v2 support                     | P0       | [x]    | Modern clients        |

### 4.3 Upload-Pack (Clone/Fetch)

| Item                    | Priority | Status | Notes                    |
| ----------------------- | -------- | ------ | ------------------------ |
| Ref advertisement       | P0       | [x]    | List refs + capabilities |
| ls-refs command (v2)    | P0       | [x]    | List refs                |
| Want parsing            | P0       | [x]    | What client wants        |
| Have parsing            | P0       | [x]    | What client has          |
| Common ancestor finding | P0       | [x]    | Negotiation              |
| Pack generation         | P0       | [x]    | Send objects             |
| Shallow clone (depth)   | P2       | [ ]    | Partial history          |
| Shallow clone (since)   | P2       | [ ]    | History after date       |
| Shallow clone (exclude) | P2       | [ ]    | Exclude refs             |
| Filter (partial clone)  | P2       | [ ]    | blob:none, tree:depth    |
| Include-tag             | P1       | [ ]    | Send annotated tags      |
| Multi-ack               | P1       | [ ]    | Better negotiation       |
| Thin pack               | P2       | [ ]    | Omit bases client has    |

### 4.4 Receive-Pack (Push)

| Item                   | Priority | Status | Notes                    |
| ---------------------- | -------- | ------ | ------------------------ |
| Ref advertisement      | P0       | [x]    | List refs + capabilities |
| Command parsing        | P0       | [x]    | old new refname          |
| Pack receiving         | P0       | [x]    | Stream from client       |
| Pack validation        | P0       | [x]    | Verify checksum          |
| Ref update application | P0       | [x]    | Update refs              |
| Atomic push            | P0       | [x]    | All or nothing           |
| Report status          | P0       | [x]    | Success/failure per ref  |
| Delete refs            | P0       | [x]    | old 0000 refname         |
| Push options           | P2       | [ ]    | Custom metadata          |
| Pre-receive hook       | P2       | [ ]    | Validation               |
| Post-receive hook      | P2       | [ ]    | Trigger actions          |
| Quarantine objects     | P2       | [ ]    | Validate before merge    |

---

## 5. Tree Operations

### 5.1 Tree Parsing

| Item                    | Priority | Status | Notes                   |
| ----------------------- | -------- | ------ | ----------------------- |
| Tree entry parsing      | P0       | [x]    | mode name\0sha          |
| Mode parsing            | P0       | [x]    | File type + permissions |
| Tree sorting validation | P1       | [ ]    | Git-specific sort order |

### 5.2 Tree Traversal

| Item                 | Priority | Status | Notes              |
| -------------------- | -------- | ------ | ------------------ |
| Single-level listing | P0       | [x]    | Directory contents |
| Recursive listing    | P1       | [ ]    | Full tree          |
| Path lookup          | P0       | [x]    | Get entry at path  |
| Tree comparison      | P1       | [ ]    | Find differences   |

### 5.3 Tree Building

| Item                 | Priority | Status | Notes           |
| -------------------- | -------- | ------ | --------------- |
| Tree entry creation  | P1       | [ ]    | For commits     |
| Tree serialization   | P1       | [ ]    | To git format   |
| Nested tree building | P1       | [ ]    | From flat paths |

---

## 6. Commit Operations

### 6.1 Commit Parsing

| Item                  | Priority | Status | Notes                  |
| --------------------- | -------- | ------ | ---------------------- |
| Tree reference        | P0       | [x]    | Root tree SHA          |
| Parent references     | P0       | [x]    | Parent commits         |
| Author parsing        | P0       | [x]    | Name, email, timestamp |
| Committer parsing     | P0       | [x]    | Name, email, timestamp |
| Message extraction    | P0       | [x]    | Subject + body         |
| GPG signature parsing | P2       | [ ]    | Extract signature      |

### 6.2 Commit Traversal

| Item                   | Priority | Status | Notes                  |
| ---------------------- | -------- | ------ | ---------------------- |
| Log (linear)           | P0       | [x]    | First-parent traversal |
| Log (all parents)      | P1       | [ ]    | Full DAG traversal     |
| Log with path filter   | P1       | [x]    | Commits touching path  |
| Log with author filter | P1       | [ ]    | By author              |
| Log with date filter   | P1       | [ ]    | Date range             |
| Log pagination         | P0       | [x]    | Offset/limit           |
| Topological sort       | P1       | [ ]    | For display            |
| Date sort              | P1       | [ ]    | By commit date         |
| Merge base             | P1       | [ ]    | Common ancestor        |
| Reachability           | P1       | [ ]    | Is A ancestor of B     |

### 6.3 Commit Creation

| Item                   | Priority | Status | Notes                        |
| ---------------------- | -------- | ------ | ---------------------------- |
| Commit object creation | P1       | [ ]    | For merge commits, web edits |
| Commit serialization   | P1       | [ ]    | To git format                |
| GPG signing            | P3       | [ ]    | Sign commits                 |

---

## 7. Diff

### 7.1 Blob Diff

| Item                 | Priority | Status | Notes                 |
| -------------------- | -------- | ------ | --------------------- |
| Myers diff algorithm | P1       | [ ]    | Standard diff         |
| Patience diff        | P2       | [ ]    | Better for some cases |
| Histogram diff       | P2       | [ ]    | Git default           |
| Unified diff output  | P1       | [x]    | Standard format       |
| Context lines        | P1       | [x]    | Surrounding lines     |
| Binary detection     | P1       | [ ]    | Skip binary files     |
| Diff stat            | P1       | [x]    | +/- line counts       |
| Word diff            | P2       | [ ]    | Inline word changes   |

### 7.2 Tree Diff

| Item           | Priority | Status | Notes                |
| -------------- | -------- | ------ | -------------------- |
| Added files    | P1       | [x]    | In new, not in old   |
| Deleted files  | P1       | [x]    | In old, not in new   |
| Modified files | P1       | [x]    | Changed content      |
| Renamed files  | P2       | [ ]    | Similarity detection |
| Copied files   | P2       | [ ]    | Similarity detection |
| Mode changes   | P1       | [ ]    | Permission changes   |
| Type changes   | P2       | [ ]    | File -> dir, etc     |

### 7.3 Commit Diff

| Item               | Priority | Status | Notes                 |
| ------------------ | -------- | ------ | --------------------- |
| Single parent diff | P1       | [x]    | Commit vs parent      |
| Merge commit diff  | P2       | [ ]    | Combined diff         |
| Range diff         | P2       | [ ]    | Compare commit ranges |

---

## 8. Blame

| Item               | Priority | Status | Notes                       |
| ------------------ | -------- | ------ | --------------------------- |
| Line attribution   | P1       | [ ]    | Which commit, which line    |
| Blame algorithm    | P1       | [ ]    | Track lines through history |
| Blame with renames | P2       | [ ]    | Follow file renames         |
| Blame range        | P1       | [ ]    | Specific line range         |
| Incremental blame  | P2       | [ ]    | Streaming results           |
| Ignore revs        | P2       | [ ]    | Skip formatting commits     |

---

## 9. Merge

### 9.1 Merge Base

| Item                  | Priority | Status | Notes            |
| --------------------- | -------- | ------ | ---------------- |
| Two-commit merge base | P1       | [ ]    | Common ancestor  |
| Octopus merge base    | P2       | [ ]    | Multiple commits |
| Virtual merge base    | P2       | [ ]    | For criss-cross  |

### 9.2 Three-Way Merge

| Item                   | Priority | Status | Notes                     |
| ---------------------- | -------- | ------ | ------------------------- |
| Tree merge             | P1       | [ ]    | Directory-level merge     |
| Blob merge             | P1       | [ ]    | File-level merge          |
| Conflict detection     | P1       | [ ]    | Overlapping changes       |
| Conflict markers       | P1       | [ ]    | <<<<<<< ======= >>>>>>>   |
| Add/add conflict       | P1       | [ ]    | Both added same path      |
| Modify/delete conflict | P1       | [ ]    | One modified, one deleted |
| Rename/rename conflict | P2       | [ ]    | Both renamed same file    |
| Rename/modify conflict | P2       | [ ]    | Rename + modify same file |

### 9.3 Merge Strategies

| Item         | Priority | Status | Notes          |
| ------------ | -------- | ------ | -------------- |
| Merge commit | P1       | [ ]    | Standard merge |
| Fast-forward | P1       | [ ]    | Linear history |
| Squash merge | P1       | [ ]    | Single commit  |
| Rebase merge | P2       | [ ]    | Replay commits |

---

## 10. Web UI Operations

### 10.1 Repository Browser

| Item                | Priority | Status | Notes               |
| ------------------- | -------- | ------ | ------------------- |
| Tree view           | P0       | [x]    | Directory listing   |
| Blob view           | P0       | [x]    | File content        |
| Syntax highlighting | P0       | [x]    | Shiki               |
| Raw file download   | P0       | [x]    | Direct file content |
| Markdown rendering  | P0       | [x]    | README, etc         |
| Image rendering     | P1       | [ ]    | Inline images       |
| PDF rendering       | P2       | [ ]    | PDF preview         |
| Notebook rendering  | P2       | [ ]    | Jupyter notebooks   |

### 10.2 Commit Browser

| Item          | Priority | Status | Notes             |
| ------------- | -------- | ------ | ----------------- |
| Commit list   | P0       | [x]    | History view      |
| Commit detail | P0       | [x]    | Single commit     |
| Commit diff   | P0       | [x]    | Changes in commit |
| Commit graph  | P2       | [ ]    | Visual DAG        |

### 10.3 Branch/Tag UI

| Item                | Priority | Status | Notes         |
| ------------------- | -------- | ------ | ------------- |
| Branch list         | P0       | [x]    | All branches  |
| Branch selector     | P0       | [x]    | Switch branch |
| Branch comparison   | P1       | [ ]    | Ahead/behind  |
| Create branch (web) | P1       | [ ]    | From web UI   |
| Delete branch (web) | P1       | [ ]    | From web UI   |
| Tag list            | P1       | [ ]    | All tags      |
| Create tag (web)    | P2       | [ ]    | From web UI   |

### 10.4 File Operations (Web)

| Item             | Priority | Status | Notes         |
| ---------------- | -------- | ------ | ------------- |
| Edit file        | P2       | [ ]    | Web editor    |
| Create file      | P2       | [ ]    | New file      |
| Delete file      | P2       | [ ]    | Remove file   |
| Upload file      | P2       | [ ]    | Binary upload |
| Rename/move file | P2       | [ ]    | Rename path   |

---

## 11. Pull Requests

### 11.1 PR Core

| Item           | Priority | Status | Notes                |
| -------------- | -------- | ------ | -------------------- |
| Create PR      | P1       | [ ]    | From branch          |
| PR list        | P1       | [ ]    | Open/closed/all      |
| PR detail view | P1       | [ ]    | Description, commits |
| PR diff view   | P1       | [ ]    | All changes          |
| Close PR       | P1       | [ ]    | Without merge        |
| Reopen PR      | P1       | [ ]    | Closed -> open       |

### 11.2 PR Merge

| Item                     | Priority | Status | Notes            |
| ------------------------ | -------- | ------ | ---------------- |
| Merge commit             | P1       | [ ]    | Standard merge   |
| Squash merge             | P1       | [ ]    | Single commit    |
| Rebase merge             | P2       | [ ]    | Replay commits   |
| Fast-forward merge       | P1       | [ ]    | Linear history   |
| Merge conflict detection | P1       | [ ]    | Pre-merge check  |
| Auto-merge               | P2       | [ ]    | When checks pass |

### 11.3 PR Review

| Item            | Priority | Status | Notes                   |
| --------------- | -------- | ------ | ----------------------- |
| PR comments     | P1       | [ ]    | Discussion              |
| Line comments   | P1       | [ ]    | Comment on diff line    |
| Review request  | P2       | [ ]    | Request review          |
| Review approval | P2       | [ ]    | Approve/request changes |
| Review dismiss  | P2       | [ ]    | Dismiss stale review    |

### 11.4 PR Checks

| Item            | Priority | Status | Notes                |
| --------------- | -------- | ------ | -------------------- |
| Status checks   | P2       | [ ]    | CI integration       |
| Required checks | P2       | [ ]    | Block merge          |
| Check runs      | P2       | [ ]    | GitHub Actions style |

---

## 12. Repository Management

### 12.1 Repository CRUD

| Item                | Priority | Status | Notes             |
| ------------------- | -------- | ------ | ----------------- |
| Create repository   | P0       | [x]    | New empty repo    |
| Repository settings | P0       | [x]    | Name, visibility  |
| Delete repository   | P1       | [ ]    | With confirmation |
| Rename repository   | P1       | [ ]    | Change name       |
| Transfer repository | P2       | [ ]    | Change owner      |
| Archive repository  | P2       | [ ]    | Read-only mode    |

### 12.2 Repository Features

| Item        | Priority | Status | Notes             |
| ----------- | -------- | ------ | ----------------- |
| Fork        | P1       | [ ]    | Copy repository   |
| Star        | P2       | [ ]    | Bookmark repo     |
| Watch       | P2       | [ ]    | Notifications     |
| Topics/tags | P2       | [ ]    | Categorization    |
| Description | P0       | [x]    | Short description |
| Website URL | P2       | [ ]    | Project homepage  |

### 12.3 Repository Access

| Item              | Priority | Status | Notes            |
| ----------------- | -------- | ------ | ---------------- |
| Public/private    | P0       | [x]    | Visibility       |
| Collaborators     | P1       | [ ]    | Add users        |
| Teams             | P2       | [ ]    | Group access     |
| Permission levels | P1       | [ ]    | Read/write/admin |
| Deploy keys       | P2       | [ ]    | CI access        |

### 12.4 Repository Statistics

| Item               | Priority | Status | Notes              |
| ------------------ | -------- | ------ | ------------------ |
| Commit count       | P1       | [ ]    | Total commits      |
| Contributor count  | P1       | [ ]    | Unique authors     |
| Language breakdown | P1       | [ ]    | By file extension  |
| Repository size    | P1       | [ ]    | Total size         |
| Code frequency     | P2       | [ ]    | Commits over time  |
| Contributor stats  | P2       | [ ]    | Commits per author |

---

## 13. Issues

| Item               | Priority | Status | Notes               |
| ------------------ | -------- | ------ | ------------------- |
| Create issue       | P0       | [x]    | New issue           |
| Issue list         | P0       | [x]    | All issues          |
| Issue detail       | P0       | [x]    | Single issue        |
| Close/reopen issue | P0       | [x]    | Status change       |
| Issue comments     | P0       | [x]    | Discussion          |
| Labels             | P1       | [ ]    | Categorization      |
| Assignees          | P1       | [ ]    | Assign to users     |
| Milestones         | P2       | [ ]    | Group issues        |
| Issue templates    | P2       | [ ]    | Predefined forms    |
| Issue search       | P1       | [ ]    | Filter/search       |
| Issue references   | P2       | [ ]    | Link to commits/PRs |

---

## 14. User & Auth

| Item                   | Priority | Status | Notes             |
| ---------------------- | -------- | ------ | ----------------- |
| User registration      | P0       | [x]    | Sign up           |
| User login             | P0       | [x]    | Sign in           |
| User profile           | P0       | [x]    | Public page       |
| User settings          | P0       | [x]    | Edit profile      |
| Personal access tokens | P0       | [x]    | API/git auth      |
| SSH keys               | P2       | [ ]    | SSH git access    |
| Two-factor auth        | P2       | [ ]    | 2FA               |
| OAuth login            | P2       | [ ]    | GitHub/Google/etc |
| Email verification     | P1       | [ ]    | Verify email      |
| Password reset         | P1       | [ ]    | Forgot password   |

---

## 15. Organizations

| Item             | Priority | Status | Notes            |
| ---------------- | -------- | ------ | ---------------- |
| Create org       | P2       | [ ]    | New organization |
| Org profile      | P2       | [ ]    | Public page      |
| Org members      | P2       | [ ]    | Member list      |
| Org teams        | P2       | [ ]    | Group members    |
| Org repositories | P2       | [ ]    | Org-owned repos  |
| Member roles     | P2       | [ ]    | Owner/member     |
| Team permissions | P2       | [ ]    | Per-repo access  |

---

## 16. Search

| Item              | Priority | Status | Notes                  |
| ----------------- | -------- | ------ | ---------------------- |
| Repository search | P1       | [ ]    | Find repos             |
| Code search       | P2       | [ ]    | Search file contents   |
| Commit search     | P2       | [ ]    | Search commit messages |
| Issue search      | P1       | [ ]    | Search issues          |
| User search       | P1       | [ ]    | Find users             |
| File finder       | P1       | [ ]    | Fuzzy file search      |

---

## 17. Notifications & Activity

| Item                | Priority | Status | Notes              |
| ------------------- | -------- | ------ | ------------------ |
| Activity feed       | P1       | [ ]    | Recent activity    |
| Notifications       | P2       | [ ]    | User notifications |
| Email notifications | P2       | [ ]    | Email alerts       |
| Watching            | P2       | [ ]    | Subscribe to repos |
| @mentions           | P2       | [ ]    | Notify users       |

---

## 18. API

| Item              | Priority | Status | Notes               |
| ----------------- | -------- | ------ | ------------------- |
| REST API          | P1       | [ ]    | Programmatic access |
| GraphQL API       | P2       | [ ]    | Flexible queries    |
| Webhooks          | P2       | [ ]    | Push notifications  |
| API rate limiting | P1       | [ ]    | Prevent abuse       |
| API documentation | P1       | [ ]    | OpenAPI/Swagger     |

---

## 19. Storage Layer (Cloudflare-Specific)

### 19.1 SQLite Index

| Item                | Priority | Status | Notes                |
| ------------------- | -------- | ------ | -------------------- |
| Object index table  | P0       | [ ]    | OID -> pack location |
| Pack registry table | P0       | [ ]    | Pack metadata        |
| Refs table          | P0       | [ ]    | Branch/tag storage   |
| Index queries       | P0       | [ ]    | Fast lookups         |
| Batch inserts       | P0       | [ ]    | Efficient indexing   |

### 19.2 R2 Storage

| Item             | Priority | Status | Notes              |
| ---------------- | -------- | ------ | ------------------ |
| Pack upload      | P0       | [ ]    | Store packfiles    |
| Pack download    | P0       | [ ]    | Retrieve packfiles |
| Range reads      | P0       | [ ]    | Partial pack reads |
| Multipart upload | P1       | [ ]    | Large packs        |
| Pack deletion    | P1       | [ ]    | GC cleanup         |

### 19.3 Cache API

| Item               | Priority | Status | Notes           |
| ------------------ | -------- | ------ | --------------- |
| Object caching     | P0       | [ ]    | Parsed objects  |
| Cache key design   | P0       | [ ]    | repo:oid format |
| Cache invalidation | P1       | [ ]    | On force push   |
| TTL configuration  | P1       | [ ]    | Expiration      |

---

## 20. Validation & Security

### 20.1 Input Validation

| Item                       | Priority | Status | Notes              |
| -------------------------- | -------- | ------ | ------------------ |
| Object format validation   | P0       | [ ]    | Valid git objects  |
| Pack checksum verification | P0       | [ ]    | SHA-1 check        |
| Ref name validation        | P0       | [ ]    | Valid ref names    |
| Path traversal prevention  | P0       | [ ]    | No ../ escapes     |
| Size limits                | P0       | [ ]    | Max file/pack size |

### 20.2 Access Control

| Item                  | Priority | Status | Notes                   |
| --------------------- | -------- | ------ | ----------------------- |
| Repository visibility | P0       | [x]    | Public/private          |
| Push authorization    | P0       | [x]    | Who can push            |
| Branch protection     | P2       | [ ]    | Restrict changes        |
| Force push protection | P1       | [ ]    | Prevent history rewrite |

---

## 21. Maintenance & Operations

### 21.1 Garbage Collection

| Item                         | Priority | Status | Notes                 |
| ---------------------------- | -------- | ------ | --------------------- |
| Unreachable object detection | P1       | [ ]    | Find orphaned objects |
| Object deletion              | P1       | [ ]    | Clean up orphans      |
| Pack repacking               | P2       | [ ]    | Merge small packs     |
| Prune old packs              | P2       | [ ]    | Remove replaced packs |

### 21.2 Monitoring

| Item                | Priority | Status | Notes               |
| ------------------- | -------- | ------ | ------------------- |
| Request logging     | P1       | [ ]    | Access logs         |
| Error tracking      | P1       | [ ]    | Error reporting     |
| Performance metrics | P2       | [ ]    | Latency, throughput |
| Storage metrics     | P2       | [ ]    | Size per repo       |

---

## Summary

### By Priority

| Priority | Count | Description                               |
| -------- | ----- | ----------------------------------------- |
| **P0**   | ~60   | MVP - clone, push, basic web UI           |
| **P1**   | ~70   | Usable product - PRs, diff, blame, search |
| **P2**   | ~80   | GitHub parity - advanced features         |
| **P3**   | ~10   | Nice to have                              |

### Already Implemented

- Git protocol (clone/push/fetch) via isomorphic-git
- Basic web UI (tree, blob, commits, issues)
- User auth with PATs
- Repository CRUD

### Critical Path for Custom Git

1. **Object model** - types, hashing, serialization
2. **Pack reading** - parse packs, resolve deltas
3. **Pack writing** - generate packs for clone/fetch
4. **Storage layer** - SQLite index, R2 packs, Cache API
5. **Protocol** - replace isomorphic-git in protocol handlers

### Hardest Parts

1. **Delta resolution** - recursive base lookup, instruction parsing
2. **Delta generation** - finding similar objects, computing deltas
3. **Blame** - tracking lines through history with renames
4. **Three-way merge** - conflict detection and resolution
5. **Streaming** - all operations within 128MB memory limit
