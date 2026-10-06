/** The open conversation lives in the URL as ?c=<id> so reloads and the back button work. */
export function parseSelection(search: string): number | null {
  const raw = new URLSearchParams(search).get("c");
  if (!raw || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return id > 0 ? id : null;
}

export function selectionSearch(id: number | null): string {
  return id === null ? "" : `?c=${id}`;
}
