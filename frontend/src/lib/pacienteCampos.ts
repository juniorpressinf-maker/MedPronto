import type { CadastroField } from "../components/CadastroSimples";

/** Campos do cadastro de paciente — usados em Pacientes e no "+ Novo" da agenda. */
export const PACIENTE_CAMPOS: CadastroField[] = [
  {
    key: "nome",
    label: "Nome",
    required: true,
    maxLength: 200,
    colSpan: 2,
  },
  {
    key: "nome_mae",
    label: "Nome da mãe",
    maxLength: 200,
    colSpan: 2,
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
];

/** Mesma regra do CadastroSimples: texto livre vai em maiúsculas. */
export function campoMaiusculo(f: CadastroField): boolean {
  return f.type !== "email" && f.type !== "tel" && f.type !== "date";
}
