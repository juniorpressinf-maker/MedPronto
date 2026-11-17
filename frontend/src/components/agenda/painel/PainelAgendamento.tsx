import {
  CalendarClock,
  ClipboardList,
  MessageCircle,
  Pencil,
  Phone,
  Receipt,
  Stethoscope,
  UserRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, api } from "../../../lib/api";
import type { AgendamentoGrade, AgendamentoTipo } from "../../../lib/agendaNova/api";
import { agendaNovaApi } from "../../../lib/agendaNova/api";
import { corTextoSobre } from "../../../lib/agendaNova/horario";
import { dataBr, rotuloDia } from "../../../lib/agendaNova/semana";
import { ACAO_STATUS, podeRemarcar, proximosStatus } from "../../../lib/agendaNova/status";
import { classeBadgeStatusAgendamento, labelStatusAgendamento } from "../../../lib/agendamentoStatus";
import { formatBRL } from "../../../lib/cobrancaFormat";
import { linkCobrancaConta } from "../../../lib/cobrancaContaNav";
import { useMessageBox } from "../../../lib/messageBoxContext";
import { temModulo } from "../../../lib/permissoes";
import { corDoCard } from "../grade/CardAgendamento";
import { PacienteEditarDialog } from "./PacienteEditarDialog";

type Props = {
  ag: AgendamentoGrade;
  tipos: AgendamentoTipo[];
  medicoNome: string;
  hoje: string;
  permissoes: string[];
  /** caminho para voltar à agenda (ex.: ao sair da conta) */
  voltarPara: string;
  onFechar: () => void;
  onEditar: () => void;
  /** recarregar a grade depois de uma ação */
  onAtualizar: () => Promise<void> | void;
};

function idade(nascIso: string | null): string {
  if (!nascIso) return "";
  const [y, m, d] = nascIso.slice(0, 10).split("-").map(Number);
  const hoje = new Date();
  let anos = hoje.getFullYear() - y!;
  if (hoje.getMonth() + 1 < m! || (hoje.getMonth() + 1 === m! && hoje.getDate() < d!)) anos--;
  return anos >= 0 ? `${anos} ano${anos === 1 ? "" : "s"}` : "";
}

