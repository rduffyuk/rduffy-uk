import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";


const projects = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/projects" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    tags: z.array(z.string()),
    url: z.string().optional(),
    order: z.number(),
  }),
});

const pages = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/pages" }),
  schema: z.object({
    title: z.string(),
  }),
});

// Blog posts migrated from blog.rduffy.uk — schema matches AstroPaper frontmatter
const writing = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/writing" }),
  schema: z
    .object({
      title: z.string(),
      description: z.string().optional(),
      pubDatetime: z.coerce.date(),
      modDatetime: z.coerce.date().optional().nullable(),
      author: z.string().optional(),
      episode: z.number().optional(),
      series: z.string().optional(),
      featured: z.boolean().optional(),
      draft: z.boolean().optional(),
      reading_time: z.string().optional(),
      tags: z.array(z.string()).default([]),
      categories: z.array(z.string()).optional(),
    })
    .passthrough(),
});

// Curated ADRs synced from the platform repo (public: true only)
const adrs = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/adrs" }),
  schema: z.object({
    id: z.number(),
    title: z.string(),
    status: z.enum(["accepted", "superseded", "proposed", "deprecated"]),
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    supersedes: z.string().optional(),
    supersededBy: z.string().optional(),
    episode: z.string().optional(), // e.g. "season-3-episode-7-the-long-weekend"
    public: z.boolean().default(true),
  }),
});

export const collections = { projects, pages, writing, adrs };
