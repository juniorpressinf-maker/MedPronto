import { UserPlus } from "lucide-react";
import { useState } from "react";
import { api, type Paciente } from "../../../lib/api";
import { dataBr } from "../../../lib/agendaNova/semana";
import { CampoBusca } from "./CampoBusca";
import { PacienteNovoDialog } from "./PacienteNovoDialog";

type Props = {
  paciente: Paciente | null;
  onEscolher: (p: Paciente | null) => void;
  /** edição: paciente do horário não pode ser trocado */
  fixo?: boolean;
};

/** Paciente: clicar abre todos, digitar filtra (padrão CampoBusca); trocar; cadastro completo no "+ Novo". */
export function PacienteSeletor({ paciente, onEscolher, fixo }: Props) {
  const [novo, setNovo] = useState(false);

  if (paciente) {
    return (
      <div className="agn-paciente">
        <div className="min-w-0">
          <div className="agn-paciente__nome">{paciente.nome}</div>
          <div className="agn-paciente__dados">
            <span>Nasc.: {paciente.data_nasc ? dataBr(paciente.data_nasc.slice(0, 10)) : "não informado"}</span>
            <span>Celular: {paciente.telefone || "não informado"}</span>
          </div>
        </div>
        {!fixo && (
          <button type="button" className="btn btn-secondary btn-sm ml-auto" onClick={() => onEscolher(null)}>
            Trocar paciente
          </button>
        )}
      </div>
    );
  }

  return (
    <>
    <CampoBusca<Paciente>
      rotulo="Paciente"
      placeholder="Clique para ver os pacientes ou digite nome, CPF ou telefone…"
      focar
      buscar={(q) => api.pacientesList(q || undefined)}
      chave={(p) => p.id}
      onEscolher={onEscolher}
      renderItem={(p) => (
        <>
          <span className="font-medium">{p.nome}</span>
          <span className="text-xs text-[var(--muted)]">
            {p.data_nasc ? dataBr(p.data_nasc.slice(0, 10)) : "sem nascimento"} · {p.telefone || "sem telefone"}
          </span>
        </>
      )}
      acao={
        <button
          type="button"
          className="btn btn-secondary btn-sm whitespace-nowrap"
          title="Cadastrar paciente novo"
          onClick={() => setNovo(true)}
        >
          <UserPlus className="inline h-4 w-4 mr-1" aria-hidden />
          Novo
        </button>
      }
    />
    {novo && (
      <PacienteNovoDialog
        onFechar={() => setNovo(false)}
        onSalvo={(p) => {
          setNovo(false);
          onEscolher(p);
        }}
      />
    )}
    </>
  );
}
