import { LevelDataV0, validateLevelData, parseLevelData } from "./leveldata";

// Helper to fetch posts from Lemmy community
export async function fetchCommunityLevels(): Promise<{ title: string, author: string, level: LevelDataV0 }[]> {
  const apiUrl = "https://lemmy.world/api/v3/post/list?community_name=videosouls";
  const levels: { title: string, author: string, level: LevelDataV0 }[] = [];
  try {
    const resp = await fetch(apiUrl);
    if (!resp.ok) return levels;
    const data = await resp.json();
    if (!Array.isArray(data.posts)) return levels;

    for (const post of data.posts) {
      const body = post?.post?.body ?? "";
      const author = post?.creator?.name ?? "unknown";
      const title = post?.post?.name ?? "";
      const levelStr = extractLevelString(body);
      if (levelStr) {
        try {
          const parsed = parseLevelData(levelStr);
          if (parsed) {
            levels.push({
              title: title + " — by " + author,
              author,
              level: parsed as LevelDataV0
            });
          }
        } catch {}
      }
    }
  } catch (err) {
    // Ignore errors, return empty list
  }
  return levels;
}

// Extracts the level JSON from a post body after a delimiter (e.g. "----")
function extractLevelString(body: string): string | null {
  const delim = body.indexOf("----");
  if (delim === -1) return null;
  // Find the next newline after the delimiter
  const nl = body.indexOf("\n", delim + 4);
  if (nl === -1) return null;
  return body.substring(nl + 1).trim();
}
