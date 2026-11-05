import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, serialize } from 'parse5';

export function contentVersion(bytes) {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 16);
}

// Only local emitted assets are eligible. Never alter API, subscription or external URLs.
export function versionAssetUrl(value, pagePath, versions) {
  if (!value || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value)) return value;
  const url = new URL(value, `https://build.invalid${pagePath}`);
  let path;
  try { path = decodeURIComponent(url.pathname); } catch { return value; }
  const hash = versions.get(path);
  if (!hash) return value;
  url.searchParams.set('v', hash);
  return value.split(/[?#]/, 1)[0] + url.search + url.hash;
}

export function versionHtmlAssets(html, pagePath, versions) {
  const document = parse(html);
  function visit(node) {
    for (const attr of node.attrs ?? []) {
      if (['src', 'href', 'poster'].includes(attr.name)) {
        attr.value = versionAssetUrl(attr.value, pagePath, versions);
      } else if (attr.name === 'srcset' && !attr.value.includes('data:')) {
        attr.value = attr.value.split(',').map(candidate => {
          const [url, ...descriptor] = candidate.trim().split(/\s+/);
          return [versionAssetUrl(url, pagePath, versions), ...descriptor].join(' ');
        }).join(', ');
      }
    }
    for (const child of node.childNodes ?? []) visit(child);
    if (node.content) visit(node.content);
  }
  visit(document);
  return serialize(document);
}

export async function versionBuildAssets(directory) {
  const assets = new Map();
  const pages = [];
  async function walk(path, prefix = '') {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const relative = `${prefix}/${entry.name}`;
      const full = join(path, entry.name);
      if (entry.isDirectory()) await walk(full, relative);
      else if (entry.name.endsWith('.html')) pages.push({ full, relative });
      else if (entry.isFile()) assets.set(relative, contentVersion(await readFile(full)));
    }
  }
  await walk(directory);
  for (const { full, relative } of pages) {
    const pagePath = relative.endsWith('/index.html') ? relative.slice(0, -10) : relative;
    await writeFile(full, versionHtmlAssets(await readFile(full, 'utf8'), pagePath, assets));
  }
}

export default function assetVersions() {
  return {
    name: 'local-asset-versions',
    hooks: {
      'astro:build:done': async ({ dir }) => versionBuildAssets(fileURLToPath(dir)),
    },
  };
}
