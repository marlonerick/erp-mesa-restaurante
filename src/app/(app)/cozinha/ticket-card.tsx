'use client';

import { useActionState } from 'react';
import {
  readyItemAction,
  readyTicketAction,
  startItemAction,
  undoReadyAction,
} from '@/modules/kitchen/interface/actions';
import { ALERT_LABEL, type AlertLevel } from '@/modules/kitchen/interface/timing';
import type { KitchenItemView, KitchenTicketView } from '@/modules/kitchen/web';
import type { FormState } from '@/shared/errors/form-state';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { SubmitButton } from '@/ui/submit-button';
import { useRefreshAfter } from './live';

/** Texto do item na visão da cozinha ("Na cozinha" do salão vira "A fazer"). */
const ITEM_LABEL: Readonly<Record<KitchenItemView['status'], string>> = {
  PENDENTE: 'Não enviado',
  ENVIADO: 'A fazer',
  EM_PREPARO: 'Preparando',
  PRONTO: 'Pronto',
  ENTREGUE: 'Entregue',
  CANCELADO: 'Cancelado pelo salão',
};

const ITEM_BADGE: Readonly<Record<KitchenItemView['status'], string>> = {
  PENDENTE: 'bg-louca text-tinta-suave',
  ENVIADO: 'bg-louca text-tinta',
  EM_PREPARO: 'bg-azulejo-claro text-azulejo',
  PRONTO: 'bg-confirma-claro text-confirma',
  ENTREGUE: 'bg-louca text-tinta-suave',
  CANCELADO: 'bg-alerta-claro text-alerta',
};

/** Borda e faixa do cartão pelo alerta — sempre com o texto (RN-KDS-09). */
const LEVEL_STYLE: Readonly<Record<AlertLevel, { card: string; band: string }>> = {
  NORMAL: { card: 'border-borda', band: 'bg-white text-tinta' },
  ATENCAO: { card: 'border-atencao', band: 'bg-atencao-claro text-atencao' },
  ATRASADO: { card: 'border-alerta', band: 'bg-alerta text-white' },
};

const time = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

function ErrorText({ state }: { readonly state: FormState | null }) {
  return state?.error ? (
    <p role="alert" className="text-sm font-semibold text-alerta">
      {state.error}
    </p>
  ) : null;
}

/** Um botão = um formulário com a loja da tela (STORE_CHANGED) e o id do item ou do ticket. */
function ActionButton({
  action,
  name,
  value,
  storeId,
  label,
  pendingText,
  ariaLabel,
  variant = 'primary',
  className,
  wide = false,
}: {
  readonly action: (previous: FormState | null, formData: FormData) => Promise<FormState>;
  readonly name: 'itemId' | 'ticketId';
  readonly value: string;
  readonly storeId: string;
  readonly label: string;
  readonly pendingText: string;
  readonly ariaLabel: string;
  readonly variant?: 'primary' | 'secondary' | 'quiet';
  readonly className?: string;
  /** Ocupa as duas colunas da grade de botões do item. */
  readonly wide?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  useRefreshAfter(state);
  return (
    <form action={formAction} className={cn('flex flex-col gap-1', wide && 'col-span-2')}>
      <input type="hidden" name="expectedStoreId" value={storeId} />
      <input type="hidden" name={name} value={value} />
      <SubmitButton
        pendingText={pendingText}
        variant={variant}
        aria-label={ariaLabel}
        className={cn('min-h-14 text-lg', className)}
      >
        {label}
      </SubmitButton>
      <ErrorText state={state} />
    </form>
  );
}

function ItemText({ item }: { readonly item: KitchenItemView }) {
  const cancelled = item.status === 'CANCELADO';
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className={cn('text-xl font-bold', cancelled && 'line-through')}>
        {item.quantity} × {item.productName}
      </span>
      {item.modifiers.length > 0 ? (
        <span className={cn('text-lg', cancelled && 'line-through')}>
          {item.modifiers.map((name) => `+ ${name}`).join(' · ')}
        </span>
      ) : null}
      {item.notes ? (
        <span className="self-start rounded-md bg-atencao-claro px-2 py-0.5 text-lg font-bold text-atencao">
          Obs.: {item.notes}
        </span>
      ) : null}
      {item.cancelReason ? (
        <span className="font-semibold text-alerta">Motivo: {item.cancelReason}</span>
      ) : null}
    </div>
  );
}

