// @ts-check
import { defineConfig } from 'astro/config';
import mdx from "@astrojs/mdx";

import tailwindcss from "@tailwindcss/vite";

import sitemap from "@astrojs/sitemap";
import assetVersions from './integrations/asset-versions.mjs';

// https://astro.build/config
export default defineConfig({
  integrations: [mdx(), sitemap(), assetVersions()],

  site: "https://ram1337.dev",
  vite: {
    server: {
      allowedHosts: ["host.docker.internal"],
    },
    plugins: [tailwindcss()],
  },
});
