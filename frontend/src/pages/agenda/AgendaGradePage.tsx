import { CalendarClock, ChevronLeft, ChevronRight, Plus, RefreshCw, Settings } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DataIsoInput } from "../../components/DataIsoInput";
import { PageHeader } from "../../components/PageHeader";
import { GradeTempo } from "../../components/agenda/grade/GradeTempo";
import { HorarioPadraoDialog } from "../../components/agenda/grade/HorarioPadraoDialog";
import { ListaDia } from "../../components/agenda/grade/ListaDia";
import { VagosDialog } from "../../components/agenda/grade/VagosDialog";
import { AgendarDialog } from "../../components/agenda/marcar/AgendarDialog";
import { PainelAgendamento } from "../../components/agenda/painel/PainelAgendamento";
import { ApiError } from "../../lib/api";
import {
  agendaNovaApi,
  type AgendamentoGrade,
  type Bloqueio,
  type Grade,
  type MedicoAgenda,
} from "../../lib/agendaNova/api";
import { horaParaMinutos } from "../../lib/agendaNova/horario";
import { faixaMinutos, horariosVagos, minutosParaHora } from "../../lib/agendaNova/layoutGrade";
import {
  dataBr,
  diasDaGradeMes,
  diasDaSemana,
  hojeIso,
  rotuloMes,
  rotuloPeriodo,
  somarDias,
  somarMeses,
} from "../../lib/agendaNova/semana";
import { GradeMes } from "../../components/agenda/grade/GradeMes";
import { comConfirmacoes, type Confirmacao } from "../../lib/agendaNova/confirmacoes";
import { useAuth } from "../../lib/authContext";
import { useMessageBox } from "../../lib/messageBoxContext";
import { temModulo } from "../../lib/permissoes";
import { corMedicoAgenda } from "../../lib/corMedicoAgenda";
import "../../agenda-nova.css";

type Visao = "mes" | "semana" | "dia" | "lista";
const VISOES: { id: Visao; rotulo: string }[] = [
  { id: "mes", rotulo: "Mês" },
  { id: "semana", rotulo: "Semana" },
  { id: "dia", rotulo: "Dia" },
  { id: "lista", rotulo: "Lista" },
];
const RECARREGAR_MS = 60_000;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

