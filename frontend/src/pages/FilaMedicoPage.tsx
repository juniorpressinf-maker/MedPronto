import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, ClipboardCheck, FileText, FlaskConical, LogIn, Stethoscope, UserX, Wallet } from "lucide-react";
import { DataIsoInput } from "../components/DataIsoInput";
import { FinalizarExameDialog } from "../components/FinalizarExameDialog";
import { ClinicaBrandMark } from "../components/ClinicaBrandMark";
import { PageHeader } from "../components/PageHeader";
import {
  ApiError,
  api,
  type AgendamentoRow,
  type MedicoRow,
  type PendenciaDiaFila,
} from "../lib/api";
import { useAuth } from "../lib/authContext";
import { useMessageBox } from "../lib/messageBoxContext";
import { temModulo } from "../lib/permissoes";
import { cobrancaReturnPath, linkCobrancaConta } from "../lib/cobrancaContaNav";
import { isDataIsoValida } from "../lib/dataIso";
import {
  classeBadgeContaAgendamento,
  labelBadgeContaAgendamento,
} from "../lib/cobrancaFormat";
import "../botoes-modernos.css";
import { corMedicoAgenda } from "../lib/corMedicoAgenda";
import {
  ASO_TITULO_CURTO,
} from "../lib/tipoAtendimento";
import {
  badgeClassModoClinico,
  horarioSoExame,
  horarioTemExame,
  horarioTemAso,
  horarioTemProntuario,
  procedimentosDaLinha,
} from "../lib/agendaProcedimentos";

function hoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type EtapaFila = "agendado" | "presente" | "em_atendimento" | "finalizado";

