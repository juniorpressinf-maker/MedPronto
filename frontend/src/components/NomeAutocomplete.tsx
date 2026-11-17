import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SugestaoCatalogo } from "../lib/api";

const DEBOUNCE_MS = 200;

type Props = {
  value: string;
  onChange: (valor: string) => void;
  /** Escolheu uma sugestão. Se informado, é ELE quem grava o nome (onChange não é chamado). */
  onSelecionar?: (nome: string) => void;
  buscar: (q: string) => Promise<SugestaoCatalogo[]>;
  className?: string;
  placeholder?: string;
  readOnly?: boolean;
  /** Teclas que a lista não usou (ex.: Enter para ir ao próximo exame). */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Saiu do campo (digitou o nome sem escolher na lista). */
  onSair?: (valor: string) => void;
  /** Marca o campo para receber o cursor ao abrir o documento. */
  focoInicial?: boolean;
};

/**
 * Campo de texto com sugestões (medicamento / exame). Continua sendo texto livre:
 * a lista só aparece enquanto digita, já com o 1º encontrado marcado (Enter escolhe;
 * setas ou clique escolhem outro; passar o mouse NÃO muda a marcação). Esc fecha a
 * lista e mantém o texto digitado.
 */
export function NomeAutocomplete({
  value,
  onChange,
  onSelecionar,
  buscar,
  className = "legacy-input w-full",
  placeholder,
  readOnly,
  onKeyDown,
  onSair,
  focoInicial,
}: Props) {
  const [itens, setItens] = useState<SugestaoCatalogo[]>([]);
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(-1);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const buscarRef = useRef(buscar);
  buscarRef.current = buscar;

  // Busca com espera curta, só enquanto a lista está aberta (usuário digitando).
  useEffect(() => {
    const q = value.trim();
    if (!aberto || q.length < 2) {
      setItens([]);
      return;
    }
    let vivo = true;
    const t = setTimeout(() => {
      buscarRef
        .current(q)
        .then((r) => {
          if (vivo) setItens(r);
        })
        .catch(() => {
          if (vivo) setItens([]);
        });
    }, DEBOUNCE_MS);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [value, aberto]);

  // Lista abriu/mudou: o primeiro encontrado já fica marcado (Enter escolhe).
  useEffect(() => setAtivo(itens.length ? 0 : -1), [itens]);

  useEffect(() => {
    if (ativo >= 0) itemRefs.current[ativo]?.scrollIntoView({ block: "nearest" });
  }, [ativo]);

  // Lista em posição fixa (a tabela da receita corta o que passa da borda).
  const mostrar = aberto && itens.length > 0;
  useLayoutEffect(() => {
    if (!mostrar) return;
    const medir = () => {
      const r = inputRef.current?.getBoundingClientRect();
      if (r) setPos({ left: r.left, top: r.bottom + 2, width: Math.min(Math.max(r.width, 460), window.innerWidth - r.left - 16) });
    };
    medir();
    window.addEventListener("scroll", medir, true);
    window.addEventListener("resize", medir);
    return () => {
      window.removeEventListener("scroll", medir, true);
      window.removeEventListener("resize", medir);
    };
  }, [mostrar]);

  const selecionar = (nome: string) => {
    setAberto(false);
    setItens([]);
    if (onSelecionar) onSelecionar(nome);
    else onChange(nome);
  };

  const teclas = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (mostrar) {
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
      if (e.key === "Enter" && ativo >= 0) {
        e.preventDefault();
        selecionar(itens[ativo].nome);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setAberto(false);
        return;
      }
    }
    if (e.key === "Enter" || e.key === "Tab") setAberto(false);
    onKeyDown?.(e);
  };

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        className={className}
        value={value}
        readOnly={readOnly}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          onChange(e.target.value);
          if (!readOnly) setAberto(true);
        }}
        data-foco-inicial={focoInicial ? "" : undefined}
        onBlur={() => {
          setAberto(false);
          if (!readOnly) onSair?.(value);
        }}
        onKeyDown={teclas}
      />
      {mostrar && pos ? (
        <div
          className="nome-autocomplete-lista"
          style={{ position: "fixed", left: pos.left, top: pos.top, width: pos.width, zIndex: 60 }}
          role="listbox"
        >
          {itens.map((item, idx) => (
            <button
              key={item.nome}
              ref={(el) => {
                itemRefs.current[idx] = el;
              }}
              type="button"
              role="option"
              aria-selected={idx === ativo}
              tabIndex={-1}
              className={`nome-sugestao${idx === ativo ? " nome-sugestao--sel" : ""}${
                item.usos > 0 ? " nome-sugestao--usado" : ""
              }`}
              title={item.nome}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selecionar(item.nome)}
            >
              <span className="nome-sugestao__label">{item.nome}</span>
              {item.usos > 0 ? (
                <span className="nome-sugestao__badge" title={`Usado ${item.usos} vez(es)`}>
                  ★ {item.usos}×
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
