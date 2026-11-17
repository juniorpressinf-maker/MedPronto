import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnexarExameDialog } from "../components/AnexarExameDialog";
import { CadastroSimples } from "../components/CadastroSimples";
import { abasHistoricoPaciente } from "../components/PacienteHistoricoAbas";
import { PACIENTE_CAMPOS } from "../lib/pacienteCampos";
import { temModulo } from "../lib/permissoes";
import { useAuth } from "../lib/authContext";

type Row = { id: number; nome?: string; [key: string]: unknown };

export function PacientesPage() {
  const navigate = useNavigate();
  const { permissoes } = useAuth();
  const podeAgendar = temModulo(permissoes, "agenda");
  const podeAnexar = temModulo(permissoes, "exames_anexos");
  const [anexarPaciente, setAnexarPaciente] = useState<Row | null>(null);
  const [listaTick, setListaTick] = useState(0);

  return (
    <>
      <CadastroSimples
        title="Pacientes"
        subtitle="Na lista: Anexar exame = nenhum arquivo; número (ex.: 2 exames) = já tem anexo. Clique para ver ou enviar outro."
        resource="pacientes"
        formCardLayout="wide"
        formGridCols={4}
        listRefreshTick={listaTick}
        searchPlaceholder="Buscar nome, CPF ou telefone — Enter"
        emptyLabel="Nenhum paciente"
        onAgendar={
          podeAgendar
            ? (row) => {
                // A6: abre a Agenda Nova já com a marcação deste paciente.
                navigate(`/agenda?paciente=${row.id}`);
              }
            : undefined
        }
        onAnexarExame={
          podeAnexar
            ? (row) => {
                setAnexarPaciente(row);
              }
            : undefined
        }
        fields={PACIENTE_CAMPOS}
        listColumns={[
          { key: "nome", label: "Nome" },
          { key: "telefone", label: "Telefone" },
          { key: "cpf", label: "CPF" },
        ]}
        rotuloAbaPrincipal="Dados do paciente"
        abasExtras={({ editId, form }) =>
          abasHistoricoPaciente(permissoes, editId, form.nome?.trim() || `Paciente #${editId}`)
        }
      />
      {anexarPaciente ? (
        <AnexarExameDialog
          pacienteId={anexarPaciente.id}
          pacienteNome={String(anexarPaciente.nome ?? "")}
          onClose={() => setAnexarPaciente(null)}
          onEnviado={() => setListaTick((n) => n + 1)}
        />
      ) : null}
    </>
  );
}
