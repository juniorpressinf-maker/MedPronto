import { ArrowLeftRight, Banknote, CreditCard, QrCode, Trash2, Wallet, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type CobrancaFormaPagamento } from "../../lib/api";
import { labelFormaPagamento } from "../../lib/cobrancaFormat";
import { useMessageBox } from "../../lib/messageBoxContext";

export type PagamentoReceber = { forma: CobrancaFormaPagamento; valor_centavos: number };

type Props = {
  /** Valor a receber já com o desconto digitado (recalcula ao mudar o desconto). */
  valorCentavos: number;
  totalItensCentavos: number;
  descontoReais: string;
  onDescontoReais: (v: string) => void;
  motivoDesconto: string;
  onMotivoDesconto: (v: string) => void;
  formas: CobrancaFormaPagamento[];
  busy: boolean;
  onConfirmar: (pagamentos: PagamentoReceber[]) => void;
  onFechar: () => void;
  /** Atendimento ainda não finalizado (agendado / aguardando / em atendimento). */
  atendimentoEmAndamento?: boolean;
};

function brl(c: number): string {
  return (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** "12,50" / "12.50" / "1.234,50" -> centavos (inválido = 0). */
export function paraCentavos(txt: string): number {
  let t = String(txt ?? "").replace(/\s/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function paraTexto(c: number): string {
  return (c / 100).toFixed(2).replace(".", ",");
}

const ICONE: Record<string, LucideIcon> = {
  pix: QrCode,
  credito: CreditCard,
  debito: CreditCard,
  dinheiro: Banknote,
  transferencia: ArrowLeftRight,
};

/** Atalho de teclado de cada forma (letra mostrada no botão). */
const ATALHO: Record<string, string> = {
  pix: "P",
  credito: "C",
  debito: "D",
  dinheiro: "N",
  transferencia: "T",
};

/**
 * Receber conta — fluxo de caixa: escolhe a forma, digita o valor, ENTER registra.
 * O foco volta sempre para o valor (já com o que falta) até fechar o total.
 * Pode repetir formas (crédito + crédito + dinheiro…).
 */
export function ReceberContaDialog({
  valorCentavos,
  totalItensCentavos,
  descontoReais,
  onDescontoReais,
  motivoDesconto,
  onMotivoDesconto,
  formas,
  busy,
  onConfirmar,
  onFechar,
  atendimentoEmAndamento,
}: Props) {
  const [pagos, setPagos] = useState<{ id: number; forma: CobrancaFormaPagamento; valor_centavos: number }[]>([]);
  const [proxId, setProxId] = useState(1);
  // Dinheiro já vem escolhido (o mais comum no balcão); troca com clique ou letra.
  const [forma, setForma] = useState<CobrancaFormaPagamento | null>(
    formas.includes("dinheiro") ? "dinheiro" : (formas[0] ?? null),
  );
  const [valor, setValor] = useState(paraTexto(valorCentavos));
  const [aviso, setAviso] = useState<string | null>(null);
  const valorRef = useRef<HTMLInputElement>(null);
  const confirmarRef = useRef<HTMLButtonElement>(null);

  const soma = pagos.reduce((t, p) => t + p.valor_centavos, 0);
  const restante = valorCentavos - soma;
  const descontoCentavos = paraCentavos(descontoReais);
  const erroDesconto =
    descontoCentavos < 0
      ? "Desconto inválido."
      : descontoCentavos > totalItensCentavos
        ? "Desconto maior que o total dos itens."
        : descontoCentavos > 0 && !motivoDesconto.trim()
          ? "Informe o motivo do desconto."
          : valorCentavos - pagos.reduce((t, p) => t + p.valor_centavos, 0) < 0
            ? "Com esse desconto, o já lançado passa do valor a receber. Diminua o desconto ou remova um pagamento."
            : null;

  // Desconto passou do permitido: NÃO é "nada a receber" (o valor só parece zero porque travou em 0).
  const descontoInvalido = Boolean(erroDesconto) && !erroDesconto!.startsWith("Informe o motivo");
  const semValor = valorCentavos === 0 && !descontoInvalido;
  // Confirmar libera com o total fechado; problema de desconto é avisado em janela ao tentar.
  const ok = !descontoInvalido && (semValor || (restante === 0 && pagos.length > 0));
  const msg = useMessageBox();
  const descontoRef = useRef<HTMLInputElement>(null);
  const motivoRef = useRef<HTMLInputElement>(null);
  /** true = desconto ok; senão abre o aviso (modal) e leva o foco ao campo certo. */
  const avisando = useRef(false);
  const conferirDesconto = async (): Promise<boolean> => {
    if (!erroDesconto) return true;
    if (avisando.current) return false; // o aviso tira o foco do campo (blur): não abrir dois
    avisando.current = true;
    const lancado = pagos.reduce((t, p) => t + p.valor_centavos, 0);
    const passou = lancado - valorCentavos;
    if (passou > 0 && descontoCentavos <= totalItensCentavos) {
      // Desconto maior que o que faltava lançar: explica com os números.
      const maxDesconto = Math.max(0, descontoCentavos - passou);
      await msg.warning({
        title: "Desconto maior que o valor restante",
        message: [
          `Total da conta: ${brl(totalItensCentavos)}`,
          `Já lançado em pagamentos: ${brl(lancado)}`,
          `Desconto informado: ${brl(descontoCentavos)}`,
          `Com esse desconto, a conta cai para ${brl(valorCentavos)}.`,
          "",
          `O que já foi lançado passa ${brl(passou)} do novo valor — o paciente estaria pagando a mais.`,
          "",
          "Para corrigir, escolha uma opção:",
          `• diminuir o desconto para no máximo ${brl(maxDesconto)}; ou`,
          "• remover um pagamento lançado (lixeira) e lançar de novo com o valor certo.",
        ].join("\n"),
      });
    } else if (descontoCentavos > totalItensCentavos) {
      await msg.warning({
        title: "Desconto maior que o total da conta",
        message: [
          `Total da conta: ${brl(totalItensCentavos)}`,
          `Desconto informado: ${brl(descontoCentavos)}`,
          "",
          `O desconto não pode passar do total — ficaria ${brl(descontoCentavos - totalItensCentavos)} "negativo".`,
          "",
          `Informe um desconto de no máximo ${brl(Math.max(0, totalItensCentavos - lancado))}${lancado > 0 ? " (já há pagamentos lançados)" : ""}.`,
        ].join("\n"),
      });
    } else {
      await msg.warning({ title: "Desconto", message: erroDesconto });
    }
    window.setTimeout(() => {
      avisando.current = false;
    }, 0);
    const alvo = erroDesconto.startsWith("Informe o motivo") ? motivoRef.current : descontoRef.current;
    alvo?.focus();
    alvo?.select?.();
    return false;
  };

  // O valor a lançar é sempre o que falta; ao fechar o total, o foco vai para Confirmar.
  useEffect(() => {
    setValor(paraTexto(Math.max(0, restante)));
    if (restante === 0 && pagos.length > 0) confirmarRef.current?.focus();
  }, [restante, pagos.length]);

  // Foco + seleção (azul) no valor DEPOIS de atualizar o texto: digitar já substitui.
  const pedirFoco = useRef(false);
  const focarValor = () => {
    pedirFoco.current = true;
  };
  useEffect(() => {
    if (!pedirFoco.current) return;
    const el = valorRef.current;
    if (!el || el.disabled) return;
    pedirFoco.current = false;
    el.focus();
    el.select();
  });

  const escolher = (f: CobrancaFormaPagamento) => {
    setForma(f);
    setAviso(null);
    focarValor();
  };

  const registrar = async () => {
    if (!(await conferirDesconto())) return;
    if (restante <= 0) return;
    if (!forma) {
      setAviso("Escolha a forma de pagamento (clique ou tecle a letra).");
      return;
    }
    const c = paraCentavos(valor);
    if (c <= 0) {
      setAviso("Informe o valor.");
      return;
    }
    if (c > restante) {
      setAviso(`Valor maior que o que falta (${brl(restante)}).`);
      return;
    }
    setPagos((ps) => [...ps, { id: proxId, forma, valor_centavos: c }]);
    setValor(paraTexto(Math.max(0, restante - c)));
    setProxId((n) => n + 1);
    setAviso(null);
    focarValor();
  };

  const remover = (id: number) => {
    const removido = pagos.find((p) => p.id === id)?.valor_centavos ?? 0;
    setPagos((ps) => ps.filter((p) => p.id !== id));
    setValor(paraTexto(Math.max(0, restante + removido)));
    focarValor();
  };

  const rotulo = (p: { id: number; forma: CobrancaFormaPagamento }) => {
    const mesmas = pagos.filter((x) => x.forma === p.forma);
    const nome = labelFormaPagamento(p.forma);
    return mesmas.length > 1 ? `${nome} ${mesmas.findIndex((x) => x.id === p.id) + 1}` : nome;
  };

  return (
    <div className="modal-overlay" role="presentation">
      <div
        className="modal panel rcb"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receber-titulo"
        onKeyDown={(e) => {
          if (e.key === "Escape" && !busy) onFechar();
        }}
      >
        <header className="rcb__topo">
          <h2 id="receber-titulo" className="rcb__titulo">
            Receber conta
          </h2>
          <div className="rcb__resumo">
            <div className="rcb__card">
              <span className="rcb__card-rotulo">A receber</span>
              <strong className="rcb__card-valor">{brl(valorCentavos)}</strong>
            </div>
            <div className="rcb__card">
              <span className="rcb__card-rotulo">Recebido</span>
              <strong className="rcb__card-valor">{brl(soma)}</strong>
            </div>
            {descontoInvalido ? (
              <div className="rcb__card rcb__card--falta">
                <span className="rcb__card-rotulo">Desconto</span>
                <strong className="rcb__card-valor">Inválido</strong>
              </div>
            ) : (
              <div className={`rcb__card ${restante === 0 && !semValor ? "rcb__card--ok" : "rcb__card--falta"}`}>
                <span className="rcb__card-rotulo">{restante === 0 ? "Situação" : restante < 0 ? "Passou" : "Falta"}</span>
                <strong className="rcb__card-valor">{restante === 0 ? "✓ Fechado" : brl(Math.abs(restante))}</strong>
              </div>
            )}
          </div>
        </header>

        {atendimentoEmAndamento && (
          <p className="rcb__aviso" role="note">
            ⚠ Atendimento ainda em andamento. Se o médico incluir algum exame ou procedimento, a conta
            será reaberta para cobrar só a diferença — os pagamentos de agora continuam valendo.
          </p>
        )}

        <section className="rcb__desconto">
          <label className="rcb__campo rcb__campo--curto">
            <span>Desconto (R$)</span>
            <input
              ref={descontoRef}
              className="legacy-input text-right"
              inputMode="decimal"
              // Pode dar desconto enquanto ainda houver valor a lançar.
              disabled={busy || (pagos.length > 0 && restante === 0)}
              title={pagos.length > 0 && restante === 0 ? "Total já lançado: remova um pagamento para mudar o desconto" : undefined}
              value={descontoReais}
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                onDescontoReais(e.target.value);
                // Desconto zerado: o motivo não vale mais.
                if (paraCentavos(e.target.value) === 0 && motivoDesconto) onMotivoDesconto("");
              }}
              onBlur={() => {
                // Ao sair do desconto: valor inválido avisa na hora (o motivo é cobrado ao lançar/confirmar).
                if (erroDesconto && !erroDesconto.startsWith("Informe o motivo")) void conferirDesconto();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (erroDesconto && !erroDesconto.startsWith("Informe o motivo")) void conferirDesconto();
                  else motivoRef.current?.focus();
                }
              }}
            />
          </label>
          <label className="rcb__campo">
            <span>Motivo do desconto</span>
            <input
              ref={motivoRef}
              className="legacy-input"
              disabled={busy}
              placeholder={descontoCentavos > 0 ? "Obrigatório" : "Opcional"}
              value={motivoDesconto}
              onChange={(e) => onMotivoDesconto(e.target.value)}
            />
          </label>
        </section>

        {descontoInvalido ? (
          <p className="rcb__erro">
            Desconto acima do permitido ({brl(totalItensCentavos)} é o total da conta). Corrija o desconto —
            ao sair do campo aparece a explicação.
          </p>
        ) : semValor ? (
          <p className="rcb__vazio">Nada a receber: a conta será fechada sem pagamento.</p>
        ) : (
          <>
            <p className="rcb__passo">1. Forma de pagamento</p>
            <div className="rcb__formas" role="radiogroup" aria-label="Forma de pagamento">
              {formas.map((f) => {
                const Icone = ICONE[f] ?? Wallet;
                return (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={forma === f}
                    disabled={busy || restante <= 0}
                    className={`rcb__forma${forma === f ? " rcb__forma--ativa" : ""}`}
                    onClick={() => escolher(f)}
                  >
                    <Icone className="rcb__forma-icone" aria-hidden />
                    <span className="rcb__forma-nome">{labelFormaPagamento(f)}</span>
                    <kbd className="rcb__tecla">{ATALHO[f] ?? "?"}</kbd>
                  </button>
                );
              })}
            </div>

            <p className="rcb__passo">2. Valor — Enter lança</p>
            <div className="rcb__lancar">
              <div className="rcb__valor">
                <span className="rcb__valor-forma">{forma ? labelFormaPagamento(forma) : "Forma?"}</span>
                <span>R$</span>
                <input
                  ref={valorRef}
                  inputMode="decimal"
                  aria-label="Valor do pagamento"
                  autoFocus
                  disabled={busy || restante <= 0}
                  value={valor}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    setValor(e.target.value);
                    setAviso(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void registrar();
                      return;
                    }
                    // Letra = troca a forma sem tirar o foco do valor.
                    const f = formas.find((x) => ATALHO[x] === e.key.toUpperCase());
                    if (f && !e.ctrlKey && !e.altKey) {
                      e.preventDefault();
                      escolher(f);
                    }
                  }}
                />
                <button
                  type="button"
                  className="rcb__valor-btn"
                  disabled={busy || restante <= 0}
                  onClick={() => void registrar()}
                >
                  Lançar ↵
                </button>
              </div>
            </div>
            {aviso && <p className="rcb__erro">{aviso}</p>}

            {pagos.length > 0 && (
              <ul className="rcb__lista">
                {pagos.map((p) => {
                  const Icone = ICONE[p.forma] ?? Wallet;
                  return (
                    <li key={p.id} className="rcb__item">
                      <Icone className="rcb__item-icone" aria-hidden />
                      <span className="rcb__item-nome">{rotulo(p)}</span>
                      <strong className="rcb__item-valor">{brl(p.valor_centavos)}</strong>
                      <button
                        type="button"
                        className="rcb__remover"
                        title="Remover este pagamento"
                        aria-label={`Remover ${rotulo(p)}`}
                        disabled={busy}
                        onClick={() => remover(p.id)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        <footer className="modal__actions rcb__rodape">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onFechar}>
            Cancelar
          </button>
          <button
            ref={confirmarRef}
            type="button"
            className="btn btn-primary"
            disabled={!ok || busy}
            onClick={async () => {
              if (!(await conferirDesconto())) return;
              onConfirmar(semValor ? [] : pagos.map((p) => ({ forma: p.forma, valor_centavos: p.valor_centavos })));
            }}
          >
            {busy ? "Recebendo…" : "Confirmar recebimento"}
          </button>
        </footer>
      </div>
    </div>
  );
}
