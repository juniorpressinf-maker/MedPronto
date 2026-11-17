/**
 * Põe o cursor no campo marcado com `data-foco-inicial` (o primeiro campo do
 * documento: medicamento, exame, dias de atestado...). Espera a tela desenhar.
 */
export function focarCampoInicial(raiz?: ParentNode | null): void {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const el = (raiz ?? document).querySelector<HTMLElement>("[data-foco-inicial]");
      if (el && !(el as HTMLInputElement).readOnly && !(el as HTMLInputElement).disabled) el.focus();
    }),
  );
}
