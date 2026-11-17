import { Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

type Props<T> = {
  placeholder: string;
  rotulo: string;
  /** Busca os itens. q vazio = lista inicial (ao clicar). Pode ser local ou no servidor. */
  buscar: (q: string) => Promise<T[]> | T[];
  chave: (item: T) => number | string;
  renderItem: (item: T) => ReactNode;
  onEscolher: (item: T) => void;
  /** máximo de itens mostrados */
  limite?: number;
  /** espera antes de buscar enquanto digita (ms) — 0 para busca local */
  espera?: number;
  /** foco ao montar (sem abrir a lista) */
  focar?: boolean;
  rodape?: ReactNode;
  /** Botão ao lado do campo, na mesma linha (ex.: "+ Novo"). */
  acao?: ReactNode;
};

/**
 * Padrão de campo de busca da Agenda Nova (paciente, procedimento…):
 * - CLICAR no campo abre a lista com todos; DIGITAR filtra; ↑↓ navega; Enter escolhe; Esc fecha.
 * - Depois de escolher, a lista FECHA e o campo fica pronto — só reabre com novo clique ou digitação.
 */
export function CampoBusca<T>(props: Props<T>) {
  const { limite = 50, espera = 250 } = props;
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [aberto, setAberto] = useState(false);
  const [itens, setItens] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const buscarRef = useRef(props.buscar);
  buscarRef.current = props.buscar;

  useEffect(() => {
    if (props.focar) inputRef.current?.focus();
    // só ao montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!aberto) return;
    let cancelado = false;
    const t = window.setTimeout(
      async () => {
        setCarregando(true);
        try {
          const lista = await buscarRef.current(q.trim());
          if (!cancelado) {
            setTotal(lista.length);
            setItens(lista.slice(0, limite));
            setAtivo(0);
          }
        } catch {
          if (!cancelado) {
            setItens([]);
            setTotal(0);
          }
        } finally {
          if (!cancelado) setCarregando(false);
        }
      },
      q.trim() ? espera : 0,
    );
    return () => {
      cancelado = true;
      window.clearTimeout(t);
    };
  }, [q, aberto, espera, limite]);

  const escolher = (item: T) => {
    props.onEscolher(item);
    setQ("");
    setAberto(false);
    // Mantém o foco no campo, mas a lista só reabre com novo clique/digitação.
  };

  return (
    <div className="agn-busca">
      <div className="agn-busca__linha">
      <div className="agn-busca__campo">
        <Search className="h-4 w-4 text-[var(--muted)]" aria-hidden />
        <input
          ref={inputRef}
          className="agn-busca__input"
          placeholder={props.placeholder}
          aria-label={props.rotulo}
          role="combobox"
          aria-expanded={aberto}
          aria-controls={`${id}-lista`}
          aria-autocomplete="list"
          value={q}
          onMouseDown={() => setAberto(true)}
          onBlur={() => window.setTimeout(() => setAberto(false), 150)}
          onChange={(e) => {
            setQ(e.target.value);
            setAberto(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              if (!aberto) setAberto(true);
              else setAtivo((i) => Math.min(i + 1, itens.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setAtivo((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && aberto && itens[ativo]) {
              e.preventDefault();
              escolher(itens[ativo]!);
            } else if (e.key === "Escape" && aberto) {
              e.stopPropagation(); // fecha só a lista, não a janela
              setAberto(false);
            }
          }}
        />
        {q && (
          <button
            type="button"
            className="agn-busca__limpar"
            aria-label="Limpar"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setQ("")}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
      {props.acao}
      </div>

      {aberto && (
        <ul id={`${id}-lista`} className="agn-busca__lista" role="listbox">
          {itens.map((item, i) => (
            <li key={props.chave(item)} role="option" aria-selected={i === ativo}>
              <button
                type="button"
                className={`agn-busca__item ${i === ativo ? "agn-busca__item--ativo" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setAtivo(i)}
                onClick={() => escolher(item)}
              >
                {props.renderItem(item)}
              </button>
            </li>
          ))}
          {!carregando && itens.length === 0 && <li className="agn-busca__vazio">Nada encontrado.</li>}
          {carregando && itens.length === 0 && <li className="agn-busca__vazio">Carregando…</li>}
          {total > itens.length && (
            <li className="agn-busca__vazio">
              Mostrando {itens.length} de {total} — digite para filtrar.
            </li>
          )}
        </ul>
      )}
      {props.rodape}
    </div>
  );
}
