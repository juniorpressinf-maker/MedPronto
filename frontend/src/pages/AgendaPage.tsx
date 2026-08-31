import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { DataIsoInput } from "../components/DataIsoInput";
import { ApiError, api, type AgendamentoRow, type CobrancaConvenio, type CobrancaProcedimento, type FichaTemplate, type MedicoRow, type Paciente, type RetornoVigente } from "../lib/api";
import { useMessageBox } from "../lib/messageBoxContext";
import { temModulo } from "../lib/permissoes";
import { useAuth } from "../lib/authContext";
import {
  AGENDA_FORM_DRAFT_SCOPE,
  clearAgendaFormDraft,
  saveAgendaFormDraft,
  takeAgendaFormDraft,
  takeAgendaPrefill,
  procedimentoIdsDoDraft,
} from "../lib/agendaPrefill";
import { setCadastroReturn } from "../lib/cadastroReturn";
import { linkCobrancaConta, cobrancaReturnPath } from "../lib/cobrancaContaNav";
import {
  classeBadgeContaAgendamento,
  labelBadgeContaAgendamento,
  classeBotaoContaAgendamento,
  labelBotaoContaAgendamento,
} from "../lib/cobrancaFormat";
import { upperPrompt } from "../lib/upperPrompt";
import { useFocusFirstField } from "../lib/useFocusFirstField";
import { VoltarButton } from "../components/VoltarButton";
import {
  ASO_TITULO,
  ASO_TITULO_CURTO,
} from "../lib/tipoAtendimento";
import {
  badgeClassModoClinico,
  ehConsultaRetorno,
  listaTemModo,
  motivoNaoJuntarProcedimento,
  procedimentosDaLinha,
  horarioTemAso,
  horarioTemProntuario,
} from "../lib/agendaProcedimentos";
import { useClinicaBranding } from "../lib/clinicaBrandingContext";
import { motivoDiaNaoUtil } from "../lib/diasEspeciais";
import { isDataIsoValida } from "../lib/dataIso";
import { corMedicoAgenda } from "../lib/corMedicoAgenda";
import {
  MSG_PACIENTE_AGENDA_INCOMPLETO,
  pacienteProntoParaAgendar,
} from "../lib/pacienteAgenda";
import {
  agendaDiaPath,
  agendaMesPath,
  lerMedicoIdAgenda,
  lerVoltarAgenda,
  mesDeData,
  resolverVistaAgenda,
} from "../lib/agendaNav";
import { AgendaMesPage } from "./AgendaMesPage";
import "../agenda-folha.css";

function hoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const STATUS_LABEL: Record<string, string> = {
  agendado: "Agendado",
  presente: "Presente",
  em_atendimento: "Em atendimento",
  finalizado: "Finalizado",
  nao_compareceu: "Não veio",
  cancelado: "Cancelado",
};

