import { Building2, Eye, EyeOff, ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FormActions } from "./FormActions";
import { useMessageBox } from "../lib/messageBoxContext";
import { isFormDirty, snapshotForm } from "../lib/formDirty";
import { useFocusFirstField } from "../lib/useFocusFirstField";
import { upperPrompt } from "../lib/upperPrompt";
import { validarEmailOpcional } from "../lib/validacoes";
import {
  IMAGE_ACCEPT,
  normalizeStoredLogoFile,
  prepareLogoForSave,
  validateLogoImageInput,
} from "../lib/logoUpload";

export type ClinicaFormData = {
  nome: string;
  cnpj_cpf: string;
  telefone: string;
  endereco: string;
  email: string;
  email_senha: string;
  logo: string;
};

type Props = {
  mode: "create" | "edit";
  /** Primeiro acesso: nome, CNPJ e telefone na mesma linha. */
  layout?: "default" | "setup";
  initial: ClinicaFormData;
  saving?: boolean;
  onSubmit: (data: ClinicaFormData) => void | Promise<void>;
  onBack?: () => void;
};

export function emptyClinicaForm(): ClinicaFormData {
  return {
    nome: "",
    cnpj_cpf: "",
    telefone: "",
    endereco: "",
    email: "",
    email_senha: "",
    logo: "",
  };
}

