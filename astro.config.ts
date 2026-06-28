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
          // build-time render → inline static SVG (no client JS)
          strategy: "inline-svg",
          mermaidConfig: {
            theme: "base",
            themeVariables: {
              primaryColor: "#fffefb",
              primaryTextColor: "#21262e",
              primaryBorderColor: "#c9c4b6",
              lineColor: "#8a8e96",
              fontFamily: "JetBrains Mono, monospace",
              fontSize: "14px",
              clusterBkg: "#f1eee6",
              clusterBorder: "#dfdbd1",
            },
          },
        },
      ],
    ],
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
