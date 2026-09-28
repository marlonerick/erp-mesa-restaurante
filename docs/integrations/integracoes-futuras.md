# Integrações futuras

Regra inviolável 9: nenhuma integração falsa apresentada como real. O MVP define **portas**
(interfaces) e implementações **manuais explícitas**.

| Integração | Prioridade | Porta | MVP | Observações |
|---|---|---|---|---|
| PIX (PSP) | P2 | `PaymentProvider` | `ManualConfirmationProvider`: caixa confirma recebimento | Futuro: cobrança dinâmica + webhook → exigirá outbox e endpoint público |
| TEF / maquininha integrada | P2 | `PaymentProvider` | Manual (caixa digita método e valor) | Depende do adquirente do cliente |
| NFC-e / NF-e | P2 | `FiscalProvider` | Não existe; piloto usa sistema fiscal atual | **Confirmar situação SAT → NFC-e em SP antes do desenho.** Candidato a subir para P1 (risco R-02) |
| Impressora térmica | P1 (ou P0) | `PrintService` | `BrowserPrintService` (pré-conta e, se necessário, via de cozinha em HTML) | ESC/POS exige agente local ou impressora de rede (ADR-0010) |
| iFood / marketplaces | P2 | `ExternalOrderSource` | — | Pedidos externos entram como `order.type = DELIVERY` (enum ampliado por migration) |
| WhatsApp | P2 | `NotificationChannel` | — | — |
| Integração bancária / conciliação | P2 | `BankStatementSource` | — | — |

Contrato mínimo de `PaymentProvider` (proposta):

```text
authorize(payment intent) → { status: CONFIRMED | PENDING | FAILED, providerReference? }
cancel(providerReference)  → { status }
```

No MVP `ManualConfirmationProvider.authorize` retorna `CONFIRMED` imediatamente porque a
confirmação é feita por um humano **antes** do comando — isso fica visível na UI
("confirme o recebimento na maquininha/app do banco").
