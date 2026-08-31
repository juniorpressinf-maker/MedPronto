import { Building2, BarChart3, ClipboardList, Landmark, Receipt, Table2, Wallet, Banknote } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../lib/authContext";
import { temModulo } from "../../lib/permissoes";

const ATALHOS = [
  {
    to: "/cobranca/caixa",
    label: "Caixa do dia",
    hint: "Recebimentos e saldo pendente",
    icon: Landmark,
    tone: "dup-resumo--paga",
  },
  {
    to: "/cobranca/contas",
    label: "Contas do dia",
    hint: "Abrir e lançar procedimentos",
    icon: Receipt,
    tone: "dup-resumo--hoje",
  },
  {
    to: "/cobranca/receber-convenios",
    label: "Receber convênios",
    hint: "Baixa do repasse mensal",
    icon: Banknote,
    tone: "dup-resumo--paga",
    modulo: "cobranca_relatorios" as const,
  },  {
    to: "/cobranca/relatorios",
    label: "Relatórios",
    hint: "Receita, convênio e procedimentos",
    icon: BarChart3,
    tone: "dup-resumo--aberto",
    modulo: "cobranca_relatorios" as const,
  },
  {
    to: "/cobranca/convenios",
    label: "Convênios",
    hint: "Particular e operadoras",
    icon: Building2,
    tone: "dup-resumo--hoje",
    modulo: "cobranca_config" as const,
  },
  {
    to: "/cobranca/procedimentos",
    label: "Procedimentos",
    hint: "O que a clínica realiza",
    icon: ClipboardList,
    tone: "dup-resumo--futura",
    modulo: "cobranca_config" as const,
  },
  {
    to: "/cobranca/precos",
    label: "Tabela de preços",
    hint: "Procedimento × convênio",
    icon: Table2,
    tone: "dup-resumo--paga",
    modulo: "cobranca_config" as const,
  },
] as const;

export function CobrancaHomePage() {
  const { permissoes } = useAuth();
  const podeConfig = temModulo(permissoes, "cobranca_config");
  const podeRelatorios = temModulo(permissoes, "cobranca_relatorios");
  const visiveis = ATALHOS.filter(
    (a) => !("modulo" in a) || temModulo(permissoes, a.modulo),
  );

  return (
    <div className="space-y-4 pt-2">
      <div className="est-card p-4 max-w-3xl">
        <h2 className="m-0 text-base font-semibold flex items-center gap-2">
          <Wallet className="h-5 w-5" aria-hidden />
          Módulo de cobrança
        </h2>
        <p className="mt-2 mb-0 text-sm text-[var(--text-2)]">
          Caixa do dia, contas do atendimento, cadastros e tabela de preços.
        </p>
      </div>

      <div className="cobranca-atalhos">
        {visiveis.map((a) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.to}
              to={a.to}
              className={`dup-resumo-card cobranca-atalho ${a.tone} no-underline text-inherit`}
            >
              <div className="dup-resumo-card__corpo">
                <Icon className="cobranca-atalho__ico" aria-hidden />
                <div className="dup-resumo-card__label">{a.label}</div>
                <div className="dup-resumo-card__qtd">{a.hint}</div>
              </div>
            </Link>
          );
        })}
      </div>

      {!podeConfig && !podeRelatorios ? (
        <p className="text-sm text-[var(--muted)] m-0">
          Cadastros e relatórios exigem permissões adicionais de cobrança.
        </p>
      ) : !podeConfig ? (
        <p className="text-sm text-[var(--muted)] m-0">
          Cadastros exigem permissão de configuração de cobrança.
        </p>
      ) : null}
    </div>
  );
}
