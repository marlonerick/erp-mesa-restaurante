import type { OrderItemStatus } from '@/modules/orders';
import { DomainError } from '@/shared/kernel';

// Regras puras da cozinha (docs/modules/kitchen.md §3).

export * from './timing';

/** Prontos há pouco (RN-KDS-10). */
export const RECENT_READY_MINUTES = 15;
export const RECENT_READY_LIMIT = 12;
/** Item ou ticket cancelado fica riscado na tela (RN-KDS-08). */
export const CANCELLED_VISIBLE_SECONDS = 30;

const rule = (code: string, message: string) => new DomainError(code, message, 'BUSINESS_RULE');

export const kitchenErrors = {
  ticketNotFound: () =>
    new DomainError('KITCHEN_TICKET_NOT_FOUND', 'Pedido da cozinha não encontrado.', 'NOT_FOUND'),
  notInKitchen: () => rule('ITEM_NOT_IN_KITCHEN', 'Este item não está na cozinha.'),
  cancelled: () => rule('ITEM_CANCELLED', 'Este item foi cancelado pelo salão.'),
  delivered: () => rule('ITEM_ALREADY_DELIVERED', 'O garçom já entregou este item.'),
};

export type KitchenCommand = 'INICIAR' | 'PRONTO' | 'DESFAZER';

interface KitchenItemState {
  readonly status: OrderItemStatus;
  readonly requiresPreparation: boolean;
  readonly kitchenTicketId: string | null;
}

/**
 * O que um comando da cozinha faz com o item (RN-KDS-03, 04, 07, 08): `MUDA` ou `NADA` (outro
 * tablet já fez — não é erro). Item cancelado, fora da cozinha ou já entregue (desfazer) é recusado.
 */
export function kitchenTransition(
  command: KitchenCommand,
  item: KitchenItemState,
): 'MUDA' | 'NADA' {
  if (item.status === 'CANCELADO') throw kitchenErrors.cancelled();
  if (!item.requiresPreparation || !item.kitchenTicketId || item.status === 'PENDENTE') {
    throw kitchenErrors.notInKitchen();
  }
  switch (command) {
    case 'INICIAR':
      return item.status === 'ENVIADO' ? 'MUDA' : 'NADA';
    case 'PRONTO':
      return item.status === 'ENVIADO' || item.status === 'EM_PREPARO' ? 'MUDA' : 'NADA';
    case 'DESFAZER':
      if (item.status === 'ENTREGUE') throw kitchenErrors.delivered();
      return item.status === 'PRONTO' ? 'MUDA' : 'NADA';
  }
}
