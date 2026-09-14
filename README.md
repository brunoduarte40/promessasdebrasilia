# promessas de Brasília

O que cada candidatura prometeu ao Distrito Federal nas eleições de 2026, com a fonte de cada promessa.

**Página independente.** Feita por Bruno Duarte, em Brasília, pessoa física, por conta própria. Sem vínculo com candidatura, partido, coligação ou governo. Sem financiamento de ninguém, sem publicidade, sem patrocínio, e nunca impulsionada com dinheiro.

---

## Por que o código está aberto

A plataforma inteira se sustenta numa afirmação: **não favorecemos ninguém.** Um texto na página de metodologia pede que você acredite. O código aberto deixa você conferir:

- a ordem das candidaturas é sorteada a cada visita — [`shuffle()`](docs/index.html), aplicado em todas as telas
- cada candidatura ao governo entrou com 15 a 17 propostas, independentemente do tamanho do plano ou da campanha — planos maiores foram recortados, não privilegiados
- o teste de afinidade é cego: você responde sem ver de quem é a proposta
- o site de campanha de cada candidatura entrou com no máximo 8 propostas, para que orçamento de comunicação não vire vantagem editorial
- nada é ponderado por baixo do pano

Não há nada escondido aqui: o TSE e a Câmara Legislativa publicam APIs abertas e sem autenticação, então não existe chave nenhuma nos coletores. Não há servidor, não há banco, não há dado de usuário.

## O que a página guarda sobre quem entra

Nada. Sem cadastro, sem login, sem cookie, sem medidor de audiência. Nenhuma requisição sai para terceiros. A "Minha cola" — a lista de números que a pessoa monta para levar à urna — fica no `localStorage` do próprio navegador e limpar os dados dele apaga.

## De onde vêm os dados

| Fonte | O que traz |
|---|---|
| [DivulgaCandContas / TSE](https://divulgacandcontas.tse.jus.br) | registro, situação, número na urna, partido, coligação, ocupação, escolaridade, bens declarados, retrato oficial, endereços declarados |
| [PLE / Câmara Legislativa do DF](https://ple.cl.df.gov.br) | proposições, projetos por tema e região administrativa dos deputados distritais em exercício |
| Planos de governo protocolados no TSE | as propostas das candidaturas majoritárias |
| Sites de campanha declarados no TSE | as propostas das candidaturas a deputado — a lei não exige plano de governo delas |
| Portais de imprensa do DF | manchetes, coletadas por feed |

**Nenhuma proposta foi inferida.** Nada foi deduzido do partido, da trajetória ou do que "seria coerente" com o discurso. Onde não havia fonte, o campo ficou vazio — e a página diz que ficou.

## Estrutura

```
docs/          o site publicado (GitHub Pages serve daqui)
  index.html   a página inteira, sem framework e sem dependência externa
  *.js         os dados, carregados como scripts
README.md      este arquivo
*.mjs          os coletores
```

O `index.html` não tem dependência de CDN, não usa framework e roda inteiro no navegador. Primeiro acesso: ~315 KB comprimidos. Os retratos das 602 candidaturas a deputado e as proposições da Câmara só carregam quando alguém abre a aba de deputados.

## Coletores

Todos são Node 18+ sem dependência, exceto onde indicado. Rode da raiz do projeto.

| Script | O que faz | Quando rodar |
|---|---|---|
| `atualizar.mjs` | relê no TSE a situação de registro e os bens das 626 candidaturas e funde nos arquivos existentes, preservando tudo que foi acrescentado depois | perto da eleição — registro muda até a véspera |
| `coletar-deputados.mjs` | monta a base das candidaturas a deputado do zero | só na montagem inicial |
| `noticias.mjs` | coleta manchetes dos portais do DF | periodicamente |
| `fotos-deputados.mjs` | baixa os 602 retratos oficiais e gera o pacote em WebP (precisa de `sharp`) | uma vez |
| `gerar-fotos.mjs` | o mesmo para as 24 candidaturas majoritárias | uma vez |
| `montar-site.mjs` | monta a pasta `docs/` com o envelope HTML completo | antes de cada publicação |
| `criar-formulario.gs` | Apps Script que cria o formulário de correção no Google Forms | uma vez |

`atualizar.mjs` grava um `mudancas.txt` com tudo que mudou, linha a linha, e uma seção separada para o que precisa de decisão humana.

## Correções

Erro encontrado é erro para corrigir: a correção é publicada e a data de atualização muda junto.

Toda correção precisa de **fonte verificável** — é a mesma exigência que vale para cada proposta publicada. Um canal que aceita "está errado, confia" abriria pela porta dos fundos exatamente o que a metodologia fecha pela frente.

O formulário de correção está na aba **Metodologia** da página, em *Quem faz*.

## Licença

Os dados são públicos e vêm do TSE e da Câmara Legislativa do DF, cada um com suas próprias condições de uso. O código deste repositório é livre para uso, cópia e adaptação — inclusive para montar a mesma coisa em outro estado, que é o melhor destino possível para ele.
