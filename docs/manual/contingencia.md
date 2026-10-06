# Contingência — internet caiu ou o sistema saiu do ar (E10-5)

O sistema funciona pela internet. Se ela cair, o restaurante **continua atendendo no papel** e
lança no sistema quando voltar.

## Internet instável (volta em poucos minutos)

- Os celulares e o tablet mostram "**Sem conexão…**". Nada se perde do que já foi salvo.
- Quando voltar, **toque de novo** no botão: o sistema reconhece o pedido/pagamento e **não
  duplica**.
- **Reserva:** o celular do caixa com **4G** (roteador do celular) para o computador do caixa e,
  se possível, para o tablet da cozinha.

## Internet fora por mais tempo (ou o sistema fora do ar)

| Posto | O que fazer no papel |
|---|---|
| Garçom | Comanda de papel por mesa: número da mesa, itens, observações, horário |
| Cozinha | Recebe a via de papel do garçom e marca o que saiu |
| Caixa | Cobra pelo papel (maquininha e dinheiro normalmente); anota cada pagamento: mesa, forma, valor. **Nota fiscal no sistema atual, como sempre** |

## Quando voltar

1. O garçom lança no sistema as comandas de papel **das mesas ainda abertas** e envia (a cozinha
   pode marcar pronto em seguida).
2. Contas que **já foram pagas no papel**: o caixa abre a mesa, lança os itens e registra os
   pagamentos como foram feitos (mesma forma e valor).
3. Guarde as folhas do dia junto com o fechamento do caixa e avise o gerente.

## Fora do ar de verdade (a tela não abre de jeito nenhum)

Avise o técnico. Ele confere o servidor (`/ready`) e, se precisar, recupera o banco pelo backup
(docs/deployment/backup.md). Enquanto isso, siga no papel.
