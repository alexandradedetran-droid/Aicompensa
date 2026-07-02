const CONNECTORS = new Set(["de", "da", "do", "dos", "das", "e"]);

function firstAlphaNumeric(input: string): string {
  const match = input.trim().match(/[A-Za-z0-9]/);
  return match?.[0]?.toUpperCase() ?? "";
}

export function getInitials(name?: string): string {
  const trimmed = name?.trim().replace(/\s+/g, " ") ?? "";
  if (!trimmed) return "U";

  const parts = trimmed.split(" ").filter(Boolean);
  const filtered = parts.filter((part) => !CONNECTORS.has(part.toLowerCase()));
  const source = filtered.length > 0 ? filtered : parts;

  const first = firstAlphaNumeric(source[0] ?? "");
  const last = source.length > 1 ? firstAlphaNumeric(source[source.length - 1] ?? "") : "";
  const initials = `${first}${last}`.trim();

  return initials || "U";
}
