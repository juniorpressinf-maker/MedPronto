import { useEffect, useMemo, useRef, useState } from "react";
import { CidAutocomplete } from "./CidAutocomplete";
import { DocAcoes } from "./DocAcoes";
import { NomeAutocomplete } from "./NomeAutocomplete";
import { ApiError, PdfCancelado, api, type PedidoExame } from "../lib/api";
import { upperPrompt } from "../lib/upperPrompt";
import {
  CATEGORIA_EXAME_LABEL,
  categoriaExame,
  chaveExame,
  separarPedido,
  type CategoriaExame,
} from "../lib/classificacaoDocs";
import { useAutoSalvar } from "../lib/useAutoSalvar";
import { useMessageBox } from "../lib/messageBoxContext";

type Props = {
  prontuarioId: number;
  pacienteNome: string;
  somenteLeitura?: boolean;
  onConsultaEncerrada?: () => void;
  /** Salvou: o atendimento atualiza a marcação do botão "Pedido exame". */
  onMudou?: () => void;
  onVoltar: () => void;
};

const VAZIO = (): PedidoExame => ({
  exames_solicitados: "",
  observacoes: "",
  observacoes_imagem: "",
  cid_codigo: "",
  cid_descricao: "",
});

/** Linhas em branco não contam como alteração. */
const snapshot = (f: PedidoExame) =>
  JSON.stringify([
    f.exames_solicitados.split("\n").map((l) => l.trim()).filter(Boolean).join("\n"),
    f.observacoes ?? "",
    f.observacoes_imagem ?? "",
    f.cid_codigo ?? "",
  ]);

/** O que vai para o servidor: um exame por linha, sem linhas vazias. */
const paraSalvar = (f: PedidoExame): PedidoExame => ({
  ...f,
  exames_solicitados: f.exames_solicitados
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n"),
});

