import { useEffect, useMemo, useRef, useState } from "react";
import { AtendimentoCardTitulo } from "./AtendimentoCardTitulo";
import { FormActions } from "./FormActions";
import { NomeAutocomplete } from "./NomeAutocomplete";
import { ApiError, PdfCancelado, api, type PedidoExame } from "../lib/api";
import { snapshotForm } from "../lib/formDirty";
import { upperPrompt } from "../lib/upperPrompt";
import { focarCampoInicial } from "../lib/focoInicial";
import { useAutoSalvar } from "../lib/useAutoSalvar";
import { useMessageBox } from "../lib/messageBoxContext";

type Props = {
  prontuarioId: number;
  pacienteNome: string;
  somenteLeitura?: boolean;
  onConsultaEncerrada?: () => void;
  onVoltar: () => void;
};

function snapshotPedido(form: PedidoExame) {
  return snapshotForm({
    exames_solicitados: form.exames_solicitados,
    observacoes: form.observacoes ?? "",
  });
}

const emptyPedido = (): PedidoExame => ({
  exames_solicitados: "",
  observacoes: "",
});

function examesParaLinhas(texto: string): string[] {
  if (!texto.trim()) return [""];
  return texto.split(/\r?\n/);
}

function linhasParaExames(linhas: string[]): string {
  return linhas.join("\n");
}

