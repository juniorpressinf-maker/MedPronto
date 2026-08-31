import { ArrowLeft } from "lucide-react";
import { Link, type LinkProps } from "react-router-dom";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type VoltarButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

/** Botão Voltar padrão — seta à esquerda do texto */
export function VoltarButton({
  children,
  className = "btn btn-primary",
  type = "button",
  ...props
}: VoltarButtonProps) {
  return (
    <button type={type} className={className} {...props}>
      <ArrowLeft size={18} aria-hidden />
      {children}
    </button>
  );
}

type VoltarLinkProps = LinkProps & {
  children: ReactNode;
};

/** Link Voltar — seta à esquerda do texto */
export function VoltarLink({ children, className = "", ...props }: VoltarLinkProps) {
  return (
    <Link
      className={`inline-flex items-center gap-1 ${className}`.trim()}
      {...props}
    >
      <ArrowLeft size={16} aria-hidden />
      {children}
    </Link>
  );
}
