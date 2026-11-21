// Checks the Privacy Policy and Terms as a logged-out visitor (no cookies are sent):
//   1. the static pages on the marketing site return 200 with their heading;
//   2. the old dashboard paths redirect permanently (308) to those static pages.
//
//   node scripts/check-public-pages.mjs                                    (live sites)
//   node scripts/check-public-pages.mjs http://localhost:3000 http://localhost:8765   (local copies)
//
// Arguments: dashboard base URL, marketing site base URL.

const dashboard = (process.argv[2] || "https://app.spirit-monkey.com").replace(/\/+$/, "");
const site = (process.argv[3] || "https://spirit-monkey.com").replace(/\/+$/, "");

const pages = [
  { old: "/privacy-policy", path: "/privacy-policy/", heading: "Privacy Policy" },
  { old: "/terms-and-conditions", path: "/terms/", heading: "Terms of Service" },
];

let failed = 0;
const report = (ok, text) => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${text}`);
};

for (const { old, path, heading } of pages) {
  const page = site + path;
  try {
    const r = await fetch(page, { redirect: "manual", headers: { "User-Agent": "public-pages-check" } });
    const html = r.status === 200 ? await r.text() : "";
    report(r.status === 200 && html.includes(`<h1>${heading}</h1>`),
      `${page} -> ${r.status}${r.status === 200 && !html.includes(heading) ? " (heading missing)" : ""}`);
  } catch (err) {
    report(false, `${page} -> ${err.message}`);
  }

  const from = dashboard + old;
  const expected = `https://spirit-monkey.com${path}`;
  try {
    const r = await fetch(from, { redirect: "manual", headers: { "User-Agent": "public-pages-check" } });
    const location = r.headers.get("location");
    report(r.status === 308 && location === expected, `${from} -> ${r.status} ${location || ""}`.trim() +
      (r.status === 308 && location === expected ? "" : ` (expected 308 to ${expected})`));
  } catch (err) {
    report(false, `${from} -> ${err.message}`);
  }
}
process.exit(failed ? 1 : 0);
