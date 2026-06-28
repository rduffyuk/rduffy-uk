import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const GET: APIRoute = async (context) => {
  const site = context.site?.href ?? "https://rduffy.uk/";
  const posts = (await getCollection("writing", ({ data }) => !data.draft)).sort(
    (a, b) => b.data.pubDatetime.getTime() - a.data.pubDatetime.getTime()
  );

  const items = posts
    .map(
      (p) => `    <item>
      <title>${esc(p.data.title)}</title>
      <link>${site}writing/${p.id}/</link>
      <guid>${site}writing/${p.id}/</guid>
      <description>${esc(p.data.description ?? "")}</description>
      <pubDate>${p.data.pubDatetime.toUTCString()}</pubDate>
    </item>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>rduffy.uk — writing</title>
    <link>${site}writing/</link>
    <description>Building AI infrastructure in public — episodes, articles, and decisions.</description>
    <language>en</language>
${items}
  </channel>
</rss>`;

  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
