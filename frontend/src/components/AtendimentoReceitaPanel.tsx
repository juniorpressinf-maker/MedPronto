import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { DocAcoes } from "./DocAcoes";
import { NomeAutocomplete } from "./NomeAutocomplete";

import { ApiError, PdfCancelado, api, type ReceitaItem, type VariacaoPrescricao } from "../lib/api";

import { snapshotForm } from "../lib/formDirty";
import { upperPrompt } from "../lib/upperPrompt";
import { focarCampoInicial } from "../lib/focoInicial";
import { useAutoSalvar } from "../lib/useAutoSalvar";
import { useMessageBox } from "../lib/messageBoxContext";



const ITEM_VAZIO = (): ReceitaItem => ({

  medicamento: "",

  dosagem: "",

  via: "",

  posologia: "",

  quantidade: "",

  duracao_dias: null,

});



/** Linha sem nada digitado (a do fim, sempre presente para digitar). */
const linhaVazia = (i: ReceitaItem) =>
  !i.medicamento.trim() && !i.dosagem && !i.via && !i.posologia && !i.quantidade && i.duracao_dias == null;

/** Sugestões do campo Via (igual ao Clinicar). */
const VIAS = ["ORAL", "SUBLINGUAL", "TÓPICA", "INALATÓRIA", "NASAL", "OFTÁLMICA", "OTOLÓGICA", "RETAL", "VAGINAL", "INTRAMUSCULAR", "SUBCUTÂNEA", "ENDOVENOSA"];

function snapshotReceita(observacoes: string, itens: ReceitaItem[]) {

  return snapshotForm({

    observacoes,

    itens: itens.filter((i) => !linhaVazia(i)).map((i) => ({

      medicamento: i.medicamento,

      dosagem: i.dosagem ?? "",

      via: i.via ?? "",

      posologia: i.posologia ?? "",

      quantidade: i.quantidade ?? "",

      duracao_dias: i.duracao_dias ?? null,

    })),

  });

}



