import { Lock } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { AgendamentoGrade, AgendamentoTipo, Bloqueio } from "../../../lib/agendaNova/api";
import { corTextoSobre, horaParaMinutos } from "../../../lib/agendaNova/horario";
import {
  faixaMinutos,
  linhasDaGrade,
  minutosParaHora,
  posicionarDia,
} from "../../../lib/agendaNova/layoutGrade";
import { ehFimDeSemana, rotuloDia } from "../../../lib/agendaNova/semana";
import { nomeFeriado } from "../../../lib/agendaNova/feriados";
import { podeRemarcar } from "../../../lib/agendaNova/status";
import { labelStatusAgendamento } from "../../../lib/agendamentoStatus";
import { createPortal } from "react-dom";
import { CardAgendamento, corDoCard } from "./CardAgendamento";
import { PezinhosArraste } from "./PezinhosArraste";

/** Escala vertical: 1,6 px por minuto (30 min = 48 px). */
export const PX_POR_MIN = 1.6;
/** Enquanto arrasta, os cards ocupam só parte da largura: sobra o espaço "ao lado" para soltar. */
const LARGURA_ARRASTANDO = 0.78;
/** Quanto o mouse precisa andar (px) para virar arraste — abaixo disso é clique. */
const LIMIAR_ARRASTE = 6;
/** Faixa (px) perto da borda da área rolável que faz a grade rolar sozinha. */
const BORDA_ROLAGEM = 48;

/** Para onde o card vai se soltar agora. */
type Alvo =
  | { tipo: "slot"; dia: string; min: number }
  | { tipo: "card"; ag: AgendamentoGrade }
  | { tipo: "invalido"; motivo: string; dia?: string; min?: number; cardId?: number };

function chaveAlvo(a: Alvo | null): string {
  if (!a) return "";
  if (a.tipo === "slot") return `s:${a.dia}|${a.min}`;
  if (a.tipo === "card") return `c:${a.ag.id}`;
  return `x:${a.dia ?? ""}|${a.min ?? ""}|${a.cardId ?? ""}|${a.motivo}`;
}

