# Plano do piloto (README B.11)

**Onde:** 1 restaurante, 1 loja. **Quem:** 1 gerente, 1 caixa, 2 garçons, 1 cozinha.
**Cadastro:** cerca de 20 produtos, 10 insumos, 10 mesas. **Data de início:** a definir (E10-5).

## Em paralelo ao sistema fiscal

O ERP **não emite documento fiscal** neste MVP. Durante o piloto:

- o cupom/nota continua saindo pelo **sistema atual** do restaurante;
- o ERP controla salão, cozinha, caixa, estoque, financeiro e relatórios;
- ao fim de cada dia, o gerente compara o **total do caixa no ERP** com o **total do sistema fiscal**
  e anota diferenças (ajuda a medir o retrabalho da digitação dupla — risco R-02).

## Rotina diária

| Quando | Quem | O quê |
|---|---|---|
| Abertura | Caixa | Abrir o caixa com o fundo de troco |
| Abertura | Cozinha | Tela da cozinha aberta, som ligado |
| Durante | Todos | Usar o sistema em todas as mesas e no balcão |
| Fechamento | Caixa | Fechar o caixa (contar cédulas, conferir PIX/cartão com a maquininha) |
| Fechamento | Gerente | Conferir o fechamento, o painel e comparar com o sistema fiscal |
| 04:30 | Servidor (automático) | Backup do banco |

## O que medir (para decidir os próximos passos)

- Tempo para abrir mesa, lançar e enviar (o garçom acha rápido?).
- Pedidos que chegaram certos na cozinha; atrasos (itens em vermelho).
- Diferenças de caixa e recontagens.
- Vezes que a internet caiu e como foi a contingência.
- O que a equipe pediu e não existe (vai para a lista pós-MVP: fiscal, delivery, impressão
  automática, funcionar sem internet…).

## Critério para encerrar o piloto

Combinar com o dono. Sugestão: 2 semanas de operação real sem perda de dados, sem cobrança em
dobro e com a equipe usando sem apoio. Depois disso, o roadmap pós-MVP é recalculado (README B.6).
