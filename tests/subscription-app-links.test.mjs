import test from "node:test";
import assert from "node:assert/strict";
import { subscriptionAppLinks } from "../src/scripts/subscription-app-links.ts";
import { deviceTitle } from "../src/scripts/subscription-devices.ts";

test("app links preserve the full personal subscription URL without a third-party redirect", () => {
  const url = "https://infra.example:8443/sub/private-token?mode=full";
  assert.deepEqual(subscriptionAppLinks(url), { happ: `happ://add/${url}`, incy: `incy://import/${url}` });
});

test("app links reject unsafe or credential-bearing URLs", () => {
  for (const value of ["javascript:alert(1)", "http://infra.example/sub", "https://user:password@infra.example/sub", "invalid"]) {
    assert.throws(() => subscriptionAppLinks(value));
  }
});

test("device titles use model, OS, then stable device number", () => {
  const device = { id: 41, model: "Phone", os: "iOS", os_version: "26", app: "INCY", first_seen: 0, last_seen: 0 };
  assert.equal(deviceTitle(device), "Phone");
  assert.equal(deviceTitle({ ...device, model: "" }), "iOS 26");
  assert.equal(deviceTitle({ ...device, model: "", os: "", os_version: "" }), "Устройство №41");
});
