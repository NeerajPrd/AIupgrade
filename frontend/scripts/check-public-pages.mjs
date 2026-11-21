// Checks that a logged-out visitor gets the Privacy Policy and Terms pages: HTTP 200, no redirect,
// and the page's own heading in the HTML. No cookies are sent.
//
//   node scripts/check-public-pages.mjs https://app.spirit-monkey.com
//   node scripts/check-public-pages.mjs http://localhost:3000
//
// This covers server-side redirects (route guard, proxy, web server). The in-browser redirect that
// used to follow a 401 from the API is covered by tests/public-paths.test.mjs.

const base = (process.argv[2] || "http://localhost:3000").replace(/\/+$/, "");
const pages = [
  ["/privacy-policy", "Privacy Policy"],
  ["/terms-and-conditions", "Terms of Service"],
];

let failed = 0;
for (const [path, heading] of pages) {
  const url = base + path;
  try {
    const response = await fetch(url, { redirect: "manual", headers: { "User-Agent": "public-pages-check" } });
    const html = response.status === 200 ? await response.text() : "";
    const ok = response.status === 200 && html.includes(heading);
    if (!ok) failed++;
    const where = response.headers.get("location");
    console.log(
      `${ok ? "PASS" : "FAIL"} ${url} -> ${response.status}` +
        (where ? ` (redirects to ${where})` : "") +
        (response.status === 200 && !ok ? ` (heading "${heading}" not found)` : "")
    );
  } catch (err) {
    failed++;
    console.log(`FAIL ${url} -> ${err.message}`);
  }
}
process.exit(failed ? 1 : 0);
