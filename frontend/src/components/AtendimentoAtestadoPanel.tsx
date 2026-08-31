import { useEffect, useMemo, useState } from "react";

import { AtendimentoCardTitulo } from "./AtendimentoCardTitulo";

import { CidAutocomplete } from "./CidAutocomplete";

import { FormActions } from "./FormActions";

import { ApiError, api, type Atestado } from "../lib/api";

import { isFormDirty, snapshotForm } from "../lib/formDirty";
import { upperPrompt } from "../lib/upperPrompt";
import { useMessageBox } from "../lib/messageBoxContext";



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

    () => isFormDirty(snapshotAtestado(form), baseline),

    [form, baseline],

  );



  const salvar = async () => {

    setSaving(true);

    try {

      await api.atestadoSave(prontuarioId, form);
      setBaseline(snapshotAtestado(form));
      setSaved(true);
      void msg.success("Atestado salvo");

    } catch (e) {

      if (e instanceof ApiError && e.status === 409) {
        void msg.warning(e.message);
        onConsultaEncerrada?.();
        return;
      }

      void msg.error(e instanceof ApiError ? e.message : "Erro ao salvar");

    } finally {

      setSaving(false);

    }

  };



  const imprimir = async () => {

    try {

      await api.atestadoPdf(prontuarioId);

    } catch (e) {

      void msg.error(e instanceof ApiError ? e.message : "Erro ao gerar PDF");

    }

  };



  return (

    <div className="prontuario-secao space-y-4">

      <AtendimentoCardTitulo titulo="Atestado médico" pacienteNome={pacienteNome} />

      <div className="grid gap-3 max-w-md">

        <div>

          <label className="text-sm font-medium">Dias de afastamento</label>

          <input
            type="number"
            min={0}
            max={365}
            className="legacy-input w-32 mt-1"
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
      <FormActions
        saving={saving}
        dirty={dirty}
        saved={saved}
        saveLabel="Salvar atestado"
        onSave={() => void salvar()}
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


