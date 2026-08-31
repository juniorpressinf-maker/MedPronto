import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo, useState } from "react";

export type SortDir = "asc" | "desc";

export function useTableSort<T>(
  rows: T[],
  comparators: Record<string, (a: T, b: T) => number>,
) {
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sortedRows = useMemo(() => {
    if (!sortCol) return rows;
    const cmp = comparators[sortCol];
    if (!cmp) return rows;
    const sorted = [...rows];
    sorted.sort((a, b) => (sortDir === "asc" ? cmp(a, b) : cmp(b, a)));
    return sorted;
  }, [rows, sortCol, sortDir, comparators]);

  const toggleSort = (col: string) => {
    if (sortCol !== col) {
      setSortCol(col);
      setSortDir("asc");
      return;
    }
    setSortDir((d) => (d === "asc" ? "desc" : "asc"));
  };

  return { sortCol, sortDir, sortedRows, toggleSort };
}

type SortableThProps = {
  col: string;
  label: string;
  sortCol: string | null;
  sortDir: SortDir;
  onSort: (col: string) => void;
  className?: string;
  numeric?: boolean;
};

export function SortableTh({
  col,
  label,
  sortCol,
  sortDir,
  onSort,
  className,
  numeric = false,
}: SortableThProps) {
  const ativa = sortCol === col;
  const Icon = !ativa ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
  const ordemLabel = numeric
    ? sortDir === "asc"
      ? "Menor"
      : "Maior"
    : sortDir === "asc"
      ? "Antes"
      : "Depois";

  return (
    <th className={className}>
      <button
        type="button"
        className={`dup-table__th-sort${ativa ? " dup-table__th-sort--ativa" : ""}`}
        onClick={() => onSort(col)}
        title={
          ativa
            ? `Ordenado ${ordemLabel.toLowerCase()} — clique para inverter`
            : `Ordenar por ${label}`
        }
      >
        <Icon className="dup-table__th-sort-ico" aria-hidden />
        <span>{label}</span>
        {ativa && <span className="dup-table__th-sort-ordem">{ordemLabel}</span>}
      </button>
    </th>
  );
}
