import assert from 'node:assert/strict';
import test from 'node:test';
import { deviceLimitLabel } from '../src/scripts/subscription-device-limit.ts';

test('badge uses the actual personal limit, including one device and unlimited', () => {
  assert.equal(deviceLimitLabel(1), 'До 1 устройства');
  assert.equal(deviceLimitLabel(7), 'До 7 устройств');
  assert.equal(deviceLimitLabel(21), 'До 21 устройства');
  assert.equal(deviceLimitLabel(11), 'До 11 устройств');
  assert.equal(deviceLimitLabel(0), 'Без ограничения устройств');
});
