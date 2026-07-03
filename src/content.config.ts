import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const postsCollection = defineCollection({
  loader: glob({ pattern: "**/[^_]*.{md,mdx}", base: "./src/content/posts" }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    telegramComments: z.boolean().default(true),
    telegramCommentsLimit: z.number().int().min(1).max(100).default(10),
    telegramDiscussion: z.string().optional(),
    telegramDiscussionPostId: z.union([z.number(), z.string()]).optional(),
  }),
});

export const collections = {
  posts: postsCollection,
};
