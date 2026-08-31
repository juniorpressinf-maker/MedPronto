import type { ReactNode } from "react";
import { PageHeader } from "./PageHeader";
import { useAuth } from "../lib/authContext";
import { useClinicaBranding } from "../lib/clinicaBrandingContext";

type Props = {
  tituloDocumento: string;
  subtituloFicha?: string;
  caixaRotulo?: string;
  caixaValor?: string;
  aviso?: ReactNode;
  identificacaoExemplo?: boolean;
  children: ReactNode;
  className?: string;
};

function formatDataBr(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function FichaFolhaLayout({
  tituloDocumento,
  subtituloFicha,
  caixaRotulo = "Modelo",
  caixaValor = "—",
  aviso,
  identificacaoExemplo = false,
  children,
  className = "",
}: Props) {
  const { branding } = useClinicaBranding();
  const { me } = useAuth();
  const hoje = formatDataBr(new Date().toISOString());

  return (
    <div className={`prontuario-folha mx-auto w-full max-w-4xl ficha-folha ${className}`.trim()}>
      <header className="prontuario-topo">
        <div className="prontuario-topo__esquerda">
          {branding?.logo ? (
            <img src={branding.logo} alt="" className="prontuario-topo__logo" />
          ) : null}
          <div>
            <div className="prontuario-topo__medico-nome">
              {branding?.nome ?? "Clínica"}
            </div>
            {me?.perfil === "medico" ? (
              <div className="prontuario-topo__medico-info">{me.username}</div>
            ) : branding?.cnpj_cpf ? (
              <div className="prontuario-topo__medico-info">CNPJ: {branding.cnpj_cpf}</div>
            ) : null}
            {subtituloFicha ? (
              <div className="ficha-folha__subtitulo">{subtituloFicha}</div>
            ) : null}
          </div>
        </div>
        <div className="prontuario-topo__caixa">
          <div className="prontuario-topo__caixa-linha">
            <span>{caixaRotulo}:</span>
            <span className="prontuario-topo__caixa-valor">{caixaValor}</span>
          </div>
          <div className="prontuario-topo__caixa-linha">
            <span>Data:</span>
            <span className="prontuario-topo__caixa-valor">{hoje}</span>
          </div>
        </div>
      </header>

      <h2 className="prontuario-titulo-documento">{tituloDocumento || "Prontuário de consulta"}</h2>

      {aviso ? <div className="ficha-folha__aviso">{aviso}</div> : null}

      {identificacaoExemplo ? (
        <section className="prontuario-identificacao ficha-folha__identificacao-exemplo">
          <p className="ficha-folha__identificacao-legenda">
            Identificação do paciente (preenchida automaticamente no atendimento)
          </p>
          <div className="prontuario-linha">
            <span className="prontuario-linha__rotulo">Nome:</span>
            <span className="prontuario-linha__valor prontuario-linha__valor--exemplo">
              Maria da Silva Santos
            </span>
            <span className="prontuario-linha__rotulo">nasc.:</span>
            <span className="prontuario-linha__valor prontuario-linha__valor--curto prontuario-linha__valor--exemplo">
              15/03/1978
            </span>
          </div>
          <div className="prontuario-linha">
            <span className="prontuario-linha__rotulo">CPF:</span>
            <span className="prontuario-linha__valor prontuario-linha__valor--exemplo">
              000.000.000-00
            </span>
          </div>
        </section>
      ) : null}

      {children}
    </div>
  );
}

export function FichaFolhaViewport({ children }: { children: ReactNode }) {
  return (
    <div className="atendimento-prontuario-view scroll-interno flex-1 min-h-0 p-4 bg-[#e8e4dc]">
      {children}
    </div>
  );
}

export function FichaFolhaToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 form-actions form-actions--toolbar border-b border-[var(--border)] pb-2 shrink-0">
      {children}
    </div>
  );
}

export function FichaFolhaPage({
  title,
  subtitle,
  toolbar,
  children,
}: {
  title: string;
  subtitle?: string;
  toolbar: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="page-stack flex-1 min-h-0 overflow-hidden">
      <PageHeader title={title} subtitle={subtitle} />
      {toolbar}
      {children}
    </div>
  );
}
