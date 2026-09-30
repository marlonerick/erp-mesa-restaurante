# Fluxo do KDS

```mermaid
flowchart LR
  R[Rodada enviada] --> T{Item requer preparo?}
  T -- não --> PR[Item PRONTO direto<br/>não aparece no KDS]
  T -- sim --> ST[Estação do produto na loja<br/>ou estação padrão]
  ST --> TK[KitchenTicket NOVO<br/>por rodada × estação]
  TK --> Q[Fila do KDS<br/>ordem: created_at]
  Q --> IN[Iniciar → EM_PREPARO]
  Q --> OK
  IN --> OK[Pronto / Tudo pronto → PRONTO]
  OK -. desfazer antes de entregar .-> IN
  OK --> RC[Prontos há pouco<br/>15 min]
  OK --> GA[Garçom vê item pronto<br/>marca ENTREGUE]
  Q -. cronômetro .-> AL{Tempo desde envio}
  AL -- ≥ amarelo --> Y[Alerta amarelo]
  AL -- ≥ vermelho --> V[Alerta vermelho<br/>conta como atrasado no dashboard]
```

- Tela `/cozinha` (Etapa 7 — docs/modules/kitchen.md). Polling a cada 3 s com a fila completa da
  estação (o cursor `since` do ADR-0005 foi adiado — kitchen.md §12).
- Cronômetro calculado no cliente a partir de `sent_at` do servidor (sem relógio do dispositivo como verdade: offset corrigido pela resposta do servidor).
- Limiares de alerta configuráveis por loja (Q-14): amarelo "Atenção" aos 10 min e vermelho
  "Atrasado" aos 20 min por padrão (`store.kds_warning_minutes`, `kds_late_minutes`).
- Situação do ticket calculada dos itens (RN-KDS-06). Via de 80 mm pelo botão "Imprimir" (Q-02 = A).
- Item cancelado sai da fila e aparece riscado por 30 s para a cozinha perceber.
- Modelo pronto para várias praças: `product_store.station_id` + `kitchen_ticket.station_id`.
