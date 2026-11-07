/** JSON re-indented with two spaces, or null when it does not parse. */
export function prettyJson(content: string): string | null {
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return null;
  }
}
