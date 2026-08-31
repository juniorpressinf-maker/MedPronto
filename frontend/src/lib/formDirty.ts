/** Compara estado atual com snapshot JSON (baseline após carregar/salvar). */
export function isFormDirty<T>(current: T, baseline: string): boolean {
  return JSON.stringify(current) !== baseline;
}

export function snapshotForm<T>(value: T): string {
  return JSON.stringify(value);
}
