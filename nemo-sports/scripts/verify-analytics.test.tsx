import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import GoogleAnalytics from "@/components/analytics/GoogleAnalytics";
import { GOOGLE_ANALYTICS_ID, GOOGLE_ANALYTICS_INIT } from "@/lib/analytics";
import { contentSecurityPolicy } from "@/lib/security-csp";

test("the head renders the supplied async Google tag and initializer once", () => {
  const html = renderToStaticMarkup(<head><GoogleAnalytics /></head>);
  assert.ok(html.includes('<script async="" src="https://www.googletagmanager.com/gtag/js?id=G-5JK3THCSMV"></script>'));
  assert.ok(html.includes(`<script>${GOOGLE_ANALYTICS_INIT}</script>`));
  assert.equal((html.match(/<script\b/g) ?? []).length, 2);
});

test("initialization preserves the data layer and queues js/config commands", () => {
  const dataLayer: unknown[] = ["existing event"];
  const context = { window: { dataLayer }, dataLayer };
  runInNewContext(GOOGLE_ANALYTICS_INIT, context);
  assert.equal(context.window.dataLayer, dataLayer);
  assert.equal(dataLayer[0], "existing event");
  assert.deepEqual(Array.from(dataLayer[1] as ArrayLike<unknown>).slice(0, 1), ["js"]);
  assert.deepEqual(Array.from(dataLayer[2] as ArrayLike<unknown>), ["config", GOOGLE_ANALYTICS_ID]);
  const freshContext = { window: {} };
  runInNewContext(`Object.defineProperty(this, 'dataLayer', { get: () => window.dataLayer });\n${GOOGLE_ANALYTICS_INIT}`, freshContext);
  assert.equal((freshContext.window as { dataLayer: unknown[] }).dataLayer.length, 2);
});

test("both language roots use the shared shell with Analytics first in its head", () => {
  for (const locale of ["ar", "en"]) {
    const layout = readFileSync(`app/(${locale})/layout.tsx`, "utf8");
    assert.ok(layout.includes('<RootShell locale='));
  }
  const shell = readFileSync("components/layout/RootShell.tsx", "utf8");
  assert.match(shell, /<head>\s*<GoogleAnalytics \/>/);
  assert.equal((shell.match(/<GoogleAnalytics \/>/g) ?? []).length, 1);
});

test("development and production CSP allow GA4 without weakening other directives", () => {
  const previous = process.env.NEXT_PUBLIC_ADS_ENABLED;
  try {
    process.env.NEXT_PUBLIC_ADS_ENABLED = "0";
    for (const dev of [false, true]) {
      const directives = new Map(contentSecurityPolicy(dev).split("; ").map((directive) => {
        const [name, ...sources] = directive.split(" ");
        return [name, sources];
      }));
      assert.ok(directives.get("script-src")?.includes("https://www.googletagmanager.com"));
      for (const host of ["https://*.google-analytics.com", "https://*.analytics.google.com", "https://www.googletagmanager.com"]) {
        assert.ok(directives.get("connect-src")?.includes(host));
      }
      assert.equal(directives.get("script-src")?.includes("'unsafe-eval'"), dev);
      assert.deepEqual(directives.get("frame-ancestors"), ["'none'"]);
      assert.deepEqual(directives.get("object-src"), ["'none'"]);
    }
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_ADS_ENABLED;
    else process.env.NEXT_PUBLIC_ADS_ENABLED = previous;
  }
});