/** Painel lateral do agendamento (A4b) — a grade continua visível ao lado. */
export function PainelAgendamento(props: Props) {
  const { ag } = props;
  const msg = useMessageBox();
  const navigate = useNavigate();
  const [ocupado, setOcupado] = useState(false);
  const [prontuarioId, setProntuarioId] = useState<number | null>(null);
  const [editandoPaciente, setEditandoPaciente] = useState(false);

  const pode = (m: string | string[]) => temModulo(props.permissoes, m);
  const podeAgenda = pode(["agenda", "fila_recepcao"]);
  const podeWhats = pode("whatsapp");
  const podeConta = pode("cobranca");
  const podeProntuario = pode(["prontuario_ler", "prontuario_escrever", "fila_medico"]);

  useEffect(() => {
    let cancelado = false;
    setProntuarioId(null);
    agendaNovaApi
      .vinculos(ag.id)
      .then((v) => !cancelado && setProntuarioId(v.prontuario_id))
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, [ag.id, ag.status]);

  // Esc fecha o painel (quando não há janela aberta por cima).
  useEffect(() => {
    if (editandoPaciente) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onFechar();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [props, editandoPaciente]);

  const executar = async (acao: () => Promise<unknown>, sucesso: string) => {
    setOcupado(true);
    try {
      await acao();
      void msg.success(sucesso);
      await props.onAtualizar();
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Não foi possível concluir");
    } finally {
      setOcupado(false);
    }
  };

  const mudarStatus = async (novo: string) => {
    if (novo === "cancelado" || novo === "nao_compareceu") {
      const ok = await msg.confirm({
        title: novo === "cancelado" ? "Cancelar agendamento?" : "Marcar que não veio?",
        message: `${ag.paciente_nome} — ${dataBr(ag.data)} às ${ag.hora}.`,
        confirmLabel: novo === "cancelado" ? "Cancelar agendamento" : "Não veio",
        cancelLabel: "Voltar",
      });
      if (!ok) return;
    }
    await executar(() => api.agendamentoStatus(ag.id, novo), `Situação: ${labelStatusAgendamento(novo)}.`);
  };

  const enviarWhats = async () => {
    const reenviar = ag.confirmacao_enviada === 1;
    if (reenviar) {
      const ok = await msg.confirm({
        title: "Reenviar confirmação?",
        message: `A confirmação já foi enviada para ${ag.paciente_nome}. Enviar de novo?`,
        confirmLabel: "Reenviar",
      });
      if (!ok) return;
    }
    await executar(() => api.whatsappEnviar(ag.id, { reenviar }), "Mensagem enviada pelo WhatsApp.");
  };

  const fecharEdicaoPaciente = useCallback(() => setEditandoPaciente(false), []);

  const cor = corDoCard(ag, props.tipos);
  const proximos = proximosStatus(ag.status);
  const procedimentos = ag.procedimentos.map((p) => p.nome).join(", ") || "Sem procedimento";

  return (
    <aside className="agn-painel" aria-label={`Agendamento de ${ag.paciente_nome}`}>
      <header className="agn-painel__topo" style={{ background: cor, color: corTextoSobre(cor) }}>
        <div className="min-w-0">
          <div className="agn-painel__titulo">{procedimentos}</div>
          <div className="text-sm opacity-90">{props.medicoNome}</div>
        </div>
        <button type="button" className="agn-painel__fechar" aria-label="Fechar painel" onClick={props.onFechar}>
          <X className="h-5 w-5" aria-hidden />
        </button>
      </header>

      <div className="agn-painel__corpo">
        <section className="agn-painel__bloco">
          <div className="flex items-center gap-2 text-sm">
            <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
            <span>
              {rotuloDia(ag.data).longo}, {dataBr(ag.data)} · de <strong>{ag.hora}</strong> às <strong>{ag.hora_fim}</strong>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className={classeBadgeStatusAgendamento(ag.status)}>{labelStatusAgendamento(ag.status)}</span>
            {ag.eh_encaixe ? <span className="agn-selo-lista">encaixe</span> : null}
            {ag.eh_retorno ? <span className="agn-selo-lista">retorno</span> : null}
            {podeAgenda && proximos.length > 0 && (
              <select
                className="legacy-input w-auto ml-auto"
                aria-label="Mudar situação"
                value=""
                disabled={ocupado}
                onChange={(e) => e.target.value && void mudarStatus(e.target.value)}
              >
                <option value="">Mudar situação…</option>
                {proximos.map((s) => (
                  <option key={s} value={s}>
                    {ACAO_STATUS[s] ?? labelStatusAgendamento(s)}
                  </option>
                ))}
              </select>
            )}
          </div>
        </section>

        {/* Ação principal do momento */}
        {ag.status === "presente" && pode(["fila_medico", "fila_recepcao"]) && (
          <Link className="btn btn-primary w-full text-center" to="/medico/fila">
            <Stethoscope className="inline h-4 w-4 mr-1" aria-hidden />
            Ir para a sala de espera
          </Link>
        )}

        {podeAgenda && (
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary flex-1" disabled={ocupado} onClick={props.onEditar}>
              <Pencil className="inline h-4 w-4 mr-1" aria-hidden />
              Editar Agendamento
            </button>
          </div>
        )}
        {podeAgenda && !podeRemarcar(ag.status) && (
          <p className="text-xs text-[var(--muted)] m-0">
            Data e hora só mudam enquanto o horário está "Agendado". Dá para editar procedimentos e comentário.
          </p>
        )}

        <section className="agn-painel__bloco">
          <h3 className="agn-painel__rotulo">Comentário</h3>
          <p className="m-0 text-sm whitespace-pre-wrap">{ag.observacao_agenda?.trim() || "—"}</p>
        </section>

        {podeWhats && (
          <section className="agn-painel__bloco">
            <h3 className="agn-painel__rotulo">WhatsApp</h3>
            <p className={`m-0 text-sm${ag.confirmacao_respondida ? " font-semibold text-green-700" : ""}`}>
              {ag.confirmacao_respondida
                ? "✓ Paciente confirmou."
                : ag.confirmacao_enviada
                  ? "Confirmação enviada, aguardando resposta."
                  : "Confirmação ainda não enviada."}
            </p>
            {/* Resposta que não é SIM: aparece para a recepção agir (nada é cancelado sozinho). */}
            {!ag.confirmacao_respondida && ag.whatsapp_ultima_resposta && ag.whatsapp_resposta_tipo !== "confirmou" ? (
              <div
                className={`agn-resposta ${ag.whatsapp_resposta_tipo === "recusou" ? "agn-resposta--recusou" : "agn-resposta--outra"}`}
                role="status"
              >
                <strong>
                  {ag.whatsapp_resposta_tipo === "recusou" ? "⚠ Paciente pode não vir" : "💬 Paciente respondeu"}
                  {ag.whatsapp_resposta_em ? ` · ${ag.whatsapp_resposta_em.slice(8, 10)}/${ag.whatsapp_resposta_em.slice(5, 7)} ${ag.whatsapp_resposta_em.slice(11, 16)}` : ""}
                </strong>
                <span className="agn-resposta__texto">“{ag.whatsapp_ultima_resposta}”</span>
                <span className="agn-resposta__dica">
                  {ag.whatsapp_resposta_tipo === "recusou"
                    ? "Ligue para o paciente: remarcar ou cancelar o horário."
                    : "Responda o paciente pelo WhatsApp ou ligue."}
                </span>
              </div>
            ) : null}
            <button
              type="button"
              // Reenviar (já enviada): verde
              className={`btn btn-sm mt-2 ${ag.confirmacao_enviada ? "btn-cobranca-paga" : "btn-secondary"}`}
              disabled={ocupado || ag.status === "cancelado" || !ag.paciente_telefone}
              title={!ag.paciente_telefone ? "Paciente sem telefone" : undefined}
              onClick={() => void enviarWhats()}
            >
              <MessageCircle className="inline h-4 w-4 mr-1" aria-hidden />
              {ag.confirmacao_enviada ? "Reenviar pelo WhatsApp" : "Enviar pelo WhatsApp"}
            </button>
            {ag.confirmacao_enviada === 1 && ag.status !== "cancelado" && (
              <button
                type="button"
                // Depois de marcado (ou se o paciente respondeu SIM): fica verde e não repete
                className={`btn btn-sm mt-2 ml-2 ${ag.confirmacao_respondida ? "btn-cobranca-paga" : "btn-secondary"}`}
                disabled={ocupado || Boolean(ag.confirmacao_respondida)}
                title={
                  ag.confirmacao_respondida
                    ? "Confirmação já registrada"
                    : "Use se o paciente confirmou por telefone ou a resposta não chegou ao sistema"
                }
                onClick={() => void executar(() => api.whatsappMarcarConfirmado(ag.id), "Confirmação registrada.")}
              >
                ✓ Paciente confirmou
              </button>
            )}
          </section>
        )}

        <section className="agn-painel__bloco">
          <h3 className="agn-painel__rotulo">Convênio e valores</h3>
          <div className="flex justify-between text-sm">
            <span>{ag.convenio_nome ?? "—"}</span>
            <span>
              Total: <strong>{formatBRL(ag.total_previsto_centavos)}</strong>
            </span>
          </div>
          {podeConta &&
            (ag.conta_id ? (
              <button
                type="button"
                className={`btn btn-sm mt-2 ${ag.conta_status === "pago" ? "btn-cobranca-paga" : "btn-secondary"}`}
                onClick={() => {
                  // grava o "voltar para a agenda" só no clique
                  const destino = linkCobrancaConta(ag.conta_id!, props.voltarPara, "Agenda");
                  navigate(destino.pathname, { state: destino.state });
                }}
              >
                <Receipt className="inline h-4 w-4 mr-1" aria-hidden />
                {!ag.conta_status || ag.conta_status === "em_aberto"
                  ? "Abrir Conta"
                  : `Abrir conta (${ag.conta_status.replace(/_/g, " ")})`}
              </button>
            ) : (
              <p className="text-xs text-[var(--muted)] mt-2 mb-0">A conta é aberta no check-in.</p>
            ))}
        </section>

        <section className="agn-painel__bloco agn-painel__paciente">
          <h3 className="agn-painel__rotulo">Paciente</h3>
          <div className="flex items-start gap-2">
            <UserRound className="h-8 w-8 shrink-0 text-[var(--muted)]" aria-hidden />
            <div className="min-w-0">
              <div className="font-semibold">{ag.paciente_nome}</div>
              <div className="text-sm text-[var(--text-2)]">
                {ag.paciente_data_nasc ? `${dataBr(ag.paciente_data_nasc.slice(0, 10))} · ${idade(ag.paciente_data_nasc)}` : "Nascimento não informado"}
              </div>
              <div className="text-sm text-[var(--text-2)] flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" aria-hidden />
                {ag.paciente_telefone || "Sem telefone"}
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-2">
            {pode("pacientes") && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditandoPaciente(true)}>
                <Pencil className="inline h-3.5 w-3.5 mr-1" aria-hidden />
                Editar paciente
              </button>
            )}
            {podeProntuario && prontuarioId && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => navigate(`/medico/atendimento/${prontuarioId}`, { state: { returnTo: props.voltarPara } })}
              >
                <ClipboardList className="inline h-3.5 w-3.5 mr-1" aria-hidden />
                Prontuário
              </button>
            )}
          </div>
        </section>
      </div>

      {editandoPaciente && (
        <PacienteEditarDialog
          pacienteId={ag.paciente_id}
          onFechar={fecharEdicaoPaciente}
          onSalvo={() => {
            setEditandoPaciente(false);
            void props.onAtualizar();
          }}
        />
      )}
    </aside>
  );
}
