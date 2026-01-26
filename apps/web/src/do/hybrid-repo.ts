import { DurableObject, env } from "cloudflare:workers";
import {
  type DrizzleSqliteDODatabase,
  drizzle,
} from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
// @ts-expect-error - drizzle-orm script
import migrations from "../../drizzle-do/migrations.js";
import * as gitSchema from "./schema/git";

export function getHybridRepoDOStub(fullRepoName: string) {
  return (env.HYBRID_REPO as DurableObjectNamespace<HybridRepo>).getByName(
    fullRepoName
  );
}

export class HybridRepo extends DurableObject<Env> {
  private readonly db: DrizzleSqliteDODatabase<typeof gitSchema>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    this.db = drizzle(ctx.storage, { schema: gitSchema });

    ctx.blockConcurrencyWhile(async () => {
      this._migrate();
    });
  }

  async _migrate() {
    migrate(this.db, migrations);
  }

  /** Health check */
  async ping(): Promise<string> {
    return "pong";
  }
}
