# Textos do convite — promessas de Brasília

Cinco peças. A primeira é a única obrigatória: é ela que todas as outras
apontam, e é ela que um advogado de campanha vai ler se alguém reclamar.

---

## 1. A carta aberta (vai no site, endereço fixo)

> Esta é a âncora. Precisa existir **antes** do primeiro post, num endereço que
> não muda, porque é para ela que o Instagram, o Reel e cada resposta em DM
> mandam a pessoa. Sugestão de endereço: `/convite/`.

### Carta aberta às 582 candidaturas a deputado no Distrito Federal

Meu nome é Bruno Duarte. Moro em Brasília e faço, por conta própria e como
pessoa física, uma página que reúne o que cada candidatura promete ao DF nestas
eleições. Sem financiamento, sem patrocínio, sem impulsionamento e sem vínculo
com partido, coligação, candidatura ou governo.

Em 13 de setembro de 2026 fui atrás das 582 candidaturas a deputado distrital e
federal que estão na urna no DF. Procurei no canal que cada uma declarou ao
próprio TSE — o endereço que a candidatura informou como sendo o dela.

**Encontrei proposta escrita em 63.**

Nas outras 519 não encontrei, e por motivos diferentes. A página diz qual foi em
cada caso:

- 66 declararam um site que está no ar e não traz proposta
- 50 declararam um site que não abriu quando visitei
- 333 não declararam site nenhum, só rede social
- 70 não declararam canal nenhum ao TSE

**Isso não quer dizer que essas candidaturas não tenham proposta.** Quer dizer
que eu não encontrei proposta escrita naquele endereço, naquele dia. A distância
entre essas duas frases é o motivo desta carta.

#### O convite

Se você é candidata ou candidato e acha que falta a sua, me manda. São quatro
perguntas, as mesmas para todo mundo:

1. Quais são as suas três prioridades para o DF?
2. Que projeto você apresenta no primeiro ano?
3. De onde sai o dinheiro para isso?
4. Qual posição você assume nos temas em disputa?

Não precisa responder às quatro. Se você já tem um plano escrito, me manda o
link e eu trabalho em cima dele.

**O que eu me comprometo a fazer com o que você mandar:**

- publicar inteiro, sem corte
- sem comentário meu, sem análise, sem nota, sem "contexto"
- com a fonte que você indicar
- no mesmo dia em que chegar
- e exatamente igual para as 582, sem exceção e sem ordem de preferência

**O que eu não faço:** não resumo, não classifico proposta como boa ou ruim, não
comparo você com adversário e não peço voto para ninguém. A página existe para
que quem vota leia e decida sozinho.

#### Por que isto não chegou na sua caixa de entrada

Porque não tem como, e prefiro dizer isso na cara. O TSE não publica e-mail de
candidato — o campo existe na base e vem vazio para todo mundo. Mandar mensagem
privada para centenas de perfis seria disparo em massa, que é spam mesmo quando
a intenção é boa. Então o convite é público, está aqui, e é o mesmo para as 582.
Se você está lendo isto, ele já chegou até você.

#### Se algo está errado

Erro encontrado é erro para corrigir. Me manda com a fonte e a correção é
publicada com a data da mudança à vista. Isso vale inclusive para o que está
escrito sobre a sua candidatura nesta página — se o seu site estava no ar e eu
disse que não abriu, quero saber.

#### Onde conferir tudo

A página inteira, as 582 candidaturas uma a uma e o código que gera tudo isso
são públicos: [endereço do site] e [endereço do repositório].

Bruno Duarte
Brasília, [data]

---

## 2. A bio do perfil

> 150 caracteres é o teto do Instagram. Esta tem 137.

```
Procurei o que as 582 candidaturas a deputado do DF prometem. Achei 63.
Mando a sua pro ar no mesmo dia. Bruno Duarte, pessoa física.
```

Link: a carta aberta, não a home. Quem chega pela bio precisa cair onde tem o
que fazer.

---

## 3. A legenda do carrossel

Sai pronta em `placar/legenda.txt` toda vez que você roda o `gerar-placar.mjs`,
já com os números do dia. Não reescreva à mão: se o número mudar e a legenda
não, é erro publicado.

Uma linha para acrescentar no fim, que o script não tem como saber:

```
Se você é candidata ou candidato, o convite completo está no link da bio.
```

---

## 4. O roteiro do Reel (35s, sua voz sobre gravação de tela)

> Este é o primeiro. Ele **não nomeia ninguém** de propósito — antes de
> apontar para alguém, a conta precisa ter deixado claro que a porta está
> aberta. Emboscada tem meia-vida curta; convite dura a campanha inteira.

| Tempo | Tela | Voz |
|---|---|---|
| 0-4s | O número 519 cheio de tela | "Quinhentos e dezenove candidatos a deputado no DF não publicaram uma proposta sequer." |
| 4-9s | Rolando a lista das 582 no site | "Eu fui atrás das quinhentas e oitenta e duas. Uma por uma." |
| 9-16s | Abrindo uma ficha, o campo de proposta vazio | "Procurei no endereço que cada uma declarou pro TSE. O endereço que ela mesma disse que era o dela." |
| 16-22s | O card dos cinco grupos | "Sessenta e três tinham. Sessenta e seis tinham site sem nada escrito. Cinquenta tinham site que nem abre. Trezentas e trinta e três não declararam site nenhum." |
| 22-28s | O gráfico por partido | "E antes que alguém pergunte: não tem lado nisso. Está em todos os partidos, da situação à oposição." |
| 28-35s | A tela do convite | "Se você é candidato e acha que falta a sua, manda. Publico inteira, com a sua fonte, no mesmo dia. O link tá na bio." |

Observações de gravação: grava a tela do celular, não do computador — é como
quase todo mundo vai ver. Fala devagar; 35 segundos de narração é bem menos
texto do que parece. E não corrige a voz para ficar de locutor: a coisa toda se
sustenta em parecer uma pessoa, não uma campanha.

---

## 5. As duas respostas que você vai precisar ter prontas

**Quando uma candidatura manda a proposta:**

```
Recebi, obrigado. Publico hoje ainda, inteira e com a fonte que você
mandou, e te mando o link quando estiver no ar. Se eu entender alguma
coisa errada, me corrige que eu conserto na hora.
```

**Quando alguém reclama de estar na conta dos 519:**

```
Obrigado por avisar — quero mesmo acertar isso. Procurei em [endereço
declarado ao TSE] no dia 13/09 e não achei proposta escrita ali. Se ela
está em outro lugar, ou se subiu depois dessa data, me manda o link que
eu publico hoje e corrijo a página. Se o erro foi meu, a correção sai com
a data à vista.
```

Nas duas: responde rápido, responde em público quando a reclamação foi pública,
e corrige antes de discutir. Uma correção publicada no mesmo dia vale mais para
a credibilidade da página do que dez posts dizendo que ela é isenta.

---

## Duas coisas que não são texto e travam o resto

1. **Onde eles mandam.** O formulário de hoje é de correção, não de proposta.
   Ou você abre um segundo, ou acrescenta um campo no que existe. Sem isso, o
   convite manda a pessoa para uma porta que não abre.

2. **A carta no ar antes do primeiro post.** Se o post sair primeiro, a
   primeira candidatura que reclamar vai reclamar sem ter para onde ir — e aí a
   conversa acontece nos comentários, que é o pior lugar possível.
