import { useEffect, useState } from "react";
import { CadastroSimples } from "../components/CadastroSimples";
import { ImpressaoPreferencia } from "../components/ImpressaoPreferencia";
import { api, type PreferenciaImpressao } from "../lib/api";

type EstadoImpressao = { editId: number; original: PreferenciaImpressao; atual: PreferenciaImpressao };

const igual = (a: PreferenciaImpressao, b: PreferenciaImpressao) =>
  Boolean(a.impressao_timbrado) === Boolean(b.impressao_timbrado) &&
  a.timbrado_topo_mm === b.timbrado_topo_mm &&
  a.timbrado_rodape_mm === b.timbrado_rodape_mm;

/** Impressão do médico dentro do formulário: carrega ao abrir; grava no "Salvar alterações". */
function ImpressaoDoMedico(props: {
  editId: number;
  estado: EstadoImpressao | null;
  setEstado: (e: EstadoImpressao | null) => void;
}) {
  const { editId, setEstado } = props;
  useEffect(() => {
    let vivo = true;
    void api
      .medicoImpressao(editId)
      .then((p) => {
        if (vivo) setEstado({ editId, original: p, atual: p });
      })
      .catch(() => {});
    return () => {
      vivo = false;
      setEstado(null); // saiu do formulário sem salvar: descarta
    };
  }, [editId, setEstado]);

  const e = props.estado;
  if (!e || e.editId !== editId) return null;
  return (
    <ImpressaoPreferencia
      noCadastro
      valor={e.atual}
      onMudar={(p) => setEstado({ ...e, atual: p })}
    />
  );
}

export function MedicosPage() {
  const [impressao, setImpressao] = useState<EstadoImpressao | null>(null);
  const extraPendente =
    impressao && !igual(impressao.original, impressao.atual)
      ? {
          dirty: true,
          salvar: async () => {
            const p = impressao.atual;
            const salvo = await api.medicoImpressaoSalvar(impressao.editId, {
              impressao_timbrado: Boolean(p.impressao_timbrado),
              timbrado_topo_mm: p.timbrado_topo_mm,
              timbrado_rodape_mm: p.timbrado_rodape_mm,
            });
            setImpressao({ editId: impressao.editId, original: salvo, atual: salvo });
          },
        }
      : null;

  return (
    <CadastroSimples
      extraPendente={extraPendente}
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
      formExtra={({ editId }) => (
        <div className="mt-3">
          <h3 className="text-sm font-semibold mb-2">Impressão dos documentos do atendimento</h3>
          <ImpressaoDoMedico key={editId} editId={editId} estado={impressao} setEstado={setImpressao} />
          <p className="text-xs text-[var(--muted)] mt-1 mb-0">
            Receita, atestado, pedido de exame e consulta. Grava ao clicar em «Salvar alterações». O médico
            também pode trocar na tela de atendimento.
          </p>
        </div>
      )}
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