function formatDataBr(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function diaSemanaBr(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString("pt-BR", { weekday: "long" });
}

const FLIP_MS = 560;
const FLIP_MEIO_MS = FLIP_MS / 2;

function prefereMovimentoReduzido(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function particularId(convenios: CobrancaConvenio[]): string {
  const p =
    convenios.find((c) => c.tipo === "particular") ??
    convenios.find((c) => c.id === 1);
  return p ? String(p.id) : "";
}

function opcoesDoAgendamento(
  data:
    | CobrancaProcedimento[]
    | { procedimentos: CobrancaProcedimento[]; convenios?: CobrancaConvenio[] },
): { procedimentos: CobrancaProcedimento[]; convenios: CobrancaConvenio[] } {
  if (Array.isArray(data)) {
    return { procedimentos: data, convenios: [] };
  }
  return {
    procedimentos: Array.isArray(data.procedimentos) ? data.procedimentos : [],
    convenios: Array.isArray(data.convenios) ? data.convenios : [],
  };
}

/** Repete a hora do último agendamento daquele médico no dia (ordem de chegada). */
function calcularHoraDefaultAgenda(agendamentos: AgendamentoRow[]): string {
  const ativos = agendamentos.filter(
    (a) => a.status !== "cancelado" && a.status !== "nao_compareceu",
  );
  if (ativos.length === 0) return "08:00";
  let ultimo = ativos[0]!;
  for (const a of ativos) {
    if (a.id > ultimo.id) ultimo = a;
  }
  return ultimo.hora;
}

export function AgendaPage() {
  const [searchParams] = useSearchParams();
  if (resolverVistaAgenda(searchParams) === "mes") {
    return <AgendaMesPage />;
  }
  return <AgendaDiaPage />;
}

function AgendaDiaPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { permissoes } = useAuth();
  const { branding } = useClinicaBranding();
  const msg = useMessageBox();
  const dataUrl = searchParams.get("data");
  const dataInicial =
    dataUrl && isDataIsoValida(dataUrl) ? dataUrl : hoje();
  const [data, setData] = useState(dataInicial);
  const [dataPicker, setDataPicker] = useState(dataInicial);
  const [rows, setRows] = useState<AgendamentoRow[]>([]);
  const [medicos, setMedicos] = useState<MedicoRow[]>([]);
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [medicoId, setMedicoId] = useState<number | "">(
    () => lerMedicoIdAgenda(searchParams),
  );
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState({
    paciente_id: "",
    medico_id: "",
    hora: "08:00",
    observacao_agenda: "",
    convenio_id: "",
    procedimento_ids: [] as number[],
    ficha_template_id: "",
    aso_template_id: "",
    checkin: false,
    eh_encaixe: false,
  });
  const [fichasConsulta, setFichasConsulta] = useState<FichaTemplate[]>([]);
  const [modelosAso, setModelosAso] = useState<FichaTemplate[]>([]);
  const [procedimentosPrevistos, setProcedimentosPrevistos] = useState<
    CobrancaProcedimento[]
  >([]);
  const [conveniosAgenda, setConveniosAgenda] = useState<CobrancaConvenio[]>([]);
  const [procParaAdicionar, setProcParaAdicionar] = useState("");
  const [retornoVigente, setRetornoVigente] = useState<RetornoVigente | null>(
    null,
  );
  const [virandoFolha, setVirandoFolha] = useState<"fwd" | "back" | null>(
    null,
  );
  const flipTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const dataTecladoRef = useRef(false);

  const voltarMes = lerVoltarAgenda(
    searchParams,
    agendaMesPath(mesDeData(data), { medicoId }),
  );

  const caminhoDia = useCallback(
    (diaIso: string) => agendaDiaPath(diaIso, { medicoId, voltar: voltarMes }),
    [medicoId, voltarMes],
  );

  const cobrancaReturn = cobrancaReturnPath("/agenda", {
    vista: "dia",
    data,
    medico_id: medicoId || undefined,
    voltar: voltarMes,
  });

  useEffect(() => {
    const d = searchParams.get("data");
    if (d && isDataIsoValida(d) && d !== data) {
      setData(d);
      setDataPicker(d);
    }
  }, [searchParams, data]);

  const limparFlipTimers = useCallback(() => {
    for (const t of flipTimersRef.current) clearTimeout(t);
    flipTimersRef.current = [];
  }, []);

  const agendarFlipTimer = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    flipTimersRef.current.push(t);
  }, []);

  const mudarData = useCallback(
    (nova: string) => {
      if (!isDataIsoValida(nova) || nova === data) return;

      limparFlipTimers();
      setVirandoFolha(null);

      if (prefereMovimentoReduzido()) {
        setData(nova);
        setDataPicker(nova);
        navigate(caminhoDia(nova), { replace: true });
        return;
      }

      const dir = nova > data ? "fwd" : "back";
      setVirandoFolha(dir);

      agendarFlipTimer(() => {
        setData(nova);
        setDataPicker(nova);
        navigate(caminhoDia(nova), { replace: true });
      }, FLIP_MEIO_MS);
      agendarFlipTimer(() => setVirandoFolha(null), FLIP_MS);
    },
    [agendarFlipTimer, caminhoDia, data, limparFlipTimers, navigate],
  );

  const onDataPickerFocus = useCallback(() => {
    dataTecladoRef.current = false;
  }, []);

  const onDataPickerChange = useCallback(
    (valor: string) => {
      setDataPicker(valor);
      if (
        !isDataIsoValida(valor) ||
        valor === data ||
        dataTecladoRef.current
      ) {
        return;
      }
      mudarData(valor);
    },
    [data, mudarData],
  );

  const onDataPickerKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      dataTecladoRef.current = true;
      if (e.key === "Enter") {
        e.currentTarget.blur();
      }
    },
    [],
  );

  const onDataPickerBlur = useCallback(() => {
    dataTecladoRef.current = false;
    if (isDataIsoValida(dataPicker) && dataPicker !== data) {
      mudarData(dataPicker);
    } else {
      setDataPicker(data);
    }
  }, [data, dataPicker, mudarData]);

  const mudarDataForm = useCallback(
    (nova: string) => {
      setData(nova);
      setDataPicker(nova);
      if (isDataIsoValida(nova)) {
        navigate(caminhoDia(nova), { replace: true });
      }
    },
    [caminhoDia, navigate],
  );

  const aplicarHoraDefault = useCallback(
    async (medicoIdNum: number, dataIso: string) => {
      try {
        const list = await api.agendamentosList(dataIso, medicoIdNum);
        const hora = calcularHoraDefaultAgenda(list);
        setForm((f) => ({ ...f, hora }));
      } catch {
        /* mantém hora atual */
      }
    },
    [],
  );

  const abrirFormAgendar = useCallback(() => {
    const mid =
      form.medico_id ||
      (medicoId !== "" ? String(medicoId) : "") ||
      (medicos[0] ? String(medicos[0].id) : "");
    setEditandoId(null);
    setForm((f) => ({ ...f, medico_id: mid || f.medico_id }));
    setShowForm(true);
  }, [form.medico_id, medicoId, medicos]);

  useEffect(() => {
    if (!showForm || !form.medico_id || editandoId) return;
    void aplicarHoraDefault(Number(form.medico_id), data);
  }, [showForm, data, form.medico_id, aplicarHoraDefault, editandoId]);

  useEffect(() => () => limparFlipTimers(), [limparFlipTimers]);

  const podeCheckin = temModulo(permissoes, "fila_recepcao");
  const podeAgendar = temModulo(permissoes, "agenda");
  const podeConsultarConsulta = temModulo(permissoes, [
    "prontuario_ler",
    "prontuario_escrever",
    "fila_medico",
  ]);
  const podeConsultarAdmissional = temModulo(permissoes, [
    "admissional",
    "admissional_agenda",
  ]);
  const podeWhatsApp = temModulo(permissoes, "whatsapp");
  const podeCobranca = temModulo(permissoes, "cobranca");
  const procsEscolhidos = form.procedimento_ids
    .map((id) => procedimentosPrevistos.find((p) => p.id === id))
    .filter((p): p is CobrancaProcedimento => p != null);
  const ehAdmissional = listaTemModo(procsEscolhidos, "aso");
  const temProntuario = listaTemModo(procsEscolhidos, "prontuario");
  const ehHoje = data === hoje();

  const medicoSelecionadoId = form.medico_id ? Number(form.medico_id) : null;
  const retornoMesmoMedico =
    retornoVigente != null &&
    medicoSelecionadoId != null &&
    medicoSelecionadoId === retornoVigente.medico_id;
  const retornoOutroMedico =
    retornoVigente != null &&
    medicoSelecionadoId != null &&
    medicoSelecionadoId !== retornoVigente.medico_id;

  const carregar = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      setRows(
        await api.agendamentosList(
          data,
          medicoId ? Number(medicoId) : undefined,
        ),
      );
    } catch (e) {
      if (!opts?.silent) {
        void msg.error(e instanceof ApiError ? e.message : "Erro na agenda");
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [data, medicoId, msg]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    const t = window.setInterval(() => void carregar({ silent: true }), 8000);
    return () => window.clearInterval(t);
  }, [carregar]);

  useEffect(() => {
    void api
      .medicosList()
      .then(setMedicos)
      .catch(() => undefined);
    void api.pacientesList().then(setPacientes).catch(() => undefined);
    void (async () => {
      try {
        const bruto = await api.agendamentoProcedimentosPrevistos();
        const { procedimentos, convenios } = opcoesDoAgendamento(bruto);
        setProcedimentosPrevistos(procedimentos);
        let listaConv = convenios.filter((c) => Number(c.ativo) !== 0);
        if (listaConv.length === 0) {
          try {
            listaConv = (await api.agendamentoConvenios()).filter(
              (c) => Number(c.ativo) !== 0,
            );
          } catch {
            listaConv = [];
          }
        }
        if (listaConv.length === 0) {
          try {
            listaConv = (await api.cobrancaConveniosList(false)).filter(
              (c) => Number(c.ativo) !== 0,
            );
          } catch {
            listaConv = [];
          }
        }
        setConveniosAgenda(listaConv);
        const padrao = particularId(listaConv);
        if (padrao) {
          setForm((f) =>
            f.convenio_id && listaConv.some((c) => String(c.id) === f.convenio_id)
              ? f
              : { ...f, convenio_id: padrao },
          );
        }
      } catch {
        setProcedimentosPrevistos([]);
      }
    })();
  }, []);

  useEffect(() => {
    const draft = takeAgendaFormDraft();
    if (draft && podeAgendar) {
      setData(draft.data);
      setDataPicker(draft.data);
      setForm({
        paciente_id: draft.paciente_id,
        medico_id: draft.medico_id,
        hora: draft.hora,
        observacao_agenda: draft.observacao_agenda,
        convenio_id: draft.convenio_id || "",
        procedimento_ids: procedimentoIdsDoDraft(draft),
        ficha_template_id: draft.ficha_template_id ?? "",
        aso_template_id: draft.aso_template_id ?? "",
        checkin: draft.checkin,
        eh_encaixe: draft.eh_encaixe ?? false,
      });
      setShowForm(true);
      void api.pacientesList().then(setPacientes).catch(() => undefined);
      return;
    }
    const prefill = takeAgendaPrefill();
    if (!prefill || !podeAgendar) return;
    setForm((f) => ({ ...f, paciente_id: prefill.paciente_id }));
    setShowForm(true);
  }, [podeAgendar]);

  useFocusFirstField([showForm, loading], { enabled: !loading });

  useEffect(() => {
    const pid = Number(form.paciente_id);
    if (!pid) {
      setRetornoVigente(null);
      return;
    }
    void api
      .retornoVigente(pid)
      .then((r) => setRetornoVigente(r.vigente ? r.retorno : null))
      .catch(() => setRetornoVigente(null));
  }, [form.paciente_id]);

  useEffect(() => {
    if (!temProntuario || !form.medico_id) {
      setFichasConsulta([]);
      return;
    }
    void api
      .fichasTemplateDisponiveis(Number(form.medico_id))
      .then((r) => setFichasConsulta(r.fichas))
      .catch(() => setFichasConsulta([]));
  }, [form.medico_id, temProntuario]);

  useEffect(() => {
    if (!ehAdmissional || temProntuario || !form.medico_id) {
      setModelosAso([]);
      return;
    }
    void api
      .fichasTemplateDisponiveis(Number(form.medico_id), "aso")
      .then((r) => setModelosAso(r.fichas))
      .catch(() => setModelosAso([]));
  }, [form.medico_id, ehAdmissional, temProntuario]);

  useEffect(() => {
    if (!showForm) return;
    void api
      .agendamentoProcedimentosPrevistos()
      .then((bruto) => {
        const { procedimentos, convenios } = opcoesDoAgendamento(bruto);
        setProcedimentosPrevistos(procedimentos);
        if (convenios.length > 0) {
          const ativos = convenios.filter((c) => Number(c.ativo) !== 0);
          setConveniosAgenda(ativos);
          const padrao = particularId(ativos);
          setForm((f) => {
            if (f.convenio_id && ativos.some((c) => String(c.id) === f.convenio_id)) {
              return f;
            }
            return padrao ? { ...f, convenio_id: padrao } : f;
          });
        }
      })
      .catch(() => undefined);
  }, [showForm]);

  useEffect(() => {
    const pid = Number(form.paciente_id);
    if (!pid || !showForm) return;
    void api
      .agendamentoConvenioSugerido(pid)
      .then((r) =>
        setForm((f) => {
          const id = String(r.convenio_id);
          const existe = conveniosAgenda.some((c) => String(c.id) === id);
          return { ...f, convenio_id: existe ? id : particularId(conveniosAgenda) || id };
        }),
      )
      .catch(() => undefined);
  }, [form.paciente_id, showForm]);

  const atualizarRetornoPaciente = useCallback(async (pacienteId: number) => {
    const r = await api.retornoVigente(pacienteId);
    const vigente = r.vigente ? r.retorno : null;
    setRetornoVigente(vigente);
    return vigente;
  }, []);

  const adicionarProcedimento = (idStr: string) => {
    setProcParaAdicionar("");
    const id = Number(idStr);
    const novo = procedimentosPrevistos.find((p) => p.id === id);
    if (!novo || form.procedimento_ids.includes(id)) return;
    const motivo = motivoNaoJuntarProcedimento(procsEscolhidos, novo);
    if (motivo) {
      void msg.warning(motivo);
      return;
    }
    setForm((f) => ({ ...f, procedimento_ids: [...f.procedimento_ids, id] }));
  };

  const removerProcedimento = (id: number) => {
    setForm((f) => ({
      ...f,
      procedimento_ids: f.procedimento_ids.filter((x) => x !== id),
    }));
  };

  const abrirEditarHorario = (r: AgendamentoRow) => {
    setEditandoId(r.id);
    setForm({
      paciente_id: String(r.paciente_id),
      medico_id: String(r.medico_id),
      hora: (r.hora ?? "08:00").slice(0, 5),
      observacao_agenda: r.observacao_agenda ?? "",
      convenio_id: r.convenio_id ? String(r.convenio_id) : "",
      procedimento_ids: procedimentosDaLinha(r)
        .map((p) => p.id)
        .filter((id) => id > 0),
      ficha_template_id: r.ficha_template_id ? String(r.ficha_template_id) : "",
      aso_template_id: r.aso_template_id ? String(r.aso_template_id) : "",
      checkin: false,
      eh_encaixe: Boolean(r.eh_encaixe),
    });
    setShowForm(true);
  };

  const salvarEdicaoHorario = async () => {
    if (!editandoId) return;
    if (!form.convenio_id) {
      void msg.warning("Selecione o convênio.");
      return;
    }
    if (form.procedimento_ids.length === 0) {
      void msg.warning("Inclua pelo menos um procedimento.");
      return;
    }
    try {
      await api.agendamentoProcedimentos(editandoId, {
        procedimento_ids: form.procedimento_ids,
        convenio_id: Number(form.convenio_id),
      });
      void msg.success("Procedimentos atualizados");
      setEditandoId(null);
      setShowForm(false);
      setRetornoVigente(null);
      await carregar();
    } catch (e) {
      void msg.error(
        e instanceof ApiError ? e.message : "Erro ao atualizar procedimentos",
      );
    }
  };

  const executarAgendamento = async (opts: {
    eh_retorno?: boolean;
    ignorar_aviso_retorno?: boolean;
    ignorar_aviso_dia_especial?: boolean;
    confirmado_retorno?: boolean;
  }) => {
    if (editandoId) {
      await salvarEdicaoHorario();
      return;
    }
    if (!form.paciente_id || !form.medico_id) {
      void msg.warning("Selecione paciente e médico");
      return;
    }

    if (!opts.ignorar_aviso_dia_especial) {
      const motivo = motivoDiaNaoUtil(data);
      if (motivo) {
        const ok = await msg.confirm({
          title: "Agenda em dia não útil",
          message:
            `${formatDataBr(data)} (${diaSemanaBr(data)}) cai em ${motivo}. Deseja agendar mesmo assim?`,
          confirmLabel: "Agendar mesmo assim",
          cancelLabel: "Cancelar",
        });
        if (!ok) return;
        return executarAgendamento({
          ...opts,
          ignorar_aviso_dia_especial: true,
        });
      }
    }

    const pacienteId = Number(form.paciente_id);
    const medicoIdNum = Number(form.medico_id);

    let pacienteRow = pacientes.find((p) => p.id === pacienteId);
    if (!pacienteRow) {
      try {
        pacienteRow = await api.pacienteGet(pacienteId);
      } catch {
        pacienteRow = undefined;
      }
    }
    if (!pacienteRow || !pacienteProntoParaAgendar(pacienteRow)) {
      void msg.warning(MSG_PACIENTE_AGENDA_INCOMPLETO);
      return;
    }

    if (opts.eh_retorno && ehAdmissional) {
      void msg.warning(`${ASO_TITULO} não pode ser agendado como retorno`);
      return;
    }

    if (!form.convenio_id) {
      void msg.warning("Selecione o convênio.");
      return;
    }

    if (temProntuario) {
      if (opts.eh_retorno && !opts.confirmado_retorno) {
        try {
          const vigente = await atualizarRetornoPaciente(pacienteId);
          if (!vigente) {
            void msg.warning("Este paciente não possui retorno vigente.");
            return;
          }
          if (medicoIdNum !== vigente.medico_id) {
            void msg.warning(
              `Retorno deve ser com ${vigente.medico_nome}. Para outro médico, agende nova consulta.`,
            );
            return;
          }
          if (data > vigente.retorno_ate.slice(0, 10)) {
            void msg.warning(
              `Prazo de retorno encerra em ${formatDataBr(vigente.retorno_ate)}. Agende como nova consulta.`,
            );
            return;
          }
          const ok = await msg.confirm({
            title: "Confirmar retorno",
            message: `Paciente em prazo de retorno com ${vigente.medico_nome} até ${formatDataBr(vigente.retorno_ate)} (${vigente.dias_restantes} dia(s) restante(s)). Confirmar agendamento como retorno?`,
            confirmLabel: "Agendar retorno",
            cancelLabel: "Cancelar",
          });
          if (!ok) return;
          return executarAgendamento({
            ...opts,
            confirmado_retorno: true,
          });
        } catch (e) {
          void msg.error(
            e instanceof ApiError ? e.message : "Erro ao verificar retorno",
          );
          return;
        }
      }

      if (!opts.eh_retorno && !opts.ignorar_aviso_retorno) {
        try {
          const vigente = await atualizarRetornoPaciente(pacienteId);
          if (vigente && medicoIdNum === vigente.medico_id) {
            const ok = await msg.confirm({
              title: "Prazo de retorno ativo",
              message: `Paciente em prazo de retorno com ${vigente.medico_nome} até ${formatDataBr(vigente.retorno_ate)} (${vigente.dias_restantes} dia(s) restante(s)). Deseja agendar como nova consulta mesmo assim?`,
              confirmLabel: "Agendar consulta",
              cancelLabel: "Cancelar",
            });
            if (!ok) return;
            return executarAgendamento({
              ...opts,
              ignorar_aviso_retorno: true,
            });
          }
        } catch (e) {
          void msg.error(
            e instanceof ApiError ? e.message : "Erro ao verificar retorno",
          );
          return;
        }
      }
    }

    try {
      let procedimento_ids = [...form.procedimento_ids];
      if (opts.eh_retorno) {
        const ret = procedimentosPrevistos.find(ehConsultaRetorno);
        if (!ret) {
          void msg.warning("Cadastre o procedimento Consulta retorno.");
          return;
        }
        const consulta = procedimentosPrevistos.find((p) => p.nome === "Consulta");
        procedimento_ids = procedimento_ids.filter((id) => id !== consulta?.id);
        if (!procedimento_ids.includes(ret.id)) {
          procedimento_ids = [ret.id, ...procedimento_ids];
        }
      }
      if (procedimento_ids.length === 0) {
        void msg.warning("Inclua pelo menos um procedimento.");
        return;
      }

      await api.agendamentoCreate({
        paciente_id: pacienteId,
        medico_id: medicoIdNum,
        data,
        hora: form.hora,
        observacao_agenda: form.observacao_agenda || undefined,
        ignorar_aviso_retorno: opts.ignorar_aviso_retorno,
        ficha_template_id:
          temProntuario && form.ficha_template_id
            ? Number(form.ficha_template_id)
            : undefined,
        aso_template_id:
          ehAdmissional && !temProntuario && form.aso_template_id
            ? Number(form.aso_template_id)
            : undefined,
        procedimento_ids,
        convenio_id: Number(form.convenio_id),
        checkin: ehHoje && form.checkin ? true : undefined,
        eh_encaixe: form.eh_encaixe || undefined,
      });
      void msg.success(
        ehHoje && form.checkin
          ? "Agendamento com check-in"
          : form.eh_encaixe
            ? "Encaixe registrado"
            : opts.eh_retorno
              ? "Retorno agendado"
              : "Agendamento registrado",
      );
      const medicoIdSalvo = Number(form.medico_id);
      setForm((prev) => ({
        ...prev,
        paciente_id: "",
        observacao_agenda: "",
        ficha_template_id: "",
        aso_template_id: "",
        procedimento_ids: [],
        convenio_id: particularId(conveniosAgenda) || prev.convenio_id,
        checkin: false,
        eh_encaixe: false,
      }));
      setRetornoVigente(null);
      await carregar();
      if (medicoIdSalvo) {
        await aplicarHoraDefault(medicoIdSalvo, data);
      }
    } catch (e) {
      if (
        e instanceof ApiError &&
        e.status === 409 &&
        !opts.ignorar_aviso_retorno &&
        !opts.eh_retorno &&
        !ehAdmissional
      ) {
        const payload = (e.data ?? {}) as {
          retorno?: RetornoVigente;
          mensagem?: string;
        };
        if (payload.retorno) {
          setRetornoVigente(payload.retorno);
          const ok = await msg.confirm({
            title: "Prazo de retorno ativo",
            message:
              payload.mensagem ??
              "Paciente ainda está no prazo de retorno. Deseja agendar como nova consulta mesmo assim?",
            confirmLabel: "Agendar consulta",
            cancelLabel: "Cancelar",
          });
          if (ok) {
            await executarAgendamento({
              ...opts,
              ignorar_aviso_retorno: true,
            });
          }
          return;
        }
      }
      void msg.error(e instanceof ApiError ? e.message : "Erro ao agendar");
    }
  };

  const mudarStatus = async (id: number, status: string) => {
    try {
      await api.agendamentoStatus(id, status);
      await carregar();
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao atualizar");
    }
  };

  const consultarAtendimento = async (r: AgendamentoRow) => {
    try {
      let dest: { tipo: "consulta" | "admissional"; id: number };

      if (horarioTemAso(r) && r.admissional_id) {
        dest = { tipo: "admissional", id: r.admissional_id };
      } else if (horarioTemProntuario(r) && r.prontuario_id) {
        dest = { tipo: "consulta", id: r.prontuario_id };
      } else {
        dest = await api.agendamentoConsultar(r.id);
      }

      if (dest.tipo === "admissional") {
        navigate(`/admissional/${dest.id}`, {
          state: { fromAgenda: true, returnTo: caminhoDia(data) },
        });
        return;
      }

      navigate(`/medico/atendimento/${dest.id}`, {
        state: {
          abaInicial: "ficha",
          fromAgenda: true,
          returnTo: caminhoDia(data),
        },
      });
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao consultar");
    }
  };

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    await executarAgendamento({});
  };

  const agendarRetorno = async () => {
    await executarAgendamento({ eh_retorno: true });
  };

  const voltarParaLista = () => {
    clearAgendaFormDraft();
    setEditandoId(null);
    setShowForm(false);
    setRetornoVigente(null);
  };

  const irNovoPaciente = () => {
    saveAgendaFormDraft({
      paciente_id: form.paciente_id,
      medico_id: form.medico_id,
      hora: form.hora,
      observacao_agenda: form.observacao_agenda,
      convenio_id: form.convenio_id,
      procedimento_ids: form.procedimento_ids,
      ficha_template_id: form.ficha_template_id,
      aso_template_id: form.aso_template_id,
      checkin: form.checkin,
      eh_encaixe: form.eh_encaixe,
      data,
    });
    setCadastroReturn({
      returnPath: caminhoDia(data),
      pickField: "paciente_id",
      formScope: AGENDA_FORM_DRAFT_SCOPE,
      resource: "pacientes",
    });
    navigate("/pacientes");
  };

  const podeConsultarFinalizado = (r: AgendamentoRow): boolean => {
    if (r.status !== "finalizado") return false;
    if (horarioTemAso(r)) return podeConsultarAdmissional;
    if (horarioTemProntuario(r)) return podeConsultarConsulta;
    return false;
  };

  const enviarWhatsApp = async (r: AgendamentoRow) => {
    try {
      const extraPendente =
        Boolean(r.confirmacao_enviada) &&
        Boolean(r.whatsapp_preparo_pendente) &&
        r.data > hoje();
      if (r.confirmacao_enviada && extraPendente) {
        await api.whatsappEnviar(r.id);
      } else if (r.confirmacao_enviada) {
        const ok = await msg.confirm({
          title: "Reenviar WhatsApp?",
          message:
            "A confirmação já foi enviada. Reenviar agora com o texto atual (cada exame em maiúsculas, um por linha)?",
          confirmLabel: "Reenviar",
        });
        if (!ok) return;
        await api.whatsappEnviar(r.id, { reenviar: true });
      } else {
        await api.whatsappEnviar(r.id);
      }
      void msg.success("Mensagem enviada.");
      await carregar({ silent: true });
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao enviar WhatsApp");
    }
  };

  const marcarConfirmadoWhatsApp = async (r: AgendamentoRow) => {
    try {
      await api.whatsappMarcarConfirmado(r.id);
      void msg.success("Marcado como confirmado.");
      await carregar({ silent: true });
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao confirmar");
    }
  };

  const badgeWhatsApp = (r: AgendamentoRow) => {
    if (r.whatsapp_ultimo_status === "erro") {
      return (
        <span className="agenda-folha__wa agenda-folha__wa--erro" title="Erro no envio">
          WhatsApp: erro
        </span>
      );
    }
    if (r.confirmacao_respondida) {
      return (
        <span className="agenda-folha__wa agenda-folha__wa--ok">Confirmado</span>
      );
    }
    if (r.confirmacao_enviada) {
      return (
        <span className="agenda-folha__wa agenda-folha__wa--enviado">WhatsApp enviado</span>
      );
    }
    return null;
  };

  const renderAcoesLinha = (r: AgendamentoRow) => {
    const acoes: React.ReactNode[] = [];

    if (podeConsultarFinalizado(r)) {
      acoes.push(
        <button
          key="ver-clinico"
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void consultarAtendimento(r)}
        >
          {horarioTemAso(r) ? `Ver ${ASO_TITULO_CURTO}` : "Ver Consulta"}
        </button>,
      );
    }

    if (
      podeAgendar &&
      r.status !== "cancelado" &&
      r.status !== "nao_compareceu" &&
      !(podeCobranca && r.conta_id) &&
      (!r.conta_id || r.conta_status === "em_aberto")
    ) {
      acoes.push(
        <button
          key="procedimentos"
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => abrirEditarHorario(r)}
        >
          Procedimentos
        </button>,
      );
    }

    if (podeCheckin && r.status === "agendado") {
      acoes.push(
        <button
          key="checkin"
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => void mudarStatus(r.id, "presente")}
        >
          Check-in
        </button>,
        <button
          key="nao-veio"
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void mudarStatus(r.id, "nao_compareceu")}
        >
          Não veio
        </button>,
      );
    }

    if (
      (podeAgendar || podeCheckin) &&
      (r.status === "agendado" || r.status === "presente")
    ) {
      acoes.push(
        <button
          key="cancelar"
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void mudarStatus(r.id, "cancelado")}
        >
          Cancelar
        </button>,
      );
    }

    if (podeWhatsApp && r.status === "agendado") {
      const hojeIso = hoje();
      const podePreparoExtra =
        Boolean(r.confirmacao_enviada) &&
        Boolean(r.whatsapp_preparo_pendente) &&
        r.data > hojeIso;
      acoes.push(
        <button
          key="wa-enviar"
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void enviarWhatsApp(r)}
        >
          {!r.confirmacao_enviada
            ? "WhatsApp"
            : podePreparoExtra
              ? "Preparo Zap"
              : "Reenviar Zap"}
        </button>,
      );
      if (r.confirmacao_enviada && !r.confirmacao_respondida) {
        acoes.push(
          <button
            key="wa-confirmar"
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void marcarConfirmadoWhatsApp(r)}
          >
            Confirmou
          </button>,
        );
      }
    }

    if (podeCobranca && r.conta_id) {
      acoes.push(
        <Link
          key="cobranca"
          to={linkCobrancaConta(r.conta_id, cobrancaReturn, "Voltar à agenda")}
          className={classeBotaoContaAgendamento(r.conta_status, "no-underline")}
        >
          {labelBotaoContaAgendamento(r.conta_status)}
        </Link>,
      );
    }

    if (acoes.length > 0) {
      return <div className="flex flex-wrap gap-1 justify-end">{acoes}</div>;
    }

    if (r.status === "finalizado") {
      return (
        <span className="agenda-folha__status text-[var(--muted)]">
          Finalizado
        </span>
      );
    }

    return null;
  };

  return (
    <div className="page-stack flex-1 min-h-0 overflow-hidden">
      <PageHeader
        title="Agenda do dia"
        subtitle="Secretaria — agendamentos e check-in"
        actions={
          <div className="form-actions form-actions--toolbar">
            <VoltarButton
              className="btn btn-secondary btn-sm"
              onClick={() => navigate(voltarMes)}
            >
              Voltar ao mês
            </VoltarButton>
            {podeAgendar && !showForm ? (
              <div className="form-actions__direita">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={abrirFormAgendar}
              >
                Agendar agora
              </button>
              </div>
            ) : null}
          </div>
        }
      />
      <div className="page-stack flex-1 min-h-0 overflow-auto p-4 space-y-4">
        {!loading && medicos.length === 0 ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            Nenhum médico cadastrado na clínica. Cadastre em{" "}
            <strong>Médicos</strong> (nome e CRM) para poder agendar.
          </div>
        ) : null}

        <div className="est-card est-card--page p-0 overflow-hidden space-y-0">
          <div className="agenda-folha-wrap flex-1 min-h-0">
            <div className="agenda-folha-livro">
              <div
                className={`agenda-folha${
                  virandoFolha === "fwd"
                    ? " agenda-folha--virando-fwd"
                    : virandoFolha === "back"
                      ? " agenda-folha--virando-back"
                      : ""
                }`}
              >
              <div className="agenda-folha__furos" aria-hidden="true">
                <span className="agenda-folha__furo" />
                <span className="agenda-folha__furo" />
                <span className="agenda-folha__furo" />
              </div>
              <header className="agenda-folha__topo">
                <div className="agenda-folha__topo-esq">
                  {branding?.logo ? (
                    <img
                      src={branding.logo}
                      alt=""
                      className="agenda-folha__logo"
                    />
                  ) : null}
                  <div>
                    <h2 className="agenda-folha__titulo">Agenda do dia</h2>
                    <p className="agenda-folha__subtitulo">
                      {branding?.nome ?? "Consultório"}
                    </p>
                  </div>
                </div>
                <div className="agenda-folha__data-caixa">
                  <div className="agenda-folha__data-linha">
                    <span>Data</span>
                    <span className="agenda-folha__data-valor">
                      {formatDataBr(data)}
                    </span>
                  </div>
                  <div className="agenda-folha__data-linha">
                    <span>Dia</span>
                    <span className="agenda-folha__data-valor capitalize">
                      {diaSemanaBr(data)}
                    </span>
                  </div>
                </div>
              </header>

              <div className="agenda-folha__filtros">
                <label className="agenda-dia-field">
                  <span className="text-sm font-medium">Data</span>
                  <input
                    type="date"
                    className="legacy-input"
                    value={dataPicker}
                    onFocus={onDataPickerFocus}
                    onKeyDown={onDataPickerKeyDown}
                    onChange={(e) => onDataPickerChange(e.target.value)}
                    onBlur={onDataPickerBlur}
                    disabled={virandoFolha !== null}
                  />
                </label>
                <label className="agenda-dia-field agenda-dia-campo">
                  <span className="text-sm font-medium">Médico</span>
                  <select
                    className="legacy-input"
                    value={medicoId}
                    onChange={(e) => {
                      const v = e.target.value ? Number(e.target.value) : "";
                      setMedicoId(v);
                      navigate(
                        agendaDiaPath(data, { medicoId: v, voltar: voltarMes }),
                        { replace: true },
                      );
                    }}
                  >
                    <option value="">Todos</option>
                    {medicos.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.crm ? `${m.nome} — ${m.crm}` : m.nome}
                      </option>
                    ))}
                  </select>
                </label>
                {data !== hoje() ? (
                  <VoltarButton
                    className="btn btn-secondary btn-sm"
                    onClick={() => mudarData(hoje())}
                    disabled={virandoFolha !== null}
                  >
                    Voltar para hoje
                  </VoltarButton>
                ) : null}
              </div>

              <div className="agenda-folha__cabecalho-lista">
                <span>Hora</span>
                <span>Paciente</span>
                <span>Ações</span>
              </div>

              {loading ? (
                <p className="agenda-folha__vazio">Carregando…</p>
              ) : rows.length === 0 ? (
                <p className="agenda-folha__vazio">
                  Nenhum agendamento para {formatDataBr(data)}.
                </p>
              ) : (
                <ul className="agenda-folha__lista">
                  {rows.map((r) => (
                    <li
                      key={r.id}
                      className={`agenda-folha__linha agenda-folha__linha--${r.status}`}
                    >
                      <div className="agenda-folha__hora">
                        {r.hora}
                        {r.eh_encaixe ? (
                          <span className="agenda-folha__encaixe">Encaixe</span>
                        ) : null}
                      </div>
                      <div className="agenda-folha__conteudo">
                        <div
                          className="agenda-folha__paciente"
                          style={{ color: corMedicoAgenda(r.medico_id) }}
                        >
                          {r.paciente_nome}
                        </div>
                        <div className="agenda-folha__meta">
                          {!medicoId && r.medico_nome ? (
                            <span
                              className="agenda-folha__medico"
                              style={{ color: corMedicoAgenda(r.medico_id) }}
                            >
                              {r.medico_nome}
                            </span>
                          ) : null}
                          {procedimentosDaLinha(r).map((p) => (
                            <span
                              key={`${r.id}-${p.id}-${p.ordem}`}
                              className={badgeClassModoClinico(p.modo_clinico)}
                            >
                              {p.nome}
                            </span>
                          ))}
                          {r.convenio_nome ? (
                            <span className="agenda-folha__convenio">
                              {r.convenio_nome}
                            </span>
                          ) : null}
                          <span className="agenda-folha__status">
                            {STATUS_LABEL[r.status] ?? r.status}
                          </span>
                          {r.eh_retorno ? (
                            <span className="text-xs font-semibold text-[var(--accent)]">
                              Retorno
                            </span>
                          ) : null}
                          {podeCobranca && r.conta_id ? (
                            <span
                              className={`text-xs font-semibold ${classeBadgeContaAgendamento(r.conta_status)}`}
                            >
                              {labelBadgeContaAgendamento(r.conta_status)}
                            </span>
                          ) : null}
                          {badgeWhatsApp(r)}
                        </div>
                        {r.observacao_agenda ? (
                          <div className="agenda-folha__obs">
                            {r.observacao_agenda}
                          </div>
                        ) : null}
                      </div>
                      <div className="agenda-folha__acoes">
                        {renderAcoesLinha(r)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {!loading && rows.length > 0 ? (
                <p className="agenda-folha__subtitulo mt-3 mb-0 text-center">
                  {rows.length} agendamento(s)
                </p>
              ) : null}
              </div>
            </div>
          </div>
        </div>

        {showForm && podeAgendar ? (
          <div
            className="modal-overlay"
            role="presentation"
            onClick={voltarParaLista}
          >
            <div
              className="modal panel fk-picker-modal agenda-agendar-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="agenda-agendar-titulo"
              onClick={(ev) => ev.stopPropagation()}
            >
              <form onSubmit={(e) => void criar(e)} className="agenda-dia-form space-y-3">
                <h2 id="agenda-agendar-titulo" className="modal__title m-0 text-center">
                  {editandoId ? "Editar procedimentos" : "Agendar agora"}
                </h2>
                <p className="modal__hint text-center m-0">
                  Data da agenda: <strong>{formatDataBr(data)}</strong>
                  {editandoId ? " · horário já marcado" : ""}
                </p>
                <div className="agenda-dia-data-hora">
                  <label className="agenda-dia-field">
                    <span className="text-sm font-medium">Data</span>
                    <DataIsoInput value={data} onValueChange={mudarDataForm} required disabled={!!editandoId} />
                  </label>
                  <label className="agenda-dia-field">
                    <span className="text-sm font-medium">Hora</span>
                    <input
                      type="time"
                      className="legacy-input"
                      value={form.hora}
                      disabled={!!editandoId}
                      onChange={(e) => setForm({ ...form, hora: e.target.value })}
                      required
                    />
                  </label>
                  {data !== hoje() && !editandoId ? (
                    <VoltarButton
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => mudarDataForm(hoje())}
                    >
                      Voltar para hoje
                    </VoltarButton>
                  ) : null}
                </div>
                <p className="text-xs text-[var(--muted)] m-0">
                  Vários pacientes no mesmo horário (ex.: 08:00 manhã). O mesmo paciente não
                  pode repetir horário com o mesmo médico — inclua os procedimentos no mesmo
                  agendamento.
                </p>
                <label className="agenda-dia-field agenda-dia-campo">
                  <span className="text-sm font-medium block mb-1">Paciente</span>
                  <div className="agenda-agendar-modal__paciente-row">
                    {!editandoId ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-novo-compact agenda-agendar-modal__novo-btn"
                      onClick={irNovoPaciente}
                    >
                      +Novo
                    </button>
                    ) : null}
                    <select
                      className="legacy-input"
                      value={form.paciente_id}
                      disabled={!!editandoId}
                      onChange={(e) =>
                        setForm({ ...form, paciente_id: e.target.value })
                      }
                      required
                      autoFocus
                    >
                      <option value="">Paciente…</option>
                      {pacientes.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>
                <label className="agenda-dia-field agenda-dia-campo">
                  <span className="text-sm font-medium">Médico</span>
                  <select
                    className="legacy-input"
                    value={form.medico_id}
                    disabled={!!editandoId}
                    onChange={(e) => setForm({ ...form, medico_id: e.target.value })}
                    required
                  >
                    <option value="">Médico…</option>
                    {medicos.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.crm ? `${m.nome} — ${m.crm}` : m.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="agenda-dia-field agenda-dia-campo">
                  <span className="text-sm font-medium">Convênio</span>
                  <select
                    className="legacy-input"
                    value={form.convenio_id}
                    onChange={(e) =>
                      setForm({ ...form, convenio_id: e.target.value })
                    }
                    required
                  >
                    <option value="">Convênio…</option>
                    {conveniosAgenda.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="agenda-dia-field agenda-dia-campo">
                  <span className="text-sm font-medium">Procedimentos</span>
                  <div className="agenda-proc-chips">
                    {procsEscolhidos.map((p) => (
                      <span
                        key={p.id}
                        className={`agenda-proc-chip ${badgeClassModoClinico(p.modo_clinico)}`}
                      >
                        {p.nome}
                        <button
                          type="button"
                          className="agenda-proc-chip__x"
                          aria-label={`Remover ${p.nome}`}
                          onClick={() => removerProcedimento(p.id)}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <select
                    className="legacy-input mt-1"
                    value={procParaAdicionar}
                    onChange={(e) => adicionarProcedimento(e.target.value)}
                  >
                    <option value="">Adicionar procedimento…</option>
                    {procedimentosPrevistos
                      .filter((p) => {
                        if (form.procedimento_ids.includes(p.id)) return false;
                        return !motivoNaoJuntarProcedimento(procsEscolhidos, p);
                      })
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome}
                        </option>
                      ))}
                  </select>
                  <p className="text-xs text-[var(--muted)] mt-1">
                    Pelo menos um. Consulta e ASO não podem ir no mesmo horário.
                  </p>
                </div>
                {temProntuario && !editandoId ? (
                  <label className="agenda-dia-field agenda-dia-campo">
                    <span className="text-sm font-medium">Ficha clínica</span>
                    <select
                      className="legacy-input"
                      value={form.ficha_template_id}
                      disabled={!form.medico_id}
                      onChange={(e) =>
                        setForm({ ...form, ficha_template_id: e.target.value })
                      }
                    >
                      <option value="">Padrão da clínica</option>
                      {fichasConsulta.map((f) => (
                        <option key={f.id} value={String(f.id)}>
                          {f.nome}
                          {f.eh_default ? " (padrão)" : ""}
                          {f.medico_nome ? ` — ${f.medico_nome}` : ""}
                        </option>
                      ))}
                    </select>
                    {form.medico_id && fichasConsulta.length === 0 ? (
                      <p className="text-xs text-[var(--muted)] mt-1">
                        Nenhuma ficha extra ativa. Use o padrão da clínica ou ative uma ficha em
                        Configurações → Fichas clínicas.
                      </p>
                    ) : null}
                  </label>
                ) : null}
                {ehAdmissional && !temProntuario && !editandoId ? (
                  <label className="agenda-dia-field agenda-dia-campo">
                    <span className="text-sm font-medium">Modelo ASO</span>
                    <select
                      className="legacy-input"
                      value={form.aso_template_id}
                      disabled={!form.medico_id}
                      onChange={(e) =>
                        setForm({ ...form, aso_template_id: e.target.value })
                      }
                    >
                      <option value="">Padrão da clínica</option>
                      {modelosAso.map((f) => (
                        <option key={f.id} value={String(f.id)}>
                          {f.nome}
                          {f.eh_default ? " (padrão)" : ""}
                          {f.medico_nome ? ` — ${f.medico_nome}` : ""}
                        </option>
                      ))}
                    </select>
                    {form.medico_id && modelosAso.length === 0 ? (
                      <p className="text-xs text-[var(--muted)] mt-1">
                        Nenhum modelo extra ativo. Use o padrão da clínica ou ative um modelo em
                        Configurações → Modelos ASO.
                      </p>
                    ) : null}
                  </label>
                ) : null}
                {ehHoje && !editandoId ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.checkin}
                      onChange={(e) =>
                        setForm({ ...form, checkin: e.target.checked })
                      }
                    />
                    Check-in imediato (paciente já chegou)
                  </label>
                ) : null}
                {!editandoId ? (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.eh_encaixe}
                    onChange={(e) =>
                      setForm({ ...form, eh_encaixe: e.target.checked })
                    }
                  />
                  Encaixe (identifica na lista; horário repetido já é permitido)
                </label>
                ) : null}
                <label className="agenda-dia-field agenda-dia-campo">
                  <span className="text-sm font-medium">Observação</span>
                  <input
                    className="legacy-input"
                    placeholder="Observação"
                    value={form.observacao_agenda}
                    onChange={(e) =>
                      setForm({ ...form, observacao_agenda: upperPrompt(e.target.value) })
                    }
                  />
                </label>
                {retornoVigente && !ehAdmissional && !editandoId ? (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                    <strong>Retorno em aberto</strong> — Dr(a).{" "}
                    {retornoVigente.medico_nome} até{" "}
                    {formatDataBr(retornoVigente.retorno_ate)} (
                    {retornoVigente.dias_restantes} dia(s) restante(s)).
                    {retornoOutroMedico ? (
                      <>
                        {" "}
                        Médico selecionado é outro — agende como{" "}
                        <strong>nova consulta</strong>.
                      </>
                    ) : (
                      <>
                        {" "}
                        Combine com o paciente: use &quot;Agendar retorno&quot; ou
                        agende nova consulta.
                      </>
                    )}
                  </div>
                ) : null}
                <div className="modal__actions fk-picker-modal__footer agenda-agendar-modal__footer">
                  <VoltarButton
                    type="button"
                    className="btn btn-secondary"
                    onClick={voltarParaLista}
                  >
                    Voltar p/ Agenda
                  </VoltarButton>
                  <div className="form-actions__direita">
                  {retornoVigente && retornoMesmoMedico && !ehAdmissional && !editandoId ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => void agendarRetorno()}
                    >
                      Agendar retorno
                    </button>
                  ) : null}
                  <button type="submit" className="btn btn-primary">
                    {editandoId
                      ? "Salvar"
                      : retornoVigente && retornoMesmoMedico && !ehAdmissional
                        ? "Agendar consulta"
                        : "Agendar"}
                  </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
