# language: pt
Funcionalidade: Ficha técnica
  Para saber quanto custa fazer cada prato
  Como gerente
  Quero cadastrar os insumos de cada produto e de cada adicional

  Contexto:
    Dado que "carla" é gerente na loja "Centro"
    E existe o insumo "Pão de hambúrguer" em "un" custando "0.800000" no "Centro"
    E existe o insumo "Carne moída" em "g" custando "0.040000" no "Centro"
    E existe o produto "X-Burger" custando "32,00" no "Centro"

  Cenário: Ficha do produto mostra custo teórico e margem
    Quando "carla" salva a ficha de "X-Burger" com "1" de "Pão de hambúrguer" e "150" de "Carne moída"
    Então o custo teórico de "X-Burger" é de 680 centavos
    E a margem de "X-Burger" é "78,8%"
    E a auditoria registra o evento "RECIPE_UPDATED" feito por "carla"

  Cenário: A ficha do adicional soma no consumo do item
    Dado existe o insumo "Bacon" em "g" custando "0.060000" no "Centro"
    E existe o adicional "Bacon extra" no grupo "Extras"
    E "carla" salvou a ficha de "X-Burger" com "1" de "Pão de hambúrguer" e "150" de "Carne moída"
    E "carla" salvou a ficha do adicional "Bacon extra" com "30" de "Bacon"
    Quando se calcula o consumo de 2 "X-Burger" com "Bacon extra"
    Então o consumo é "2.000" de "Pão de hambúrguer", "300.000" de "Carne moída" e "60.000" de "Bacon"

  Cenário: Duas pessoas salvando a mesma ficha
    Dado "carla" salvou a ficha de "X-Burger" com "1" de "Pão de hambúrguer" e "150" de "Carne moída"
    E duas telas abertas mostram a ficha de "X-Burger"
    Quando a primeira tela salva "160" de "Carne moída"
    E a segunda tela tenta salvar "170" de "Carne moída"
    Então a ação é recusada com o código "CONCURRENT_MODIFICATION"

  Cenário: Cozinha vê a ficha mas não altera
    Dado "teo" é da cozinha na loja "Centro"
    Quando "teo" tenta salvar a ficha de "X-Burger" com "1" de "Pão de hambúrguer" e "150" de "Carne moída"
    Então a ação é negada por falta de permissão