function Coluna({
  etapa,
  titulo,
  itens,
  mostrarMedico,
  onCheckin,
  onNaoVeio,
  onAtender,
  onFinalizarExame,
  onVerExames,
  onVerConsulta,
  onVerAdmissional,
  podeCobranca,
  cobrancaReturn = "/medico/fila",
}: {
  etapa: EtapaFila;
  titulo: string;
  itens: AgendamentoRow[];
  mostrarMedico?: boolean;
  onCheckin?: (id: number) => void;
  onNaoVeio?: (id: number) => void;
  onAtender?: (a: AgendamentoRow) => void;
  onFinalizarExame?: (a: AgendamentoRow) => void;
  onVerExames?: (a: AgendamentoRow) => void;
  onVerConsulta?: (prontuarioId: number) => void;
  onVerAdmissional?: (admissionalId: number) => void;
  podeCobranca?: boolean;
  cobrancaReturn?: string;
}) {
  return (
    <div
      className={`est-card fila-coluna fila-coluna--${etapa} flex min-h-0 min-w-[200px] flex-1 flex-col p-3`}
    >
      <h3 className="fila-coluna__titulo m-0 mb-3 shrink-0 text-sm font-semibold uppercase tracking-wide">
        {titulo} ({itens.length})
      </h3>
      <ul className="fila-coluna__lista scroll-interno scroll-interno--flex m-0 list-none space-y-2 p-0">
        {itens.map((a) => {
          const temAso = horarioTemAso(a);
          const temProntuario = horarioTemProntuario(a);
          const abreClinico = temAso || temProntuario;
          const soExame = horarioSoExame(a);
          const temExame = horarioTemExame(a);
          return (
            <li
              key={a.id}
              className="fila-coluna__item rounded-lg border p-2"
              // Contorno na cor do médico: identifica de quem é o paciente na fila.
              style={{ borderColor: corMedicoAgenda(a.medico_id), borderWidth: 4 }}
            >
              <div
                className="fila-coluna__paciente font-medium"
                style={{ color: corMedicoAgenda(a.medico_id) }}
              >
                {a.paciente_nome}
              </div>
              <div className="text-xs text-[var(--muted)]">{a.hora}</div>
              {mostrarMedico && a.medico_nome ? (
                <div
                  className="text-xs"
                  style={{ color: corMedicoAgenda(a.medico_id) }}
                >
                  {a.medico_nome}
                </div>
              ) : null}
              {procedimentosDaLinha(a).map((p) => (
                <span
                  key={`${a.id}-${p.id}-${p.ordem}`}
                  className={badgeClassModoClinico(p.modo_clinico)}
                >
                  {p.nome}
                </span>
              ))}
              {a.observacao_agenda ? (
                <div className="text-xs text-[var(--muted)] mt-1">
                  {a.observacao_agenda}
                </div>
              ) : null}
              {a.paciente_alergias ? (
                <div className="text-xs text-red-700 mt-1">
                  Alergia: {a.paciente_alergias}
                </div>
              ) : null}
              {podeCobranca && a.conta_id ? (
                <div
                  className={`text-xs font-semibold mt-1 ${classeBadgeContaAgendamento(a.conta_status)}`}
                >
                  {labelBadgeContaAgendamento(a.conta_status)}
                </div>
              ) : null}
              <div className="fila-coluna__acoes mt-2 flex flex-wrap gap-1">
                {onCheckin && a.status === "agendado" ? (
                  <button
                    type="button"
                    className="acao-pill acao-pill--primaria"
                    onClick={() => onCheckin(a.id)}
                  >
                    <LogIn size={18} aria-hidden /> Check-in
                  </button>
                ) : null}
                {onNaoVeio && a.status === "agendado" ? (
                  <button
                    type="button"
                    className="acao-pill acao-pill--suave acao-pill--alerta"
                    onClick={() => onNaoVeio(a.id)}
                  >
                    <UserX size={18} aria-hidden /> Não veio
                  </button>
                ) : null}
                {onAtender &&
                abreClinico &&
                (a.status === "presente" || a.status === "em_atendimento") ? (
                  <button
                    type="button"
                    className="acao-pill acao-pill--primaria"
                    onClick={() => onAtender(a)}
                  >
                    <Stethoscope size={18} aria-hidden /> Atender
                  </button>
                ) : null}
                {onFinalizarExame &&
                soExame &&
                (a.status === "presente" || a.status === "em_atendimento") ? (
                  <button
                    type="button"
                    className="acao-pill acao-pill--primaria"
                    onClick={() => onFinalizarExame(a)}
                  >
                    <CheckCircle2 size={18} aria-hidden /> Finalizar
                  </button>
                ) : null}
                {/* Só-exame: "Finalizar" já abre o diálogo; aqui só depois de finalizado.
                    Misto (consulta/ASO + exame): laudo a qualquer momento após o check-in. */}
                {onVerExames &&
                a.conta_id &&
                (soExame
                  ? a.status === "finalizado"
                  : temExame &&
                    (a.status === "presente" ||
                      a.status === "em_atendimento" ||
                      a.status === "finalizado")) ? (
                  <button
                    type="button"
                    className="acao-pill acao-pill--suave"
                    onClick={() => onVerExames(a)}
                  >
                    <FlaskConical size={18} aria-hidden /> Exames
                  </button>
                ) : null}
                {onVerConsulta && temProntuario && a.prontuario_id ? (
                  <button
                    type="button"
                    className="acao-pill acao-pill--suave"
                    onClick={() => onVerConsulta(a.prontuario_id!)}
                  >
                    <FileText size={18} aria-hidden /> Ver consulta
                  </button>
                ) : null}
                {onVerAdmissional && temAso && a.admissional_id ? (
                  <button
                    type="button"
                    className="acao-pill acao-pill--suave"
                    onClick={() => onVerAdmissional(a.admissional_id!)}
                  >
                    <ClipboardCheck size={18} aria-hidden /> Ver {ASO_TITULO_CURTO}
                  </button>
                ) : null}
                {podeCobranca && a.conta_id ? (
                  <Link
                    to={linkCobrancaConta(a.conta_id, cobrancaReturn, "Voltar à fila")}
                    className={`acao-pill no-underline ${a.conta_status === "pago" ? "acao-pill--pago" : "acao-pill--suave"}`}
                  >
                    <Wallet size={18} aria-hidden /> Conta
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
        {!itens.length && (
          <li className="text-sm text-[var(--muted)]">Nenhum</li>
        )}
      </ul>
    </div>
  );
}

/** Data/médico da sala de espera: lembrados até o fim do dia (ir ao prontuário e voltar não perde). */
const CHAVE_FILTRO = "medpronto_fila_filtro";
function lerFiltroLembrado(): { data?: string; medico_id?: number | "" } {
  try {
    const v = JSON.parse(sessionStorage.getItem(CHAVE_FILTRO) ?? "null");
    if (v && v.dia === hoje()) return v;
  } catch {
    /* sem storage */
  }
  return {};
}

export function FilaMedicoPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const lembrado = lerFiltroLembrado();
  const msg = useMessageBox();
  const { me, permissoes } = useAuth();
  const dataUrl = searchParams.get("data");
  const dataInicial = dataUrl && isDataIsoValida(dataUrl) ? dataUrl : (lembrado.data ?? hoje());
  const medicoUrl = searchParams.get("medico_id");
  const medicoInicial: number | "" =
    medicoUrl && /^[0-9]+$/.test(medicoUrl) ? Number(medicoUrl) : dataUrl ? "" : (lembrado.medico_id ?? "");
  const [data, setData] = useState(dataInicial);
  const [grupos, setGrupos] = useState<Record<string, AgendamentoRow[]>>({});
  const [medicos, setMedicos] = useState<MedicoRow[]>([]);
  const [medicoId, setMedicoId] = useState<number | "">(medicoInicial);
  // Laudo dos exames: modo "finalizar" (Aguardando/Em atendimento) ou só ver/anexar (Finalizados).
  const [qtdLaudosPendentes, setQtdLaudosPendentes] = useState<number | null>(null);
  /** Dias anteriores com horário sem desfecho (igual ao CliniCar). */
  const [pendenciasDias, setPendenciasDias] = useState<PendenciaDiaFila[]>([]);
  const [dialogExames, setDialogExames] = useState<{
    agendamento: AgendamentoRow;
    finalizar: boolean;
  } | null>(null);

  const ehMedicoPerfil = me?.perfil === "medico";
  const podeFiltrarQualquerMedico =
    me?.perfil === "admin" ||
    me?.perfil === "secretaria" ||
    temModulo(permissoes, "fila_recepcao");
  const ehSecretaria =
    me?.perfil === "secretaria" ||
    (temModulo(permissoes, ["fila_recepcao", "agenda"]) &&
      !temModulo(permissoes, "fila_medico"));

  const checkinAgendados =
    !ehMedicoPerfil && temModulo(permissoes, ["fila_recepcao", "agenda"]);
  const podeCobranca = temModulo(permissoes, "cobranca");

  const cobrancaReturn = cobrancaReturnPath("/medico/fila", {
    data,
    medico_id: medicoId || undefined,
  });

  // Estado -> endereço + lembrança do dia: voltar do prontuário/menu mantém data e médico.
  useEffect(() => {
    const sp = new URLSearchParams(searchParams);
    sp.set("data", data);
    if (medicoId) sp.set("medico_id", String(medicoId));
    else sp.delete("medico_id");
    if (sp.toString() !== searchParams.toString()) setSearchParams(sp, { replace: true });
    try {
      sessionStorage.setItem(CHAVE_FILTRO, JSON.stringify({ dia: hoje(), data, medico_id: medicoId }));
    } catch {
      /* sem storage */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, medicoId]);

  const voltarParaFila = `/medico/fila?data=${data}${medicoId ? `&medico_id=${medicoId}` : ""}`;

  const acoesAtender =
    temModulo(permissoes, "fila_medico") &&
    (ehMedicoPerfil || me?.perfil === "admin");

  const mostrarMedico = podeFiltrarQualquerMedico && !medicoId;

  /** Abre o dia da pendência; se o médico escolhido não tem pendência nesse dia,
   *  troca o filtro para quem tem (um só) ou para Todos. */
  const abrirPendencia = (p: PendenciaDiaFila) => {
    const meds = p.medicos ?? [];
    if (podeFiltrarQualquerMedico && medicoId && !meds.some((m) => m.id === Number(medicoId))) {
      setMedicoId(meds.length === 1 ? meds[0]!.id : "");
    }
    setData(p.data);
  };

  const carregar = useCallback(async () => {
    try {
      const filtro =
        ehMedicoPerfil && !podeFiltrarQualquerMedico && me?.id
          ? me.id
          : medicoId
            ? Number(medicoId)
            : undefined;
      const r = await api.agendamentosFila(data, filtro);
      setGrupos(r.grupos);
      // Contador do botão "Laudos pendentes" (silencioso: sem permissão = some).
      void api
        .agendamentosExamesPendentes()
        .then((p) => setQtdLaudosPendentes(p.pendentes.length))
        .catch(() => setQtdLaudosPendentes(null));
      void api
        // Recepção vê as pendências da clínica toda (independe do médico escolhido);
        // médico vê só as dele (o servidor também garante).
        .agendamentosPendenciasDias(podeFiltrarQualquerMedico ? undefined : filtro)
        .then(setPendenciasDias)
        .catch(() => setPendenciasDias([]));
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro na fila");
    }
  }, [
    data,
    ehMedicoPerfil,
    me?.id,
    medicoId,
    msg,
    podeFiltrarQualquerMedico,
  ]);

  useEffect(() => {
    void carregar();
    const t = setInterval(() => void carregar(), 8000);
    return () => clearInterval(t);
  }, [carregar]);

  useEffect(() => {
    if (!podeFiltrarQualquerMedico) return;
    void api
      .medicosList()
      .then(setMedicos)
      .catch((e) => {
        setMedicos([]);
        void msg.error(
          e instanceof ApiError ? e.message : "Erro ao carregar médicos",
        );
      });
  }, [msg, podeFiltrarQualquerMedico]);

  const mudarStatus = async (id: number, status: string) => {
    try {
      await api.agendamentoStatus(id, status);
      await carregar();
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao atualizar");
    }
  };

  const finalizarExame = async (a: AgendamentoRow) => {
    // Com conta: diálogo para anexar o laudo de cada exame antes de finalizar.
    if (a.conta_id) {
      setDialogExames({ agendamento: a, finalizar: true });
      return;
    }
    const ok = await msg.confirm({
      title: "Finalizar exame",
      message:
        "Este horário só tem exame. Não abre ficha clínica nem ASO. Finalizar o atendimento?",
      confirmLabel: "Finalizar",
      cancelLabel: "Cancelar",
    });
    if (!ok) return;
    await mudarStatus(a.id, "finalizado");
  };

  const abrirAtendimento = async (a: AgendamentoRow) => {
    try {
      if (horarioTemAso(a)) {
        const row = await api.admissionalAbrir(a.id);
        navigate(`/admissional/${row.id}`, { state: { fromFila: true, returnTo: voltarParaFila } });
        await carregar();
        return;
      }
      if (!horarioTemProntuario(a)) {
        void msg.warning("Este horário só tem exame. Não abre ficha clínica.");
        return;
      }
      const r = await api.prontuarioAbrir(a.id);
      navigate(`/medico/atendimento/${r.prontuario.id}`, {
        state: { fromFila: true, returnTo: voltarParaFila },
      });
      await carregar();
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao abrir");
    }
  };

  const acoesCheckinAgendados = checkinAgendados
    ? {
        onCheckin: (id: number) => void mudarStatus(id, "presente"),
        onNaoVeio: (id: number) => void mudarStatus(id, "nao_compareceu"),
      }
    : {};

  const acoesAtenderMedico = acoesAtender
    ? { onAtender: (a: AgendamentoRow) => void abrirAtendimento(a) }
    : {};

  const podeFinalizarExame =
    acoesAtender || temModulo(permissoes, "fila_recepcao");
  const acoesFinalizarExame = podeFinalizarExame
    ? { onFinalizarExame: (a: AgendamentoRow) => void finalizarExame(a) }
    : {};
  const acoesExames = podeFinalizarExame
    ? {
        onVerExames: (a: AgendamentoRow) =>
          setDialogExames({ agendamento: a, finalizar: false }),
      }
    : {};

  const verConsulta = (prontuarioId: number) => {
    navigate(`/medico/atendimento/${prontuarioId}`, {
      state: { abaInicial: "ficha", fromFila: true, returnTo: voltarParaFila },
    });
  };

  const verAdmissional = (admissionalId: number) => {
    navigate(`/admissional/${admissionalId}`, { state: { fromFila: true, returnTo: voltarParaFila } });
  };

  // Cada botão só aparece para quem pode abrir a tela (mesmos módulos das rotas no App.tsx);
  // senão o ModuloGuard mandava para o início (secretaria com ASO via "Ver consulta").
  const acoesVerFinalizado = {
    ...(temModulo(permissoes, ["prontuario_escrever", "prontuario_ler", "fila_medico"])
      ? { onVerConsulta: verConsulta }
      : {}),
    ...(acoesAtender || temModulo(permissoes, ["admissional", "admissional_agenda"])
      ? { onVerAdmissional: verAdmissional }
      : {}),
  };

  const subtitulo = ehSecretaria
    ? "Agendados: check-in. Conta se já existir — em qualquer coluna."
    : ehMedicoPerfil
      ? "Seus atendimentos do dia"
      : "Atendimentos do dia";

  return (
    <div className="page-stack flex-1 min-h-0 overflow-hidden">
      <PageHeader
        title="Sala de espera"
        subtitle={subtitulo}
        leading={<ClinicaBrandMark size="lg" tone="light" showSubtitle={false} />}
        actions={
          <div className="flex flex-wrap items-center gap-4">
            {podeFiltrarQualquerMedico ? (
              <label className="flex items-center gap-2">
                <span className="text-base font-semibold whitespace-nowrap">Médico:</span>
                <select
                  className="legacy-input fila-filtro-campo min-w-[16rem]"
                  value={medicoId}
                  onChange={(e) =>
                    setMedicoId(e.target.value ? Number(e.target.value) : "")
                  }
                >
                  <option value="">Todos</option>
                  {medicos.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.crm ? `${m.nome} — ${m.crm}` : m.nome}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {qtdLaudosPendentes ? (
              <Link
                to="/medico/laudos-pendentes"
                className="btn btn-secondary no-underline"
                title="Exames de atendimentos finalizados que ainda não têm laudo anexado"
              >
                Laudos pendentes ({qtdLaudosPendentes})
              </Link>
            ) : null}
            <label className="flex items-center gap-2">
              <span className="text-base font-semibold whitespace-nowrap">Data:</span>
              <DataIsoInput className="legacy-input fila-filtro-campo" value={data} onValueChange={setData} />
            </label>
          </div>
        }
      />
      {pendenciasDias.length > 0 ? (
        <div className="mx-4 mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-950">
          <strong>Pendências de dias anteriores:</strong> horários que ficaram sem finalizar ou sem falta. Abra o dia e
          finalize ou registre a falta.
          <div className="mt-2 flex flex-wrap gap-2">
            {pendenciasDias.map((p) => (
              <button
                key={p.data}
                type="button"
                className={`btn btn-sm${p.data === data ? " btn-primary" : " btn-secondary"}`}
                title={`${p.na_sala} na sala sem finalizar · ${p.sem_desfecho} sem check-in/falta${
                  p.medicos && p.medicos.length > 0
                    ? `\n${p.medicos.map((m) => `${m.nome}: ${m.total}`).join("\n")}`
                    : ""
                }`}
                onClick={() => abrirPendencia(p)}
              >
                {p.data.split("-").reverse().join("/")} ({p.total})
                {podeFiltrarQualquerMedico && p.medicos && p.medicos.length > 0 ? (
                  <span className="ml-1 font-normal opacity-80">
                    · {p.medicos.map((m) => `${m.nome} ${m.total}`).join(", ")}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="fila-dia-board flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
        <Coluna
          etapa="agendado"
          titulo="Agendados"
          itens={grupos.agendado ?? []}
          mostrarMedico={mostrarMedico}
          podeCobranca={podeCobranca}
          cobrancaReturn={cobrancaReturn}
          {...acoesCheckinAgendados}
        />
        <Coluna
          etapa="presente"
          titulo="Aguardando"
          itens={grupos.presente ?? []}
          mostrarMedico={mostrarMedico}
          podeCobranca={podeCobranca}
          cobrancaReturn={cobrancaReturn}
          {...acoesAtenderMedico}
          {...acoesFinalizarExame}
          {...acoesExames}
        />
        <Coluna
          etapa="em_atendimento"
          titulo="Em atendimento"
          itens={grupos.em_atendimento ?? []}
          mostrarMedico={mostrarMedico}
          podeCobranca={podeCobranca}
          cobrancaReturn={cobrancaReturn}
          {...acoesAtenderMedico}
          {...acoesFinalizarExame}
          {...acoesExames}
        />
        <Coluna
          etapa="finalizado"
          titulo="Finalizados"
          itens={grupos.finalizado ?? []}
          mostrarMedico={mostrarMedico}
          podeCobranca={podeCobranca}
          cobrancaReturn={cobrancaReturn}
          {...acoesVerFinalizado}
          {...acoesExames}
        />
      </div>
      {dialogExames ? (
        <FinalizarExameDialog
          agendamentoId={dialogExames.agendamento.id}
          onFinalizar={
            dialogExames.finalizar
              ? () => mudarStatus(dialogExames.agendamento.id, "finalizado")
              : undefined
          }
          onClose={() => setDialogExames(null)}
        />
      ) : null}
    </div>
  );
}
