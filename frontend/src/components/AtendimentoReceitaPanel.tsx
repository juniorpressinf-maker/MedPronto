import { useEffect, useMemo, useState } from "react";

import { AtendimentoCardTitulo } from "./AtendimentoCardTitulo";

import { FormActions } from "./FormActions";

import { ApiError, api, type ReceitaItem } from "../lib/api";

import { isFormDirty, snapshotForm } from "../lib/formDirty";
import { upperPrompt } from "../lib/upperPrompt";
import { useMessageBox } from "../lib/messageBoxContext";



const ITEM_VAZIO = (): ReceitaItem => ({

  medicamento: "",

  dosagem: "",

  via: "",

  posologia: "",

  quantidade: "",

  duracao_dias: null,

});



function snapshotReceita(observacoes: string, itens: ReceitaItem[]) {

  return snapshotForm({

    observacoes,

    itens: itens.map((i) => ({

      medicamento: i.medicamento,

      dosagem: i.dosagem ?? "",

      via: i.via ?? "",

      posologia: i.posologia ?? "",

      quantidade: i.quantidade ?? "",

      duracao_dias: i.duracao_dias ?? null,

    })),

  });

}



type Props = {

  prontuarioId: number;

  pacienteNome: string;

  somenteLeitura?: boolean;

  onConsultaEncerrada?: () => void;

  onVoltar: () => void;

};



export function AtendimentoReceitaPanel({ prontuarioId, pacienteNome, somenteLeitura = false, onConsultaEncerrada, onVoltar }: Props) {

  const msg = useMessageBox();

  const [observacoes, setObservacoes] = useState("");

  const [itens, setItens] = useState<ReceitaItem[]>([ITEM_VAZIO()]);

  const [baseline, setBaseline] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
        const rows = r.itens.length ? r.itens : [ITEM_VAZIO()];
        setObservacoes(obs);
        setItens(rows);
        setBaseline(snapshotReceita(obs, rows));
        setSaved(Boolean(r.receita?.id));
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

    () => isFormDirty(snapshotReceita(observacoes, itens), baseline),

    [observacoes, itens, baseline],

  );



  const salvar = async () => {

    const validos = itens.filter((i) => i.medicamento.trim());

    if (!validos.length) {

      void msg.warning("Informe ao menos um medicamento");

      return;

    }

    setSaving(true);

    try {

      await api.receitaSave(prontuarioId, { observacoes, itens: validos });

      void msg.success("Receita salva");
      const r = await api.receitaGet(prontuarioId);
      const obs = r.receita?.observacoes ?? "";
      const rows = r.itens.length ? r.itens : [ITEM_VAZIO()];
      setObservacoes(obs);
      setItens(rows);
      setBaseline(snapshotReceita(obs, rows));
      setSaved(Boolean(r.receita?.id));

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

      await api.receitaPdf(prontuarioId);

    } catch (e) {

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



  return (
    <div className="prontuario-secao receita-panel">
      <AtendimentoCardTitulo titulo="Receituário" pacienteNome={pacienteNome} />
      <div className="receita-panel__tabela dup-table-wrap panel panel-table">
        <table className="data-table receita-panel__table">

          <thead>

            <tr>

              <th>Medicamento</th>

              <th>Dose</th>

              <th>Via</th>

              <th>Posologia</th>

              <th>Qtd</th>

              <th>Dias</th>
              {!somenteLeitura ? <th /> : null}
            </tr>
          </thead>

          <tbody>

            {itens.map((row, idx) => (

              <tr key={idx}>

                <td className="receita-panel__col-medicamento">
                  <input
                    className="legacy-input w-full"
                    value={row.medicamento}
                    readOnly={somenteLeitura}
                    onChange={(e) => setItem(idx, { medicamento: e.target.value })}
                  />

                </td>

                <td>

                  <input
                    className="legacy-input w-full"
                    value={row.dosagem ?? ""}
                    readOnly={somenteLeitura}
                    onChange={(e) => setItem(idx, { dosagem: e.target.value })}
                  />

                </td>

                <td>

                  <input
                    className="legacy-input w-full"
                    value={row.via ?? ""}
                    readOnly={somenteLeitura}
                    onChange={(e) => setItem(idx, { via: e.target.value })}
                  />

                </td>

                <td className="receita-panel__col-posologia">
                  <input
                    className="legacy-input w-full"
                    value={row.posologia ?? ""}
                    readOnly={somenteLeitura}
                    onChange={(e) => setItem(idx, { posologia: e.target.value })}
                  />

                </td>

                <td>

                  <input
                    className="legacy-input w-full"
                    value={row.quantidade ?? ""}
                    readOnly={somenteLeitura}
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
                    onChange={(e) =>
                      setItem(idx, {
                        duracao_dias: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </td>
                {!somenteLeitura ? (
                  <td>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => setItens((prev) => prev.filter((_, i) => i !== idx))}
                      disabled={itens.length <= 1}
                    >
                      ×
                    </button>
                  </td>
                ) : null}

              </tr>

            ))}

          </tbody>

        </table>

      </div>
      {!somenteLeitura ? (
        <button
          type="button"
          className="btn btn-primary btn-sm receita-panel__add"
          onClick={() => setItens((prev) => [...prev, ITEM_VAZIO()])}
        >
          + Medicamento
        </button>
      ) : null}

      <div className="receita-panel__obs">
        <label className="prontuario-secao__titulo">Observações</label>
        <textarea
          className="prontuario-secao__area w-full mt-1"
          rows={2}
          value={observacoes}
          readOnly={somenteLeitura}
          onChange={(e) => setObservacoes(upperPrompt(e.target.value))}
        />
      </div>
      <FormActions
        saving={saving}
        dirty={dirty}
        saved={saved}
        saveLabel="Salvar receita"
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


