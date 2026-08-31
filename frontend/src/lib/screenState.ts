/** Estado de tela em sessionStorage — restaura ao voltar pelo menu */

export function screenStateKey(scope: string) {
  return `medpronto:screen:${scope}`;
}

export function loadScreenState<T>(scope: string): T | null {
  try {
    const raw = sessionStorage.getItem(screenStateKey(scope));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function saveScreenState<T>(scope: string, state: T) {
  try {
    sessionStorage.setItem(screenStateKey(scope), JSON.stringify(state));
  } catch {
    /* quota / privado */
  }
}

export function clearScreenState(scope: string) {
  try {
    sessionStorage.removeItem(screenStateKey(scope));
  } catch {
    /* ignora */
  }
}
