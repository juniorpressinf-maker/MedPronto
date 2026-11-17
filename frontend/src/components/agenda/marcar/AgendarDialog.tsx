import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  api,
  type CobrancaConvenio,
  type CobrancaProcedimento,
  type Paciente,
} from "../../../lib/api";
import {
  agendaNovaApi,
  type HorarioPadrao,
  type AgendamentoGrade,
  type MedicoAgenda,
  type NovoAgendamento,
  type Previa,
} from "../../../lib/agendaNova/api";
import { comConfirmacoes, confirmacaoPedida, type CampoConfirmacao } from "../../../lib/agendaNova/confirmacoes";
import { horaFimValida, horaParaMinutos, horaValida } from "../../../lib/agendaNova/horario";
import { minutosParaHora } from "../../../lib/agendaNova/layoutGrade";
import { dataBr, rotuloDia } from "../../../lib/agendaNova/semana";
import { podeRemarcar } from "../../../lib/agendaNova/status";
import { useMessageBox } from "../../../lib/messageBoxContext";
import { PacienteSeletor } from "./PacienteSeletor";
import { ProcedimentosSeletor } from "./ProcedimentosSeletor";

type Props = {
  medicos: MedicoAgenda[];
  medicoId: number;
  data: string;
  hora: string;
  padrao: HorarioPadrao;
  /** perfil médico: só a própria agenda, sem bloqueio da clínica toda */
  ehMedico: boolean;
  hoje: string;
  /** Editar agendamento existente (A4b). Sem isto: novo agendamento. */
  editar?: AgendamentoGrade;
  /** Novo agendamento já com este paciente (ex.: vindo de Pacientes → Agendar). */
  pacienteInicialId?: number;
  onFechar: () => void;
  onSalvo: () => void;
};

const MAX_MIN = 24 * 60;

function somarMin(h: string, n: number): string {
  return minutosParaHora(Math.min(MAX_MIN, Math.max(0, horaParaMinutos(h) + n)));
}

function digitos(s: string): string {
  return s.replace(/\D/g, "");
}

