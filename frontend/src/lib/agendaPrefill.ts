import { clearScreenState, loadScreenState, saveScreenState } from "./screenState";

const SCOPE = "agenda:prefill";
export const AGENDA_FORM_DRAFT_SCOPE = "agenda:form-draft";

export type AgendaPrefill = {
  paciente_id: string;
  openForm: true;
};

export type AgendaFormDraft = {
  paciente_id: string;
  medico_id: string;
  hora: string;
  observacao_agenda: string;
  convenio_id: string;
  procedimento_ids: number[];
  ficha_template_id: string;
  aso_template_id?: string;
  checkin: boolean;
  eh_encaixe: boolean;
  data: string;
  openForm: true;
  /** rascunho antigo, só leitura na restauração */
  procedimento_id?: string;
};

export function setAgendaPrefill(pacienteId: number) {
  saveScreenState<AgendaPrefill>(SCOPE, {
    paciente_id: String(pacienteId),
    openForm: true,
  });
}

export function peekAgendaPrefill(): AgendaPrefill | null {
  const prefill = loadScreenState<AgendaPrefill>(SCOPE);
  if (!prefill?.openForm || !prefill.paciente_id) return null;
  return prefill;
}

export function takeAgendaPrefill(): AgendaPrefill | null {
  const prefill = peekAgendaPrefill();
  if (!prefill) return null;
  clearScreenState(SCOPE);
  return prefill;
}

export function saveAgendaFormDraft(
  draft: Omit<AgendaFormDraft, "openForm">,
) {
  saveScreenState<AgendaFormDraft>(AGENDA_FORM_DRAFT_SCOPE, {
    ...draft,
    openForm: true,
  });
}

export function peekAgendaFormDraft(): AgendaFormDraft | null {
  const draft = loadScreenState<AgendaFormDraft>(AGENDA_FORM_DRAFT_SCOPE);
  if (!draft?.openForm) return null;
  return draft;
}

export function takeAgendaFormDraft(): AgendaFormDraft | null {
  const draft = peekAgendaFormDraft();
  if (!draft) return null;
  clearScreenState(AGENDA_FORM_DRAFT_SCOPE);
  return draft;
}

export function clearAgendaFormDraft() {
  clearScreenState(AGENDA_FORM_DRAFT_SCOPE);
}

export function procedimentoIdsDoDraft(draft: AgendaFormDraft): number[] {
  if (Array.isArray(draft.procedimento_ids) && draft.procedimento_ids.length > 0) {
    return draft.procedimento_ids.map(Number).filter((n) => n > 0);
  }
  const legado = Number(draft.procedimento_id);
  return legado > 0 ? [legado] : [];
}
