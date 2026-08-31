import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClinicaBrandMark } from "../components/ClinicaBrandMark";
import {
  ClinicaForm,
  emptyClinicaForm,
  type ClinicaFormData,
} from "../components/ClinicaForm";
import { useAuth } from "../lib/authContext";
import { ApiError, api } from "../lib/api";
import { useClinicaBranding } from "../lib/clinicaBrandingContext";
import { useMessageBox } from "../lib/messageBoxContext";

export function ClinicaSetupPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const { refreshBranding } = useClinicaBranding();
  const msg = useMessageBox();
  const [saving, setSaving] = useState(false);

  const save = async (data: ClinicaFormData) => {
    setSaving(true);
    try {
      await api.clinicaCreate({
        nome: data.nome,
        cnpj_cpf: data.cnpj_cpf || undefined,
        telefone: data.telefone || undefined,
        endereco: data.endereco || undefined,
        email: data.email,
        email_senha: data.email_senha,
        logo: data.logo || undefined,
      });
      await refreshBranding();
      await refresh();
      navigate("/", { replace: true });
    } catch (err) {
      void msg.error(
        err instanceof ApiError ? err.message : "Erro ao cadastrar clínica",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="clinica-setup flex min-h-screen items-center justify-center bg-[var(--bg)] p-4">
      <div className="clinica-setup__inner w-full max-w-4xl">
        <div className="mb-6 flex flex-col items-center gap-3 text-center login-brand">
          <ClinicaBrandMark size="lg" tone="light" />
          <h1 className="text-xl font-bold text-[var(--text)]">Cadastro da clínica</h1>
          <p className="text-sm text-[var(--muted)]">
            Primeiro acesso — informe os dados do consultório
          </p>
        </div>
        <div className="est-card p-6">
          <ClinicaForm
            mode="create"
            layout="setup"
            initial={emptyClinicaForm()}
            saving={saving}
            onSubmit={save}
          />
        </div>
      </div>
    </div>
  );
}
