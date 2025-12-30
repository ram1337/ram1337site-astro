// @ts-check
import { defineConfig } from 'astro/config';
import mdx from "@astrojs/mdx";

import tailwindcss from "@tailwindcss/vite";

import sitemap from "@astrojs/sitemap";

// https://astro.build/config
export default defineConfig({
  integrations: [mdx(), sitemap()],

  site: "https://ram1337.ru",
  vite: {
    plugins: [tailwindcss()],
  },
});