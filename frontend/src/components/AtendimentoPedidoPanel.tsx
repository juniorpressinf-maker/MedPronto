import { useEffect, useMemo, useRef, useState } from "react";
import { CidAutocomplete } from "./CidAutocomplete";
import { DocAcoes } from "./DocAcoes";
import { NomeAutocomplete } from "./NomeAutocomplete";
import { ApiError, PdfCancelado, api, type PedidoExame } from "../lib/api";
import { upperPrompt } from "../lib/upperPrompt";
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

const VAZIO = (): PedidoExame => ({ exames_solicitados: "", observacoes: "", cid_codigo: "", cid_descricao: "" });

/** Linhas em branco não contam como alteração. */
const snapshot = (f: PedidoExame) =>
  JSON.stringify([
    f.exames_solicitados.split("\n").map((l) => l.trim()).filter(Boolean).join("\n"),
    f.observacoes ?? "",
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
      <div className="doc-grade">
        {/* o campo de CID já tem o próprio título "CID-10:" */}
        <div className="pedido__cid">
          <CidAutocomplete
            codigo={form.cid_codigo ?? ""}
            descricao={form.cid_descricao ?? ""}
            disabled={somenteLeitura}
            onChange={(codigo, descricao) => setForm((f) => ({ ...f, cid_codigo: codigo, cid_descricao: descricao }))}
          />
        </div>
        <div>
          <label className="doc-rotulo" htmlFor={`pedido-obs-${prontuarioId}`}>
            Indicação clínica / observações
          </label>
          <textarea
            id={`pedido-obs-${prontuarioId}`}
            className="doc-area"
            rows={3}
            value={form.observacoes ?? ""}
            readOnly={somenteLeitura}
            onChange={(e) => setForm((f) => ({ ...f, observacoes: upperPrompt(e.target.value) }))}
          />
        </div>
      </div>
      <DocAcoes indicador={indicador} saving={saving} onVoltar={onVoltar} onImprimir={() => void imprimir()} />
    </div>
  );
}
