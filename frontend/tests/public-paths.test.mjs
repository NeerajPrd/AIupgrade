// Run with: node --test tests/   (from the frontend folder; Node 22.6+ runs the .ts module directly)
import { test } from "node:test";
import assert from "node:assert/strict";

import { PUBLIC_PAGE_PATHS, isPublicPage, shouldRedirectToLogin } from "../src/lib/public-paths.ts";

test("only the Privacy Policy and Terms are public", () => {
  assert.deepEqual([...PUBLIC_PAGE_PATHS].sort(), ["/privacy-policy", "/terms-and-conditions"]);
});

test("public pages are recognised with or without a trailing slash or query", () => {
  for (const path of ["/privacy-policy", "/privacy-policy/", "/terms-and-conditions", "/terms-and-conditions?x=1"]) {
    assert.equal(isPublicPage(path), true, path);
  }
});

test("a 401 on a public page does not send the visitor to /login", () => {
  assert.equal(shouldRedirectToLogin("/privacy-policy"), false);
  assert.equal(shouldRedirectToLogin("/terms-and-conditions"), false);
  assert.equal(shouldRedirectToLogin("/login"), false);
});

test("every other page still requires login", () => {
  for (const path of ["/", "/chat", "/agents", "/admin/leads", "/manage-models", "/privacy-policy-x",
    "/privacy-policy/edit", "/terms", "/workflow/new", "/profile"]) {
    assert.equal(isPublicPage(path), false, path);
    assert.equal(shouldRedirectToLogin(path), true, path);
  }
});

// ---- the legal text lives only on the static marketing site

import { PRIVACY_POLICY_URL, TERMS_URL } from "../src/lib/public-paths.ts";
import { LEGAL_REDIRECTS } from "../next.config.mjs";

test("dashboard legal paths redirect permanently to the static marketing pages", () => {
  assert.deepEqual(
    LEGAL_REDIRECTS.map(({ source, destination, permanent }) => [source, destination, permanent]),
    [
      ["/privacy-policy", PRIVACY_POLICY_URL, true],
      ["/terms-and-conditions", TERMS_URL, true],
    ]
  );
  assert.equal(PRIVACY_POLICY_URL, "https://spirit-monkey.com/privacy-policy/");
  assert.equal(TERMS_URL, "https://spirit-monkey.com/terms/");
});