/** Pedido de exames (igual ao Clinicar): um exame por linha numerada, busca automática (TUSS), CID. */
export function AtendimentoPedidoPanel({
  prontuarioId,
  pacienteNome,
  somenteLeitura = false,
  onConsultaEncerrada,
  onMudou,
  onVoltar,
}: Props) {
  const msg = useMessageBox();
  const [form, setForm] = useState<PedidoExame>(VAZIO);
  const [linhas, setLinhas] = useState<string[]>([""]);
  const [baseline, setBaseline] = useState("");
  const [saving, setSaving] = useState(false);
  const listaRef = useRef<HTMLDivElement>(null);
  /** Categoria corrigida pelo médico (lab / imagem), por exame. */
  const [correcoes, setCorrecoes] = useState<Record<string, CategoriaExame>>({});
  const focoApos = useRef<number | null>(null);

  const focarLinha = (i: number) =>
    requestAnimationFrame(() => {
      const el = listaRef.current?.querySelectorAll<HTMLInputElement>(".pedido__input")[i];
      el?.focus();
      el?.select();
    });

  useEffect(() => {
    if (focoApos.current == null) return;
    const i = focoApos.current;
    focoApos.current = null;
    focarLinha(i);
  }, [linhas]);

  useEffect(() => {
    api
      .pedidoExameCategorias(prontuarioId)
      .then((r) => setCorrecoes(r.correcoes))
      .catch(() => undefined);
  }, [prontuarioId]);

  /** Troca laboratório ⇄ imagem do exame: vale para este pedido e os próximos. */
  const trocarCategoria = async (nome: string) => {
    const nova: CategoriaExame = categoriaExame(nome, correcoes) === "lab" ? "imagem" : "lab";
    setCorrecoes((c) => ({ ...c, [chaveExame(nome)]: nova }));
    try {
      const r = await api.pedidoExameCategoriaSalvar(prontuarioId, nome, nova);
      setCorrecoes(r.correcoes);
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao trocar a categoria");
    }
  };

  const folhas = useMemo(
    () => separarPedido(linhas.map((l) => l.trim()).filter(Boolean), correcoes),
    [linhas, correcoes],
  );

  useEffect(() => {
    let vivo = true;
    setForm(VAZIO());
    setLinhas([""]);
    setBaseline("");
    void (async () => {
      try {
        const r = await api.pedidoExameGet(prontuarioId);
        if (!vivo) return;
        const p = r.pedido ?? VAZIO();
        setForm(p);
        // sempre uma linha em branco no fim para o próximo exame
        setLinhas(p.exames_solicitados ? [...p.exames_solicitados.split(/\r?\n/), ""] : [""]);
        setBaseline(snapshot(p));
        focarLinha(0);
      } catch (e) {
        if (vivo) void msg.error(e instanceof ApiError ? e.message : "Erro ao carregar o pedido");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [prontuarioId, msg]);

  const atualizarLinhas = (novas: string[]) => {
    if (somenteLeitura) return;
    const n = novas.length ? novas : [""];
    setLinhas(n);
    setForm((f) => ({ ...f, exames_solicitados: n.join("\n") }));
  };

  /** Enter/escolha na lista: vai para a próxima linha vazia (cria uma se precisar). */
  const avancar = (idx: number, base: string[] = linhas) => {
    let b = base;
    if (b[b.length - 1]?.trim()) b = [...b, ""];
    const vazio = b.findIndex((l, i) => i > idx && !l.trim());
    if (vazio >= 0) {
      if (b !== linhas) atualizarLinhas(b);
      focoApos.current = vazio;
      if (b === linhas) focarLinha(vazio);
      return;
    }
    const next = [...b];
    next.splice(idx + 1, 0, "");
    focoApos.current = idx + 1;
    atualizarLinhas(next);
  };

  const dirty = useMemo(() => baseline !== "" && snapshot(form) !== baseline, [form, baseline]);

  const salvar = async (silencioso = false): Promise<boolean> => {
    if (somenteLeitura) return false;
    const dados = paraSalvar(form);
    if (!dados.exames_solicitados.trim()) {
      if (!silencioso) void msg.warning("Informe os exames solicitados.");
      return false;
    }
    if (!silencioso) setSaving(true);
    try {
      await api.pedidoExameSave(prontuarioId, dados);
      setBaseline(snapshot(form));
      onMudou?.();
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        if (!silencioso) void msg.warning(e.message);
        onConsultaEncerrada?.();
        return false;
      }
      if (!silencioso) void msg.error(e instanceof ApiError ? e.message : "Erro ao salvar o pedido");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const indicador = useAutoSalvar({ chave: snapshot(form), dirty, desligado: somenteLeitura, salvar });

  const imprimir = async () => {
    try {
      // Com alteração não salva: salva antes (o PDF sai do que está gravado).
      // Abre direto a janela da impressora (igual ao Clinicar).
      await api.pedidoExameImprimir(
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

  return (
    <div className="doc-painel pedido">
      <header className="doc-painel__topo">
        <h2>Pedido de exames</h2>
        <span>{pacienteNome}</span>
      </header>
      {somenteLeitura ? <p className="doc-aviso">Consulta finalizada: pedido só para leitura e impressão.</p> : null}
      <label className="doc-rotulo">
        Exames solicitados <small>(Enter vai para o próximo)</small>
      </label>
      <div className="pedido__lista" ref={listaRef}>
        {linhas.map((linha, idx) => (
          <div key={idx} className="pedido__linha">
            <span className="pedido__n">{idx + 1}.</span>
            <NomeAutocomplete
              className="pedido__input"
              value={linha}
              readOnly={somenteLeitura}
              placeholder={idx === 0 ? "Digite o exame (ex.: HEMOGRAMA)" : `Exame ${idx + 1}`}
              buscar={(q) => api.pedidoExameSugestoes(prontuarioId, q).then((r) => r.itens)}
              onChange={(v) => atualizarLinhas(linhas.map((l, i) => (i === idx ? upperPrompt(v) : l)))}
              onSelecionar={(nome) => avancar(idx, linhas.map((l, i) => (i === idx ? upperPrompt(nome) : l)))}
              focoInicial={idx === 0}
              onKeyDown={(e) => {
                if (somenteLeitura) return;
                if (e.key === "Enter") {
                  e.preventDefault();
                  avancar(idx);
                }
              }}
            />
            {linha.trim() ? (
              (() => {
                const cat = categoriaExame(linha, correcoes);
                return (
                  <button
                    type="button"
                    className={`pedido__cat pedido__cat--${cat}`}
                    disabled={somenteLeitura}
                    title={
                      somenteLeitura
                        ? CATEGORIA_EXAME_LABEL[cat]
                        : `${CATEGORIA_EXAME_LABEL[cat]} — clique para mudar (o sistema lembra)`
                    }
                    onClick={() => void trocarCategoria(linha)}
                  >
                    {cat === "lab" ? "Lab" : "Imagem"}
                  </button>
                );
              })()
            ) : null}
            {!somenteLeitura && !(idx === linhas.length - 1 && !linha.trim()) ? (
              <button
                type="button"
                className="pedido__del"
                title="Remover linha"
                onClick={() => atualizarLinhas(linhas.filter((_, i) => i !== idx))}
              >
                ×
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {folhas.length > 1 ? (
        <p className="pedido__folhas">
          Sai em {folhas.length} pedidos separados:{" "}
          {folhas.map((f) => `${CATEGORIA_EXAME_LABEL[f.categoria]} (${f.exames.length})`).join(" e ")}.
        </p>
      ) : null}
      {/* o campo de CID já tem o próprio título "CID-10:" */}
      <div className="pedido__cid">
        <CidAutocomplete
          codigo={form.cid_codigo ?? ""}
          descricao={form.cid_descricao ?? ""}
          disabled={somenteLeitura}
          onChange={(codigo, descricao) => setForm((f) => ({ ...f, cid_codigo: codigo, cid_descricao: descricao }))}
        />
      </div>
      <div className={`pedido__indicacoes${folhas.length > 1 || form.observacoes_imagem?.trim() ? " pedido__indicacoes--duas" : ""}`}>
        <div className="pedido__indicacao">
          <label className="pedido__indicacao-titulo" htmlFor={`pedido-obs-${prontuarioId}`}>
            Indicação clínica / observações
            {folhas.length > 1 ? <small>laboratório{form.observacoes_imagem?.trim() ? "" : " e imagem"}</small> : null}
          </label>
          <textarea
            id={`pedido-obs-${prontuarioId}`}
            className="doc-area pedido__indicacao-area"
            rows={4}
            value={form.observacoes ?? ""}
            readOnly={somenteLeitura}
            placeholder="Ex.: DOR ABDOMINAL HÁ 5 DIAS"
            onChange={(e) => setForm((f) => ({ ...f, observacoes: upperPrompt(e.target.value) }))}
          />
        </div>
        {folhas.length > 1 || form.observacoes_imagem?.trim() ? (
          <div className="pedido__indicacao pedido__indicacao--imagem">
            <label className="pedido__indicacao-titulo" htmlFor={`pedido-obs-img-${prontuarioId}`}>
              Indicação para imagem
              <small>opcional — vazio: repete a do lado</small>
            </label>
            <textarea
              id={`pedido-obs-img-${prontuarioId}`}
              className="doc-area pedido__indicacao-area"
              rows={4}
              value={form.observacoes_imagem ?? ""}
              readOnly={somenteLeitura}
              placeholder={form.observacoes?.trim() || "Ex.: INVESTIGAR LINFONODOS"}
              onChange={(e) => setForm((f) => ({ ...f, observacoes_imagem: upperPrompt(e.target.value) }))}
            />
          </div>
        ) : null}
      </div>
      <DocAcoes indicador={indicador} saving={saving} onVoltar={onVoltar} onImprimir={() => void imprimir()} />
    </div>
  );
}