export function ClinicaForm({ mode, layout = "default", initial, saving, onSubmit, onBack }: Props) {
  const msg = useMessageBox();
  const [form, setForm] = useState(initial);
  const [emailConfirmacao, setEmailConfirmacao] = useState("");
  const [senhaEmailConfirmacao, setSenhaEmailConfirmacao] = useState("");
  const [showSenhaEmail, setShowSenhaEmail] = useState(false);
  const [showSenhaEmailConf, setShowSenhaEmailConf] = useState(false);
  const [logoProcessing, setLogoProcessing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const locked = mode === "edit";
  const [baseline, setBaseline] = useState("");

  const clinicaSnapshot = () =>
    snapshotForm({
      form,
      emailConfirmacao,
      senhaEmailConfirmacao,
    });

  const dirty = useMemo(
    () => baseline !== "" && isFormDirty(clinicaSnapshot(), baseline),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshot fields
    [form, emailConfirmacao, senhaEmailConfirmacao, baseline],
  );

  useEffect(() => {
    const next = { ...initial, email_senha: "" };
    setForm(next);
    setEmailConfirmacao("");
    setSenhaEmailConfirmacao("");
    setBaseline(
      snapshotForm({
        form: next,
        emailConfirmacao: "",
        senhaEmailConfirmacao: "",
      }),
    );
  }, [initial]);

  useFocusFirstField([mode, initial]);

  const set = (name: keyof ClinicaFormData, value: string) => {
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleLogo = (file: File | null) => {
    if (!file) return;
    const erro = validateLogoImageInput(file);
    if (erro) {
      void msg.warning(erro);
      return;
    }
    setLogoProcessing(true);
    void normalizeStoredLogoFile(file)
      .then((dataUrl) => set("logo", dataUrl))
      .catch((err) => {
        const msgErro =
          err instanceof Error && err.message
            ? err.message
            : "Não foi possível processar a imagem. Tente outro arquivo.";
        void msg.warning(msgErro);
      })
      .finally(() => setLogoProcessing(false));
  };

  const clearLogo = () => {
    set("logo", "");
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (logoProcessing) {
      void msg.warning("Aguarde o processamento da imagem.");
      return;
    }
    if (!form.nome.trim()) {
      void msg.warning("Informe o nome da clínica");
      return;
    }
    if (!form.email.trim()) {
      void msg.warning("Informe o e-mail da clínica");
      return;
    }
    if (validarEmailOpcional(form.email)) {
      void msg.warning("Informe um e-mail válido");
      return;
    }
    if (mode === "create" && !form.email_senha.trim()) {
      void msg.warning("Informe a senha do e-mail cadastrado");
      return;
    }
    if (mode === "create") {
      if (form.email.trim() !== emailConfirmacao.trim()) {
        void msg.warning("Os e-mails não coincidem");
        return;
      }
      if (form.email_senha !== senhaEmailConfirmacao) {
        void msg.warning("As senhas do e-mail não coincidem");
        return;
      }
    }

    let logo = form.logo;
    if (logo.trim()) {
      setLogoProcessing(true);
      try {
        logo = await prepareLogoForSave(logo);
      } catch (err) {
        const msgErro =
          err instanceof Error && err.message
            ? err.message
            : "Não foi possível processar a logomarca.";
        void msg.warning(msgErro);
        return;
      } finally {
        setLogoProcessing(false);
      }
    }

    await onSubmit({
      nome: form.nome.trim().toUpperCase(),
      cnpj_cpf: form.cnpj_cpf.trim(),
      telefone: form.telefone.trim(),
      endereco: form.endereco.trim(),
      email: form.email.trim(),
      email_senha: form.email_senha.trim(),
      logo,
    });
  };

  return (
    <form
      className="panel legacy-form legacy-form--wide"
      onSubmit={submit}
      autoComplete="off"
    >
      <div className="sr-only" aria-hidden="true">
        <input type="text" name="fake-user" autoComplete="username" tabIndex={-1} />
        <input
          type="password"
          name="fake-pass"
          autoComplete="current-password"
          tabIndex={-1}
        />
      </div>
      <div className="empresa-form__brand-row">
        <div className="empresa-form__logo-col">
          <button
            type="button"
            className="empresa-form__logo-btn"
            disabled={logoProcessing}
            onClick={() => fileRef.current?.click()}
            title={
              form.logo
                ? "Clique para trocar a logomarca"
                : "Clique para escolher logomarca"
            }
          >
            {form.logo ? (
              <img
                src={form.logo}
                alt="Logomarca"
                className="empresa-form__logo-img"
              />
            ) : (
              <>
                <ImagePlus className="h-8 w-8 text-[var(--muted)]" />
                <span>Logomarca</span>
              </>
            )}
          </button>
          {form.logo ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={clearLogo}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remover
            </button>
          ) : (
            <span className="text-xs text-[var(--muted)] text-center">
              Qualquer tamanho — PNG, JPG, WebP, GIF… o sistema comprime ao gravar
            </span>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={IMAGE_ACCEPT}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            e.target.value = "";
            handleLogo(file);
          }}
        />
        <div className="empresa-form__brand-hint">
          <Building2 className="h-5 w-5 text-[var(--accent)] shrink-0" />
          <p>
            {mode === "create"
              ? "Cadastre os dados da clínica. O e-mail e a senha do e-mail servem só para recuperar a senha do MedPronto — não criam usuário de acesso."
              : "Nome e CNPJ/CPF são fixos. Você pode atualizar telefone, endereço, e-mail, senha do e-mail e a logomarca."}
          </p>
        </div>
      </div>

      <div
        className={`legacy-form__grid legacy-form__grid--wide${layout === "setup" ? " legacy-form__grid--setup-id" : ""}`}
      >
        <label
          className={`legacy-field${layout === "setup" ? "" : " legacy-field--span2"}`}
        >
          <span className="legacy-field__label">Nome da clínica *</span>
          <input
            className="legacy-input"
            value={form.nome}
            disabled={locked}
            readOnly={locked}
            style={{ textTransform: "uppercase" }}
            onChange={(e) => set("nome", e.target.value.toUpperCase())}
            required
          />
        </label>

        <label className="legacy-field">
          <span className="legacy-field__label">CNPJ/CPF</span>
          <input
            className="legacy-input"
            value={form.cnpj_cpf}
            disabled={locked}
            readOnly={locked}
            onChange={(e) => set("cnpj_cpf", e.target.value)}
            placeholder="00.000.000/0000-00"
          />
        </label>

        <label className="legacy-field">
          <span className="legacy-field__label">Telefone</span>
          <input
            className="legacy-input"
            value={form.telefone}
            onChange={(e) => set("telefone", e.target.value)}
            placeholder="(00) 00000-0000"
          />
        </label>

        <label className="legacy-field legacy-field--span2">
          <span className="legacy-field__label">Endereço</span>
          <input
            className="legacy-input"
            value={form.endereco}
            onChange={(e) => set("endereco", upperPrompt(e.target.value))}
          />
        </label>

        <label className="legacy-field legacy-field--span2">
          <span className="legacy-field__label">E-mail *</span>
          <input
            type="text"
            inputMode="email"
            name="clinica_email_recuperacao"
            className="legacy-input"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="contato@suaclinica.com.br"
            required
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />
        </label>

        {mode === "create" ? (
          <label className="legacy-field legacy-field--span2">
            <span className="legacy-field__label">Confirmar e-mail *</span>
            <input
              type="text"
              inputMode="email"
              name="clinica_email_recuperacao_conf"
              className="legacy-input"
              value={emailConfirmacao}
              onChange={(e) => setEmailConfirmacao(e.target.value)}
              placeholder="digite o e-mail novamente"
              required
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
            />
          </label>
        ) : null}

        <label className="legacy-field legacy-field--span2">
          <span className="legacy-field__label">
            {mode === "create"
              ? "Senha do e-mail *"
              : "Senha do e-mail (preencha só para alterar)"}
          </span>
          <div className="relative">
            <input
              type={showSenhaEmail ? "text" : "password"}
              name="clinica_senha_email_recuperacao"
              className="legacy-input pr-10"
              value={form.email_senha}
              onChange={(e) => set("email_senha", e.target.value)}
              autoComplete="new-password"
              required={mode === "create"}
            />
            <button
              type="button"
              onClick={() => setShowSenhaEmail((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              tabIndex={-1}
            >
              {showSenhaEmail ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          <span className="cfg-muted text-xs block mt-1">
            A mesma senha que você usa para entrar no seu e-mail (Outlook, Gmail, etc.).
          </span>
        </label>

        {mode === "create" ? (
          <label className="legacy-field legacy-field--span2">
            <span className="legacy-field__label">Confirmar senha do e-mail *</span>
            <div className="relative">
              <input
                type={showSenhaEmailConf ? "text" : "password"}
                name="clinica_senha_email_recuperacao_conf"
                className="legacy-input pr-10"
                value={senhaEmailConfirmacao}
                onChange={(e) => setSenhaEmailConfirmacao(e.target.value)}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowSenhaEmailConf((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                tabIndex={-1}
              >
                {showSenhaEmailConf ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </label>
        ) : null}
      </div>

      <FormActions
        saving={saving || logoProcessing}
        dirty={dirty}
        savingLabel={
          logoProcessing ? "Processando imagem…" : "Gravando…"
        }
        saveLabel={
          mode === "create" ? "Cadastrar clínica" : "Confirmar alterações"
        }
        onBack={onBack}
      />
    </form>
  );
}
