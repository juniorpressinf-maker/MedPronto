import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { DataIsoInput } from "../components/DataIsoInput";
import { ClinicaBrandMark } from "../components/ClinicaBrandMark";
import { PageHeader } from "../components/PageHeader";
import {
  ApiError,
  api,
  type AgendamentoRow,
  type MedicoRow,
} from "../lib/api";
import { useAuth } from "../lib/authContext";
import { useMessageBox } from "../lib/messageBoxContext";
import { temModulo } from "../lib/permissoes";
import { cobrancaReturnPath, linkCobrancaConta } from "../lib/cobrancaContaNav";
import { isDataIsoValida } from "../lib/dataIso";
import {
  classeBadgeContaAgendamento,
  labelBadgeContaAgendamento,
  classeBotaoContaAgendamento,
  labelBotaoContaAgendamento,
} from "../lib/cobrancaFormat";
import { corMedicoAgenda } from "../lib/corMedicoAgenda";
import {
  ASO_TITULO_CURTO,
} from "../lib/tipoAtendimento";
import {
  badgeClassModoClinico,
  horarioSoExame,
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
          return (
            <li
              key={a.id}
              className="fila-coluna__item rounded-lg border p-2"
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
                    className="btn btn-primary btn-sm"
                    onClick={() => onCheckin(a.id)}
                  >
                    Check-in
                  </button>
                ) : null}
                {onNaoVeio && a.status === "agendado" ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onNaoVeio(a.id)}
                  >
                    Não veio
                  </button>
                ) : null}
                {onAtender &&
                abreClinico &&
                (a.status === "presente" || a.status === "em_atendimento") ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => onAtender(a)}
                  >
                    Atender
                  </button>
                ) : null}
                {onFinalizarExame &&
                soExame &&
                (a.status === "presente" || a.status === "em_atendimento") ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => onFinalizarExame(a)}
                  >
                    Finalizar
                  </button>
                ) : null}
                {onVerConsulta && temProntuario && a.prontuario_id ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onVerConsulta(a.prontuario_id!)}
                  >
                    Ver consulta
                  </button>
                ) : null}
                {onVerAdmissional && temAso && a.admissional_id ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onVerAdmissional(a.admissional_id!)}
                  >
                    Ver {ASO_TITULO_CURTO}
                  </button>
                ) : null}
                {podeCobranca && a.conta_id ? (
                  <Link
                    to={linkCobrancaConta(a.conta_id, cobrancaReturn, "Voltar à fila")}
                    className={classeBotaoContaAgendamento(a.conta_status, "no-underline")}
                  >
                    {labelBotaoContaAgendamento(a.conta_status)}
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

export function FilaMedicoPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const msg = useMessageBox();
  const { me, permissoes } = useAuth();
  const dataUrl = searchParams.get("data");
  const dataInicial = dataUrl && /^\d{4}-\d{2}-\d{2}$/.test(dataUrl) ? dataUrl : hoje();
  const medicoUrl = searchParams.get("medico_id");
  const medicoInicial =
    medicoUrl && /^\d+$/.test(medicoUrl) ? Number(medicoUrl) : "";
  const [data, setData] = useState(dataInicial);
  const [grupos, setGrupos] = useState<Record<string, AgendamentoRow[]>>({});
  const [medicos, setMedicos] = useState<MedicoRow[]>([]);
  const [medicoId, setMedicoId] = useState<number | "">(medicoInicial);

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

  useEffect(() => {
    const d = searchParams.get("data");
    if (d && isDataIsoValida(d) && d !== data) {
      setData(d);
    }
    const m = searchParams.get("medico_id");
    if (m && /^\d+$/.test(m)) {
      const n = Number(m);
      if (n !== medicoId) setMedicoId(n);
    } else if (!m && medicoId !== "") {
      setMedicoId("");
    }
  }, [searchParams, data, medicoId]);

  const acoesAtender =
    temModulo(permissoes, "fila_medico") &&
    (ehMedicoPerfil || me?.perfil === "admin");

  const mostrarMedico = podeFiltrarQualquerMedico && !medicoId;

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
        navigate(`/admissional/${row.id}`, { state: { fromFila: true } });
        await carregar();
        return;
      }
      if (!horarioTemProntuario(a)) {
        void msg.warning("Este horário só tem exame. Não abre ficha clínica.");
        return;
      }
      const r = await api.prontuarioAbrir(a.id);
      navigate(`/medico/atendimento/${r.prontuario.id}`, {
        state: { fromFila: true },
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

  const verConsulta = (prontuarioId: number) => {
    navigate(`/medico/atendimento/${prontuarioId}`, {
      state: { abaInicial: "ficha", fromFila: true },
    });
  };

  const verAdmissional = (admissionalId: number) => {
    navigate(`/admissional/${admissionalId}`, { state: { fromFila: true } });
  };

  const acoesVerFinalizado =
    acoesAtender ||
    temModulo(permissoes, ["prontuario_ler", "admissional", "admissional_agenda"])
      ? {
          onVerConsulta: verConsulta,
          onVerAdmissional: verAdmissional,
        }
      : {};

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
          <div className="flex flex-wrap items-center gap-2">
            {podeFiltrarQualquerMedico ? (
              <label className="flex items-center gap-2">
                <span className="text-sm font-medium whitespace-nowrap">Médico</span>
                <select
                  className="legacy-input min-w-[12rem]"
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
            <DataIsoInput value={data} onValueChange={setData} />
          </div>
        }
      />
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
        />
        <Coluna
          etapa="finalizado"
          titulo="Finalizados"
          itens={grupos.finalizado ?? []}
          mostrarMedico={mostrarMedico}
          podeCobranca={podeCobranca}
          cobrancaReturn={cobrancaReturn}
          {...acoesVerFinalizado}
        />
      </div>
    </div>
  );
}
