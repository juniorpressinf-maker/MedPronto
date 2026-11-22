import { Check } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { AgendamentoGrade, AgendamentoTipo } from "../../../lib/agendaNova/api";
import { corTextoSobre } from "../../../lib/agendaNova/horario";
import { labelStatusAgendamento } from "../../../lib/agendamentoStatus";

const COR_PADRAO = "#475569";
const INATIVOS = new Set(["cancelado", "nao_compareceu"]);

/** Cor do card = cor do 1º procedimento (decisão 13/11); sem cor → tipo → cinza. */
export function corDoCard(ag: AgendamentoGrade, tipos: AgendamentoTipo[]): string {
  const doProc = ag.procedimentos.find((p) => p.cor)?.cor;
  if (doProc) return doProc;
  return tipos.find((t) => t.id === ag.agendamento_tipo_id)?.cor ?? COR_PADRAO;
}

type Props = {
  ag: AgendamentoGrade;
  cor: string;
  /** altura em px — decide quantas linhas cabem */
  alturaPx: number;
  style: React.CSSProperties;
  onClick: () => void;
  /** "origem" = card sendo arrastado; "troca" = soltar aqui troca os dois; "negado" = não dá para trocar */
  destaque?: "origem" | "troca" | "negado" | null;
  /** Arraste próprio (ponteiro): quem decide se pode é a grade. */
  arraste?: {
    arrastavel: boolean;
    /** por que NÃO pode arrastar (aparece no balão e no texto ao passar o mouse) */
    motivo: string | null;
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  };
};

export function CardAgendamento({ ag, cor, alturaPx, style, onClick, destaque, arraste }: Props) {
  const inativo = INATIVOS.has(ag.status);
  const procedimentos = ag.procedimentos.map((p) => p.nome).join(", ");
  const status = labelStatusAgendamento(ag.status);
  const titulo =
    `${ag.hora}–${ag.hora_fim} · ${ag.paciente_nome}` +
    (procedimentos ? `\n${procedimentos}` : "") +
    (ag.convenio_nome ? `\n${ag.convenio_nome}` : "") +
    `\n${status}${ag.confirmacao_respondida ? " · confirmado" : ""}${ag.eh_encaixe ? " · encaixe" : ""}`;

  return (
    <button
      type="button"
      className={`agn-card ${inativo ? "agn-card--inativo" : ""} agn-card--${ag.status} ${destaque ? `agn-card--${destaque}` : ""} ${arraste?.arrastavel ? "agn-card--arrastavel" : ""}`}
      style={{ ...style, background: cor, color: corTextoSobre(cor) }}
      data-agn-card={ag.id}
      title={
        arraste?.arrastavel
          ? `${titulo}\n\nArraste para remarcar; solte em outro card para trocar.`
          : arraste?.motivo
            ? `${titulo}\n\nNão dá para arrastar: ${arraste.motivo}`
            : titulo
      }
      draggable={false}
      onPointerDown={arraste?.onPointerDown}
      aria-label={titulo.replace(/\n/g, ". ")}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <span className="agn-card__linha agn-card__linha--forte">
        {ag.confirmacao_respondida ? <Check className="agn-card__ok" aria-hidden /> : null}
        {!ag.confirmacao_respondida && ag.whatsapp_resposta_tipo === "recusou" ? (
          <span className="agn-card__alerta" title={`Paciente respondeu: ${ag.whatsapp_ultima_resposta ?? ""}`}>⚠</span>
        ) : !ag.confirmacao_respondida && ag.whatsapp_resposta_tipo === "outra" ? (
          <span className="agn-card__msg" title={`Paciente respondeu: ${ag.whatsapp_ultima_resposta ?? ""}`}>💬</span>
        ) : null}
        <span className="agn-card__hora">{ag.hora}</span>
        <span className="agn-card__paciente">{ag.paciente_nome}</span>
      </span>
      {alturaPx >= 34 && procedimentos ? (
        <span className="agn-card__linha">
          {ag.eh_encaixe ? "Encaixe · " : ""}
          {procedimentos}
        </span>
      ) : null}
      {alturaPx >= 50 && ag.convenio_nome ? <span className="agn-card__linha">{ag.convenio_nome}</span> : null}
      {alturaPx >= 66 && ag.status !== "agendado" ? (
        <span className="agn-card__linha agn-card__status">{status}</span>
      ) : null}
    </button>
  );
}
