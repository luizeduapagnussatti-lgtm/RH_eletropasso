import type { User } from '../../types';

/** Eletropasso: ciência do espelho PTRP é do gestor/RH; colaborador assina na folha. */
export function usePendingTimesheetSign(_user?: User | null): boolean {
  return false;
}
