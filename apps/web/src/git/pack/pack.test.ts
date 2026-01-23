import { exec } from "node:child_process";
import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";
import { PackfileParser } from "./index";
import type {
  PackfileEvent,
  PackfileHeader,
  PackfileObject,
  PackfileResult,
} from "./types";

const execAsync = promisify(exec);

/** Compute git object hash: SHA-1 of "type size\0content" */
async function computeGitObjectHash(
  type: string,
  data: Uint8Array
): Promise<string> {
  const header = new TextEncoder().encode(`${type} ${data.length}\0`);
  const full = new Uint8Array(header.length + data.length);
  full.set(header);
  full.set(data, header.length);

  const hashBuffer = await crypto.subtle.digest("SHA-1", full);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type GitVerifyPackEntry = {
  sha: string;
  type: string;
  size: number;
  sizeInPack: number;
  offset: number;
  depth?: number;
  baseSha?: string;
};

/**
 *
 * parses the output of `git verify-pack -v <packfile>` and returns an array of entries
 *
 * When specifying the -v option the format used is:
 *         SHA-1 type size size-in-packfile offset-in-packfile
 * for objects that are not deltified in the pack, and
 *         SHA-1 type size size-in-packfile offset-in-packfile depth base-SHA-1
 * for objects that are deltified.
 */
async function parseGitVerifyPack(packPath: string) {
  const { stdout } = await execAsync(`git verify-pack -v "${packPath}"`);
  const lines = stdout.trim().split("\n");
  const entries: GitVerifyPackEntry[] = [];

  for (const line of lines) {
    // Skip summary lines (non-SHA1, chain length, etc.)
    if (!line.match(/^[0-9a-f]{40}\s/)) continue;

    const parts = line.split(/\s+/);
    if (parts.length < 5) continue;

    const entry: GitVerifyPackEntry = {
      sha: parts[0],
      type: parts[1],
      size: Number.parseInt(parts[2], 10),
      sizeInPack: Number.parseInt(parts[3], 10),
      offset: Number.parseInt(parts[4], 10),
    };

    // Delta objects have depth and base SHA
    if (parts.length >= 7) {
      entry.depth = Number.parseInt(parts[5], 10);
      entry.baseSha = parts[6];
    }

    entries.push(entry);
  }

  return entries;
}

async function findGitRoot(startDir: string): Promise<string> {
  let dir = startDir;
  while (dir !== "/") {
    try {
      await readdir(join(dir, ".git"));
      return dir;
    } catch {
      dir = join(dir, "..");
    }
  }
  throw new Error("Could not find .git directory");
}

async function findPackFiles(): Promise<string[]> {
  const gitRoot = await findGitRoot(process.cwd());
  const packDir = join(gitRoot, ".git", "objects", "pack");
  const files = await readdir(packDir);
  return files.filter((f) => f.endsWith(".pack")).map((f) => join(packDir, f));
}

function fileToWebStream(path: string) {
  const nodeStream = createReadStream(path);
  return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
}

describe("PackfileParser", () => {
  let packPath: string;
  let events: PackfileEvent[];
  let parsedHeader: PackfileHeader;
  let parsedObjects: PackfileObject[];
  let parsedResult: PackfileResult;
  let gitEntries: GitVerifyPackEntry[];
  let lastParser: PackfileParser;

  beforeAll(async () => {
    const packFiles = await findPackFiles();
    if (packFiles.length === 0) throw new Error("No pack files found");
    packPath = packFiles[0];

    const stream = fileToWebStream(packPath);
    const parser = new PackfileParser(stream);
    lastParser = parser;

    events = [];
    parsedObjects = [];

    for await (const res of parser.parse()) {
      if (res.isErr()) throw new Error(`Parse error: ${res.error.message}`);
      events.push(res.value);
      if (res.value.type === "object") {
        parsedObjects.push(res.value);
      }
    }

    const h = events[0];
    const r = events.at(-1);

    if (h?.type !== "header") throw new Error("First event should be header");
    if (r?.type !== "result") throw new Error("Last event should be result");

    parsedHeader = h;
    parsedResult = r;

    gitEntries = await parseGitVerifyPack(packPath);
  });

  it("parses packfile header correctly", () => {
    expect(parsedHeader.type).toBe("header");
    expect(parsedHeader.version).toBeOneOf([2, 3]);
    expect(parsedHeader.objectCount).toBeGreaterThan(0);
  });

  it("parses all objects without errors", () => {
    expect(parsedObjects.length).toBeGreaterThan(0);

    const validTypes = [
      "commit",
      "tree",
      "blob",
      "tag",
      "ofs_delta",
      "ref_delta",
    ];
    for (const obj of parsedObjects) {
      expect(validTypes).toContain(obj.objectType);
      expect(obj.data).toBeInstanceOf(Uint8Array);
      expect(obj.size).toBeGreaterThanOrEqual(0);
      expect(obj.offset).toBeGreaterThanOrEqual(0);
    }
  });

  it("validates checksum correctly", () => {
    expect(parsedResult.type).toBe("result");
    expect(parsedResult.valid).toBe(true);
    expect(parsedResult.checksum).toMatch(/^[0-9a-f]{40}$/);
  });

  it("tracks progress correctly", () => {
    expect(lastParser.progress.objectsParsed).toBe(parsedHeader.objectCount);
    expect(lastParser.progress.objectsTotal).toBe(parsedHeader.objectCount);
  });

  it("object count matches header", () => {
    expect(parsedObjects.length).toBe(parsedHeader.objectCount);
  });

  it("parsed objects match git verify-pack output", async () => {
    expect(gitEntries.length).toBeGreaterThan(0);

    const gitShas = new Set(gitEntries.map((e) => e.sha));
    const gitBaseObjects = gitEntries.filter((e) => e.depth === undefined);
    const gitDeltaObjects = gitEntries.filter((e) => e.depth !== undefined);

    const parsedBaseObjects = parsedObjects.filter(
      (o) => o.objectType !== "ofs_delta" && o.objectType !== "ref_delta"
    );
    const parsedDeltaObjects = parsedObjects.filter(
      (o) => o.objectType === "ofs_delta" || o.objectType === "ref_delta"
    );

    expect(parsedBaseObjects.length).toBe(gitBaseObjects.length);
    expect(parsedDeltaObjects.length).toBe(gitDeltaObjects.length);

    for (const obj of parsedBaseObjects) {
      const hash = await computeGitObjectHash(obj.objectType, obj.data);
      expect(gitShas.has(hash)).toBe(true);
    }
  });

  it("decompressed data size matches declared size", () => {
    for (const obj of parsedObjects) {
      expect(obj.data.length).toBe(obj.size);
    }
  });
});
