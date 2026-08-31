type Props = {
  titulo: string;
  pacienteNome: string;
};

export function AtendimentoCardTitulo({ titulo, pacienteNome }: Props) {
  const nome = pacienteNome.trim();
  return (
    <h2 className="prontuario-titulo-documento">
      {titulo}
      {nome ? (
        <span className="prontuario-titulo-documento__paciente"> — {nome}</span>
      ) : null}
    </h2>
  );
}
