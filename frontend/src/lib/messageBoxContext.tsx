import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Info,
} from "lucide-react";

export type MessageKind = "info" | "success" | "warning" | "error" | "confirm";

export type MessageOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

/** Pergunta com campo de texto (ex.: motivo obrigatório). */
export type PromptOptions = MessageOptions & {
  inputLabel?: string;
  placeholder?: string;
  /** Mínimo de caracteres (sem espaços nas pontas) para liberar o botão. */
  minLength?: number;
  maxLength?: number;
  /** Texto já preenchido (ex.: renomear). */
  valorInicial?: string;
};

type ActiveMessage = MessageOptions & {
  kind: MessageKind;
  input?: Omit<PromptOptions, keyof MessageOptions>;
  resolve?: (value: boolean, texto?: string) => void;
};

type MessageBoxApi = {
  show: (kind: MessageKind, options: MessageOptions) => Promise<boolean>;
  info: (options: MessageOptions | string) => Promise<void>;
  success: (options: MessageOptions | string) => Promise<void>;
  warning: (options: MessageOptions | string) => Promise<void>;
  error: (options: MessageOptions | string) => Promise<void>;
  confirm: (options: MessageOptions | string) => Promise<boolean>;
  /** Devolve o texto digitado (já sem espaços nas pontas) ou null se cancelar. */
  prompt: (options: PromptOptions) => Promise<string | null>;
};

const MessageBoxContext = createContext<MessageBoxApi | null>(null);

const DEFAULT_TITLES: Record<MessageKind, string> = {
  info: "Informação",
  success: "Sucesso",
  warning: "Atenção",
  error: "Erro",
  confirm: "Confirmar",
};

function normalizeOptions(options: MessageOptions | string): MessageOptions {
  return typeof options === "string" ? { message: options } : options;
}

const KIND_META: Record<
  MessageKind,
  { icon: typeof Info; className: string; defaultConfirm: string }
> = {
  info: { icon: Info, className: "msg-box--info", defaultConfirm: "OK" },
  success: { icon: CheckCircle2, className: "msg-box--success", defaultConfirm: "OK" },
  warning: { icon: AlertTriangle, className: "msg-box--warning", defaultConfirm: "OK" },
  error: { icon: AlertCircle, className: "msg-box--error", defaultConfirm: "OK" },
  confirm: { icon: HelpCircle, className: "msg-box--confirm", defaultConfirm: "Sim" },
};

function MessageBoxDialog({
  active,
  onClose,
}: {
  active: ActiveMessage;
  onClose: (confirmed: boolean, texto?: string) => void;
}) {
  const meta = KIND_META[active.kind];
  const Icon = meta.icon;
  const isConfirm = active.kind === "confirm";
  const input = active.input;
  const [texto, setTexto] = useState(input?.valorInicial ?? "");
  const minimo = input?.minLength ?? 1;
  const textoValido = !input || texto.trim().length >= minimo;

  const confirmar = useCallback(() => {
    if (!textoValido) return;
    onClose(true, input ? texto.trim() : undefined);
  }, [input, onClose, texto, textoValido]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // No campo de texto, Shift+Enter quebra linha; Enter confirma.
      if (e.key === "Enter" && !(input && e.shiftKey)) {
        e.preventDefault();
        confirmar();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose(isConfirm ? false : true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmar, input, isConfirm, onClose]);

  return (
    <div
      className="msg-box-overlay"
      role="presentation"
      onClick={() => onClose(isConfirm ? false : true)}
    >
      <div
        className={`msg-box panel ${meta.className}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="msg-box-title"
        aria-describedby="msg-box-text"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="msg-box__head">
          <span className="msg-box__icon" aria-hidden="true">
            <Icon className="h-6 w-6" />
          </span>
          <h3 id="msg-box-title" className="msg-box__title">
            {active.title ?? DEFAULT_TITLES[active.kind]}
          </h3>
        </div>
        <p id="msg-box-text" className="msg-box__text">
          {active.message}
        </p>
        {input ? (
          <label className="block mb-4">
            {input.inputLabel ? (
              <span className="text-sm font-medium block mb-1">{input.inputLabel}</span>
            ) : null}
            <textarea
              className="legacy-input w-full min-h-[3.5rem]"
              rows={3}
              autoFocus
              value={texto}
              maxLength={input.maxLength ?? 500}
              placeholder={input.placeholder}
              onChange={(e) => setTexto(e.target.value)}
            />
            {minimo > 1 && !textoValido ? (
              <span className="text-xs text-[var(--muted)]">
                Mínimo de {minimo} caracteres.
              </span>
            ) : null}
          </label>
        ) : null}
        <div className="msg-box__actions">
          {isConfirm && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onClose(false)}
            >
              {active.cancelLabel ?? "Não"}
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            autoFocus={!input}
            disabled={!textoValido}
            onClick={confirmar}
          >
            {active.confirmLabel ?? meta.defaultConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}

export function MessageBoxProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveMessage | null>(null);

  const close = useCallback((confirmed: boolean, texto?: string) => {
    setActive((current) => {
      current?.resolve?.(confirmed, texto);
      return null;
    });
  }, []);

  const show = useCallback((kind: MessageKind, options: MessageOptions) => {
    return new Promise<boolean>((resolve) => {
      setActive({ kind, ...options, resolve });
    });
  }, []);

  const prompt = useCallback((options: PromptOptions) => {
    const { inputLabel, placeholder, minLength, maxLength, ...msg } = options;
    return new Promise<string | null>((resolve) => {
      setActive({
        kind: "confirm",
        ...msg,
        input: { inputLabel, placeholder, minLength, maxLength },
        resolve: (ok, texto) => resolve(ok && texto ? texto : null),
      });
    });
  }, []);

  const api = useMemo<MessageBoxApi>(
    () => ({
      show,
      info: async (options) => {
        await show("info", normalizeOptions(options));
      },
      success: async (options) => {
        await show("success", normalizeOptions(options));
      },
      warning: async (options) => {
        await show("warning", normalizeOptions(options));
      },
      error: async (options) => {
        await show("error", normalizeOptions(options));
      },
      confirm: (options) => show("confirm", normalizeOptions(options)),
      prompt,
    }),
    [show, prompt],
  );

  return (
    <MessageBoxContext.Provider value={api}>
      {children}
      {active && <MessageBoxDialog active={active} onClose={close} />}
    </MessageBoxContext.Provider>
  );
}

export function useMessageBox(): MessageBoxApi {
  const ctx = useContext(MessageBoxContext);
  if (!ctx) {
    throw new Error("useMessageBox deve ser usado dentro de MessageBoxProvider");
  }
  return ctx;
}
