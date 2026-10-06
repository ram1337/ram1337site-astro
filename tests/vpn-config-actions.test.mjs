import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configAccessActions } from '../src/scripts/vpn-config-actions.ts';

test('active WireGuard and AmneziaWG accesses expose download and reissue', () => {
  for (const server_type of ['wireguard', 'amneziawg']) {
    const actions = configAccessActions({server_type, status: 'active', config_available: true});
    assert.equal(actions.supported, true);
    assert.equal(actions.canDownload, true);
    assert.equal(actions.provisionAction, 'reissue');
  }
});

test('imported access without private keys still exposes reissue and explains disabled download', () => {
  const actions = configAccessActions({server_type: 'amneziawg', status: 'active', config_available: false});
  assert.equal(actions.supported, true);
  assert.equal(actions.canDownload, false);
  assert.equal(actions.provisionAction, 'reissue');
  assert.match(actions.downloadHelp, /ключей/);
});

test('revoked accesses expose creation while failed provisioning cannot be downloaded', () => {
  for (const status of ['revoked', 'sync_failed', 'provisioning']) {
    const actions = configAccessActions({server_type: 'amneziawg', status, config_available: true});
    assert.equal(actions.canDownload, false);
    assert.equal(actions.provisionAction, status === 'revoked' ? 'create' : 'reissue');
  }
});

test('uses server metadata when access type is missing and excludes IKEv2 files', () => {
  assert.equal(configAccessActions({status: 'active', config_available: true}, 'wireguard').canDownload, true);
  assert.equal(configAccessActions({server_type: 'ikev2', status: 'active', config_available: true}).supported, false);
});