export function AtendimentoPedidoPanel({
  prontuarioId,
  pacienteNome,
  somenteLeitura = false,
  onConsultaEncerrada,
  onVoltar,
}: Props) {
  const msg = useMessageBox();
  const [form, setForm] = useState<PedidoExame>(emptyPedido);
  const [linhasExames, setLinhasExames] = useState<string[]>([""]);
  const [baseline, setBaseline] = useState(() => snapshotPedido(emptyPedido()));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const listaRef = useRef<HTMLDivElement>(null);
  const focoAposLinhas = useRef<number | null>(null);

  const focarLinha = (index: number) => {
    requestAnimationFrame(() => {
      const inputs = listaRef.current?.querySelectorAll<HTMLInputElement>(
        ".pedido-exame-linha__input",
      );
      const el = inputs?.[index];
      el?.focus();
      el?.select();
    });
  };

  useEffect(() => {
    if (focoAposLinhas.current == null) return;
    const idx = focoAposLinhas.current;
    focoAposLinhas.current = null;
    focarLinha(idx);
  }, [linhasExames]);

  useEffect(() => {
    let active = true;
    const empty = emptyPedido();
    setForm(empty);
    setLinhasExames([""]);
    setBaseline(snapshotPedido(empty));
    setSaved(false);

    void (async () => {
      try {
        const r = await api.pedidoExameGet(prontuarioId);
        if (!active) return;
        const next = r.pedido ?? emptyPedido();
        setForm(next);
        setLinhasExames(examesParaLinhas(next.exames_solicitados));
        setBaseline(snapshotPedido(next));
        setSaved(Boolean(r.pedido?.id));
        focarCampoInicial(listaRef.current);
      } catch (e) {
        if (!active) return;
        void msg.error(e instanceof ApiError ? e.message : "Erro ao carregar pedido");
      }
    })();

    return () => {
      active = false;
    };
  }, [prontuarioId, msg]);

  const dirty = useMemo(
    () => snapshotPedido(form) !== baseline,
    [form, baseline],
  );

  const atualizarLinhas = (linhas: string[]) => {
    if (somenteLeitura) return;
    const normalizadas = linhas.length ? linhas : [""];
    setLinhasExames(normalizadas);
    setForm((prev) => ({
      ...prev,
      exames_solicitados: linhasParaExames(normalizadas),
    }));
  };

  const setLinha = (idx: number, valor: string) => {
    if (somenteLeitura) return;
    atualizarLinhas(
      linhasExames.map((linha, i) =>
        i === idx ? upperPrompt(valor) : linha,
      ),
    );
  };

  const avancarParaProximoExame = (idx: number, linhas: string[] = linhasExames) => {
    if (linhas !== linhasExames) atualizarLinhas(linhas);
    if (idx + 1 < linhas.length && !linhas[idx + 1]?.trim()) {
      focarLinha(idx + 1);
      return;
    }
    const proximoVazio = linhas.findIndex(
      (linha, i) => i > idx && !linha.trim(),
    );
    if (proximoVazio >= 0) {
      focarLinha(proximoVazio);
      return;
    }
    const next = [...linhas];
    const ins = idx + 1;
    if (ins >= next.length) {
      next.push("");
    } else {
      next.splice(ins, 0, "");
    }
    focoAposLinhas.current = ins;
    atualizarLinhas(next);
  };

  const salvar = async (silencioso = false): Promise<boolean> => {
    if (somenteLeitura) return false;
    if (!form.exames_solicitados.trim()) {
      if (!silencioso) void msg.warning("Informe os exames solicitados");
      return false;
    }
    if (!silencioso) setSaving(true);
    try {
      await api.pedidoExameSave(prontuarioId, form);
      setBaseline(snapshotPedido(form));
      setSaved(true);
      if (!silencioso) void msg.success("Pedido salvo");
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
    chave: JSON.stringify(snapshotPedido(form)),
    dirty,
    desligado: somenteLeitura,
    salvar,
  });

  const imprimir = async () => {
    try {
      // Com alteração não salva: salva antes (o PDF sai do que está gravado).
      await api.pedidoExamePdf(
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
    <div className="prontuario-secao pedido-exame-panel space-y-4">
      <AtendimentoCardTitulo titulo="Pedido de exame" pacienteNome={pacienteNome} />

      <div>
        <label className="prontuario-secao__titulo">Exames solicitados</label>
        <div className="pedido-exame-lista mt-1" ref={listaRef}>
          {linhasExames.map((linha, idx) => (
            <div key={idx} className="pedido-exame-linha">
              <NomeAutocomplete
                className="pedido-exame-linha__input"
                value={linha}
                readOnly={somenteLeitura}
                placeholder={`Exame ${idx + 1}`}
                buscar={(q) => api.pedidoExameSugestoes(prontuarioId, q).then((r) => r.itens)}
                onChange={(v) => setLinha(idx, v)}
                focoInicial={idx === 0}
                onSelecionar={(nome) =>
                  avancarParaProximoExame(
                    idx,
                    linhasExames.map((l, i) => (i === idx ? upperPrompt(nome) : l)),
                  )
                }
                onKeyDown={(e) => {
                  if (somenteLeitura) return;
                  if (e.key === "Enter") {
                    e.preventDefault();
                    avancarParaProximoExame(idx);
                  }
                }}
              />
              {!somenteLeitura ? (
                <button
                  type="button"
                  className="pedido-exame-linha__del btn btn-primary btn-sm"
                  onClick={() =>
                    atualizarLinhas(linhasExames.filter((_, i) => i !== idx))
                  }
                  disabled={linhasExames.length <= 1}
                  title="Remover linha"
                >
                  ×
                </button>
              ) : null}
            </div>
          ))}
        </div>
        {!somenteLeitura ? (
          <button
            type="button"
            className="btn btn-primary btn-sm mt-2"
            onClick={() => {
              const next = [...linhasExames, ""];
              atualizarLinhas(next);
              focoAposLinhas.current = next.length - 1;
            }}
          >
            + Exame
          </button>
        ) : null}
      </div>

      <div>
        <label className="prontuario-secao__titulo">Observações</label>
        <div className="prontuario-campo prontuario-campo--linhas pedido-exame-obs mt-1">
          <textarea
            className="prontuario-secao__area w-full"
            rows={3}
            value={form.observacoes ?? ""}
            readOnly={somenteLeitura}
            onChange={(e) =>
              setForm({ ...form, observacoes: upperPrompt(e.target.value) })
            }
          />
        </div>
      </div>

      <FormActions
        saving={saving}
        dirty={dirty}
        saved={saved}
        saveLabel="Salvar pedido"
        onSave={() => void salvar()}
        indicador={indicadorSalvo}
        onBack={onVoltar}
        backLabel="Voltar ao prontuário"
        somenteLeitura={somenteLeitura}
      >
        <button type="button" className="btn btn-primary" onClick={() => void imprimir()}>
          Imprimir PDF
        </button>
      </FormActions>
    </div>
  );
}
