import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { api, type Cid10Item } from "../lib/api";

const DEBOUNCE_MS = 200;

type Props = {
  codigo: string;
  descricao: string;
  onChange: (codigo: string, descricao: string) => void;
  disabled?: boolean;
};

export function CidAutocomplete({
  codigo,
  descricao,
  onChange,
  disabled,
}: Props) {
  const [q, setQ] = useState("");
  const [itens, setItens] = useState<Cid10Item[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    setQ(codigo || descricao || "");
  }, [codigo, descricao]);

  useEffect(() => {
    if (!aberto || q.trim().length < 2) {
      setItens([]);
      setAtivo(0);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      setBuscando(true);
      api
        .cid(q.trim())
        .then((r) => {
          if (alive) setItens(r.itens ?? []);
        })
        .catch(() => {
          if (alive) setItens([]);
        })
        .finally(() => {
          if (alive) setBuscando(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, aberto]);

  useEffect(() => {
    setAtivo(0);
  }, [itens]);

  useEffect(() => {
    if (!aberto || itens.length === 0) return;
    const el = itemRefs.current[ativo];
    if (el) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [ativo, itens, aberto]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const selecionar = useCallback(
    (item: Cid10Item) => {
      onChange(item.codigo, item.descricao);
      setQ(`${item.codigo} — ${item.descricao}`);
      setAberto(false);
      inputRef.current?.focus();
    },
    [onChange],
  );

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!aberto || itens.length === 0) {
      if (e.key === "ArrowDown" && itens.length > 0) {
        e.preventDefault();
        setAtivo(0);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAtivo((i) => Math.min(i + 1, itens.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setAtivo((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const item = itens[ativo];
      if (item) selecionar(item);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setAberto(false);
    }
  };

  const onItemKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    idx: number,
  ) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAtivo(Math.min(idx + 1, itens.length - 1));
      inputRef.current?.focus();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setAtivo(Math.max(idx - 1, 0));
      inputRef.current?.focus();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const item = itens[idx];
      if (item) selecionar(item);
    }
  };

  return (
    <div ref={wrapRef} className="relative w-full">
      <label className="prontuario-secao__titulo">CID-10:</label>
      <div className="prontuario-campo">
        <div className="toolbar-search">
          <Search className="toolbar-search__icon" />
          <input
            ref={inputRef}
            className="legacy-input w-full"
            value={q}
            disabled={disabled}
            placeholder="Buscar por código ou descrição (mín. 2 letras)"
            autoComplete="off"
            spellCheck={false}
            onFocus={() => setAberto(true)}
            onKeyDown={onInputKeyDown}
            onChange={(e) => {
              setQ(e.target.value.toUpperCase());
              setAberto(true);
              if (!e.target.value.trim()) onChange("", "");
            }}
          />
        </div>
        {buscando ? (
          <p className="text-xs text-[var(--muted)] mt-2 mb-0">Buscando…</p>
        ) : null}
        {aberto && q.trim().length >= 2 && !buscando && itens.length === 0 ? (
          <p className="text-xs text-[var(--muted)] mt-2 mb-0">
            Nenhum CID encontrado
          </p>
        ) : null}
        {aberto && itens.length > 0 ? (
          <div
            ref={listaRef}
            className="cid-autocomplete-list mt-2 max-h-48 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--panel)] shadow-md"
            role="listbox"
            aria-activedescendant={
              itens[ativo] ? `cid-opt-${itens[ativo].codigo}` : undefined
            }
          >
            {itens.map((item, idx) => (
              <button
                key={item.codigo}
                id={`cid-opt-${item.codigo}`}
                ref={(el) => {
                  itemRefs.current[idx] = el;
                }}
                type="button"
                role="option"
                aria-selected={idx === ativo}
                tabIndex={-1}
                className={`cid-autocomplete-item block w-full text-left px-3 py-2 text-sm border-b border-[var(--border)] last:border-0 ${
                  idx === ativo ? "cid-autocomplete-item--active" : ""
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setAtivo(idx)}
                onClick={() => selecionar(item)}
                onKeyDown={(e) => onItemKeyDown(e, idx)}
              >
                <strong>{item.codigo}</strong> — {item.descricao}
              </button>
            ))}
          </div>
        ) : null}
        {codigo ? (
          <p className="text-sm mt-2 mb-0 text-[var(--muted)]">
            Selecionado: <strong>{codigo}</strong>
            {descricao ? ` — ${descricao}` : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}
