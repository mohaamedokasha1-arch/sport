import { permanentRedirect } from "next/navigation";

/**
 * The old articles screen rendered fabricated demo articles with buttons that
 * did nothing. Editorial articles are now managed for real at
 * /admin/news/manual; keep this URL stable for existing bookmarks.
 */
export default function AdminArticles(): never {
  permanentRedirect("/admin/news/manual");
}
