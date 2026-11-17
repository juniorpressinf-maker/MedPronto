import { Lock } from "lucide-react";
import { useMemo, useState, type DragEvent } from "react";
import type { AgendamentoGrade, AgendamentoTipo, Bloqueio } from "../../../lib/agendaNova/api";
import { horaParaMinutos } from "../../../lib/agendaNova/horario";
import {
  faixaMinutos,
  linhasDaGrade,
  minutosParaHora,
  posicionarDia,
} from "../../../lib/agendaNova/layoutGrade";
import { ehFimDeSemana, rotuloDia } from "../../../lib/agendaNova/semana";
import { nomeFeriado } from "../../../lib/agendaNova/feriados";
import { podeRemarcar } from "../../../lib/agendaNova/status";
import { CardAgendamento, corDoCard } from "./CardAgendamento";

/** Escala vertical: 1,6 px por minuto (30 min = 48 px). */
export const PX_POR_MIN = 1.6;
/** Enquanto arrasta, os cards ocupam só parte da largura: sobra o espaço "ao lado" para soltar. */
const LARGURA_ARRASTANDO = 0.78;
const TIPO_DND = "application/x-medpronto-agendamento";

type Props = {
  dias: string[];
  faixa: { inicio: string; fim: string };
  /** horário padrão: fora dele fica sombreado */
  padrao: { inicio: string; fim: string };
  passo: number;
  agendamentos: AgendamentoGrade[];
  bloqueios: Bloqueio[];
  tipos: AgendamentoTipo[];
  hoje: string;
  agoraMin: number;
  /** permite arrastar (A4d) */
  podeArrastar: boolean;
  onSlot: (data: string, hora: string) => void;
  onCard: (ag: AgendamentoGrade) => void;
  onBloqueio: (b: Bloqueio) => void;
  /** soltou em espaço livre → remarcar para esse horário (fica lado a lado se já houver alguém) */
  onMover: (ag: AgendamentoGrade, data: string, hora: string) => void;
  /** soltou em cima de outro card → trocar os dois de lugar */
  onTrocar: (ag: AgendamentoGrade, alvo: AgendamentoGrade) => void;
};

