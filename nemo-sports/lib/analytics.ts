/** Google Analytics property supplied for nemo-sports.vercel.app. */
export const GOOGLE_ANALYTICS_ID = "G-5JK3THCSMV";
export const GOOGLE_ANALYTICS_SCRIPT_URL =
  `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}`;

export const GOOGLE_ANALYTICS_INIT = `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GOOGLE_ANALYTICS_ID}');`;

/** Only the Google hosts needed to load gtag and send GA4 events. */
export const GOOGLE_ANALYTICS_SCRIPT_HOST = "https://www.googletagmanager.com";
export const GOOGLE_ANALYTICS_CONNECT_HOSTS = [
  "https://*.google-analytics.com",
  "https://*.analytics.google.com",
  "https://www.googletagmanager.com",
] as const;
