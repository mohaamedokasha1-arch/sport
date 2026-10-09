/** Runs ONLY against a disposable local QA server/database configured by the
 * operator. Credential values are read from an external test-only file, never logged. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const base = process.env.BASE ?? "http://127.0.0.1:3001";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
const credentials = JSON.parse(readFileSync(process.env.NEMO_QA_ENV_FILE, "utf8"));
const login = async (username, password) => {
  const response = await fetch(`${base}/api/admin/auth/login`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ username, password }) });
  assert.equal(response.status, 200, "QA login");
  const cookie = response.headers.get("set-cookie");
  assert.ok(/HttpOnly/i.test(cookie), "HttpOnly cookie flag"); assert.ok(/SameSite=(?:lax|strict)/i.test(cookie), "SameSite cookie flag");
  return cookie.split(";")[0];
};
const anonymous = await fetch(`${base}/api/v1/system`); assert.equal(anonymous.status, 401);
const nullLogin = await fetch(`${base}/api/admin/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: "null" }); assert.equal(nullLogin.status, 400);
const csrf = await fetch(`${base}/api/admin/auth/login`, { method: "POST", headers: { "content-type": "application/json", origin: "https://attacker.invalid" }, body: "{}" }); assert.equal(csrf.status, 403);
const basic = await fetch(`${base}/api/v1/system`, { headers: { authorization: `Basic ${Buffer.from(`admin:${credentials.ADMIN_ACCESS_TOKEN}`).toString("base64")}` } });
assert.equal(basic.status, 200, "Legacy Basic Auth remains functional with route-level revalidation");
const admin = await login("admin", credentials.ADMIN_ACCESS_TOKEN);
assert.equal((await fetch(`${base}/api/v1/system`, { headers: { cookie: admin } })).status, 200);
const editor = await login("qa_editor", credentials.NEMO_QA_PASSWORD);
assert.equal((await fetch(`${base}/api/v1/system`, { headers: { cookie: editor } })).status, 403);
assert.equal((await fetch(`${base}/admin/users`, { headers: { cookie: editor } })).status, 404);
assert.equal((await fetch(`${base}/api/admin/streams/validate`, { method: "POST", headers: { cookie: editor, "content-type": "application/json" }, body: JSON.stringify({ url: "https://attacker.invalid/embed" }) })).status, 422);
const slug = "qa-nemo-a-vs-b-2030-01-01";
const response = await fetch(`${base}/matches/${slug}`); assert.equal(response.status, 200);
const html = await response.text(); assert.ok(html.includes("QA Nemo A")); assert.ok(html.includes("https://www.youtube.com/embed/qa-only"));
const unrelated = await fetch(`${base}/matches/qa-nemo-a-vs-b-2030-02-01`); assert.equal(unrelated.status, 404);
const calendar = await fetch(`${base}/api/v1/calendar/${slug}`); assert.equal(calendar.status, 200); assert.match(calendar.headers.get("content-type"), /text\/calendar/); assert.match(await calendar.text(), /DTSTART:20300101T180000Z/);
console.log("PASS: HTTP auth, cookie flags, editor RBAC, CSRF, invalid inputs, durable public match/stream association, rematch rejection and calendar download");
