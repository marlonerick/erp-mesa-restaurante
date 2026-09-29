# language: pt
Funcionalidade: Cadastro e configurações das lojas
  Para que cada ponto de venda funcione com as próprias regras
  Como administrador
  Quero cadastrar lojas e ajustar as configurações de cada uma

  Cenário: Admin cadastra uma loja com as configurações padrão
    Dado que "marlon" é administrador da organização
    Quando "marlon" cadastra a loja "Shopping" com o código "shop"
    Então a loja "Shopping" existe com o código "SHOP"
    E a loja tem virada do dia às "05:00", taxa de serviço de 10%, estoque negativo "PERMITIR_COM_ALERTA" e 1 caixa aberto
    E a loja tem a estação de cozinha padrão "Cozinha"
    E a auditoria registra o evento "STORE_CREATED" feito por "marlon"

  Cenário: Código de loja repetido na mesma empresa é recusado
    Dado que "marlon" é administrador da organização
    Quando "marlon" cadastra a loja "Outro Centro" com o código "centro"
    Então a ação é negada com a mensagem "Já existe uma loja com este código nesta empresa."

  Cenário: Admin altera a taxa de serviço e permite dois caixas abertos
    Dado que "marlon" é administrador da organização
    Quando "marlon" altera a loja "Centro" para taxa de serviço de 12,5% e 2 caixas abertos
    Então a loja "Centro" passa a ter taxa de serviço de 12,5% e 2 caixas abertos
    E a auditoria registra o evento "STORE_UPDATED" com o antes e o depois

  Cenário: Gerente não altera as configurações da loja
    Dado que "carla" é gerente na loja "Centro"
    Quando "carla" tenta alterar a taxa de serviço da loja "Centro" para 0%
    Então a ação é negada por falta de permissão

  Cenário: Duas pessoas alteram a mesma loja ao mesmo tempo
    Dado que "marlon" é administrador da organização
    E "marlon" abriu a loja "Centro" para editar em duas abas
    Quando "marlon" salva a primeira aba com taxa de serviço de 11%
    E "marlon" salva a segunda aba com taxa de serviço de 9%
    Então a segunda alteração é recusada com a mensagem "Outra pessoa alterou estes dados. Recarregue a página e tente de novo."
    E a loja "Centro" continua com taxa de serviço de 11%

  Cenário: Não é possível desativar a loja em uso
    Dado que "marlon" é administrador da organização
    E "marlon" está trabalhando na loja "Centro"
    Quando "marlon" tenta desativar a loja "Centro"
    Então a ação é negada com a mensagem "Troque para outra loja antes de desativar esta."