/** Igual ao backend (catalogoNomes.normalizarNomeCatalogo). */
function normalizar(v: string | null | undefined): string {
  return (v ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Igual ao backend: identifica a forma de prescrever (para ocultar/deduplicar). */
function assinaturaVariacao(v: Pick<ReceitaItem, "dosagem" | "via" | "posologia" | "quantidade" | "duracao_dias">): string {
  return [v.dosagem, v.via, v.posologia, v.quantidade, v.duracao_dias == null ? "" : String(v.duracao_dias)]
    .map(normalizar)
    .join("|");
}

/** "1 CP · ORAL · 6/6H · 20 CP · 5 dias" */
function resumoVariacao(v: VariacaoPrescricao): string {
  return [v.dosagem, v.via, v.posologia, v.quantidade, v.duracao_dias ? `${v.duracao_dias} dias` : null]
    .filter((x) => x != null && String(x).trim())
    .join(" · ");
}

type Props = {

  prontuarioId: number;

  pacienteNome: string;

  somenteLeitura?: boolean;

  onConsultaEncerrada?: () => void;

  /** Salvou: o atendimento atualiza a marcação do botão "Receita". */
  onMudou?: () => void;

  onVoltar: () => void;

};



export function AtendimentoReceitaPanel({ prontuarioId, pacienteNome, somenteLeitura = false, onConsultaEncerrada, onMudou, onVoltar }: Props) {

  const msg = useMessageBox();

  const [observacoes, setObservacoes] = useState("");

  const [itens, setItens] = useState<ReceitaItem[]>([ITEM_VAZIO()]);

  const [baseline, setBaseline] = useState("");
  /** Memória de prescrição por linha (aparece ao escolher o medicamento na lista). */
  const [memoria, setMemoria] = useState<Record<number, { nome: string; variacoes: VariacaoPrescricao[] }>>({});
  const [saving, setSaving] = useState(false);
  const [, setSaved] = useState(false);
  const painelRef = useRef<HTMLDivElement>(null);
  /**
   * Igual ao pedido de exames: a linha nova só abre quando o medicamento da última
   * linha fica pronto (escolhido na lista ou ao sair do campo) — não a cada letra.
   */
  const garantirLinhaNova = () => {
    if (somenteLeitura) return;
    setItens((prev) => (prev[prev.length - 1]?.medicamento.trim() ? [...prev, ITEM_VAZIO()] : prev));
  };
  /** Linhas carregadas + uma em branco no fim para o próximo medicamento. */
  const comLinhaFinal = (rows: ReceitaItem[]) =>
    rows.length ? (somenteLeitura ? rows : [...rows, ITEM_VAZIO()]) : [ITEM_VAZIO()];

  useEffect(() => {
    let active = true;
    const vazio = [ITEM_VAZIO()];
    setObservacoes("");
    setItens(vazio);
    setBaseline(snapshotReceita("", vazio));
    setSaved(false);

    void (async () => {
      try {
        const r = await api.receitaGet(prontuarioId);
        if (!active) return;
        const obs = r.receita?.observacoes ?? "";
        const rows = comLinhaFinal(r.itens);
        setObservacoes(obs);
        setItens(rows);
        setBaseline(snapshotReceita(obs, rows));
        setSaved(Boolean(r.receita?.id));
        focarCampoInicial(painelRef.current);
      } catch (e) {
        if (!active) return;
        void msg.error(e instanceof ApiError ? e.message : "Erro ao carregar receita");
      }
    })();

    return () => {
      active = false;
    };
  }, [prontuarioId, msg]);



  const dirty = useMemo(

    () => snapshotReceita(observacoes, itens) !== baseline,

    [observacoes, itens, baseline],

  );



  const salvar = async (silencioso = false): Promise<boolean> => {

    const validos = itens.filter((i) => i.medicamento.trim());

    if (!validos.length) {

      if (!silencioso) void msg.warning("Informe ao menos um medicamento");

      return false;

    }

    if (!silencioso) setSaving(true);

    try {

      await api.receitaSave(prontuarioId, { observacoes, itens: validos });
      if (silencioso) {
        // Automático: não recarrega (não mexe no que o médico está digitando).
        setBaseline(snapshotReceita(observacoes, itens));
        setSaved(true);
        onMudou?.();
        return true;
      }

      onMudou?.();
      const r = await api.receitaGet(prontuarioId);
      const obs = r.receita?.observacoes ?? "";
      const rows = comLinhaFinal(r.itens);
      setObservacoes(obs);
      setItens(rows);
      setBaseline(snapshotReceita(obs, rows));
      setSaved(Boolean(r.receita?.id));
      return true;

    } catch (e) {

      if (e instanceof ApiError && e.status === 409) {
        if (!silencioso) void msg.warning(e.message);
        onConsultaEncerrada?.();
        return false;
      }

      if (!silencioso) void msg.error(e instanceof ApiError ? e.message : "Erro ao salvar");

    } finally {

      setSaving(false);

    }

    return false;
  };

  // Salva sozinho (1,5 s após digitar e ao sair); o botão Salvar vira indicador.
  const indicadorSalvo = useAutoSalvar({
    chave: JSON.stringify(snapshotReceita(observacoes, itens)),
    dirty,
    desligado: somenteLeitura,
    salvar,
  });

  const imprimir = async () => {
    try {
      // Com alteração não salva: salva antes (o PDF sai do que está gravado).
      // Abre direto a janela da impressora (igual ao Clinicar).
      await api.receitaImprimir(
        prontuarioId,
        dirty
          ? async () => {
              if (!(await salvar())) throw new PdfCancelado();
            }
          : undefined,
      );
    } catch (e) {
      if (e instanceof PdfCancelado) return;
      void msg.error(e instanceof ApiError ? e.message : "Erro ao gerar PDF");
    }
  };



  const setItem = (idx: number, patch: Partial<ReceitaItem>) => {
    const upperPatch = { ...patch };
    for (const key of [
      "medicamento",
      "dosagem",
      "via",
      "posologia",
      "quantidade",
    ] as const) {
      if (typeof upperPatch[key] === "string") {
        upperPatch[key] = upperPrompt(upperPatch[key]!);
      }
    }
    setItens((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, ...upperPatch } : row)),
    );
  };



  /** Preenche dose/via/posologia/qtd/dias com a forma lembrada (só campos vazios, salvo `forcar`). */
  const aplicarVariacao = (idx: number, v: VariacaoPrescricao, forcar: boolean, nome?: string) => {
    setItens((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        // Resposta chegou depois de excluir/trocar a linha: não preenche remédio errado.
        if (nome != null && normalizar(row.medicamento) !== normalizar(nome)) return row;
        const vazio = (x: unknown) => x == null || x === "";
        const pega = <T,>(atual: T, novo: T) => (forcar || vazio(atual) ? novo ?? atual : atual);
        return {
          ...row,
          dosagem: pega(row.dosagem, v.dosagem ?? ""),
          via: pega(row.via, v.via ?? ""),
          posologia: pega(row.posologia, v.posologia ?? ""),
          quantidade: pega(row.quantidade, v.quantidade ?? ""),
          duracao_dias: pega(row.duracao_dias, v.duracao_dias),
        };
      }),
    );
  };

  /** Escolheu o medicamento na lista: grava o nome e busca a memória do médico. */
  const escolherMedicamento = async (idx: number, nome: string) => {
    setItem(idx, { medicamento: nome });
    garantirLinhaNova();
    await buscarMemoria(idx, upperPrompt(nome));
  };

  /** Saiu do campo após digitar o nome (sem clicar na lista): busca a memória se a linha está vazia. */
  const sairMedicamento = (idx: number, row: ReceitaItem, valor: string) => {
    const nome = valor.trim();
    if (nome) garantirLinhaNova();
    if (nome.length < 2 || memoria[idx]?.nome === nome) return;
    const vazia = !row.dosagem && !row.via && !row.posologia && !row.quantidade && row.duracao_dias == null;
    if (vazia) void buscarMemoria(idx, nome);
  };

  const buscarMemoria = async (idx: number, nome: string) => {
    setMemoria((m) => ({ ...m, [idx]: { nome, variacoes: [] } }));
    let doServidor: VariacaoPrescricao[] = [];
    let ocultas = new Set(ocultasTela.current.get(normalizar(nome)) ?? []);
    try {
      const r = await api.receitaMemoria(prontuarioId, nome);
      doServidor = r.variacoes;
      ocultas = new Set([...ocultas, ...r.ocultas]);
    } catch {
      /* sem memória do servidor: usa só as linhas da tela */
    }
    // Mesmo remédio em outra linha DESTA receita (ainda que não salva): vale primeiro.
    // O que o médico excluiu (×) não volta, nem vindo das linhas da tela.
    const locais: VariacaoPrescricao[] = itens
      .filter((r, i) => i !== idx && normalizar(r.medicamento) === normalizar(nome))
      .map((r) => ({
        assinatura: assinaturaVariacao(r),
        dosagem: r.dosagem ?? null,
        via: r.via ?? null,
        posologia: r.posologia ?? null,
        quantidade: r.quantidade ?? null,
        duracao_dias: r.duracao_dias ?? null,
        usos: 1,
      }))
      .filter((v) => v.assinatura.replace(/\|/g, "") && !ocultas.has(v.assinatura));
    const vistas = new Set(locais.map((v) => v.assinatura));
    const todas = [
      ...locais.filter((v, i) => locais.findIndex((x) => x.assinatura === v.assinatura) === i),
      ...doServidor.filter((v) => !vistas.has(v.assinatura) && !ocultas.has(v.assinatura)),
    ].slice(0, 3);
    setMemoria((m) => (m[idx]?.nome === nome ? { ...m, [idx]: { nome, variacoes: todas } } : m));
    if (todas[0]) aplicarVariacao(idx, todas[0], false, nome);
  };

  /** Variações excluídas (×) nesta tela, por medicamento — vale até o servidor responder. */
  const ocultasTela = useRef(new Map<string, Set<string>>());

  const ocultarVariacao = async (idx: number, v: VariacaoPrescricao) => {
    const mem = memoria[idx];
    if (!mem) return;
    try {
      await api.receitaMemoriaOcultar(prontuarioId, mem.nome, v.assinatura);
      const chave = normalizar(mem.nome);
      const set = ocultasTela.current.get(chave) ?? new Set<string>();
      set.add(v.assinatura);
      ocultasTela.current.set(chave, set);
      setMemoria((m) =>
        m[idx]
          ? { ...m, [idx]: { ...m[idx], variacoes: m[idx].variacoes.filter((x) => x.assinatura !== v.assinatura) } }
          : m,
      );
      // Se a linha está preenchida justamente com a forma excluída, limpa (senão ela é salva de novo).
      setItens((prev) =>
        prev.map((row, i) =>
          i === idx && normalizar(row.medicamento) === chave && assinaturaVariacao(row) === v.assinatura
            ? { ...row, dosagem: "", via: "", posologia: "", quantidade: "", duracao_dias: null }
            : row,
        ),
      );
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao ocultar sugestão");
    }
  };

  return (
    <div className="doc-painel receita receita-panel" ref={painelRef}>
      <header className="doc-painel__topo">
        <h2>Receituário</h2>
        <span>{pacienteNome}</span>
      </header>
      {somenteLeitura ? <p className="doc-aviso">Consulta finalizada: receita só para leitura e impressão.</p> : null}
      <datalist id={`receita-vias-${prontuarioId}`}>
        {VIAS.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <div className="dup-table-wrap receita__tabela receita-panel__tabela">
        <table className="data-table receita__table">
          <thead>
            <tr>
              <th className="th-sem-ord">Medicamento</th>
              <th className="th-sem-ord">Dose</th>
              <th className="th-sem-ord">Via</th>
              <th className="th-sem-ord">Posologia</th>
              <th className="th-sem-ord">Qtd</th>
              <th className="th-sem-ord">Dias</th>
              {!somenteLeitura ? <th className="th-sem-ord" /> : null}
            </tr>
          </thead>
          <tbody>
            {itens.map((row, idx) => (
              <Fragment key={idx}>
                <tr>
                  <td className="receita__col-medicamento">
                    <NomeAutocomplete
                      value={row.medicamento}
                      readOnly={somenteLeitura}
                      placeholder="Digite o medicamento"
                      buscar={(q) => api.receitaSugestoes(prontuarioId, q).then((r) => r.itens)}
                      onChange={(v) => setItem(idx, { medicamento: v })}
                      onSelecionar={(nome) => void escolherMedicamento(idx, nome)}
                      onSair={(v) => sairMedicamento(idx, row, v)}
                      focoInicial={idx === 0}
                    />
                  </td>
                  <td>
                    <input
                      className="legacy-input w-full"
                      value={row.dosagem ?? ""}
                      readOnly={somenteLeitura}
                      placeholder="1 CP"
                      onChange={(e) => setItem(idx, { dosagem: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="legacy-input w-full"
                      list={`receita-vias-${prontuarioId}`}
                      value={row.via ?? ""}
                      readOnly={somenteLeitura}
                      onChange={(e) => setItem(idx, { via: e.target.value })}
                    />
                  </td>
                  <td className="receita__col-posologia">
                    <input
                      className="legacy-input w-full"
                      value={row.posologia ?? ""}
                      readOnly={somenteLeitura}
                      placeholder="DE 8/8 HORAS"
                      onChange={(e) => setItem(idx, { posologia: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="legacy-input w-full"
                      value={row.quantidade ?? ""}
                      readOnly={somenteLeitura}
                      placeholder="1 CX"
                      onChange={(e) => setItem(idx, { quantidade: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      className="legacy-input w-full min-w-0"
                      value={row.duracao_dias ?? ""}
                      readOnly={somenteLeitura}
                      onChange={(e) => setItem(idx, { duracao_dias: e.target.value ? Number(e.target.value) : null })}
                    />
                  </td>
                  {!somenteLeitura ? (
                    <td>
                      {idx === itens.length - 1 && linhaVazia(row) ? null : (
                        <button
                          type="button"
                          className="btn btn-sm"
                          title="Remover"
                          onClick={() => {
                            setItens((prev) => prev.filter((_, i) => i !== idx));
                            setMemoria({});
                          }}
                        >
                          ×
                        </button>
                      )}
                    </td>
                  ) : null}
                </tr>
                {!somenteLeitura && memoria[idx]?.variacoes.length ? (
                  <tr className="receita__memoria">
                    <td colSpan={7}>
                      <span className="receita__memoria-titulo">Como você costuma receitar:</span>
                      {memoria[idx].variacoes.map((v) => (
                        <span key={v.assinatura} className="receita__memoria-chip">
                          <button type="button" title="Usar esta forma" onClick={() => aplicarVariacao(idx, v, true)}>
                            {resumoVariacao(v)}
                            {v.usos > 1 ? <small> ({v.usos}×)</small> : null}
                          </button>
                          <button
                            type="button"
                            className="receita__memoria-ocultar"
                            title="Não sugerir mais esta forma"
                            onClick={() => void ocultarVariacao(idx, v)}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <label className="doc-rotulo" htmlFor={`receita-obs-${prontuarioId}`}>
        Observações da receita <small>(saem no fim da receita impressa)</small>
      </label>
      <textarea
        id={`receita-obs-${prontuarioId}`}
        className="doc-area"
        rows={3}
        placeholder="Ex.: tomar após as refeições; retornar em 15 dias…"
        value={observacoes}
        readOnly={somenteLeitura}
        onChange={(e) => setObservacoes(upperPrompt(e.target.value))}
      />
      <DocAcoes indicador={indicadorSalvo} saving={saving} onVoltar={onVoltar} onImprimir={() => void imprimir()} />
    </div>
  );
}
