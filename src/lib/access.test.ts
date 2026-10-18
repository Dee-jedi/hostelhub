import assert from "node:assert/strict";
import { test } from "node:test";
import { accessFrom, isManagerOf, isPlatformAdmin, isTenantOf } from "./access";

test("reads our claims and ignores token fields we don't own", () => {
  const token = { iss: "x", email: "a@b.c", p: "admin", h: { mowarid: "manager" }, t: { other: true }, role: "admin" };
  assert.deepEqual(accessFrom(token), { p: "admin", h: { mowarid: "manager" }, t: { other: true }, role: "admin" });
});

test("bad shapes are dropped, not trusted", () => {
  assert.deepEqual(accessFrom({ p: "owner", h: ["mowarid"], t: "mowarid" }), {});
  assert.deepEqual(accessFrom(null), {});
});

test("checks are per hostel", () => {
  const a = accessFrom({ h: { mowarid: "manager" }, t: { grace: true } });
  assert.ok(isManagerOf(a, "mowarid"));
  assert.ok(!isManagerOf(a, "grace"));
  assert.ok(isTenantOf(a, "grace"));
  assert.ok(!isTenantOf(a, "mowarid"));
  assert.ok(!isPlatformAdmin(a));
});
