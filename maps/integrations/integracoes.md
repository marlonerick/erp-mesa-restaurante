# Integrações — portas e implementações

Detalhes: [docs/integrations/integracoes-futuras.md](../../docs/integrations/integracoes-futuras.md).

```mermaid
flowchart LR
  subgraph Nucleo[Núcleo do ERP]
    PAY[Payments] --> PP{{PaymentProvider}}
    POS[PDV] --> PS{{PrintService}}
    FUT1[Fiscal P2] -.-> FP{{FiscalProvider}}
    FUT2[Delivery P1/P2] -.-> EO{{ExternalOrderSource}}
    FUT3[Notificações P2] -.-> NC{{NotificationChannel}}
  end

  PP --> MAN[ManualConfirmationProvider<br/>MVP]
  PP -.-> PSP[PSP PIX — P2]
  PP -.-> TEF[TEF — P2]
  PS --> BRW[BrowserPrintService<br/>MVP]
  PS -.-> ESC[ESC/POS agente local — P1]
  FP -.-> NFCE[NFC-e / NF-e — P2]
  EO -.-> IFD[iFood — P2]
  NC -.-> WA[WhatsApp — P2]
```

Linhas sólidas = existe no MVP. Tracejadas = futuro (entra com ADR próprio; integrações assíncronas trazem o padrão outbox).
