import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidSlug, resolveHost } from "./hostel-host";

const live = { platformDomain: "hostelhub.africa", defaultHostel: "mowarid" };
const beforeDomain = { platformDomain: "", defaultHostel: "mowarid" };

test("a hostel subdomain resolves to that hostel", () => {
  assert.deepEqual(resolveHost("mowarid.hostelhub.africa", live), { kind: "hostel", slug: "mowarid", via: "subdomain" });
  assert.deepEqual(resolveHost("Grace-Court.HostelHub.Africa:443", live), { kind: "hostel", slug: "grace-court", via: "subdomain" });
});

test("the first value of a forwarded host list is used", () => {
  assert.deepEqual(resolveHost("mowarid.hostelhub.africa, internal.run.app", live), { kind: "hostel", slug: "mowarid", via: "subdomain" });
});

test("platform addresses are not hostels", () => {
  assert.deepEqual(resolveHost("hostelhub.africa", live), { kind: "platform", area: "home" });
  assert.deepEqual(resolveHost("www.hostelhub.africa", live), { kind: "platform", area: "home" });
  assert.deepEqual(resolveHost("admin.hostelhub.africa", live), { kind: "platform", area: "admin" });
});

test("reserved, nested or malformed subdomains are unknown, never a hostel", () => {
  for (const host of ["api.hostelhub.africa", "a.b.hostelhub.africa", "x.hostelhub.africa", "-bad.hostelhub.africa", "a--b.hostelhub.africa"]) {
    assert.deepEqual(resolveHost(host, live), { kind: "unknown" }, host);
  }
});

test("local development uses *.localhost subdomains", () => {
  assert.deepEqual(resolveHost("mowarid.localhost:3000", beforeDomain), { kind: "hostel", slug: "mowarid", via: "subdomain" });
  assert.deepEqual(resolveHost("localhost:3000", beforeDomain), { kind: "hostel", slug: "mowarid", via: "default" });
});

test("before the domain exists, hosted.app falls back to the default hostel", () => {
  assert.deepEqual(resolveHost("hostelhub--hostelhub-b51cc.europe-west4.hosted.app", beforeDomain), { kind: "hostel", slug: "mowarid", via: "default" });
  assert.deepEqual(resolveHost("hostelhub--hostelhub-b51cc.europe-west4.hosted.app", { platformDomain: "", defaultHostel: "" }), { kind: "unknown" });
});

test("a look-alike domain is not the platform", () => {
  assert.deepEqual(resolveHost("mowarid.hostelhub.africa.evil.com", { platformDomain: "hostelhub.africa", defaultHostel: "" }), { kind: "unknown" });
});

test("slug rules", () => {
  assert.ok(isValidSlug("mowarid"));
  assert.ok(isValidSlug("block-a-lodge"));
  assert.ok(!isValidSlug("ab"));
  assert.ok(!isValidSlug("admin"));
  assert.ok(!isValidSlug("Mowarid"));
  assert.ok(!isValidSlug("a".repeat(33)));
});
