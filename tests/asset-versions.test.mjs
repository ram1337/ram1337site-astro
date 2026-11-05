import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { contentVersion, versionAssetUrl, versionBuildAssets } from '../integrations/asset-versions.mjs';

test('changed assets get new versions while unchanged assets retain theirs across builds', async () => {
  const root = await mkdtemp(join(tmpdir(), 'asset-versions-'));
  try {
    await mkdir(join(root, 'cp'));
    await writeFile(join(root, 'app.js'), 'console.log(1)');
    await writeFile(join(root, 'logo.svg'), '<svg/>');
    const html = '<html><head><script type="module" src="/app.js"></script></head><body><img src="../logo.svg"><img srcset="/logo.svg 1x, /logo.svg 2x"><script>const text="<img src=\"/logo.svg\">";</script><a href="https://infra.example/sub/private">Subscribe</a></body></html>';
    await writeFile(join(root, 'cp/index.html'), html);
    await versionBuildAssets(root);
    const first = await readFile(join(root, 'cp/index.html'), 'utf8');
    assert.ok(first.includes(`/app.js?v=${contentVersion('console.log(1)')}`));
    assert.ok(first.includes(`../logo.svg?v=${contentVersion('<svg/>')}`));
    assert.ok(first.includes(`/logo.svg?v=${contentVersion('<svg/>')} 2x`));
    assert.ok(first.includes('const text="<img src=\"/logo.svg\">";'));
    assert.ok(first.includes('href="https://infra.example/sub/private"'));
    await writeFile(join(root, 'app.js'), 'console.log(2)');
    await versionBuildAssets(root);
    const second = await readFile(join(root, 'cp/index.html'), 'utf8');
    assert.ok(second.includes(`/app.js?v=${contentVersion('console.log(2)')}`));
    assert.ok(second.includes(`../logo.svg?v=${contentVersion('<svg/>')}`));
    assert.ok(!second.includes(contentVersion('console.log(1)')));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('preserves fragments and query options, skips external URLs, navigation and data URLs', () => {
  const versions = new Map([['/icon.svg', 'abc123']]);
  assert.equal(versionAssetUrl('/icon.svg?size=2&v=old#part', '/cp/', versions), '/icon.svg?size=2&v=abc123#part');
  for (const url of ['https://example.com/icon.svg', '//example.com/icon.svg', 'data:image/svg+xml,test', '/cp/', '#fragment', 'happ://add/https://infra.example/sub']) {
    assert.equal(versionAssetUrl(url, '/cp/', versions), url);
  }
});
