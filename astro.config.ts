import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import rehypeMermaid from "rehype-mermaid";

export default defineConfig({
  site: "https://rduffy.uk",
  integrations: [react()],
  markdown: {
    // Let rehype-mermaid claim ```mermaid blocks instead of Shiki highlighting them
    syntaxHighlight: { type: "shiki", excludeLangs: ["mermaid"] },
    rehypePlugins: [
      [
        rehypeMermaid,
        {
          // pre-mermaid = emit <pre class="mermaid"> at build, render CLIENT-side.
          // inline-svg needs a headless Chromium at build time, which cannot
          // launch in Cloudflare's non-root build container (missing system
          // libs) — that failure was emptying ALL content-collection bodies.
          // Client-side rendering removes the build-time browser dependency.
          // Theme is applied in the client init (see BaseLayout.astro).
          strategy: "pre-mermaid",
        },
      ],
    ],
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
