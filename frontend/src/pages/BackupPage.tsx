import { ArchiveRestore, DatabaseBackup, Download, FileArchive } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { ApiError, api } from "../lib/api";
import { useMessageBox } from "../lib/messageBoxContext";
import { SaveFileCancelled } from "../lib/saveFile";
import { waitForApiRestart } from "../lib/waitForApiRestart";

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function BackupPage() {
  const msg = useMessageBox();
  const fileRef = useRef<HTMLInputElement>(null);
  const [backups, setBackups] = useState<
    Awaited<ReturnType<typeof api.backupList>>["backups"]
  >([]);
  const [incluirAuth, setIncluirAuth] = useState(true);
  const [loading, setLoading] = useState(true);
  const [baixando, setBaixando] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const [arquivoRestore, setArquivoRestore] = useState<File | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.backupList();
      setBackups(data.backups);
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [msg]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function baixar() {
    setBaixando(true);
    try {
      const r = await api.backupDownload(incluirAuth);
      void msg.success(`Backup salvo: ${r.nome}`);
      await carregar();
    } catch (e) {
      if (e instanceof SaveFileCancelled) return;
      void msg.error(e instanceof ApiError ? e.message : "Erro ao gerar backup");
    } finally {
      setBaixando(false);
    }
  }

  function escolherArquivoRestore() {
    fileRef.current?.click();
  }

  function onArquivoRestoreChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setArquivoRestore(null);
      return;
    }
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setArquivoRestore(null);
      e.target.value = "";
      void msg.warning("Escolha um arquivo .zip de backup do MedPronto.");
      return;
    }
    setArquivoRestore(file);
  }

  async function restaurar() {
    if (!arquivoRestore) {
      void msg.warning('Primeiro clique no botão azul "Escolher arquivo .zip".');
      escolherArquivoRestore();
      return;
    }

    const ok = await msg.confirm({
      title: "Confirmar restauração",
      message:
        `Arquivo: ${arquivoRestore.name}\n\n` +
        "Isso substitui TODOS os dados atuais pelo conteúdo deste backup.\n\n" +
        "O MedPronto reinicia sozinho em alguns segundos.",
      confirmLabel: "Sim, restaurar",
      cancelLabel: "Não, voltar",
    });
    if (!ok) return;

    setRestaurando(true);
    try {
      await api.backupRestaurar(arquivoRestore);
      void msg.info(
        "Reiniciando o MedPronto… o servidor vai cair e voltar em alguns segundos.",
      );
      const voltou = await waitForApiRestart();
      if (!voltou) {
        void msg.warning(
          "Demorou mais que o esperado. Se a tela de login já abriu, continue por ela.",
        );
      }
      window.location.href = "/login?restaurado=1";
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao restaurar");
      setRestaurando(false);
    }
  }

  return (
    <div className="page-stack flex-1 min-h-0 overflow-hidden">
      <PageHeader
        title="Backup"
        subtitle="Cópia de segurança dos seus dados — agenda.db e WhatsApp"
      />
      <div className="page-stack flex-1 min-h-0 overflow-auto px-4 pb-4 space-y-4">
        <div className="est-card p-4 max-w-2xl w-full space-y-4">
          <h2 className="m-0 text-base font-semibold flex items-center gap-2">
            <DatabaseBackup className="h-5 w-5" />
            Fazer backup
          </h2>
          <p className="m-0 text-sm text-[var(--text-2)]">
            Gera um arquivo .zip com o banco de dados. Ao salvar, você escolhe a
            pasta (Desktop, pendrive, etc.). Pode incluir a sessão do WhatsApp
            para não precisar escanear o QR de novo.
          </p>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={incluirAuth}
              onChange={(e) => setIncluirAuth(e.target.checked)}
              className="h-4 w-4"
            />
            Incluir WhatsApp (sessão em data/auth)
          </label>
          <button
            type="button"
            className="btn btn-primary agenda-big-action"
            disabled={baixando}
            onClick={() => void baixar()}
          >
            <Download size={20} />
            {baixando ? "Gerando…" : "Salvar backup…"}
          </button>
        </div>

        <div className="est-card p-4 max-w-2xl w-full space-y-4">
          <h2 className="m-0 text-base font-semibold flex items-center gap-2">
            <ArchiveRestore className="h-5 w-5" />
            Restaurar backup
          </h2>
          <p className="m-0 text-sm text-[var(--text-2)]">
            Siga os dois passos abaixo, nesta ordem.
          </p>

          <input
            ref={fileRef}
            type="file"
            accept=".zip,application/zip"
            className="backup-file-input-hidden"
            onChange={onArquivoRestoreChange}
          />

          <div className="backup-restore-passo">
            <div className="backup-restore-passo__num">1</div>
            <div className="backup-restore-passo__corpo">
              <p className="backup-restore-passo__titulo">Escolher o arquivo</p>
              <p className="backup-restore-passo__hint">
                Clique no botão para abrir e selecionar o .zip do backup.
              </p>
              <button
                type="button"
                className="btn btn-primary agenda-big-action"
                disabled={restaurando}
                onClick={escolherArquivoRestore}
              >
                <FileArchive size={20} />
                Escolher arquivo .zip
              </button>
              <div
                className={`backup-restore-arquivo${arquivoRestore ? " backup-restore-arquivo--ok" : ""}`}
              >
                {arquivoRestore ? (
                  <>
                    <strong>Arquivo selecionado:</strong> {arquivoRestore.name}
                  </>
                ) : (
                  "Nenhum arquivo escolhido ainda"
                )}
              </div>
            </div>
          </div>

          <div className="backup-restore-passo">
            <div className="backup-restore-passo__num">2</div>
            <div className="backup-restore-passo__corpo">
              <p className="backup-restore-passo__titulo">Restaurar</p>
              <p className="backup-restore-passo__hint">
                Só depois do passo 1. Vai pedir confirmação antes de aplicar.
              </p>
              <button
                type="button"
                className="btn btn-primary agenda-big-action"
                disabled={restaurando || !arquivoRestore}
                onClick={() => void restaurar()}
              >
                {restaurando ? "Restaurando…" : "Restaurar backup"}
              </button>
            </div>
          </div>

          <p className="m-0 text-xs text-[var(--muted)]">
            A cópia dos dados atuais fica guardada em data_pre_restore_… por
            segurança.
          </p>
        </div>

        <div className="est-card p-4 max-w-2xl w-full">
          <h2 className="m-0 text-base font-semibold">Backups neste computador</h2>
          <p className="m-0 mt-1 text-sm text-[var(--muted)]">
            Arquivos em data/backups/ (gerados ao baixar)
          </p>
          {loading && (
            <p className="mt-3 text-[var(--muted)]">Carregando…</p>
          )}
          {!loading && backups.length === 0 && (
            <p className="mt-3 text-[var(--text-2)]">Nenhum backup local ainda.</p>
          )}
          {!loading && backups.length > 0 && (
            <ul className="mt-3 space-y-2 text-sm">
              {backups.map((b) => (
                <li key={b.nome} className="flex justify-between gap-4">
                  <span>{b.nome}</span>
                  <span className="text-[var(--muted)] shrink-0">
                    {formatBytes(b.tamanho)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
