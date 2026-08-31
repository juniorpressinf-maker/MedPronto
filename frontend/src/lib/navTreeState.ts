export type NavTreeOpenMap = Record<string, boolean>;

const STORAGE_KEY = "medpronto.navTreeOpen";

export function loadNavTreeOpen(): NavTreeOpenMap {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as NavTreeOpenMap;
  } catch {
    return {};
  }
}

export function saveNavTreeOpen(map: NavTreeOpenMap): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function navBranchKey(parentKey: string | null, label: string): string {
  return parentKey ? `${parentKey}::${label}` : label;
}
