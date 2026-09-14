/**
 * criar-formulario.gs — promessasdebrasilia
 *
 * Monta, na SUA conta Google, o formulário de correção da plataforma —
 * com as seis perguntas já escritas, nas palavras certas.
 *
 * COMO RODAR (leva 2 minutos)
 *   1. Abra  script.google.com  e clique em "Novo projeto"
 *   2. Apague o conteúdo do editor e cole ESTE arquivo inteiro
 *   3. Com a função "criarFormulario" selecionada no topo, clique em Executar
 *   4. O Google vai pedir autorização — é para o script poder criar o
 *      formulário na sua conta. Aceite.
 *   5. O registro de execução (Ctrl+Enter) imprime dois endereços:
 *        PÚBLICO  — é o que vai na página, me mande esse
 *        EDITAR   — é o seu, para mexer nas perguntas depois
 *
 * O formulário nasce no seu Drive. As respostas ficam na aba "Respostas" do
 * próprio formulário; se quiser planilha, é um clique lá dentro.
 *
 * Por que a pergunta da FONTE é obrigatória: é a mesma regra que vale para
 * toda proposta publicada na plataforma — nada entra sem fonte verificável.
 * Um canal de correção que aceita "está errado, confia" abriria pela porta
 * dos fundos exatamente o que a metodologia fecha pela frente.
 *
 * Por que perguntar se quem escreve é da candidatura: aviso de terceiro e
 * pedido da própria campanha são coisas diferentes e merecem tratamento
 * diferente. Não é para filtrar — é para saber o que se está lendo.
 */

function criarFormulario() {
  var f = FormApp.create("promessas de Brasília — avisar de um erro");

  f.setDescription(
    "Esta página reúne o que é público sobre as candidaturas do DF em 2026. "
    + "Erro encontrado é erro para corrigir: a correção é publicada e a data de "
    + "atualização da página muda junto.\n\n"
    + "Toda correção precisa de fonte — é a mesma exigência que vale para cada "
    + "proposta publicada aqui."
  );

  f.addMultipleChoiceItem()
    .setTitle("O que está errado?")
    .setChoiceValues([
      "Uma proposta atribuída a alguém",
      "Um dado da candidatura (partido, número, patrimônio, situação do registro)",
      "Um link que não funciona ou leva para o lugar errado",
      "Uma manchete de imprensa que não é sobre essa pessoa",
      "Outra coisa"
    ])
    .showOtherOption(false)
    .setRequired(true);

  f.addTextItem()
    .setTitle("Em qual candidatura?")
    .setHelpText("O nome como aparece na página, ou cole o endereço da página da candidatura.")
    .setRequired(true);

  f.addParagraphTextItem()
    .setTitle("O que a página diz hoje?")
    .setHelpText("Copie e cole o trecho, se puder. Ajuda a achar rápido.")
    .setRequired(true);

  f.addParagraphTextItem()
    .setTitle("O que deveria dizer — e qual é a fonte?")
    .setHelpText(
      "A fonte é obrigatória: link do plano de governo no TSE, da matéria, do site "
      + "oficial da campanha, do diário oficial, do sistema da Câmara Legislativa. "
      + "Sem fonte verificável a correção não entra — é a mesma regra que vale para "
      + "tudo que está publicado aqui."
    )
    .setRequired(true);

  f.addMultipleChoiceItem()
    .setTitle("Você é da candidatura envolvida?")
    .setHelpText("Candidato, assessoria, militância ou partido. Não muda o critério — só ajuda a entender quem está escrevendo.")
    .setChoiceValues(["Não", "Sim", "Prefiro não dizer"])
    .showOtherOption(false)
    .setRequired(true);

  f.addTextItem()
    .setTitle("Seu e-mail, se quiser resposta")
    .setHelpText("Opcional. Só é usado para responder sobre esta correção — não entra em lista nenhuma.")
    .setRequired(false);

  f.setConfirmationMessage(
    "Recebido. Toda correção com fonte é conferida no original; quando procede, "
    + "a página muda e a data de atualização muda junto."
  );
  f.setShowLinkToRespondAgain(false);

  // Só existe em conta Workspace; numa conta pessoal o formulário já é público.
  try { f.setRequireLogin(false); } catch (e) {}

  Logger.log("PÚBLICO (é este que vai na página): " + f.getPublishedUrl());
  Logger.log("EDITAR (guarde para você):          " + f.getEditUrl());
  Logger.log("");
  Logger.log("Mande o endereço PÚBLICO no chat.");
}
