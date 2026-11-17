import { useEffect, useMemo, useState } from "react";

import { AtendimentoCardTitulo } from "./AtendimentoCardTitulo";

import { CidAutocomplete } from "./CidAutocomplete";

import { FormActions } from "./FormActions";

import { ApiError, PdfCancelado, api, type Atestado } from "../lib/api";

import { snapshotForm } from "../lib/formDirty";
import { upperPrompt } from "../lib/upperPrompt";
import { useAutoSalvar } from "../lib/useAutoSalvar";
import { useMessageBox } from "../lib/messageBoxContext";
import { focarCampoInicial } from "../lib/focoInicial";

/**
 * Prévia ao vivo do atestado — mesmo texto e ordem do PDF
 * (backend/src/services/documentPdf.ts → gerarPdfAtestado). Mudou lá, mude aqui.
 */
function AtestadoPrevia({ pacienteNome, form }: { pacienteNome: string; form: Atestado }) {
  const dias = form.dias_afastamento;
  const cid = [form.cid_codigo, form.cid_descricao].filter(Boolean).join(" — ");
  const texto = form.texto_livre?.trim();
  const vazio = !(dias != null && dias > 0) && !cid && !texto;
  return (
    <aside className="atestado-previa" aria-label="Prévia do atestado">
      <p className="atestado-previa__rotulo">Prévia — como vai sair impresso</p>
      <div className="atestado-previa__folha">
        <h4 className="atestado-previa__titulo">ATESTADO MÉDICO</h4>
        <p className="atestado-previa__cab">
          Paciente: {pacienteNome}
          <br />
          Data: {new Date().toLocaleDateString("pt-BR")}
        </p>
        <hr />
        {dias != null && dias > 0 ? (
          <p>
            Atesto para os devidos fins que o(a) paciente acima identificado(a) necessita de afastamento de
            suas atividades por <strong>{dias} dia(s)</strong>.
          </p>
        ) : null}
        {cid ? <p>CID: {cid}</p> : null}
        {texto ? <p className="whitespace-pre-wrap">{texto}</p> : null}
        {vazio ? (
          <p className="atestado-previa__vazio">Preencha os dias, o CID ou o texto ao lado.</p>
        ) : null}
        <div className="atestado-previa__assinatura">
          _______________________________
          <br />
          Assinatura e carimbo do médico
        </div>
      </div>
    </aside>
  );
}

type Props = {
  prontuarioId: number;
  pacienteNome: string;
  somenteLeitura?: boolean;
  onConsultaEncerrada?: () => void;
  cidInicial?: { codigo: string; descricao: string };
  onVoltar: () => void;
};



function snapshotAtestado(form: Atestado) {

  return snapshotForm({

    dias_afastamento: form.dias_afastamento ?? null,

    cid_codigo: form.cid_codigo ?? "",

    cid_descricao: form.cid_descricao ?? "",

    texto_livre: form.texto_livre ?? "",

  });

}



const emptyAtestado = (

  cidInicial?: { codigo: string; descricao: string },

): Atestado => ({

  dias_afastamento: null,

  cid_codigo: cidInicial?.codigo ?? "",

  cid_descricao: cidInicial?.descricao ?? "",

  texto_livre: "",

});



export function AtendimentoAtestadoPanel({
  prontuarioId,
  pacienteNome,
  somenteLeitura = false,
  onConsultaEncerrada,
  cidInicial,
  onVoltar,
}: Props) {

  const msg = useMessageBox();

  const [form, setForm] = useState<Atestado>(() => emptyAtestado(cidInicial));

  const [baseline, setBaseline] = useState(() =>

    snapshotAtestado(emptyAtestado(cidInicial)),

  );

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    const empty = emptyAtestado(cidInicial);
    setForm(empty);
    setBaseline(snapshotAtestado(empty));
    setSaved(false);

    void (async () => {
      try {
        const r = await api.atestadoGet(prontuarioId);
        if (!active) return;
        const next = r.atestado ?? emptyAtestado(cidInicial);
        setForm(next);
        setBaseline(snapshotAtestado(next));
        setSaved(Boolean(r.atestado?.id));
        focarCampoInicial();
      } catch (e) {
        if (!active) return;
        void msg.error(e instanceof ApiError ? e.message : "Erro ao carregar atestado");
      }
    })();

    return () => {
      active = false;
    };
  }, [prontuarioId, cidInicial, msg]);



  const dirty = useMemo(

    () => snapshotAtestado(form) !== baseline,

    [form, baseline],

  );



  const salvar = async (silencioso = false): Promise<boolean> => {

    if (!silencioso) setSaving(true);

    try {

      await api.atestadoSave(prontuarioId, form);
      setBaseline(snapshotAtestado(form));
      setSaved(true);
      if (!silencioso) void msg.success("Atestado salvo");
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
    chave: JSON.stringify(snapshotAtestado(form)),
    dirty,
    desligado: somenteLeitura,
    salvar,
  });

  const imprimir = async () => {
    try {
      // Com alteração não salva: salva antes (o PDF sai do que está gravado).
      await api.atestadoPdf(
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

    <div className="prontuario-secao space-y-4">

      <AtendimentoCardTitulo titulo="Atestado médico" pacienteNome={pacienteNome} />

      <div className="atestado-panel__corpo">
      <div className="grid gap-3 content-start">

        <div>

          <label className="text-sm font-medium">Dias de afastamento</label>

          <input
            type="number"
            min={0}
            max={365}
            className="legacy-input w-32 mt-1"
            data-foco-inicial=""
            value={form.dias_afastamento ?? ""}
            readOnly={somenteLeitura}
            onChange={(e) =>
              setForm({
                ...form,
                dias_afastamento: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </div>
        <CidAutocomplete
          codigo={form.cid_codigo ?? ""}
          descricao={form.cid_descricao ?? ""}
          disabled={somenteLeitura}
          onChange={(codigo, descricao) =>
            setForm({ ...form, cid_codigo: codigo, cid_descricao: descricao })
          }
        />
        <div>
          <label className="prontuario-secao__titulo">Texto do atestado</label>
          <textarea
            className="prontuario-secao__area w-full mt-1"
            rows={6}
            value={form.texto_livre ?? ""}
            readOnly={somenteLeitura}
            onChange={(e) =>
              setForm({ ...form, texto_livre: upperPrompt(e.target.value) })
            }
            placeholder="Texto livre complementar…"
          />
        </div>
      </div>
      <AtestadoPrevia pacienteNome={pacienteNome} form={form} />
      </div>
      <FormActions
        saving={saving}
        dirty={dirty}
        saved={saved}
        saveLabel="Salvar atestado"
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


