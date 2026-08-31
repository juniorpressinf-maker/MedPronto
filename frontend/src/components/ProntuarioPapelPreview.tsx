type Props = {
  nomeClinica?: string;
  medicoNome?: string;
  medicoCrm?: string;
  pacienteNome?: string;
  pacienteNasc?: string;
  pacienteCpf?: string;
  alergias?: string;
  prontuarioNumero?: number;
  dataAtendimento?: string;
};

export function ProntuarioPapelPreview({
  nomeClinica = "Consultório Médico Exemplo",
  medicoNome = "Dr. João Silva",
  medicoCrm = "CRM 12345",
  pacienteNome = "Maria da Silva Santos",
  pacienteNasc = "15/03/1978",
  pacienteCpf = "000.000.000-00",
  alergias = "Dipirona",
  prontuarioNumero = 1042,
  dataAtendimento = new Date().toLocaleDateString("pt-BR"),
}: Props) {
  const secoes = [
    { label: "Queixa principal:", valor: "Cefaleia há 3 dias, piora ao acordar." },
    { label: "Anamnese:", valor: "" },
    { label: "Exame físico:", valor: "" },
    { label: "Hipótese diagnóstica:", valor: "" },
    { label: "Conduta:", valor: "" },
    { label: "Plano:", valor: "" },
  ] as const;

  return (
    <div className="prontuario-folha">
      <header className="prontuario-topo">
        <div className="prontuario-topo__esquerda">
          <div>
            <div className="prontuario-topo__medico-nome">
              {medicoNome}
              {medicoCrm ? ` — ${medicoCrm}` : ""}
            </div>
            {nomeClinica ? (
              <div className="prontuario-topo__medico-info">{nomeClinica}</div>
            ) : null}
          </div>
        </div>
        <div className="prontuario-topo__caixa">
          <div className="prontuario-topo__caixa-linha">
            <span>Pront. nº:</span>
            <span className="prontuario-topo__caixa-valor">{prontuarioNumero}</span>
          </div>
          <div className="prontuario-topo__caixa-linha">
            <span>Data:</span>
            <span className="prontuario-topo__caixa-valor">{dataAtendimento}</span>
          </div>
        </div>
      </header>

      <h2 className="prontuario-titulo-documento">Prontuário médico</h2>

      <section className="prontuario-identificacao">
        <div className="prontuario-linha">
          <span className="prontuario-linha__rotulo">Nome:</span>
          <span className="prontuario-linha__valor">{pacienteNome}</span>
          <span className="prontuario-linha__rotulo">nasc.:</span>
          <span className="prontuario-linha__valor prontuario-linha__valor--curto">
            {pacienteNasc}
          </span>
        </div>
        <div className="prontuario-linha">
          <span className="prontuario-linha__rotulo">CPF:</span>
          <span className="prontuario-linha__valor">{pacienteCpf}</span>
        </div>
        {alergias ? (
          <div className="prontuario-alerta-alergia">{alergias}</div>
        ) : null}
      </section>

      <div className="prontuario-corpo">
        {secoes.map(({ label, valor }) => (
          <section key={label} className="prontuario-secao">
            <h3 className="prontuario-secao__titulo">{label}</h3>
            <div className="prontuario-campo prontuario-campo--linhas">
              <textarea
                readOnly
                className="prontuario-secao__area"
                defaultValue={valor}
                rows={3}
              />
            </div>
          </section>
        ))}

        <section className="prontuario-secao">
          <h3 className="prontuario-secao__titulo">CID-10:</h3>
          <div className="prontuario-linha">
            <span className="prontuario-linha__valor">G43.9 — Enxaqueca, não especificada</span>
          </div>
        </section>
      </div>
    </div>
  );
}
