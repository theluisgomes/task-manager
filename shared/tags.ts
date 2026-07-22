/** Parse stored tags (JSON array or comma-separated text) into a normalized list. */
export function parseTags(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];

  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return dedupeTags(parsed.map((t) => String(t).trim()).filter(Boolean));
      }
    } catch {
      // fall through to comma-separated parsing
    }
  }

  return dedupeTags(trimmed.split(",").map((t) => t.trim()).filter(Boolean));
}

/** Serialize tags for DB storage as a JSON array, or null when empty. */
export function serializeTags(tags: string[]): string | null {
  const normalized = dedupeTags(tags.map((t) => t.trim()).filter(Boolean));
  return normalized.length > 0 ? JSON.stringify(normalized) : null;
}

function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    const key = tag.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(tag);
    }
  }
  return result;
}