function agoraEmMinutos(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/** Médico escolhido fica lembrado neste computador, por usuário. */
function chaveMedico(usuarioId: number | undefined) {
  return `agn.medico.${usuarioId ?? 0}`;
}
function lerMedicoSalvo(usuarioId: number | undefined): number | null {
  try {
    const n = Number(localStorage.getItem(chaveMedico(usuarioId)));
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}
function salvarMedico(usuarioId: number | undefined, id: number) {
  try {
    localStorage.setItem(chaveMedico(usuarioId), String(id));
  } catch {
    /* navegador sem armazenamento: só não lembra */
  }
}

/** Agenda Nova — grade da semana/dia de UM médico, pronta para marcar (A4). */
export function AgendaGradePage() {
  const msg = useMessageBox();
  const { me, permissoes } = useAuth();
  const ehMedico = me?.perfil === "medico";
  const podeAjustarPadrao = temModulo(permissoes, "agenda_config");

  const [params, setParams] = useSearchParams();
  const visao: Visao = (["mes", "semana", "dia", "lista"] as const).find((v) => v === params.get("v")) ?? "semana";
  const dataRef = DATA_RE.test(params.get("d") ?? "") ? params.get("d")! : hojeIso();

  const [medicos, setMedicos] = useState<MedicoAgenda[]>([]);
  const [medicoId, setMedicoId] = useState<number | null>(null);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [hoje, setHoje] = useState(hojeIso());
  const [agoraMin, setAgoraMin] = useState(agoraEmMinutos());
  const [dialogo, setDialogo] = useState<"padrao" | "vagos" | null>(null);
  /** Janela de marcação aberta (A4c). */
  const [marcando, setMarcando] = useState<{ data: string; hora: string; pacienteId?: number } | null>(null);
  /** Painel lateral (A4b) e edição. */
  const [selecionadoId, setSelecionadoId] = useState<number | null>(null);
  const [editando, setEditando] = useState<AgendamentoGrade | null>(null);

  // Mês = 6 semanas fixas (42 dias, dentro do limite da grade no backend).
  const dias = useMemo(
    () =>
      visao === "mes" ? diasDaGradeMes(dataRef) : visao === "semana" ? diasDaSemana(dataRef) : [dataRef],
    [visao, dataRef],
  );
  const de = dias[0]!;
  const ate = dias[dias.length - 1]!;

  const irPara = (mudar: { v?: Visao; d?: string }) => {
    const p = new URLSearchParams(params);
    if (mudar.v) p.set("v", mudar.v);
    if (mudar.d) p.set("d", mudar.d);
    setParams(p, { replace: true });
  };

  // Médicos: o perfil médico vê só a própria agenda.
  useEffect(() => {
    if (!me) return;
    if (ehMedico) {
      setMedicos([{ medico_id: me.id, nome: me.username, ativo: 1 }]);
      setMedicoId(me.id);
      return;
    }
    agendaNovaApi
      .medicos()
      .then((lista) => {
        const ativos = lista.filter((m) => m.ativo);
        setMedicos(ativos);
        const salvo = lerMedicoSalvo(me.id);
        setMedicoId(ativos.find((m) => m.medico_id === salvo)?.medico_id ?? ativos[0]?.medico_id ?? null);
      })
      .catch((e) => void msg.error(e instanceof ApiError ? e.message : "Erro ao carregar os médicos"));
  }, [me, ehMedico, msg]);

  const carregar = useCallback(
    async (silencioso = false) => {
      if (!medicoId) return;
      if (!silencioso) setCarregando(true);
      try {
        setGrade(await agendaNovaApi.grade(de, ate, medicoId));
      } catch (e) {
        if (!silencioso) void msg.error(e instanceof ApiError ? e.message : "Erro ao carregar a agenda");
      } finally {
        setCarregando(false);
      }
    },
    [de, ate, medicoId, msg],
  );

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Atualiza sozinha (outro computador pode ter marcado) e move a linha da hora atual.
  useEffect(() => {
    const t = window.setInterval(() => {
      setHoje(hojeIso());
      setAgoraMin(agoraEmMinutos());
      void carregar(true);
    }, RECARREGAR_MS);
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void carregar(true);
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [carregar]);

  const medico = medicos.find((m) => m.medico_id === medicoId) ?? null;
  // Todos do médico (inclui cancelados/"não veio") — só para o painel lateral não
  // fechar na hora em que a secretária marca "Não veio" ou cancela.
  const todosDoMedico = useMemo(
    () => (grade?.agendamentos ?? []).filter((a) => a.medico_id === medicoId),
    [grade, medicoId],
  );
  // Na agenda (semana, dia, mês e lista) cancelados e "não veio" não aparecem:
  // o horário fica livre para marcar outro paciente (o banco já não os conta como ocupando).
  const agendamentos = useMemo(
    () => todosDoMedico.filter((a) => a.status !== "cancelado" && a.status !== "nao_compareceu"),
    [todosDoMedico],
  );
  // Mês: pacientes por dia (ignora cancelados e "não veio").
  const ativosPorDia = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of agendamentos) {
      if (a.status === "cancelado" || a.status === "nao_compareceu") continue;
      m.set(a.data, (m.get(a.data) ?? 0) + 1);
    }
    return m;
  }, [agendamentos]);

  // Painel: sempre a versão mais nova do agendamento (some se saiu do período/médico).
  const selecionado = todosDoMedico.find((a) => a.id === selecionadoId) ?? null;

  // Bloqueios do médico e os da clínica toda (o backend já filtra).
  const bloqueios: Bloqueio[] = grade?.bloqueios ?? [];
  const padrao = grade?.horario_padrao ?? { inicio: "07:00", fim: "19:00", intervalo_minutos: 30 };

  const vagosPorDia = useMemo(() => {
    const p = faixaMinutos(padrao);
    return dias.map((d) => ({
      data: d,
      vagos: horariosVagos({
        padrao: p,
        passo: padrao.intervalo_minutos,
        ocupados: agendamentos
          .filter((a) => a.data === d && a.status !== "cancelado" && a.status !== "nao_compareceu")
          .map((a) => ({ ini: horaParaMinutos(a.hora), fim: horaParaMinutos(a.hora_fim) })),
        bloqueios: bloqueios
          .filter((b) => b.data_inicio <= d && d <= b.data_fim)
          .map((b) => ({ ini: horaParaMinutos(b.hora_inicio), fim: horaParaMinutos(b.hora_fim) })),
        agoraMin: d === hoje ? agoraMin : null,
        passado: d < hoje,
      }),
    }));
  }, [dias, padrao, agendamentos, bloqueios, hoje, agoraMin]);

  // --- Ações (o painel lateral do card chega na A4b) ---
  const marcar = (data: string, hora: string) => {
    if (data < hoje) {
      void msg.warning("Esse dia já passou.");
      return;
    }
    if (!medicoId) return;
    setMarcando({ data, hora });
  };

  // --- Arrastar para remarcar (A4d) ---
  const perguntar = (c: Confirmacao) =>
    msg.confirm({ title: c.titulo, message: c.mensagem, confirmLabel: c.botao, cancelLabel: "Cancelar" });

  /** Move o card na tela na hora, sem esperar o servidor (o recarregar confirma). */
  const moverNaTela = (mudancas: { id: number; data: string; hora: string }[]) =>
    setGrade((g) =>
      g
        ? {
            ...g,
            agendamentos: g.agendamentos.map((a) => {
              const m = mudancas.find((x) => x.id === a.id);
              if (!m) return a;
              const fim = minutosParaHora(horaParaMinutos(m.hora) + a.duracao_minutos);
              return { ...a, data: m.data, hora: m.hora, hora_fim: fim };
            }),
          }
        : g,
    );

  /**
   * Arrastar e soltar: sem a pergunta "Remarcar?" e sem mensagem de sucesso.
   * Os avisos da agenda (horário bloqueado, sábado/domingo/feriado, prazo de
   * retorno, conta recebida) continuam aparecendo; se a pessoa desistir, o card volta.
   */
  /** Soltou em espaço livre: remarcar (fica lado a lado se já houver alguém). */
  const moverPorArraste = async (ag: AgendamentoGrade, data: string, hora: string) => {
    if (ag.data === data && ag.hora === hora) return;
    moverNaTela([{ id: ag.id, data, hora }]);
    try {
      await comConfirmacoes((flags) => agendaNovaApi.mover(ag.id, { data, hora, ...flags }), perguntar);
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Não foi possível remarcar");
    }
    await carregar(true);
  };

  /** Soltou em cima de outro card: os dois trocam de lugar. */
  const trocarPorArraste = async (a: AgendamentoGrade, b: AgendamentoGrade) => {
    moverNaTela([
      { id: a.id, data: b.data, hora: b.hora },
      { id: b.id, data: a.data, hora: a.hora },
    ]);
    try {
      await comConfirmacoes((flags) => agendaNovaApi.trocar(a.id, b.id, flags), perguntar);
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Não foi possível trocar");
    }
    await carregar(true);
  };

  /** Clique no card: abre o painel lateral (A4b). */
  const abrirCard = (ag: AgendamentoGrade) => setSelecionadoId(ag.id);

  /** Clique no bloqueio: mostra os detalhes e permite desbloquear. */
  const abrirBloqueio = async (b: Bloqueio) => {
    const diaInteiro = b.hora_inicio === "00:00" && b.hora_fim === "24:00";
    const periodo =
      b.data_inicio === b.data_fim ? dataBr(b.data_inicio) : `${dataBr(b.data_inicio)} a ${dataBr(b.data_fim)}`;
    const ok = await msg.confirm({
      title: "Horário bloqueado",
      message:
        [
          `${periodo} · ${diaInteiro ? "dia inteiro" : `${b.hora_inicio} às ${b.hora_fim}`}`,
          b.medico_id ? b.medico_nome : "Todos os médicos (clínica toda)",
          b.motivo && `Motivo: ${b.motivo}`,
          b.criado_por_nome && `Bloqueado por: ${b.criado_por_nome}`,
        ]
          .filter(Boolean)
          .join("\n") +
        `\n\n${b.data_inicio === b.data_fim ? "Deseja desbloquear?" : "Desbloquear libera todo esse período."}`,
      confirmLabel: "Desbloquear",
      cancelLabel: "Manter bloqueado",
    });
    if (!ok) return;
    try {
      await agendaNovaApi.desbloquear(b.id);
      void msg.success("Horário desbloqueado.");
      await carregar(true);
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao desbloquear");
    }
  };

  /** "+ Agendar": próximo horário vago a partir de agora. */
  const agendarProximo = () => {
    const prox = vagosPorDia.find((d) => d.vagos.length > 0);
    if (!prox) {
      void msg.info("Nenhum horário vago no período. Avance a semana ou clique direto num horário.");
      return;
    }
    marcar(prox.data, minutosParaHora(prox.vagos[0]!.ini));
  };

  // Vindo de Pacientes → "Agendar" (/agenda?paciente=ID): abre a marcação no próximo
  // horário vago com o paciente já escolhido, e tira o parâmetro da URL.
  const pacienteParam = Number(params.get("paciente"));
  useEffect(() => {
    if (!Number.isInteger(pacienteParam) || pacienteParam <= 0 || !grade || !medicoId) return;
    const prox = vagosPorDia.find((d) => d.vagos.length > 0);
    setMarcando({
      data: prox?.data ?? hoje,
      hora: prox ? minutosParaHora(prox.vagos[0]!.ini) : padrao.inicio,
      pacienteId: pacienteParam,
    });
    const p = new URLSearchParams(params);
    p.delete("paciente");
    setParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pacienteParam, grade, medicoId]);

  /** ‹ › anda 1 mês, 1 semana ou 1 dia conforme a visão. */
  const navegar = (sentido: 1 | -1) =>
    irPara({
      d:
        visao === "mes"
          ? somarMeses(dataRef, sentido)
          : somarDias(dataRef, sentido * (visao === "semana" ? 7 : 1)),
    });
  const nomeDoPasso = visao === "mes" ? "mês" : visao === "semana" ? "semana" : "dia";
  const periodo = visao === "mes" ? rotuloMes(dataRef) : rotuloPeriodo(de, ate);

  return (
    <div className="page-stack flex-1 min-h-0 overflow-hidden">
      <PageHeader
        title="Agenda"
        subtitle={grade ? periodo : undefined}
      />

      <div className="agn-barra px-4">
        <div className="agn-barra__grupo" role="group" aria-label="Visão">
          {VISOES.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={visao === v.id}
              className={`btn btn-sm ${visao === v.id ? "btn-primary" : "btn-secondary"}`}
              onClick={() => irPara({ v: v.id })}
            >
              {v.rotulo}
            </button>
          ))}
        </div>

        {/* Data: Hoje ‹ › em cima, campo no meio, período embaixo — tudo centralizado no campo. */}
        <div className="agn-barra__data">
          <div className="agn-barra__data-nav">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => irPara({ d: hojeIso() })}>
            Hoje
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm px-2"
            aria-label={`Voltar (${nomeDoPasso} anterior)`}
            onClick={() => navegar(-1)}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm px-2"
            aria-label={`Avançar (próximo ${nomeDoPasso})`}
            onClick={() => navegar(1)}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
          </div>
          {/* DataIsoInput: digitando, só vai para a data ao sair do campo ou apertar Enter
              (antes buscava a cada tecla, pegando datas parciais como o ano 0002).
              Escolhendo no calendário, vai na hora. */}
          <DataIsoInput
            className="legacy-input agn-barra__data-campo"
            aria-label="Ir para a data"
            title="Digite a data e aperte Enter (ou escolha no calendário)"
            value={dataRef}
            onValueChange={(d) => {
              const ano = Number(d.slice(0, 4));
              if (ano >= 1900 && ano <= 2100) irPara({ d });
            }}
          />
          <span className="agn-barra__periodo">{periodo}</span>
        </div>

        <div className="agn-barra__grupo agn-barra__grupo--medico">
          {ehMedico ? (
            <span className="font-medium">{medico?.nome}</span>
          ) : (
            <label className="flex items-center gap-2 text-sm">
              <span className="font-medium">Médico</span>
              <select
                className="legacy-input agn-barra__medico"
                value={medicoId ?? ""}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  setMedicoId(id);
                  salvarMedico(me?.id, id);
                }}
              >
                {medicos.length === 0 && <option value="">Nenhum médico ativo</option>}
                {medicos.map((m) => (
                  <option key={m.medico_id} value={m.medico_id}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="agn-barra__grupo ml-auto">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDialogo("vagos")} disabled={!medico}>
            <CalendarClock className="inline h-4 w-4 mr-1" aria-hidden />
            Ver horários vagos
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={agendarProximo} disabled={!medico}>
            <Plus className="inline h-4 w-4 mr-1" aria-hidden />
            Agendar
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm px-2"
            aria-label="Atualizar"
            title="Atualizar"
            onClick={() => void carregar()}
          >
            <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} aria-hidden />
          </button>
          {podeAjustarPadrao && (
            <button
              type="button"
              className="btn btn-secondary btn-sm px-2"
              aria-label="Horário padrão da agenda"
              title={`Horário padrão: ${padrao.inicio}–${padrao.fim}, de ${padrao.intervalo_minutos} em ${padrao.intervalo_minutos} min`}
              onClick={() => setDialogo("padrao")}
              disabled={!grade}
            >
              <Settings className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      </div>

      <div
        className="agn-area scroll-interno"
        style={medicoId ? ({ "--agn-cor-medico": corMedicoAgenda(medicoId) } as React.CSSProperties) : undefined}
      >
        {!medicoId ? (
          <p className="p-6 text-sm text-[var(--muted)]">
            {medicos.length === 0 ? "Nenhum médico ativo cadastrado (menu Médicos)." : "Escolha o médico."}
          </p>
        ) : !grade ? (
          <p className="p-6 text-sm text-[var(--muted)]">Carregando…</p>
        ) : visao === "mes" ? (
          <GradeMes
            dias={dias}
            mesRef={dataRef}
            ativosPorDia={ativosPorDia}
            bloqueios={bloqueios}
            hoje={hoje}
            onDia={(d) => irPara({ v: "dia", d })}
          />
        ) : visao === "lista" ? (
          <ListaDia agendamentos={agendamentos} tipos={grade.tipos} onCard={abrirCard} />
        ) : (
          <GradeTempo
            dias={dias}
            faixa={grade.faixa}
            padrao={padrao}
            passo={padrao.intervalo_minutos}
            agendamentos={agendamentos}
            bloqueios={bloqueios}
            tipos={grade.tipos}
            hoje={hoje}
            agoraMin={agoraMin}
            podeArrastar={temModulo(permissoes, "agenda")}
            onSlot={marcar}
            onCard={abrirCard}
            onBloqueio={abrirBloqueio}
            onMover={(ag, d, h) => void moverPorArraste(ag, d, h)}
            onTrocar={(a, b) => void trocarPorArraste(a, b)}
          />
        )}
      </div>

      {dialogo === "padrao" && grade && (
        <HorarioPadraoDialog
          atual={padrao}
          onFechar={() => setDialogo(null)}
          onSalvo={() => {
            setDialogo(null);
            void msg.success("Horário padrão salvo.");
            void carregar();
          }}
        />
      )}
      {selecionado && grade && (
        <PainelAgendamento
          ag={selecionado}
          tipos={grade.tipos}
          medicoNome={medico?.nome ?? ""}
          hoje={hoje}
          permissoes={permissoes}
          voltarPara={`/agenda?${params.toString()}`}
          onFechar={() => setSelecionadoId(null)}
          onEditar={() => setEditando(selecionado)}
          onAtualizar={() => carregar(true)}
        />
      )}
      {editando && medicoId && (
        <AgendarDialog
          medicos={medicos}
          medicoId={editando.medico_id}
          data={editando.data}
          hora={editando.hora}
          padrao={padrao}
          ehMedico={ehMedico}
          hoje={hoje}
          editar={editando}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            void carregar(true);
          }}
        />
      )}
      {marcando && medicoId && (
        <AgendarDialog
          medicos={medicos}
          medicoId={medicoId}
          data={marcando.data}
          hora={marcando.hora}
          padrao={padrao}
          ehMedico={ehMedico}
          hoje={hoje}
          pacienteInicialId={marcando.pacienteId}
          onFechar={() => setMarcando(null)}
          onSalvo={() => {
            setMarcando(null);
            void carregar(true);
          }}
        />
      )}
      {dialogo === "vagos" && medico && (
        <VagosDialog
          medicoNome={medico.nome}
          vagosPorDia={vagosPorDia}
          onFechar={() => setDialogo(null)}
          onEscolher={(d, h) => {
            setDialogo(null);
            marcar(d, h);
          }}
        />
      )}
    </div>
  );
}
