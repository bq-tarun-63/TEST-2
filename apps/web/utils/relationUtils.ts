export type RelationValue = string | { noteId?: string; id?: string } | Array<string | { noteId?: string; id?: string } | null | undefined> | null | undefined;

export function getRelationIdsFromValue(
  value: RelationValue,
  relationLimit: "single" | "multiple" = "multiple",
): string[] {
  if (value === null || value === undefined || value === "") {
    return [];
  }

  const items = Array.isArray(value) ? value : [value];
  const ids = items
    .map((item) => {
      if (!item) return null;
      if (typeof item === "string") {
        const trimmed = item.trim();
        return trimmed ? trimmed : null;
      }
      if (typeof item === "object") {
        const idValue = ("noteId" in item ? item.noteId : ("id" in item ? item.id : null));
        if (idValue) {
          const id = String(idValue).trim();
          return id ? id : null;
        }
      }
      return null;
    })
    .filter((id): id is string => !!id);

  if (relationLimit === "single") {
    return ids.length > 0 ? [ids[0]!] : [];
  }

  return ids;
}

