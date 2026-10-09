import { textSimilarity } from "./dedup";
import type { NewsArticle } from "./types";
/** Presentation-only grouping in the loaded window; never deletes source
 * records or treats similarity as corroboration of a factual claim. */
export function groupSimilarStories(articles: NewsArticle[]): NewsArticle[][] {
  const groups: NewsArticle[][] = [];
  for (const article of articles) {
    const group = groups.find(([lead]) => lead.publicationDate.slice(0, 10) === article.publicationDate.slice(0, 10) && textSimilarity(lead.title, article.title) >= 88);
    if (group) group.push(article);
    else groups.push([article]);
  }
  return groups;
}
