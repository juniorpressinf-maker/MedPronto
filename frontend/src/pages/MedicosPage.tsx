import { CadastroSimples } from "../components/CadastroSimples";

export function MedicosPage() {
  return (
    <CadastroSimples
      title="Médicos"
      subtitle="Profissionais que atendem na clínica — usados na agenda"
      resource="medicos"
      showAtivo
      searchPlaceholder="Buscar nome, CRM, CPF ou telefone — Enter"
      emptyLabel=" "
      fields={[
        {
          key: "nome",
          label: "Nome",
          required: true,
          maxLength: 120,
          colSpan: 2,
        },
        {
          key: "crm",
          label: "CRM",
          required: true,
          maxLength: 30,
          placeholder: "Ex.: 12345 ou CRM/MG 12345",
        },
        {
          key: "cpf",
          label: "CPF",
          maxLength: 14,
          placeholder: "000.000.000-00",
        },
        {
          key: "telefone",
          label: "Telefone",
          type: "tel",
          maxLength: 30,
          placeholder: "(00) 00000-0000",
        },
        {
          key: "email",
          label: "E-mail",
          type: "email",
          maxLength: 120,
          colSpan: 2,
        },
        {
          key: "login",
          label: "Usuário de acesso",
          labelWhenEdit: "Usuário de acesso",
          maxLength: 30,
          placeholder: "Ex.: joao — ou deixe vazio para gerar pelo nome",
          hint: "Nome que o médico digita na tela de entrada. Se deixar vazio, o sistema cria pelo primeiro nome (ex.: João Silva → joao).",
          hintWhenEdit:
            "É o que o médico digita na tela de entrada do MedPronto (campo «Usuário»). Para trocar o usuário, use Configurações → Usuários.",
          readOnlyOnEdit: true,
        },
        {
          key: "senha",
          label: "Senha de acesso",
          type: "password",
          requiredOnCreate: true,
          labelWhenEdit: "Nova senha",
          placeholder: "Mínimo 6 caracteres",
          hint: "Defina agora a senha que o médico usará para entrar. Anote em local seguro — depois do cadastro ela não pode ser consultada, só trocada.",
          hintWhenEdit:
            "Deixe em branco para não alterar. A senha atual não aparece por segurança; preencha somente se quiser definir uma senha nova.",
        },
        {
          key: "endereco",
          label: "Endereço",
          type: "textarea",
          maxLength: 500,
          colSpan: 2,
        },
      ]}
      listColumns={[
        { key: "nome", label: "Nome" },
        { key: "login", label: "Usuário" },
        { key: "crm", label: "CRM" },
        { key: "telefone", label: "Telefone" },
        { key: "cpf", label: "CPF" },
      ]}
    />
  );
}
