# language: pt
Funcionalidade: Dados da empresa
  Para identificar o negócio nos documentos futuros
  Como administrador
  Quero manter a razão social, o nome fantasia e o CNPJ

  Cenário: Admin informa um CNPJ válido com pontuação
    Dado que "marlon" é administrador da organização
    Quando "marlon" altera a empresa para o CNPJ "11.222.333/0001-81"
    Então a empresa fica com o CNPJ "11222333000181"
    E a auditoria registra o evento "COMPANY_UPDATED" feito por "marlon"

  Cenário: CNPJ com dígito verificador errado é recusado
    Dado que "marlon" é administrador da organização
    Quando "marlon" altera a empresa para o CNPJ "11.222.333/0001-82"
    Então a ação é negada com a mensagem "CNPJ inválido. Confira os 14 dígitos."

  Cenário: Gerente não altera a empresa
    Dado que "carla" é gerente na loja "Centro"
    Quando "carla" tenta alterar o nome fantasia da empresa
    Então a ação é negada por falta de permissão