/** Acha a área que rola (para rolar sozinho quando o card chega perto da borda). */
function areaRolavel(el: HTMLElement | null): HTMLElement | null {
  let p = el?.parentElement ?? null;
  while (p) {
    const s = getComputedStyle(p);
    if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight) return p;
    p = p.parentElement;
  }
  return (document.scrollingElement as HTMLElement | null) ?? null;
}

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
  const [alvo, setAlvoState] = useState<Alvo | null>(null);
  /** balão "não dá para arrastar" junto do mouse */
  const [aviso, setAviso] = useState<{ texto: string; x: number; y: number } | null>(null);

  const raizRef = useRef<HTMLDivElement | null>(null);
  const fantasmaRef = useRef<HTMLDivElement | null>(null);
  const alvoRef = useRef<Alvo | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  /** depois de um arraste, o clique que o navegador dispara no card é ignorado */
  const ignorarCliqueRef = useRef(false);
  const arrasteRef = useRef<{
    ag: AgendamentoGrade;
    x0: number;
    y0: number;
    /** onde o mouse pegou o card (para o card "andar" sem pular) */
    dx: number;
    dy: number;
    largura: number;
    altura: number;
    iniciado: boolean;
    x: number;
    y: number;
    rolavel: HTMLElement | null;
    raf: number;
    limpar: () => void;
  } | null>(null);

  const setAlvo = useCallback((a: Alvo | null) => {
    if (chaveAlvo(a) === chaveAlvo(alvoRef.current)) return;
    alvoRef.current = a;
    setAlvoState(a);
  }, []);

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

  /** Por que este card NÃO pode ser arrastado (null = pode). */
  const motivoNaoArrasta = (ag: AgendamentoGrade): string | null => {
    if (!props.podeArrastar) return "você não tem permissão para remarcar a agenda.";
    if (ag.data < hoje) return "agendamento de um dia que já passou.";
    if (!podeRemarcar(ag.status))
      return `a situação é "${labelStatusAgendamento(ag.status)}" — só "Agendado" pode ser remarcado.`;
    return null;
  };

  /** Calcula o alvo sob o mouse (card de outro paciente ou horário da coluna). */
  const calcularAlvo = useCallback(
    (x: number, y: number): Alvo | null => {
      const a = arrasteRef.current;
      if (!a) return null;
      const { hoje: hj, passo: ps } = propsRef.current;
      const fx = faixaMinutos(propsRef.current.faixa);
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      if (!el || !raizRef.current?.contains(el)) return null;

      const cardEl = el.closest<HTMLElement>("[data-agn-card]");
      if (cardEl) {
        const id = Number(cardEl.dataset.agnCard);
        if (id !== a.ag.id) {
          const outro = propsRef.current.agendamentos.find((g) => g.id === id);
          if (outro) {
            if (outro.data < hj) return { tipo: "invalido", motivo: "Dia que já passou", cardId: id };
            if (!podeRemarcar(outro.status))
              return { tipo: "invalido", motivo: `Não troca com "${labelStatusAgendamento(outro.status)}"`, cardId: id };
            return { tipo: "card", ag: outro };
          }
        }
      }

      const colEl = el.closest<HTMLElement>("[data-agn-dia]");
      if (!colEl) return null;
      const dia = colEl.dataset.agnDia ?? "";
      const r = colEl.getBoundingClientRect();
      // o topo do card fantasma é que decide o horário (o card cai onde ele está desenhado)
      const topo = y - a.dy - r.top;
      let min = fx.ini + Math.round(topo / PX_POR_MIN / ps) * ps;
      min = Math.max(fx.ini, Math.min(min, fx.fim - ps));
      if (dia < hj) return { tipo: "invalido", motivo: "Dia que já passou", dia, min };
      return { tipo: "slot", dia, min };
    },
    [],
  );

  /** Move o fantasma (direto no DOM, sem redesenhar a grade) + rolagem automática. */
  const tique = useCallback(() => {
    const a = arrasteRef.current;
    if (!a || !a.iniciado) return;
    const f = fantasmaRef.current;
    if (f) f.style.transform = `translate3d(${a.x - a.dx}px, ${a.y - a.dy}px, 0)`;

    const sc = a.rolavel;
    if (sc) {
      const r = sc === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : sc.getBoundingClientRect();
      let v = 0;
      if (a.y < r.top + BORDA_ROLAGEM) v = -Math.ceil((r.top + BORDA_ROLAGEM - a.y) / 4);
      else if (a.y > r.bottom - BORDA_ROLAGEM) v = Math.ceil((a.y - (r.bottom - BORDA_ROLAGEM)) / 4);
      if (v !== 0) {
        sc.scrollTop += v;
        setAlvo(calcularAlvo(a.x, a.y));
      }
    }
    a.raf = requestAnimationFrame(tique);
  }, [calcularAlvo, setAlvo]);

  const encerrar = useCallback(() => {
    const a = arrasteRef.current;
    if (a) {
      cancelAnimationFrame(a.raf);
      a.limpar();
    }
    arrasteRef.current = null;
    document.body.classList.remove("agn-arrastando", "agn-arraste-negado");
    setArrastando(null);
    setAlvo(null);
    setAviso(null);
  }, [setAlvo]);

  // se a tela sair (troca de semana, fechar), não deixa arraste pendurado
  useEffect(() => () => encerrar(), [encerrar]);

  /** Pressionou o botão do mouse num card. */
  const iniciarPressao = (e: ReactPointerEvent<HTMLButtonElement>, ag: AgendamentoGrade) => {
    if (e.button !== 0 || arrasteRef.current) return;
    const motivo = motivoNaoArrasta(ag);
    const x0 = e.clientX;
    const y0 = e.clientY;

    if (motivo) {
      // Não pode: se a pessoa tentar arrastar, mostra o motivo junto do mouse.
      const mover = (ev: PointerEvent) => {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < LIMIAR_ARRASTE) return;
        document.body.classList.add("agn-arraste-negado");
        setAviso({ texto: `Não dá para arrastar: ${motivo}`, x: ev.clientX, y: ev.clientY });
      };
      const soltar = () => {
        window.removeEventListener("pointermove", mover);
        window.removeEventListener("pointerup", soltar);
        window.removeEventListener("pointercancel", soltar);
        document.body.classList.remove("agn-arraste-negado");
        window.setTimeout(() => setAviso(null), 1800);
      };
      window.addEventListener("pointermove", mover);
      window.addEventListener("pointerup", soltar);
      window.addEventListener("pointercancel", soltar);
      return;
    }

    const rc = e.currentTarget.getBoundingClientRect();
    // Card "em pé" sobre os pezinhos: centralizado no mouse, com a base logo acima dele.
    const larguraF = Math.max(rc.width, 150);
    const alturaF = Math.max(46, Math.min(rc.height, 64));
    const mover = (ev: PointerEvent) => {
      const a = arrasteRef.current;
      if (!a) return;
      a.x = ev.clientX;
      a.y = ev.clientY;
      if (!a.iniciado) {
        if (Math.hypot(a.x - a.x0, a.y - a.y0) < LIMIAR_ARRASTE) return;
        a.iniciado = true;
        a.rolavel = areaRolavel(raizRef.current);
        document.body.classList.add("agn-arrastando");
        window.getSelection()?.removeAllRanges();
        setArrastando(a.ag);
        a.raf = requestAnimationFrame(tique);
      }
      ev.preventDefault();
      setAlvo(calcularAlvo(a.x, a.y));
    };
    const soltar = () => {
      const a = arrasteRef.current;
      const destino = alvoRef.current;
      const iniciado = !!a?.iniciado;
      const ag0 = a?.ag;
      encerrar();
      if (!iniciado || !ag0) return; // foi só um clique: o onClick do card abre o painel
      ignorarCliqueRef.current = true;
      window.setTimeout(() => (ignorarCliqueRef.current = false), 0);
      if (!destino || destino.tipo === "invalido") return;
      if (destino.tipo === "card") {
        propsRef.current.onTrocar(ag0, destino.ag);
      } else if (destino.dia !== ag0.data || minutosParaHora(destino.min) !== ag0.hora) {
        propsRef.current.onMover(ag0, destino.dia, minutosParaHora(destino.min));
      }
    };
    const tecla = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        const iniciado = !!arrasteRef.current?.iniciado;
        encerrar();
        if (iniciado) {
          ignorarCliqueRef.current = true;
          window.setTimeout(() => (ignorarCliqueRef.current = false), 0);
        }
      }
    };
    window.addEventListener("pointermove", mover, { passive: false });
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", encerrar);
    window.addEventListener("keydown", tecla);

    arrasteRef.current = {
      ag,
      x0,
      y0,
      dx: larguraF / 2,
      dy: alturaF + 2,
      largura: larguraF,
      altura: alturaF,
      iniciado: false,
      x: x0,
      y: y0,
      rolavel: null,
      raf: 0,
      limpar: () => {
        window.removeEventListener("pointermove", mover);
        window.removeEventListener("pointerup", soltar);
        window.removeEventListener("pointercancel", encerrar);
        window.removeEventListener("keydown", tecla);
      },
    };
  };

  const duracaoArrastando = arrastando ? Math.max(horaParaMinutos(arrastando.hora_fim) - horaParaMinutos(arrastando.hora), passo) : 0;
  const textoDestino =
    !alvo
      ? "Solte num horário"
      : alvo.tipo === "slot"
        ? `→ ${rotuloDia(alvo.dia).curto} ${alvo.dia.slice(8, 10)}/${alvo.dia.slice(5, 7)} às ${minutosParaHora(alvo.min)}`
        : alvo.tipo === "card"
          ? `⇄ Trocar com ${alvo.ag.paciente_nome}`
          : `✕ ${alvo.motivo}`;

  return (
    <div
      ref={raizRef}
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
            data-agn-dia={d}
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
              return (
                <button
                  key={m}
                  type="button"
                  className={`agn-grade__slot ${m % 60 === 0 ? "agn-grade__slot--hora" : ""}`}
                  style={{ top: px(m), height: passo * PX_POR_MIN }}
                  aria-label={`Marcar ${rotuloDia(d).longo} ${d.split("-").reverse().join("/")} às ${minutosParaHora(m)}`}
                  onClick={() => {
                    if (ignorarCliqueRef.current) return;
                    props.onSlot(d, minutosParaHora(m));
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
              const motivo = motivoNaoArrasta(ag);
              const destaque =
                arrastando?.id === ag.id
                  ? "origem"
                  : alvo?.tipo === "card" && alvo.ag.id === ag.id
                    ? "troca"
                    : alvo?.tipo === "invalido" && alvo.cardId === ag.id
                      ? "negado"
                      : null;
              return (
                <CardAgendamento
                  key={ag.id}
                  ag={ag}
                  cor={corDoCard(ag, props.tipos)}
                  alturaPx={alturaPx}
                  destaque={destaque}
                  style={{
                    top: p.topo * PX_POR_MIN + 1,
                    height: alturaPx,
                    left: `calc(${p.coluna * largura}% + 2px)`,
                    width: `calc(${largura}% - 4px)`,
                  }}
                  onClick={() => {
                    if (ignorarCliqueRef.current) return;
                    props.onCard(ag);
                  }}
                  arraste={{
                    arrastavel: motivo === null,
                    motivo,
                    onPointerDown: (e) => iniciarPressao(e, ag),
                  }}
                />
              );
            })}

            {/* Prévia: onde o card vai cair (tracejado), vermelha se não vale */}
            {arrastando && alvo && alvo.tipo !== "card" && alvo.dia === d && alvo.min !== undefined ? (
              <div
                className={`agn-grade__previa ${alvo.tipo === "invalido" ? "agn-grade__previa--invalida" : ""}`}
                style={{ top: px(alvo.min), height: Math.max(duracaoArrastando * PX_POR_MIN - 2, 14) }}
                aria-hidden
              >
                {alvo.tipo === "invalido"
                  ? alvo.motivo
                  : `${minutosParaHora(alvo.min)}–${minutosParaHora(alvo.min + duracaoArrastando)}`}
              </div>
            ) : null}

            {/* Linha da hora atual */}
            {d === hoje && agoraMin >= faixa.ini && agoraMin <= faixa.fim && (
              <div className="agn-grade__agora" style={{ top: px(agoraMin) }} aria-label={`Agora ${minutosParaHora(agoraMin)}`} />
            )}
          </div>
        );
      })}

      {/* Card "andando" junto do mouse */}
      {arrastando && arrasteRef.current ? createPortal(
        <div
          ref={fantasmaRef}
          className={`agn-fantasma ${alvo?.tipo === "invalido" ? "agn-fantasma--invalido" : ""}`}
          style={{
            width: arrasteRef.current.largura,
            height: arrasteRef.current.altura,
            background: corDoCard(arrastando, props.tipos),
            color: corTextoSobre(corDoCard(arrastando, props.tipos)),
            transform: `translate3d(${arrasteRef.current.x - arrasteRef.current.dx}px, ${arrasteRef.current.y - arrasteRef.current.dy}px, 0)`,
          }}
          aria-hidden
        >
          <span className="agn-fantasma__nome">
            {arrastando.hora} {arrastando.paciente_nome}
          </span>
          <span className="agn-fantasma__destino">{textoDestino}</span>
        </div>,
        document.body,
      ) : null}

      {/* Pezinhos andando embaixo do card (igual ao Clinicar) */}
      <PezinhosArraste
        ativo={!!arrastando}
        cor={arrastando ? corDoCard(arrastando, props.tipos) : "#475569"}
        podeSoltar={alvo?.tipo === "slot" || alvo?.tipo === "card"}
      />

      {/* Motivo de não poder arrastar, junto do mouse */}
      {aviso
        ? createPortal(
            <div className="agn-aviso-arraste" style={{ left: aviso.x + 14, top: aviso.y + 16 }} role="status">
              {aviso.texto}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
