import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downloadFilename, saveDownload } from '../src/scripts/download.ts';

test('uses attachment filenames including UTF-8 and quoted spaces', () => {
  assert.equal(downloadFilename('attachment; filename="alice Spain.conf"', 'fallback.conf'), 'alice Spain.conf');
  assert.equal(downloadFilename("attachment; filename*=UTF-8''alice%20Spain.conf", 'fallback.conf'), 'alice Spain.conf');
});

test('preserves required extension with hidden CORS header or text filename', () => {
  assert.equal(downloadFilename(null, 'alice Spain.conf'), 'alice Spain.conf');
  assert.equal(downloadFilename('attachment; filename="alice Spain.txt"', 'fallback.conf'), 'alice Spain.conf');
  assert.equal(downloadFilename('attachment; filename="vpn-configs.zip"', 'fallback.zip', '.zip'), 'vpn-configs.zip');
});

test('removes filesystem paths and tolerates malformed encoded filenames', () => {
  assert.equal(downloadFilename('attachment; filename="../../alice.conf"', 'fallback.conf').includes('/'), false);
  assert.equal(downloadFilename("attachment; filename=alice.conf; filename*=UTF-8''%ZZ", 'fallback.conf'), 'alice.conf');
});

test('saves text response as binary .conf, clicks download, and defers object URL cleanup', async () => {
  const events = [];
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const createObjectURL = URL.createObjectURL;
  const revokeObjectURL = URL.revokeObjectURL;
  let downloadedBlob;
  let cleanup;
  const anchor = { hidden: false, click() { events.push('click'); }, remove() { events.push('remove'); } };
  globalThis.document = { createElement: () => anchor, body: { append: () => events.push('append') } };
  globalThis.window = { setTimeout(callback, delay) { cleanup = callback; assert.equal(delay, 60000); } };
  URL.createObjectURL = (blob) => { downloadedBlob = blob; return 'blob:test'; };
  URL.revokeObjectURL = (url) => events.push(`revoke:${url}`);
  try {
    await saveDownload(new Response('[Interface]\n[Peer]\n', { headers: { 'Content-Type': 'text/plain' } }), 'alice Spain.conf');
    assert.equal(anchor.download, 'alice Spain.conf');
    assert.equal(anchor.href, 'blob:test');
    assert.equal(downloadedBlob.type, 'application/octet-stream');
    assert.equal(await downloadedBlob.text(), '[Interface]\n[Peer]\n');
    assert.deepEqual(events, ['append', 'click', 'remove']);
    cleanup();
    assert.equal(events.at(-1), 'revoke:blob:test');
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
  }
});
