import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnexarExameDialog } from "../components/AnexarExameDialog";
import { CadastroSimples } from "../components/CadastroSimples";
import { PacienteHistoricoAbas } from "../components/PacienteHistoricoAbas";
import { setAgendaPrefill } from "../lib/agendaPrefill";
import {
  agendaDiaPath,
  hojeIso,
} from "../lib/agendaNav";
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
                setAgendaPrefill(row.id);
                navigate(
                  agendaDiaPath(hojeIso(), { voltar: "/pacientes" }),
                );
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
        fields={[
          {
            key: "nome",
            label: "Nome",
            required: true,
            maxLength: 200,
            colSpan: 4,
          },
          { key: "data_nasc", label: "Data nasc.", type: "date", required: true },
          { key: "cpf", label: "CPF", maxLength: 14, placeholder: "000.000.000-00" },
          {
            key: "telefone",
            label: "Telefone",
            type: "tel",
            required: true,
            maxLength: 30,
            placeholder: "(00) 00000-0000",
          },
          {
            key: "email",
            label: "E-mail",
            type: "email",
            maxLength: 120,
          },
          {
            key: "endereco",
            label: "Endereço",
            maxLength: 200,
            colSpan: 2,
          },
          {
            key: "numero",
            label: "Número",
            maxLength: 20,
          },
          {
            key: "uf",
            label: "UF",
            maxLength: 2,
            placeholder: "MG",
          },
          {
            key: "bairro",
            label: "Bairro",
            maxLength: 100,
            colSpan: 2,
          },
          {
            key: "cidade",
            label: "Cidade",
            maxLength: 100,
          },
          {
            key: "fone_emergencia",
            label: "Fone emergência",
            type: "tel",
            maxLength: 30,
            placeholder: "(00) 00000-0000",
          },
          {
            key: "alergias",
            label: "Alergias",
            type: "textarea",
            maxLength: 2000,
            colSpan: 2,
            rows: 2,
          },
          {
            key: "medicacoes_uso",
            label: "Medicações em uso",
            type: "textarea",
            maxLength: 2000,
            colSpan: 2,
            rows: 2,
          },
          {
            key: "observacoes_clinicas",
            label: "Observações clínicas",
            type: "textarea",
            maxLength: 4000,
            colSpan: 4,
            rows: 2,
          },
        ]}
        listColumns={[
          { key: "nome", label: "Nome" },
          { key: "telefone", label: "Telefone" },
          { key: "cpf", label: "CPF" },
        ]}
        formExtra={({ editId, form }) => (
          <PacienteHistoricoAbas
            pacienteId={editId}
            pacienteNome={form.nome?.trim() || `Paciente #${editId}`}
          />
        )}
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
