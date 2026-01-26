import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import alchemy from "alchemy/cloudflare/tanstack-start";
import { defineConfig, type Plugin } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Custom Vite plugin to handle SQL file imports as text modules.
 * Required for drizzle-orm migrations in Cloudflare Durable Objects.
 * @see https://github.com/cloudflare/workers-sdk/issues/9011
 */
function sqlLoader(): Plugin {
  return {
    name: "sql-loader",
    transform(code, id) {
      if (id.endsWith(".sql")) {
        const escaped = code
          .replace(/\\/g, "\\\\")
          .replace(/`/g, "\\`")
          .replace(/\$/g, "\\$");
        return `export default \`${escaped}\`;`;
      }
    },
  };
}

export default defineConfig({
  plugins: [
    sqlLoader(),
    tsconfigPaths(),
    tailwindcss(),
    alchemy(),
    tanstackStart(),
    viteReact(),
  ],
  server: {
    port: 3000,
  },
});
