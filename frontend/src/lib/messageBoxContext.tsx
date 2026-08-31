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

type ActiveMessage = MessageOptions & {
  kind: MessageKind;
  resolve?: (value: boolean) => void;
};

type MessageBoxApi = {
  show: (kind: MessageKind, options: MessageOptions) => Promise<boolean>;
  info: (options: MessageOptions | string) => Promise<void>;
  success: (options: MessageOptions | string) => Promise<void>;
  warning: (options: MessageOptions | string) => Promise<void>;
  error: (options: MessageOptions | string) => Promise<void>;
  confirm: (options: MessageOptions | string) => Promise<boolean>;
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
  onClose: (confirmed: boolean) => void;
}) {
  const meta = KIND_META[active.kind];
  const Icon = meta.icon;
  const isConfirm = active.kind === "confirm";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onClose(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose(isConfirm ? false : true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isConfirm, onClose]);

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
            autoFocus
            onClick={() => onClose(true)}
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

  const close = useCallback((confirmed: boolean) => {
    setActive((current) => {
      current?.resolve?.(confirmed);
      return null;
    });
  }, []);

  const show = useCallback((kind: MessageKind, options: MessageOptions) => {
    return new Promise<boolean>((resolve) => {
      setActive({ kind, ...options, resolve });
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
    }),
    [show],
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