/** Janela "Agendamento de horário" — novo (A4c), editar (A4b) ou bloquear. */
export function AgendarDialog(props: Props) {
  const msg = useMessageBox();
  const passo = props.padrao.intervalo_minutos;

  const [modo, setModo] = useState<"agendar" | "bloquear">("agendar");
  const [medicoId, setMedicoId] = useState(props.medicoId);
  const [data, setData] = useState(props.data);
  const [inicio, setInicio] = useState(props.hora);
  const ed = props.editar;
  const editando = !!ed;
  const [fim, setFim] = useState(ed ? ed.hora_fim : somarMin(props.hora, passo));
  /** depois que o usuário mexe no fim, ele não é mais recalculado sozinho (na edição já começa manual) */
  const [fimManual, setFimManual] = useState(!!ed);
  /** edição de horário em status diferente de agendado é recusada pelo backend */
  const horarioTravado = !!ed && !podeRemarcar(ed.status);

  // Agendar
  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [completar, setCompletar] = useState({ data_nasc: "", telefone: "" });
  const [procedimentos, setProcedimentos] = useState<CobrancaProcedimento[]>([]);
  const [convenios, setConvenios] = useState<CobrancaConvenio[]>([]);
  const [convenioId, setConvenioId] = useState<number | null>(ed?.convenio_id ?? null);
  const [procIds, setProcIds] = useState<number[]>(ed ? ed.procedimentos.map((p) => p.id) : []);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [obs, setObs] = useState(ed?.observacao_agenda ?? "");
  const [encaixe, setEncaixe] = useState(false);

  // Bloquear
  const [motivo, setMotivo] = useState("");
  const [diaInteiro, setDiaInteiro] = useState(false);
  const [clinicaToda, setClinicaToda] = useState(false);

  const [salvando, setSalvando] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Novo com paciente já escolhido (Pacientes → Agendar).
  useEffect(() => {
    if (ed || !props.pacienteInicialId) return;
    api
      .pacienteGet(props.pacienteInicialId)
      .then(setPaciente)
      .catch(() => undefined);
  }, [ed, props.pacienteInicialId]);

  // Edição: carrega o paciente do agendamento (fixo — não se troca paciente de um horário).
  useEffect(() => {
    if (!ed) return;
    api
      .pacienteGet(ed.paciente_id)
      .then(setPaciente)
      .catch((e) => void msg.error(e instanceof ApiError ? e.message : "Erro ao carregar o paciente"));
  }, [ed, msg]);

  // Catálogo: procedimentos ativos + convênios ativos.
  useEffect(() => {
    api
      .agendamentoProcedimentosPrevistos()
      .then((r) => {
        if (Array.isArray(r)) {
          setProcedimentos(r);
        } else {
          setProcedimentos(r.procedimentos);
          if (r.convenios) setConvenios(r.convenios.filter((c) => c.ativo));
        }
      })
      .catch((e) => void msg.error(e instanceof ApiError ? e.message : "Erro ao carregar procedimentos"));
    api
      .agendamentoConvenios()
      .then((cs) => setConvenios(cs.filter((c) => c.ativo)))
      .catch(() => undefined);
  }, [msg]);

  // Ao escolher o paciente: convênio sugerido + aviso de retorno vigente.
  useEffect(() => {
    setCompletar({ data_nasc: paciente?.data_nasc?.slice(0, 10) ?? "", telefone: paciente?.telefone ?? "" });
    if (!paciente) return;
    api
      .agendamentoConvenioSugerido(paciente.id)
      .then((r) => setConvenioId((atual) => atual ?? r.convenio_id))
      .catch(() => undefined);
    if (editando) return; // aviso só ao marcar novo
    let cancelado = false;
    api
      .retornoVigente(paciente.id)
      .then((r) => {
        if (cancelado || !r.vigente || !r.retorno) return;
        const ret = r.retorno;
        void msg.info({
          title: "Paciente em prazo de retorno",
          message:
            `Em prazo de retorno com ${ret.medico_nome} até ${dataBr(ret.retorno_ate.slice(0, 10))} ` +
            `(${ret.dias_restantes} dia(s)).\n\nPara marcar o retorno, use o procedimento "Consulta retorno".`,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, [paciente, editando, msg]);

  // Valor total + duração sugerida dos procedimentos.
  useEffect(() => {
    if (procIds.length === 0) {
      setPrevia(null);
      return;
    }
    let cancelado = false;
    agendaNovaApi
      .previa(convenioId, procIds)
      .then((p) => !cancelado && setPrevia(p))
      .catch(() => !cancelado && setPrevia(null));
    return () => {
      cancelado = true;
    };
  }, [convenioId, procIds]);

  // Fim automático = início + duração (procedimentos → intervalo padrão).
  const duracao = previa?.duracao_sugerida ?? passo;
  useEffect(() => {
    if (!fimManual && horaValida(inicio)) setFim(somarMin(inicio, duracao));
  }, [inicio, duracao, fimManual]);

  // Esc fecha.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onFechar();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [props]);

  const valores = useMemo(
    () => new Map((previa?.itens ?? []).map((i) => [i.procedimento_id, i.valor_centavos])),
    [previa],
  );
  const medico = props.medicos.find((m) => m.medico_id === medicoId);
  const faltaCadastro =
    !!paciente && (!paciente.data_nasc?.trim() || digitos(paciente.telefone ?? "").length < 10);

  // ----------------------------------------------------------- validação
  const erroHorario =
    !data
      ? "Informe a data."
      : data < props.hoje && !(ed && data === ed.data)
        ? "Essa data já passou."
        : modo === "bloquear" && diaInteiro
          ? null
          : !horaValida(inicio) || !horaFimValida(fim)
            ? "Informe início e fim."
            : inicio >= fim
              ? "O fim precisa ser depois do início."
              : modo === "agendar" && horaParaMinutos(fim) - horaParaMinutos(inicio) < 5
                ? "Mínimo de 5 minutos."
                : null;
  const erroAgendar =
    modo !== "agendar"
      ? null
      : !paciente
        ? "Escolha o paciente."
        : !ed && faltaCadastro && (!completar.data_nasc || digitos(completar.telefone).length < 10)
          ? "Complete nascimento e celular do paciente."
          : !convenioId
            ? "Escolha o convênio."
            : procIds.length === 0
              ? "Adicione pelo menos um procedimento."
              : null;
  const erro = erroHorario ?? erroAgendar;

  const deslocar = (delta: number) => {
    const ni = horaParaMinutos(inicio) + delta;
    const nf = horaParaMinutos(fim) + delta;
    if (ni < 0 || nf > MAX_MIN) return;
    setInicio(minutosParaHora(ni));
    setFim(minutosParaHora(nf));
  };

  // ----------------------------------------------------------- salvar
  const completarCadastro = async (p: Paciente): Promise<Paciente> => {
    // PUT regrava o cadastro inteiro: parte do paciente completo para não apagar nada.
    const completo = await api.pacienteGet(p.id);
    return api.pacienteSave(
      { ...completo, data_nasc: completar.data_nasc, telefone: completar.telefone.trim() },
      p.id,
    );
  };

  const agendar = async () => {
    if (!paciente || !convenioId) return;
    let pac = paciente;
    if (faltaCadastro) {
      pac = await completarCadastro(paciente);
      setPaciente(pac);
    }
    const base: NovoAgendamento = {
      paciente_id: pac.id,
      medico_id: medicoId,
      data,
      hora: inicio,
      hora_fim: fim,
      convenio_id: convenioId,
      procedimento_ids: procIds,
      observacao_agenda: obs.trim() || undefined,
      eh_encaixe: encaixe || undefined,
    };
    const confirmados: Partial<Record<CampoConfirmacao, boolean>> = {};
    // O servidor pode pedir confirmações (retorno, bloqueio): pergunta e reenvia.
    for (;;) {
      try {
        const r = await agendaNovaApi.agendar({ ...base, ...confirmados });
        const sobre = r.avisos?.sobreposicao ?? [];
        void msg.success(
          sobre.length
            ? `Agendado. Atenção: mesmo horário que ${sobre.map((s) => `${s.paciente_nome} (${s.hora})`).join(", ")}.`
            : "Agendado.",
        );
        props.onSalvo();
        return;
      } catch (e) {
        if (!(e instanceof ApiError)) throw e;
        const c = confirmacaoPedida(e.status, e.data, confirmados);
        if (!c) {
          void msg.error(e.message);
          return;
        }
        const ok = await msg.confirm({ title: c.titulo, message: c.mensagem, confirmLabel: c.botao, cancelLabel: "Cancelar" });
        if (!ok) return;
        confirmados[c.campo] = true;
      }
    }
  };

  const bloquear = async () => {
    const r = await agendaNovaApi.bloquear({
      medico_id: clinicaToda ? null : medicoId,
      data_inicio: data,
      data_fim: data,
      hora_inicio: diaInteiro ? "00:00" : inicio,
      hora_fim: diaInteiro ? "24:00" : fim,
      motivo: motivo.trim() || null,
    });
    void msg.success(
      r.agendamentos_afetados
        ? `Horário bloqueado. Atenção: ${r.agendamentos_afetados} agendamento(s) já marcado(s) nesse período continuam na agenda.`
        : "Horário bloqueado.",
    );
    props.onSalvo();
  };

  /**
   * Editar (A4b): cada parte usa a rota própria do backend, na ordem que menos
   * deixa trabalho pela metade: 1) remarcar (pode pedir confirmação),
   * 2) procedimentos/convênio, 3) comentário. Só envia o que mudou.
   */
  const salvarEdicao = async (ag: AgendamentoGrade) => {
    const mudouHorario =
      data !== ag.data || inicio !== ag.hora || fim !== ag.hora_fim || medicoId !== ag.medico_id;
    const idsAtuais = ag.procedimentos.map((p) => p.id);
    const mudouProcs =
      convenioId !== ag.convenio_id ||
      procIds.length !== idsAtuais.length ||
      procIds.some((id, i) => id !== idsAtuais[i]);
    const mudouObs = (obs.trim() || null) !== (ag.observacao_agenda?.trim() || null);
    if (!mudouHorario && !mudouProcs && !mudouObs) {
      props.onFechar();
      return;
    }

    if (mudouHorario) {
      const confirmados: Partial<Record<CampoConfirmacao, boolean>> = {};
      for (;;) {
        try {
          await agendaNovaApi.mover(ag.id, {
            data,
            hora: inicio,
            hora_fim: fim,
            medico_id: medicoId !== ag.medico_id ? medicoId : undefined,
            ...confirmados,
          });
          break;
        } catch (e) {
          if (!(e instanceof ApiError)) throw e;
          const c = confirmacaoPedida(e.status, e.data, confirmados);
          if (!c) {
            void msg.error(e.message);
            return;
          }
          const ok = await msg.confirm({ title: c.titulo, message: c.mensagem, confirmLabel: c.botao, cancelLabel: "Cancelar" });
          if (!ok) return;
          confirmados[c.campo] = true;
        }
      }
    }
    try {
      if (mudouProcs && convenioId) {
        // Conta já recebida: pergunta "Reabrir e incluir" e reenvia confirmado.
        const ok = await comConfirmacoes(
          (conf) =>
            api.agendamentoProcedimentos(ag.id, {
              procedimento_ids: procIds,
              convenio_id: convenioId,
              reabrir_conta: conf.reabrir_conta,
            }),
          (c) => msg.confirm({ title: c.titulo, message: c.mensagem, confirmLabel: c.botao, cancelLabel: "Cancelar" }),
        );
        if (!ok) return;
      }
      if (mudouObs) {
        await agendaNovaApi.alterarAgenda(ag.id, { observacao_agenda: obs.trim() || null });
      }
    } catch (e) {
      // O horário pode já ter sido remarcado: recarrega e mostra o que faltou.
      void msg.error(
        `${mudouHorario ? "O horário foi remarcado, mas " : ""}não foi possível salvar o resto: ${e instanceof ApiError ? e.message : "erro"}`,
      );
      props.onSalvo();
      return;
    }
    void msg.success(mudouHorario ? "Agendamento remarcado. A confirmação do WhatsApp será enviada de novo." : "Alterações salvas.");
    props.onSalvo();
  };

  const salvar = async () => {
    if (erro || salvando) return;
    setSalvando(true);
    try {
      if (ed) await salvarEdicao(ed);
      else if (modo === "agendar") await agendar();
      else await bloquear();
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  };

  const convenioOpcoes = convenios.length ? convenios : [];

  return (
    <div className="modal-overlay" role="presentation" onClick={props.onFechar}>
      <div
        ref={dialogRef}
        className="modal panel agn-marcar"
        role="dialog"
        aria-modal="true"
        aria-labelledby="agn-marcar-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ---------------- Coluna esquerda: quando ---------------- */}
        <div className="agn-marcar__esq">
          <label className="text-sm block">
            <span className="font-medium block mb-1">Profissional</span>
            <select
              className="legacy-input w-full"
              value={medicoId}
              disabled={props.ehMedico || horarioTravado}
              onChange={(e) => setMedicoId(Number(e.target.value))}
            >
              {props.medicos.map((m) => (
                <option key={m.medico_id} value={m.medico_id}>
                  {m.nome}
                </option>
              ))}
            </select>
          </label>

          {!ed && (
          <div className="agn-chave" role="radiogroup" aria-label="Agendar ou bloquear">
            <button
              type="button"
              role="radio"
              aria-checked={modo === "agendar"}
              className={`agn-chave__op ${modo === "agendar" ? "agn-chave__op--agendar" : ""}`}
              onClick={() => setModo("agendar")}
            >
              Agendar
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={modo === "bloquear"}
              className={`agn-chave__op ${modo === "bloquear" ? "agn-chave__op--bloquear" : ""}`}
              onClick={() => setModo("bloquear")}
            >
              <Lock className="inline h-3.5 w-3.5 mr-1" aria-hidden />
              Bloquear
            </button>
          </div>
          )}
          {horarioTravado && (
            <p className="agn-alerta m-0">
              Paciente já chegou ou o horário foi encerrado: data, hora e médico não podem mais ser mudados.
            </p>
          )}

          <label className="text-sm block">
            <span className="font-medium block mb-1">Data</span>
            <input
              type="date"
              className="legacy-input w-full"
              value={data}
              min={ed ? undefined : props.hoje}
              disabled={horarioTravado}
              onChange={(e) => setData(e.target.value)}
            />
            {data && <span className="text-xs text-[var(--muted)]">{rotuloDia(data).longo}, {dataBr(data)}</span>}
          </label>

          {!(modo === "bloquear" && diaInteiro) && (
            <div className="agn-horario" role="group" aria-label="Horário">
              <button type="button" className="agn-horario__seta" disabled={horarioTravado} aria-label={`Voltar ${passo} minutos`} onClick={() => deslocar(-passo)}>
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
              <span className="text-sm">de</span>
              <input
                type="time"
                step={300}
                className="legacy-input"
                aria-label="Início"
                disabled={horarioTravado}
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
              />
              <span className="text-sm">às</span>
              <input
                type="time"
                step={300}
                className="legacy-input"
                aria-label="Fim"
                disabled={horarioTravado}
                value={fim === "24:00" ? "23:59" : fim}
                onChange={(e) => {
                  setFim(e.target.value);
                  setFimManual(true);
                }}
              />
              <button type="button" className="agn-horario__seta" disabled={horarioTravado} aria-label={`Avançar ${passo} minutos`} onClick={() => deslocar(passo)}>
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          )}
          {modo === "agendar" && !horarioTravado && (
            <p className="text-xs text-[var(--muted)] m-0">
              {fimManual ? (
                <>
                  Fim ajustado à mão.{" "}
                  <button type="button" className="underline" onClick={() => setFimManual(false)}>
                    Usar duração sugerida ({duracao} min)
                  </button>
                </>
              ) : (
                <>Duração sugerida: {duracao} min{procIds.length ? " (pelos procedimentos)" : " (intervalo padrão)"}. Dá para mudar.</>
              )}
            </p>
          )}

          {modo === "bloquear" && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={diaInteiro} onChange={(e) => setDiaInteiro(e.target.checked)} />
                Dia inteiro
              </label>
              {!props.ehMedico && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={clinicaToda} onChange={(e) => setClinicaToda(e.target.checked)} />
                  Bloquear para todos os médicos
                </label>
              )}
            </div>
          )}
        </div>

        {/* ---------------- Coluna direita: o quê ---------------- */}
        <div className="agn-marcar__dir">
          <h2 id="agn-marcar-titulo" className="modal__title">
            {ed ? "Editar agendamento" : modo === "agendar" ? "Agendamento de horário" : "Bloquear horário"}
          </h2>

          {modo === "agendar" ? (
            <>
              <section aria-label="Paciente">
                {ed && !paciente ? (
                  <p className="text-sm text-[var(--muted)]">Carregando paciente…</p>
                ) : (
                  <PacienteSeletor paciente={paciente} onEscolher={setPaciente} fixo={!!ed} />
                )}
                {faltaCadastro && (
                  <div className="agn-alerta mt-2" role="alert">
                    <span className="font-medium">Complete o cadastro para agendar:</span>
                    <div className="grid gap-2 sm:grid-cols-2 mt-1">
                      <label className="text-sm">
                        <span className="block mb-1">Nascimento *</span>
                        <input
                          type="date"
                          className="legacy-input w-full"
                          value={completar.data_nasc}
                          onChange={(e) => setCompletar((c) => ({ ...c, data_nasc: e.target.value }))}
                        />
                      </label>
                      <label className="text-sm">
                        <span className="block mb-1">Celular (com DDD) *</span>
                        <input
                          type="tel"
                          className="legacy-input w-full"
                          value={completar.telefone}
                          onChange={(e) => setCompletar((c) => ({ ...c, telefone: e.target.value }))}
                        />
                      </label>
                    </div>
                  </div>
                )}
              </section>

              <label className="text-sm block mt-3">
                <span className="font-medium block mb-1">Convênio</span>
                <select
                  className="legacy-input w-full"
                  value={convenioId ?? ""}
                  onChange={(e) => setConvenioId(Number(e.target.value) || null)}
                >
                  <option value="">Selecione…</option>
                  {convenioOpcoes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </label>

              <div className="text-sm mt-3">
                <span className="font-medium block mb-1">Procedimentos</span>
                <ProcedimentosSeletor
                  todos={procedimentos}
                  selecionados={procIds}
                  onChange={setProcIds}
                  valores={valores}
                  total={previa ? previa.total_centavos : procIds.length ? null : 0}
                />
              </div>

              <label className="text-sm block mt-3">
                <span className="font-medium block mb-1">Comentários</span>
                <textarea
                  className="legacy-input w-full min-h-[3.5rem]"
                  maxLength={500}
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                />
              </label>

              {!ed && (
              <label className="flex items-center gap-2 text-sm mt-2">
                <input type="checkbox" checked={encaixe} onChange={(e) => setEncaixe(e.target.checked)} />
                Encaixe
              </label>
              )}
            </>
          ) : (
            <>
              <p className="modal__text">
                O horário fica fechado na agenda de{" "}
                <strong>{clinicaToda ? "todos os médicos" : (medico?.nome ?? "")}</strong>. Agendamentos que já existem
                nesse período não são mexidos.
              </p>
              <label className="text-sm block">
                <span className="font-medium block mb-1">Motivo</span>
                <input
                  className="legacy-input w-full"
                  maxLength={200}
                  placeholder="Ex.: Reunião, congresso, folga…"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
              </label>
            </>
          )}

          <div className="modal__actions agn-marcar__acoes">
            {erro && (
              <span className="text-sm text-[var(--muted)] mr-auto" role="status">
                {erro}
              </span>
            )}
            <button type="button" className="btn btn-secondary" onClick={props.onFechar}>
              Cancelar
            </button>
            <button
              type="button"
              className={`btn ${modo === "agendar" ? "btn-primary" : "agn-btn-bloquear"}`}
              disabled={!!erro || salvando}
              onClick={() => void salvar()}
            >
              {salvando ? "Salvando…" : ed ? "Salvar alterações" : modo === "agendar" ? "Confirmar agendamento" : "Bloquear horário"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