/** Grade de horários: 1 coluna por dia (semana = 7, dia = 1). */
export function GradeTempo(props: Props) {
  const { dias, passo, hoje, agoraMin } = props;
  const faixa = faixaMinutos(props.faixa);
  const padrao = faixaMinutos(props.padrao);
  const linhas = linhasDaGrade(faixa, passo);
  const alturaTotal = (faixa.fim - faixa.ini) * PX_POR_MIN;
  const px = (min: number) => (min - faixa.ini) * PX_POR_MIN;

  const [arrastando, setArrastando] = useState<AgendamentoGrade | null>(null);
  /** 'slot:AAAA-MM-DD|min' ou 'card:id' */
  const [alvo, setAlvo] = useState<string | null>(null);

  const porDia = useMemo(() => {
    const mapa = new Map<string, ReturnType<typeof posicionarDia<AgendamentoGrade>>>();
    for (const d of dias) {
      const doDia = props.agendamentos.filter((a) => a.data === d);
      mapa.set(
        d,
        posicionarDia(
          doDia,
          (a) => ({ ini: horaParaMinutos(a.hora), fim: horaParaMinutos(a.hora_fim) }),
          faixa,
        ),
      );
    }
    return mapa;
    // faixa é derivada de props.faixa (strings) — dependência estável
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias, props.agendamentos, props.faixa.inicio, props.faixa.fim]);

  const terminar = () => {
    setArrastando(null);
    setAlvo(null);
  };

  /** Só aceita soltar em dia de hoje em diante. */
  const aceitar = (e: DragEvent, d: string, chaveAlvo: string) => {
    if (!arrastando || d < hoje) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (alvo !== chaveAlvo) setAlvo(chaveAlvo);
  };

  return (
    <div
      className={`agn-grade ${arrastando ? "agn-grade--arrastando" : ""}`}
      style={{ ["--agn-dias" as string]: dias.length }}
    >
      {/* Cabeçalho dos dias */}
      <div className="agn-grade__canto" aria-hidden />
      {dias.map((d) => {
        const r = rotuloDia(d);
        const feriado = nomeFeriado(d);
        return (
          <div
            key={d}
            className={`agn-grade__dia-cab ${d === hoje ? "agn-grade__dia-cab--hoje" : ""} ${ehFimDeSemana(d) ? "agn-grade__dia-cab--fds" : ""} ${feriado ? "agn-grade__dia-cab--feriado" : ""}`}
            title={feriado ? `Feriado: ${feriado}` : undefined}
          >
            <span className="agn-grade__dia-nome">{dias.length === 1 ? r.longo : r.curto}</span>
            <span className="agn-grade__dia-num">{r.numero}</span>
            {feriado ? <span className="agn-grade__feriado">{feriado}</span> : null}
          </div>
        );
      })}

      {/* Eixo das horas */}
      <div className="agn-grade__horas" style={{ height: alturaTotal }}>
        {linhas.map((m) => (
          <span key={m} className="agn-grade__hora" style={{ top: px(m) }}>
            {m % 60 === 0 || passo < 60 ? minutosParaHora(m) : ""}
          </span>
        ))}
      </div>

      {/* Colunas dos dias */}
      {dias.map((d) => {
        const passado = d < hoje;
        const bloqueiosDia = props.bloqueios.filter((b) => b.data_inicio <= d && d <= b.data_fim);
        return (
          <div
            key={d}
            className={`agn-grade__coluna ${ehFimDeSemana(d) ? "agn-grade__coluna--fds" : ""} ${nomeFeriado(d) ? "agn-grade__coluna--feriado" : ""} ${passado ? "agn-grade__coluna--passado" : ""}`}
            style={{ height: alturaTotal }}
          >
            {/* Fora do horário padrão: hachurado */}
            {padrao.ini > faixa.ini && (
              <div className="agn-grade__fora" style={{ top: 0, height: px(padrao.ini) }} aria-hidden />
            )}
            {padrao.fim < faixa.fim && (
              <div className="agn-grade__fora" style={{ top: px(padrao.fim), height: alturaTotal - px(padrao.fim) }} aria-hidden />
            )}

            {/* Slots: clicar marca; soltar um card remarca para cá */}
            {linhas.map((m) => {
              const chave = `slot:${d}|${m}`;
              return (
                <button
                  key={m}
                  type="button"
                  className={`agn-grade__slot ${m % 60 === 0 ? "agn-grade__slot--hora" : ""} ${alvo === chave ? "agn-grade__slot--alvo" : ""}`}
                  style={{ top: px(m), height: passo * PX_POR_MIN }}
                  aria-label={`Marcar ${rotuloDia(d).longo} ${d.split("-").reverse().join("/")} às ${minutosParaHora(m)}`}
                  onClick={() => props.onSlot(d, minutosParaHora(m))}
                  onDragOver={(e) => aceitar(e, d, chave)}
                  onDragLeave={() => alvo === chave && setAlvo(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    const ag = arrastando;
                    terminar();
                    if (ag) props.onMover(ag, d, minutosParaHora(m));
                  }}
                />
              );
            })}

            {/* Bloqueios (durante o arraste deixam passar o soltar para o slot de baixo) */}
            {bloqueiosDia.map((b) => {
              const ini = Math.max(horaParaMinutos(b.hora_inicio), faixa.ini);
              const fim = Math.min(horaParaMinutos(b.hora_fim), faixa.fim);
              if (fim <= ini) return null;
              return (
                <button
                  key={b.id}
                  type="button"
                  className="agn-grade__bloqueio"
                  style={{ top: px(ini), height: (fim - ini) * PX_POR_MIN }}
                  title={`Horário bloqueado ${b.hora_inicio}–${b.hora_fim}${b.motivo ? ` · ${b.motivo}` : ""}`}
                  onClick={() => props.onBloqueio(b)}
                >
                  <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate">Horário bloqueado{b.motivo ? ` · ${b.motivo}` : ""}</span>
                </button>
              );
            })}

            {/* Cards */}
            {(porDia.get(d) ?? []).map((p) => {
              const ag = p.item;
              const fator = arrastando ? LARGURA_ARRASTANDO : 1;
              const largura = (100 / p.colunas) * fator;
              const alturaPx = p.altura * PX_POR_MIN - 2;
              const arrastavel = props.podeArrastar && podeRemarcar(ag.status) && ag.data >= hoje;
              const chave = `card:${ag.id}`;
              const podeReceber =
                !!arrastando && arrastando.id !== ag.id && podeRemarcar(ag.status) && ag.data >= hoje;
              return (
                <CardAgendamento
                  key={ag.id}
                  ag={ag}
                  cor={corDoCard(ag, props.tipos)}
                  alturaPx={alturaPx}
                  destaque={alvo === chave ? "troca" : arrastando?.id === ag.id ? "origem" : null}
                  style={{
                    top: p.topo * PX_POR_MIN + 1,
                    height: alturaPx,
                    left: `calc(${p.coluna * largura}% + 2px)`,
                    width: `calc(${largura}% - 4px)`,
                  }}
                  onClick={() => props.onCard(ag)}
                  dnd={{
                    draggable: arrastavel,
                    onDragStart: (e) => {
                      e.dataTransfer.setData(TIPO_DND, String(ag.id));
                      e.dataTransfer.setData("text/plain", ag.paciente_nome);
                      e.dataTransfer.effectAllowed = "move";
                      // adia o encolhimento para o navegador capturar a imagem do card inteiro
                      window.setTimeout(() => setArrastando(ag), 0);
                    },
                    onDragEnd: terminar,
                    onDragOver: (e) => {
                      if (podeReceber) aceitar(e, d, chave);
                    },
                    onDragLeave: () => alvo === chave && setAlvo(null),
                    onDrop: (e) => {
                      if (!podeReceber) return;
                      e.preventDefault();
                      e.stopPropagation();
                      const origem = arrastando;
                      terminar();
                      if (origem) props.onTrocar(origem, ag);
                    },
                  }}
                />
              );
            })}

            {/* Linha da hora atual */}
            {d === hoje && agoraMin >= faixa.ini && agoraMin <= faixa.fim && (
              <div className="agn-grade__agora" style={{ top: px(agoraMin) }} aria-label={`Agora ${minutosParaHora(agoraMin)}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
