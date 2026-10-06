import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("./frontend", import.meta.url));
export default defineConfig({
  root,
  server: { middlewareMode: true },
  appType: "mpa",
  build: { outDir: "../dist", emptyOutDir: true },
});