function ItemRow({
  item,
  storeId,
  canManage,
  where,
}: {
  readonly item: KitchenItemView;
  readonly storeId: string;
  readonly canManage: boolean;
  /** "Mesa 10": o nome do botão diz de qual pedido é (leitor de tela e testes). */
  readonly where: string;
}) {
  const what = `${item.productName} (${where})`;
  return (
    <li className="flex flex-col gap-2 border-b border-borda py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <ItemText item={item} />
        <span
          className={cn(
            'shrink-0 rounded-md px-2 py-0.5 text-sm font-semibold',
            ITEM_BADGE[item.status],
          )}
        >
          {ITEM_LABEL[item.status]}
        </span>
      </div>
      {canManage ? (
        <div className="grid grid-cols-2 gap-2">
          {item.status === 'ENVIADO' ? (
            <ActionButton
              action={startItemAction}
              name="itemId"
              value={item.id}
              storeId={storeId}
              label="Iniciar"
              pendingText="Iniciando…"
              ariaLabel={`Iniciar ${what}`}
              variant="secondary"
            />
          ) : null}
          {item.status === 'ENVIADO' || item.status === 'EM_PREPARO' ? (
            <ActionButton
              action={readyItemAction}
              name="itemId"
              value={item.id}
              storeId={storeId}
              label="Pronto"
              pendingText="Marcando…"
              ariaLabel={`Pronto ${what}`}
              wide={item.status === 'EM_PREPARO'}
            />
          ) : null}
          {item.status === 'PRONTO' ? (
            <ActionButton
              action={undoReadyAction}
              name="itemId"
              value={item.id}
              storeId={storeId}
              label="Desfazer"
              pendingText="Desfazendo…"
              ariaLabel={`Desfazer pronto ${what}`}
              variant="quiet"
              wide
              className="justify-start px-0"
            />
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** Cartão de um pedido na fila (ou cancelado agora, riscado). */
export function TicketCard({
  ticket,
  level,
  elapsedText,
  storeId,
  canManage,
  onPrint,
}: {
  readonly ticket: KitchenTicketView;
  readonly level: AlertLevel;
  /** Cronômetro "12:05"; null no ticket cancelado. */
  readonly elapsedText: string | null;
  readonly storeId: string;
  readonly canManage: boolean;
  readonly onPrint: (() => void) | null;
}) {
  const cancelled = ticket.status === 'CANCELADO';
  const style = LEVEL_STYLE[cancelled ? 'NORMAL' : level];
  const open = ticket.items.some(
    (item) => item.status === 'ENVIADO' || item.status === 'EM_PREPARO',
  );
  return (
    <article
      aria-label={`${ticket.title}, rodada ${String(ticket.roundNumber)}`}
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border-4 bg-white',
        cancelled ? 'border-alerta opacity-80' : style.card,
      )}
    >
      <header className={cn('flex items-start justify-between gap-3 px-4 py-3', style.band)}>
        <div className="flex min-w-0 flex-col">
          <h3 className={cn('text-2xl font-bold wrap-break-word', cancelled && 'line-through')}>
            {ticket.title}
          </h3>
          <p className="text-sm font-semibold">
            Conta {ticket.orderNumber} · Rodada {ticket.roundNumber}
            {ticket.sentByName ? ` · ${ticket.sentByName}` : ''} ·{' '}
            <time dateTime={ticket.createdAt} suppressHydrationWarning>
              {time(ticket.createdAt)}
            </time>
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          {cancelled ? (
            <span className="text-lg font-bold text-alerta">Cancelado pelo salão</span>
          ) : (
            <>
              <span className="text-3xl font-bold" suppressHydrationWarning>
                {elapsedText}
              </span>
              <span className="text-sm font-bold uppercase" suppressHydrationWarning>
                {ALERT_LABEL[level]}
              </span>
            </>
          )}
        </div>
      </header>

      <ul className="flex flex-1 flex-col px-4" aria-label={`Itens de ${ticket.title}`}>
        {ticket.items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            storeId={storeId}
            canManage={canManage && !cancelled}
            where={ticket.title}
          />
        ))}
      </ul>

      {!cancelled && (canManage || onPrint) ? (
        <footer className="flex flex-col gap-2 border-t-2 border-borda bg-louca px-4 py-3">
          {canManage && open ? (
            <ActionButton
              action={readyTicketAction}
              name="ticketId"
              value={ticket.id}
              storeId={storeId}
              label="Tudo pronto"
              pendingText="Marcando tudo…"
              ariaLabel={`Tudo pronto ${ticket.title}`}
              className="w-full"
            />
          ) : null}
          {onPrint ? (
            <Button variant="secondary" onClick={onPrint} aria-label={`Imprimir ${ticket.title}`}>
              Imprimir
            </Button>
          ) : null}
        </footer>
      ) : null}
    </article>
  );
}

/** Pedido que saiu da fila há pouco: conferir e desfazer um pronto por engano (RN-KDS-10). */
export function RecentTicket({
  ticket,
  storeId,
  canManage,
}: {
  readonly ticket: KitchenTicketView;
  readonly storeId: string;
  readonly canManage: boolean;
}) {
  return (
    <article aria-label={`${ticket.title} pronto`} className="flex flex-col gap-2">
      <h3 className="text-lg font-bold">
        {ticket.title} · Rodada {ticket.roundNumber}
        {ticket.finishedAt ? (
          <span className="font-normal text-tinta-suave">
            {' '}
            · pronto às{' '}
            <time dateTime={ticket.finishedAt} suppressHydrationWarning>
              {time(ticket.finishedAt)}
            </time>
          </span>
        ) : null}
      </h3>
      <ul className="flex flex-col gap-2">
        {ticket.items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {item.quantity} × {item.productName}{' '}
              <span className="text-sm font-semibold text-tinta-suave">
                ({ITEM_LABEL[item.status]})
              </span>
            </span>
            {canManage && item.status === 'PRONTO' ? (
              <ActionButton
                action={undoReadyAction}
                name="itemId"
                value={item.id}
                storeId={storeId}
                label="Desfazer"
                pendingText="Desfazendo…"
                ariaLabel={`Desfazer pronto ${item.productName} (${ticket.title})`}
                variant="secondary"
                className="min-h-12 text-base"
              />
            ) : null}
          </li>
        ))}
      </ul>
    </article>
  );
}
