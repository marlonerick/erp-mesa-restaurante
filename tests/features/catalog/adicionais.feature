# language: pt
Funcionalidade: Adicionais
  Para o garçom anotar o ponto da carne e os extras
  Como gerente
  Quero cadastrar grupos de adicionais e ligá-los aos produtos

  Cenário: Grupo "Ponto da carne" aparece no produto do cardápio
    Dado que "carla" é gerente na loja "Centro"
    E existe a categoria "Lanches"
    E "carla" cadastrou o grupo "Ponto da carne" com escolha mínima 1 e máxima 1
    E o grupo "Ponto da carne" tem as opções "Mal passado", "Ao ponto" e "Bem passado"
    Quando "carla" cadastra o produto "X-Burger" em "Lanches" com o grupo "Ponto da carne"
    Então no cardápio o "X-Burger" pede "Ponto da carne" com 3 opções

  Cenário: Adicional tem o mesmo preço em todas as lojas
    Dado que "carla" é gerente na loja "Centro"
    E "carla" cadastrou o grupo "Extras" com escolha mínima 0 e máxima 3
    Quando "carla" cadastra a opção "Bacon" custando "5,00" no grupo "Extras"
    Então a opção "Bacon" do grupo "Extras" custa 500 centavos

  Esquema do Cenário: Limites de escolha inválidos são recusados
    Dado que "carla" é gerente na loja "Centro"
    Quando "carla" tenta cadastrar o grupo "Molhos" com escolha mínima <minimo> e máxima <maximo>
    Então a ação é recusada com o código "INVALID_SELECTION_LIMITS"

    Exemplos:
      | minimo | maximo |
      | 2      | 1      |
      | 0      | 0      |
      | 0      | 11     |
