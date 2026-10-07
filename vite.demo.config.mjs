// Static build for GitHub Pages: the dashboard driven by built-in sample data, no server.
// `npm run build:demo` writes dist-demo/. DEMO_BASE is the site's sub-path.
import { defineConfig } from "vite";
import { rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = (process.env.DEMO_BASE || "/mediasite-dashboard/").replace(
  /\/?$/,
  "/",
);
const REPO = "https://github.com/mtmangum/mediasite-dashboard";
const root = fileURLToPath(new URL("./frontend", import.meta.url));
const outDir = fileURLToPath(new URL("./dist-demo", import.meta.url));

const demoSite = {
  name: "demo-site",
  transformIndexHtml: {
    order: "pre",
    handler: (html) =>
      html
        // The official university wordmarks are not part of the public demo.
        .replace(/<img\s+src="\/brand\/[\s\S]*?\/>/, "")
        .replace(
          /<body[^>]*>/,
          (body) =>
            `${body}<div class="demo-banner" role="note"><strong>Demo</strong> · sample courses and analytics · no live Mediasite connection · <a href="${REPO}">Source on GitHub</a></div>`,
        ),
  },
  closeBundle() {
    writeFileSync(`${outDir}/.nojekyll`, "");
    rmSync(`${outDir}/brand`, { recursive: true, force: true }); // wordmarks unused here
  },
};

export default defineConfig({
  root,
  base: BASE,
  appType: "mpa",
  define: { __DEMO__: true },
  plugins: [demoSite],
  build: { outDir, emptyOutDir: true },
});
