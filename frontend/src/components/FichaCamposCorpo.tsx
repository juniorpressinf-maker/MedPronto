import { Search } from "lucide-react";
import { useState } from "react";
import { CidAutocomplete } from "./CidAutocomplete";
import type { FichaCampoDef } from "../lib/fichaTipos";
import { rotuloOpcaoEscolha } from "../lib/asoModelo";
import "../ficha-folha.css";

export type FichaPreviewDados = Record<string, unknown>;

const RETORNO_PRESETS = [7, 15, 30, 60, 90] as const;

type Props = {
  campos: FichaCampoDef[];
  readOnly?: boolean;
  dados?: FichaPreviewDados;
  onDadosChange?: (dados: FichaPreviewDados) => void;
};

function getStr(dados: FichaPreviewDados, id: string): string {
  const v = dados[id];
  return typeof v === "string" ? v : "";
}

export function FichaCamposCorpo({
  campos,
  readOnly = true,
  dados: dadosProp,
  onDadosChange,
}: Props) {
  const [local, setLocal] = useState<FichaPreviewDados>({});
  const dados = dadosProp ?? local;

  function set(id: string, value: unknown) {
    const next = { ...dados, [id]: value };
    if (onDadosChange) onDadosChange(next);
    else setLocal(next);
  }

  function toggleOpcao(id: string, opcao: string) {
    const cur = Array.isArray(dados[id]) ? (dados[id] as string[]) : [];
    const next = cur.includes(opcao)
      ? cur.filter((x) => x !== opcao)
      : [...cur, opcao];
    set(id, next);
  }

  const ordenados = [...campos].sort((a, b) => a.ordem - b.ordem);

  if (ordenados.length === 0) {
    return (
      <p className="ficha-folha__aviso" style={{ marginTop: "0.5rem" }}>
        Nenhum campo definido — adicione campos ao formulário.
      </p>
    );
  }

  return (
    <div className="prontuario-corpo">
      {ordenados.map((c) => {
        if (c.tipo === "textarea") {
          return (
            <section key={c.id} className="prontuario-secao">
              <label className="prontuario-secao__titulo">{c.label}</label>
              <div className="prontuario-campo prontuario-campo--linhas">
                <textarea
                  className="prontuario-secao__area"
                  rows={3}
                  readOnly={readOnly}
                  value={getStr(dados, c.id)}
                  onChange={(e) => set(c.id, e.target.value)}
                  placeholder="…"
                />
              </div>
            </section>
          );
        }

        if (c.tipo === "text") {
          return (
            <section key={c.id} className="prontuario-linha">
              <span className="prontuario-linha__rotulo">{c.label}</span>
              <input
                type="text"
                className="prontuario-linha__valor prontuario-linha__input"
                readOnly={readOnly}
                value={getStr(dados, c.id)}
                onChange={(e) => set(c.id, e.target.value)}
              />
            </section>
          );
        }

        if (c.tipo === "busca") {
          return (
            <section key={c.id} className="prontuario-secao">
              <label className="prontuario-secao__titulo">{c.label}</label>
              <div className="ficha-folha__busca-wrap">
                <Search size={15} className="ficha-folha__busca-icone" aria-hidden />
                <input
                  type="search"
                  className="prontuario-admissional-input w-full"
                  readOnly={readOnly}
                  placeholder={c.placeholder ?? "Digite para buscar…"}
                  value={getStr(dados, c.id)}
                  onChange={(e) => set(c.id, e.target.value)}
                />
              </div>
            </section>
          );
        }

        if (c.tipo === "sim_nao") {
          const v = dados[c.id] as string | null | undefined;
          return (
            <section key={c.id} className="prontuario-secao">
              <label className="prontuario-secao__titulo">{c.label}</label>
              <div className="ficha-folha__sim-nao">
                {(
                  [
                    ["sim", "Sim"],
                    ["nao", "Não"],
                    ["ni", "N.I."],
                  ] as const
                ).map(([val, lbl]) => (
                  <button
                    key={val}
                    type="button"
                    className={`ficha-folha__sim-nao-btn ${v === val ? "ficha-folha__sim-nao-btn--ativo" : ""}`}
                    disabled={readOnly}
                    onClick={() => set(c.id, val)}
                  >
                    {lbl}
                  </button>
                ))}
                {!readOnly ? (
                  <button
                    type="button"
                    className="ficha-folha__sim-nao-btn"
                    onClick={() => set(c.id, null)}
                  >
                    Limpar
                  </button>
                ) : null}
              </div>
            </section>
          );
        }

        if (c.tipo === "escolha") {
          const v = getStr(dados, c.id);
          const opcoes = c.opcoes ?? [];
          return (
            <section key={c.id} className="prontuario-secao">
              <label className="prontuario-secao__titulo">{c.label}</label>
              <div className="ficha-folha__escolha" role="radiogroup" aria-label={c.label}>
                {opcoes.map((op) => (
                  <label key={`${c.id}-${op}`} className="ficha-folha__escolha-opcao">
                    <input
                      type="radio"
                      name={c.id}
                      disabled={readOnly}
                      checked={v === op}
                      onChange={() => set(c.id, op)}
                    />
                    <span>{rotuloOpcaoEscolha(op)}</span>
                  </label>
                ))}
              </div>
            </section>
          );
        }

        if (c.tipo === "marcadores" || (c.tipo === "checkbox" && c.opcoes?.length)) {
          const sel = Array.isArray(dados[c.id]) ? (dados[c.id] as string[]) : [];
          const opcoes = c.opcoes ?? [];
          return (
            <section key={c.id} className="prontuario-secao">
              <label className="prontuario-secao__titulo">{c.label}</label>
              <div className="ficha-folha__marcadores" role="group" aria-label={c.label}>
                {opcoes.map((op, idx) => (
                  <label
                    key={`${c.id}-${idx}-${op}`}
                    className="prontuario-admissional-check ficha-folha__marcador"
                  >
                    <input
                      type="checkbox"
                      disabled={readOnly}
                      checked={sel.includes(op)}
                      onChange={() => toggleOpcao(c.id, op)}
                    />
                    <span>{op}</span>
                  </label>
                ))}
              </div>
            </section>
          );
        }

        if (c.tipo === "checkbox") {
          const checked = dados[c.id] === true;
          return (
            <section key={c.id} className="prontuario-secao">
              <label className="prontuario-admissional-check">
                <input
                  type="checkbox"
                  disabled={readOnly}
                  checked={checked}
                  onChange={(e) => set(c.id, e.target.checked)}
                />
                <span className="prontuario-secao__titulo mb-0">{c.label}</span>
              </label>
            </section>
          );
        }

        if (c.tipo === "cid") {
          const cid = dados[c.id] as { codigo?: string; descricao?: string } | undefined;
          return (
            <section key={c.id} className="prontuario-secao prontuario-secao--cid">
              <CidAutocomplete
                codigo={cid?.codigo ?? ""}
                descricao={cid?.descricao ?? ""}
                disabled={readOnly}
                onChange={(codigo, descricao) => set(c.id, { codigo, descricao })}
              />
            </section>
          );
        }

        if (c.tipo === "retorno") {
          const dias = typeof dados[c.id] === "number" ? (dados[c.id] as number) : null;
          if (readOnly) {
            const texto = dias != null ? `${dias} dias` : "Sem retorno";
            return (
              <section key={c.id} className="prontuario-secao">
                <label className="prontuario-secao__titulo">{c.label}</label>
                <p
                  className={
                    dias != null
                      ? "prontuario-retorno__leitura"
                      : "prontuario-retorno__leitura prontuario-retorno__leitura--vazio"
                  }
                >
                  {texto}
                </p>
              </section>
            );
          }
          return (
            <section key={c.id} className="prontuario-secao">
              <label className="prontuario-secao__titulo">{c.label}</label>
              <p className="prontuario-retorno__hint">
                Prazo para retorno sem nova consulta.
              </p>
              <div className="prontuario-retorno__presets">
                {RETORNO_PRESETS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`btn btn-primary ${dias === d ? "ring-2 ring-[var(--accent)]" : ""}`}
                    disabled={readOnly}
                    onClick={() => set(c.id, d)}
                  >
                    {d} dias
                  </button>
                ))}
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={readOnly}
                  onClick={() => set(c.id, null)}
                >
                  Sem retorno
                </button>
              </div>
            </section>
          );
        }

        return null;
      })}
    </div>
  );
}
