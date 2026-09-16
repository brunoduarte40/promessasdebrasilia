#!/usr/bin/env node
/**
 * gerar-placar.mjs — promessasdebrasilia
 *
 *   node gerar-placar.mjs
 *
 * Gera os cards do placar, prontos para postar: cinco imagens 1080×1350
 * (carrossel), uma 1080×1920 (story), o HTML de origem e a legenda já com os
 * números dentro.
 *
 * Por que isto existe: o placar tem de ser republicado várias vezes até 4 de
 * outubro, e cada republicação muda um número. Refazer isso à mão em editor de
 * imagem é meia hora que não existe no orçamento. Aqui é um comando.
 *
 * O número da capa não é inventado nem arredondado: sai da mesma base que o
 * site publica. Se ele estiver errado, o site está errado junto — que é
 * exatamente a propriedade que se quer, porque é o site que pode ser conferido.
 *
 * Fluxo de trabalho:
 *   1. preenche as duas datas do bloco "registro" no questionario.json
 *   2. cada proposta que chega vira uma linha em "propostas"
 *   3. roda este script de novo — os números andam sozinhos
 *
 * A conta dos grupos vem de grupos.mjs, compartilhado com gerar-paginas.mjs,
 * que publica os mesmos números na página /convite/ do site.
 */

import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { contar, porPartido, temProposta } from "./grupos.mjs";
import {
  C, SANS, MONO, CORTE, MARGEM, amb, CSS_AMBIENTE,
  MEDIR_TRANSBORDO, MEDIR_ZONA_SEGURA, relatarProblemas,
  carregarChromium, abrirNavegador,
} from "./ambiente.mjs";
import { existsSync } from "node:fs";

const SITE   = "https://brunoduarte40.github.io/promessasdebrasilia/";
const SITE_C = "brunoduarte40.github.io/promessasdebrasilia";
const PERFIL = "@promessasdebrasilia";
const AUTOR  = "Bruno Duarte";
const SAIDA  = "placar";
const ARQ    = "questionario.json";

/* Só entram no recorte por partido as legendas com candidatura suficiente para
   a porcentagem significar alguma coisa. Com 3 candidaturas, uma resposta vira
   33% e o gráfico mente. */
const MIN_PARTIDO = 15;

const N_CARDS = 7;

/* ── utilidades ────────────────────────────────────────────────────────── */
const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
               "agosto", "setembro", "outubro", "novembro", "dezembro"];

/* Data no formato ISO vira "23 de setembro". Sem fuso: a string é lida como
   número, porque new Date("2026-09-23") em UTC volta um dia no Brasil. */
function porExtenso(iso, comAno = false) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return String(iso || "");
  const d = Number(m[3]), mes = MESES[Number(m[2]) - 1], ano = m[1];
  return d + " de " + mes + (comAno ? " de " + ano : "");
}
function hojeISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

/* ── 1. a base ─────────────────────────────────────────────────────────── */
/* Os dados podem estar na raiz OU só em docs/ — é o caso de quem clonou o
   repositório, onde a cópia publicada é a que existe. Mesma regra que o
   montar-site.mjs já aplica ("já estava em docs/, mantido"), e é de docs/ que
   o gerar-paginas.mjs lê. Procurar num lugar só quebrava numa máquina e
   funcionava na outra, que é o pior tipo de erro. */
const BASE = ["deputados.js", "docs/deputados.js"].find((p) => existsSync(p));
if (!BASE) {
  console.error("não achei deputados.js nem em ./ nem em docs/. Rode da raiz do projeto.");
  process.exit(1);
}
const win = {};
new Function("window", await readFile(BASE, "utf8"))(win);
if (!win.DEPUTADOS || !Array.isArray(win.DEPUTADOS.candidatos)) {
  console.error(BASE + " não expôs window.DEPUTADOS.candidatos — base corrompida?");
  process.exit(1);
}
const TODOS = win.DEPUTADOS.candidatos;
const URNA  = TODOS.filter((c) => c.na_urna);

/* O placar mede as candidaturas a DEPUTADO, que é onde está o silêncio. Mas o
   site cobre governo e Senado também, e a legenda termina mandando a pessoa
   para lá — então o número do convite final tem de ser o da página inteira,
   não o do recorte. Dizer "todas as 582" num link que abre 626 é errar na
   única coisa que a página vende: a conta bater. */
const BASE_MAJ = ["dados.js", "docs/dados.js"].find((p) => existsSync(p));
let SITE_TOTAL = null;
if (BASE_MAJ) {
  const w2 = {};
  new Function("window", await readFile(BASE_MAJ, "utf8"))(w2);
  const D = w2.DADOS;
  if (D && Array.isArray(D.governo) && Array.isArray(D.senado)) {
    SITE_TOTAL = D.governo.length + D.senado.length + TODOS.length;
  }
}
if (!SITE_TOTAL) {
  console.error("não consegui contar as candidaturas do site (dados.js não achado ou sem\n"
    + "DADOS.governo/DADOS.senado). A legenda terminaria com um número errado no link.");
  process.exit(1);
}

/* ── 2. o registro do questionário ─────────────────────────────────────── */
/* Se não existir, nasce um modelo preenchível. É de propósito que o script
   pare aqui na primeira vez: publicar um placar com data de envio inventada
   seria o tipo de erro que custa o projeto inteiro. */
if (!existsSync(ARQ)) {
  const modelo = {
    "_leia": "Registro do que sustenta as frases dos cards. 'visitamos' é a data em "
      + "que os canais declarados ao TSE foram conferidos — é ela que autoriza dizer "
      + "'procuramos e não encontramos'. 'convite' é a data em que a porta foi aberta "
      + "publicamente. Sem as duas, a afirmação vira acusação e o script não gera nada.",
    registro: {
      visitamos: "",
      convite: "",
      onde_enviar: "formulário da aba Metodologia",
      observacao: ""
    },
    "_propostas": "chave = número de urna (string). Ex: \"5566\": "
      + "{ \"data\": \"2026-09-20\", \"via\": \"formulário\" }",
    propostas: {}
  };
  await writeFile(ARQ, JSON.stringify(modelo, null, 2) + "\n");
  console.log("criei " + ARQ + " em branco.\n"
    + "Preencha 'visitamos' e 'convite' no bloco registro e rode de novo.");
  process.exit(0);
}

const Q = JSON.parse(await readFile(ARQ, "utf8"));
const reg = Q.registro || {};
const respostas = Q.propostas || {};

if (!reg.visitamos || !reg.convite) {
  console.error("questionario.json: 'registro.visitamos' e 'registro.convite' têm de\n"
    + "estar preenchidos. São as duas datas que sustentam as frases dos cards:\n"
    + "  visitamos → autoriza dizer que procuramos e não encontramos\n"
    + "  convite   → autoriza dizer que a porta está aberta para todas\n"
    + "Sem elas não gero nada.");
  process.exit(1);
}

/* ── 3. junção, com guarda ─────────────────────────────────────────────── */
/* Número de urna é único entre as 582 na urna — conferido. Ainda assim, um
   número digitado errado sumiria da contagem em silêncio, que é o pior jeito
   de errar. Então: se não casa, para. */
const porNumero = new Map(URNA.map((c) => [String(c.numero), c]));
const orfaos = [];
const responderam = [];
for (const [num, dado] of Object.entries(respostas)) {
  const c = porNumero.get(String(num));
  if (!c) { orfaos.push(num); continue; }
  responderam.push({ ...c, resposta: dado || {} });
}
if (orfaos.length) {
  console.error("questionario.json: número de urna que não casa com nenhuma "
    + "candidatura na urna: " + orfaos.join(", "));
  console.error("Confira o número. Um dígito errado tira a candidatura da conta sem avisar.");
  process.exit(1);
}

const idsResponderam = new Set(responderam.map((c) => c.id));
const comProposta = URNA.filter(temProposta);
/* Quem respondeu E já tinha proposta conta uma vez só, do lado de quem falou. */
const silencio = URNA.filter((c) => !temProposta(c) && !idsResponderam.has(c.id));

const N = {
  urna: URNA.length,
  proposta: comProposta.length,
  respondeu: responderam.length,
  silencio: silencio.length,
  semCanal: URNA.filter((c) => !c.sites || !c.sites.length).length,
  federal: URNA.filter((c) => c.cargo === "federal").length,
  distrital: URNA.filter((c) => c.cargo === "distrital").length,
};

/* O recorte é "deputado" e isso são DOIS cargos: federal e distrital. Dizer só
   "deputado" não é errado, mas deixa o leitor supor que é um só — e a primeira
   pessoa a conferir vai achar essa brecha. Então a legenda abre os dois.
   Sai da base, nunca digitado: no dia em que uma candidatura for indeferida, a
   soma anda sozinha. E se um dia aparecer um terceiro cargo aqui dentro, o
   script para, porque a frase "federal e distrital" passaria a mentir. */
if (N.federal + N.distrital !== N.urna) {
  const cargos = [...new Set(URNA.map((c) => c.cargo))];
  console.error("deputados.js traz cargo além de federal/distrital: " + cargos.join(", ")
    + ".\nA legenda diz \"federal e distrital\" e passaria a excluir alguém em silêncio.");
  process.exit(1);
}

/* ── os cinco grupos ───────────────────────────────────────────────────── */
/* A conta vem de grupos.mjs, o mesmo arquivo que alimenta a página do convite
   no site. É de propósito: o card e a página dizem o mesmo número em público
   com minutos de diferença, e se divergirem, quem notar tem razão. */
let contagem;
try {
  contagem = contar(URNA);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
const GRUPOS = contagem.grupos;
const G = contagem.G;

/* ── 4. o silêncio por partido ─────────────────────────────────────────── */
const PARTIDOS = porPartido(URNA, MIN_PARTIDO, (c) => idsResponderam.has(c.id));

/* A prova de isenção não é um texto dizendo que somos isentos: é o gráfico
   trazendo situação e oposição na mesma régua. Se um dia ele vier com um lado
   só, é porque a régua quebrou — e aí o script avisa em vez de deixar passar. */
if (PARTIDOS.length < 6) {
  console.warn("AVISO: só " + PARTIDOS.length + " partidos passaram do corte de "
    + MIN_PARTIDO + ". O card de partidos fica fraco e parece recorte. Confira.");
}

/* ── 5. os cards ───────────────────────────────────────────────────────── */
const DATA_CARD = porExtenso(hojeISO());
const VISITA = porExtenso(reg.visitamos);
const CONVITE = porExtenso(reg.convite);

const CSS = CSS_AMBIENTE + `
/* A sombra não é efeito: o número agora cai sobre um céu que tem variação, e
   sem ela a borda dele encosta no gradiente e perde o corte. */
.numerao{font-size:330px;line-height:.82;font-weight:800;letter-spacing:-.045em;
  font-variant-numeric:tabular-nums;color:#fff;text-shadow:0 0 90px rgba(0,0,0,.45)}
.story .numerao{font-size:400px}
.frase{font-size:63px;line-height:1.17;font-weight:600;letter-spacing:-.02em;max-width:16ch}
.story .frase{font-size:72px}
.frase em{font-style:normal;color:${C.verdeClaro}}
.frase-topo{font-size:46px;line-height:1.25;font-weight:500;color:${C.claro2};max-width:22ch}
.story .frase-topo{font-size:54px}
.frase-pe{font-size:56px;line-height:1.2;font-weight:600;letter-spacing:-.02em;
  color:${C.verdeClaro}}
.story .frase-pe{font-size:64px}
/* O escopo anda junto do número, não no rodapé: é ele que diz o que exatamente
   foi verificado, e quem só olha o card tem de ler os dois na mesma batida. */
.escopo{font-family:${MONO};font-size:25px;line-height:1.45;color:${C.claro2};
  max-width:34ch;border-left:4px solid ${C.verdeClaro};padding-left:22px}
.story .escopo{font-size:28px}
.linhas{display:flex;gap:0;border-top:2px solid rgba(255,255,255,.16);padding-top:34px}
.linhas > div{flex:1;border-left:2px solid rgba(255,255,255,.16);padding-left:24px}
.linhas > div:first-child{border-left:0;padding-left:0}
.ln-n{font-family:${MONO};font-size:52px;font-weight:600;line-height:1;
  font-variant-numeric:tabular-nums}
.ln-t{font-size:23px;line-height:1.3;color:${C.claro2};margin-top:12px;max-width:15ch}
.titulo{font-size:58px;line-height:1.1;font-weight:700;letter-spacing:-.025em}
.sub{font-size:27px;line-height:1.45;color:${C.ink2};margin-top:20px;max-width:40ch}
.vazio{flex:1;display:flex;flex-direction:column;justify-content:center;gap:26px}
.vz-item{display:flex;gap:22px;align-items:flex-start}
.vz-num{font-family:${MONO};font-size:27px;font-weight:600;color:${C.verde};
  border:2px solid ${C.verde};width:52px;height:52px;display:grid;place-items:center;
  flex:none;border-radius:2px}
.vz-tx{font-size:31px;line-height:1.35;padding-top:8px}
.lista{display:flex;flex-direction:column;gap:0}
.item{display:flex;align-items:baseline;gap:18px;padding:17px 0;
  border-bottom:1px solid ${C.linha}}
.it-num{font-family:${MONO};font-size:27px;font-weight:600;color:${C.verde};
  font-variant-numeric:tabular-nums;flex:none;width:112px}
.it-nome{font-size:31px;font-weight:600;letter-spacing:-.01em;flex:1;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.it-part{font-family:${MONO};font-size:22px;color:${C.ink3};letter-spacing:.05em;flex:none}
.lista.compacta .item{padding:11px 0}
.lista.compacta .it-nome{font-size:26px}
.lista.compacta .it-num{font-size:23px;width:96px}
.lista.compacta .it-part{font-size:19px}
.grp{display:flex;align-items:baseline;gap:26px;padding:19px 0;
  border-bottom:1px solid ${C.linha}}
.grp-n{font-family:${MONO};font-size:44px;font-weight:600;color:${C.verde};
  font-variant-numeric:tabular-nums;flex:none;width:118px;text-align:right}
.grp-t{font-size:28px;line-height:1.3;flex:1}
.def-sim{font-size:40px;line-height:1.3;font-weight:500;max-width:24ch}
.def-nao{font-size:40px;line-height:1.3;font-weight:700;color:${C.verdeEsc};
  max-width:24ch;margin-top:30px;padding-top:30px;border-top:3px solid ${C.verde}}
.barras{display:flex;flex-direction:column;gap:0;margin-top:26px}
.bar{display:flex;align-items:center;gap:16px;padding:6px 0}
.bar-p{font-family:${MONO};font-size:22px;line-height:1.15;font-weight:600;width:178px;
  flex:none;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bar-t{flex:1;height:22px;background:${C.verdeSuave};position:relative;border-radius:1px}
.bar-f{position:absolute;inset:0 auto 0 0;background:${C.verde};border-radius:1px}
.bar-v{font-family:${MONO};font-size:22px;font-weight:600;width:112px;flex:none;
  text-align:right;font-variant-numeric:tabular-nums;color:${C.ink2}}
/* Com a zona segura, a altura útil caiu 132px e as 19 legendas não cabiam mais.
   Apertar a barra é melhor que subir o MIN_PARTIDO: num card que se chama "o
   silêncio não tem lado", partido que some é o argumento indo junto. E o
   aperto é automático, então no dia em que entrar a vigésima ele se resolve
   sozinho em vez de estourar. */
.barras.compacta .bar{padding:4px 0}
.barras.compacta .bar-t{height:20px}
.barras.compacta .bar-p{font-size:20px}
.barras.compacta .bar-v{font-size:20px}
.nota{font-size:22px;line-height:1.45;color:${C.ink3};margin-top:26px;max-width:42ch}
.met{display:flex;flex-direction:column;gap:22px;margin-top:38px}
.met-l{display:flex;gap:20px;align-items:flex-start}
.met-k{font-family:${MONO};font-size:21px;letter-spacing:.09em;text-transform:uppercase;
  color:${C.verde};width:190px;flex:none;padding-top:7px;font-weight:600}
.met-v{font-size:28px;line-height:1.4;flex:1}
.caixa{background:${C.verdeSuave};border-left:8px solid ${C.verde};padding:34px 38px;
  margin-top:auto}
.caixa p{font-size:29px;line-height:1.4;font-weight:600;color:${C.verdeEsc}}
.caixa span{display:block;font-family:${MONO};font-size:27px;margin-top:14px;
  color:${C.ink};font-weight:600;white-space:nowrap}
`;

function rodape(escuro) {
  return '<div class="rodape"><span>' + esc(PERFIL) + '</span>'
    + '<span>' + esc(SITE_C) + '</span></div>';
}

/* CAPA — o único card que precisa parar o dedo de alguém rolando.
 *
 * A versão anterior abria com o 519, que é a conclusão. Esta abre com a
 * busca e para no achado: "procurei nas 582, achei 63". Mesma informação,
 * ordem invertida — e o buraco se abre sozinho na cabeça de quem lê, porque
 * 63 é pequeno demais e a pessoa quer saber o que houve com o resto.
 *
 * Não é truque de curiosidade: é contar na ordem em que aconteceu. Numa
 * página cuja moeda é não exagerar, o ângulo tem de vir da especificidade e
 * nunca de esconder o final.
 *
 * E uma ideia só no card, que é a regra que a versão antiga quebrava: lá
 * tinha o número, a frase, o escopo e mais três estatísticas embaixo. */
function capa(story) {
  const cls = story ? "card story escuro" : "card escuro";
  return '<div class="' + cls + '" id="' + (story ? "story" : "c0") + '">'
    + amb("escuro", story ? null : 1, N_CARDS)
    + '<div class="selo">placar do silêncio · ' + esc(DATA_CARD) + '</div>'
    + '<div class="cresce" style="display:flex;flex-direction:column;justify-content:center;gap:34px">'
      + '<div class="frase-topo">Procurei a proposta dos ' + N.urna
        + ' candidatos a deputado federal e distrital do DF.</div>'
      + '<div class="numerao">' + N.proposta + '</div>'
      + '<div class="frase-pe">Foi o que achei.</div>'
    + '</div>'
    + rodape(true) + '</div>';
}

/* O 519 — agora a RESPOSTA, não a abertura. É aqui que ele bate mais forte,
   porque chega como resolução de uma pergunta que a capa deixou aberta. */
function card1() {
  return '<div class="card escuro" id="c1">'
    + amb("escuro", 2, N_CARDS)
    + '<div class="selo">os outros</div>'
    + '<div class="cresce" style="display:flex;flex-direction:column;justify-content:center;gap:40px">'
      + '<div class="numerao">' + N.silencio + '</div>'
      /* "Não disseram o que pretendem fazer" é mais forte e é o que dá vontade de
         escrever. Só que é uma afirmação sobre o mundo, e o que foi verificado é
         menor: o canal que a própria candidatura declarou ao TSE não traz proposta.
         A frase menor é a que aguenta uma notificação. */
      + '<div class="frase">não publicaram <em>proposta nenhuma</em>.</div>'
      + '<div class="escopo">no canal que elas mesmas declararam ao TSE, '
        + 'conferido em ' + esc(VISITA) + '</div>'
    + '</div>'
    + rodape(true) + '</div>';
}

/* Card 2 — quem falou. Antes do prazo não existe placar ainda, então o card
   explica o que foi perguntado. Depois, vira a lista de quem respondeu, que é
   o prêmio: é ela que faz a candidatura nº 42 querer responder. */
/* Card dos grupos — o que foi efetivamente checado, candidatura por
   candidatura. É o card que transforma "não encontramos proposta" numa
   afirmação que se sustenta, porque separa quem tinha onde publicar e não
   publicou de quem nunca declarou um lugar para publicar. */
function cardGrupos() {
  const linhas = GRUPOS.map((g) =>
    '<div class="grp"><span class="grp-n">' + g.n + '</span>'
    + '<span class="grp-t">' + esc(g.curta) + '</span></div>').join("");
  return '<div class="card claro" id="cg">'
    + amb("claro", 3, N_CARDS)
    + '<div class="selo" style="margin-bottom:34px">o que nós checamos</div>'
    + '<div class="titulo">Fomos atrás<br>das ' + N.urna + ', uma a uma</div>'
    + '<div class="sub">No canal que cada candidatura declarou ao próprio TSE, '
      + 'em ' + esc(VISITA) + '.</div>'
    + '<div class="cresce" style="overflow:hidden;margin-top:34px">' + linhas + '</div>'
    + '<div class="nota">Nenhuma proposta foi deduzida de partido, trajetória ou '
      + 'discurso. Onde não havia, o campo ficou vazio — e a página diz que ficou.</div>'
    + '<div style="height:26px"></div>' + rodape(false) + '</div>';
}

function card2() {
  let miolo;
  if (!responderam.length) {
    /* Sem ninguém tendo mandado ainda, este card é o convite — e o convite é
       a peça que faz o resto ser justo: a porta está aberta, datada, e é a
       mesma para as 582. */
    miolo = '<div class="titulo">Achamos que falta<br>a sua proposta?</div>'
      + '<div class="sub">Manda. Publicamos inteira, com a sua fonte, no mesmo dia — '
        + 'e o seu nome sai desta conta.</div>'
      + '<div class="vazio">'
        + ['Quais são as suas três prioridades para o DF?',
           'Que projeto você apresenta no primeiro ano?',
           'De onde sai o dinheiro para isso?',
           'Qual posição você assume nos temas em disputa?']
          .map((t, i) => '<div class="vz-item"><div class="vz-num">' + (i + 1) + '</div>'
            + '<div class="vz-tx">' + esc(t) + '</div></div>').join("")
      + '</div>'
      + '<div class="nota">Aberto desde ' + esc(CONVITE) + ', para as ' + N.urna
        + ', sem prazo para fechar. O formulário está na aba Metodologia da página.</div>';
  } else {
    /* O card tem altura fixa: acima de MAX_LISTA nomes não cabe mais ninguém.
       Aí em vez de cortar, ele diz quantos ficaram de fora — porque o problema
       de ter resposta demais para um card é o melhor problema possível aqui. */
    const ordenados = responderam.slice()
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    const compacta = ordenados.length > 12;
    const MAX_LISTA = compacta ? 16 : 12;
    const mostrados = ordenados.slice(0, MAX_LISTA);
    const sobraram = ordenados.length - mostrados.length;
    const lista = mostrados.map((c) => '<div class="item">'
      + '<span class="it-num">' + esc(c.numero) + '</span>'
      + '<span class="it-nome">' + esc(c.nome) + '</span>'
      + '<span class="it-part">' + esc(c.partido) + '</span></div>').join("");
    miolo = '<div class="titulo">' + responderam.length
        + (responderam.length === 1 ? ' mandou' : ' mandaram') + '</div>'
      + '<div class="sub">Mandaram a proposta depois do convite. Está publicada na '
        + 'página, inteira, com a fonte.</div>'
      + '<div class="cresce" style="overflow:hidden;margin-top:30px"><div class="lista'
        + (compacta ? " compacta" : "") + '">' + lista + '</div></div>'
      + (sobraram ? '<div class="nota">E mais ' + sobraram
          + ' — a lista completa está na página.</div>' : "");
  }
  return '<div class="card claro" id="c2">'
    + amb("claro", 6, N_CARDS)
    + '<div class="selo" style="margin-bottom:38px">'
      + (responderam.length ? "quem mandou" : "o convite") + '</div>'
    + miolo + '<div style="height:34px"></div>' + rodape(false) + '</div>';
}

/* Card 3 — o silêncio por partido. É aqui que a isenção deixa de ser
   afirmação e vira gráfico: todo mundo grande aparece, na mesma régua. */
function card3() {
  const max = PARTIDOS.length ? Math.max(...PARTIDOS.map((p) => p.pct)) : 100;
  const barras = PARTIDOS.map((p) =>
    '<div class="bar">'
    + '<span class="bar-p">' + esc(p.partido) + '</span>'
    + '<span class="bar-t"><span class="bar-f" style="width:'
      + (p.pct / max * 100).toFixed(1) + '%"></span></span>'
    + '<span class="bar-v">' + p.calados + '/' + p.total + '</span></div>').join("");
  return '<div class="card claro" id="c3">'
    + amb("claro", 4, N_CARDS)
    + '<div class="selo" style="margin-bottom:34px">o silêncio não tem lado</div>'
    + '<div class="titulo">Candidaturas sem<br>proposta, por partido</div>'
    + '<div class="cresce" style="overflow:hidden"><div class="barras'
      + (PARTIDOS.length > 16 ? " compacta" : "") + '">' + barras + '</div></div>'
    + '<div class="nota">Legendas com ' + MIN_PARTIDO + ' ou mais candidaturas na urna. '
      + 'Abaixo disso a porcentagem diz mais sobre o tamanho do partido do que sobre o silêncio.</div>'
    + '<div style="height:26px"></div>' + rodape(false) + '</div>';
}

/* A DEFINIÇÃO, sozinha num card. Antes ela era a terceira de cinco linhas de
   metodologia e passava batida — sendo que é a frase que separa um dado de uma
   acusação, e a que decide se isto aguenta uma notificação extrajudicial.
   Card próprio, com ar em volta. */
function cardDefinicao() {
  return '<div class="card claro" id="c4">'
    + amb("claro", 5, N_CARDS)
    + '<div class="selo" style="margin-bottom:34px">o que isto quer dizer</div>'
    + '<div class="titulo">&ldquo;Sem proposta&rdquo;<br>quer dizer o quê?</div>'
    + '<div class="cresce" style="display:flex;flex-direction:column;justify-content:center">'
      + '<div class="def-sim">Que eu não encontrei proposta escrita no endereço que a '
        + 'candidatura declarou ao TSE, no dia ' + esc(VISITA) + '.</div>'
      + '<div class="def-nao">Não quer dizer que ela não tenha uma.</div>'
    + '</div>'
    + '<div class="nota">Nada foi deduzido de partido, de trajetória ou do que &ldquo;seria '
      + 'coerente&rdquo;. Onde não havia fonte, o campo ficou vazio — e a página diz que ficou.</div>'
    + '<div style="height:26px"></div>' + rodape(false) + '</div>';
}

/* O ÚLTIMO CARD entrega a coisa em vez de pedir seguidor. Quem chegou até aqui
   quer a ferramenta; o endereço é o maior elemento da tela. */
function cardConferir() {
  return '<div class="card claro" id="c5">'
    + amb("claro", 7, N_CARDS)
    + '<div class="selo" style="margin-bottom:34px">confira você mesmo</div>'
    + '<div class="titulo">As ' + SITE_TOTAL + ' candidaturas<br>do DF, uma a uma</div>'
    + '<div class="sub">Governo, Senado e deputado. Cada informação com a fonte ao lado, '
      + 'e o código que gera tudo isso é público.</div>'
    + '<div class="cresce"></div>'
    + '<div class="caixa"><p>Está tudo aqui:</p>'
      + '<span>' + esc(SITE_C) + '</span></div>'
    + '<div class="nota" style="margin-top:22px">Achou um erro? Manda com a fonte pelo '
      + 'formulário da aba Metodologia — a correção sai no mesmo dia, com a data à vista.</div>'
    + '<div style="height:26px"></div>'
    + '<div class="rodape"><span>' + esc(PERFIL) + '</span>'
      + '<span>por ' + esc(AUTOR) + ' · pessoa física</span></div>'
    + '</div>';
}

const HTML = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
  + '<title>placar — promessas de Brasília</title><style>' + CSS + '</style></head>'
  + '<body>' + capa(false) + card1() + cardGrupos() + card3() + cardDefinicao()
  + card2() + cardConferir() + capa(true)
  + '</body></html>';

/* ── 6. gravar ─────────────────────────────────────────────────────────── */
if (existsSync(SAIDA)) await rm(SAIDA, { recursive: true });
await mkdir(SAIDA, { recursive: true });
await writeFile(SAIDA + "/placar.html", HTML);

/* A legenda é metade do trabalho de postar, e é onde o erro de tom acontece.
   Sai pronta, com os números já dentro e a linha de identificação que a lei
   pede — propaganda eleitoral na internet não pode ser anônima. */
/* Cada frase daqui é checável contra a base. A tentação é escrever "519 não têm
   proposta" — mais curto e mais forte. Só que não é o que foi verificado: o que
   foi verificado é que não achamos proposta no endereço que cada uma declarou ao
   TSE, num dia determinado. A frase mais fraca é a que se sustenta.
 *
 * ── por que a legenda tem esta forma ──────────────────────────────────────
 *
 * O Instagram corta a legenda depois de duas linhas, no "… mais". A versão
 * anterior gastava essas duas linhas explicando o método e o número só
 * aparecia depois do corte — ou seja, para quem não tocou em "mais", o post
 * não dizia nada. Agora o achado abre e o método vem logo atrás.
 *
 * O sinal que hoje mais empurra um post para quem não segue a conta não é
 * curtida: é ENVIO — o número de vezes que alguém manda aquilo no direct.
 * Então a legenda pede envio, e pede com endereço, porque "compartilha aí"
 * não move ninguém. Aqui há dois destinatários óbvios e específicos: quem
 * ainda não decidiu o voto, e o próprio candidato — que é, aliás, o motor do
 * modelo do convite: cobrança de eleitor pesa mais que cobrança minha.
 *
 * O que NÃO entrou, de propósito:
 *   · "comenta LINK que eu mando no direct" — precisa de robô de terceiro
 *     para responder, e o art. 57-B §3º da Lei 9.504/97 proíbe ferramenta não
 *     fornecida pela plataforma para alterar alcance de propaganda eleitoral.
 *     Fora que a página não é fechada: fingir portão onde não tem é teatro.
 *   · "qual te surpreendeu mais?" e afins — pergunta sobre candidatura em
 *     período de campanha cheira a enquete, vedada pelo art. 33 §5º.
 *   · indignação ("que VERGONHA!") — funciona e destrói a única coisa que
 *     esta página tem para vender, que é não ter lado.
 *   · monte de hashtag — a plataforma despriorizou e limitou hashtag, e quem
 *     lê a legenda para busca são as PALAVRAS. Daí "Eleições 2026",
 *     "Distrito Federal" e "Brasília" estarem escritas por extenso no pé.
 *
 * O pedido de correção no fim não é humildade decorativa: é o convite que
 * gera comentário sem precisar de isca, e é a jogada mais forte que uma
 * página de checagem tem — convidar o público a provar que ela errou. */
const legenda = [
  /* as duas linhas que aparecem antes do "… mais" */
  /* "deputado" sozinho não está errado — os " + N.urna + " somam os dois cargos —,
     mas deixa o leitor supor que é só um deles. Nomear os dois custa onze
     caracteres e fecha a brecha. */
  N.urna + " candidatos a deputado federal e distrital no DF.",
  "Achei proposta escrita em " + N.proposta + ".",
  "",
  "Fui atrás de todos, um a um — " + N.federal + " candidatos a federal e " + N.distrital
    + " a distrital. Não perguntei a ninguém: procurei no canal que a própria candidatura "
    + "declarou ao TSE, em " + VISITA + ".",
  "",
  "O resto:",
  "",
  G.vazio + " declararam um site que está no ar e não traz proposta nenhuma.",
  G.quebrado + " declararam um site que nem abriu.",
  G.so_rede + " não declararam site, só rede social.",
  G.nada + " não declararam canal nenhum — nem site, nem rede.",
  "",
  "Some: dá " + N.urna + ". A conta fecha, e você confere linha por linha.",
  "",
  "Tem card mostrando isso por partido. Não tem lado nenhum: está em todos, da situação "
    + "à oposição.",
  "",
  "LEIA ESTA PARTE: \"sem proposta\" aqui quer dizer que eu não encontrei proposta escrita "
    + "naquele endereço naquele dia. NÃO quer dizer que a candidatura não tenha uma.",
  "",
  "Por isso o convite, aberto desde " + CONVITE + " e igual para as " + N.urna + ": é candidata ou "
    + "candidato e acha que falta a sua? Manda. Publico inteira, com a sua fonte, no mesmo dia, "
    + "sem corte e sem comentário meu. O formulário está na aba Metodologia da página.",
  N.respondeu === 0 ? "" : "",
  N.respondeu === 0 ? "" : (N.respondeu === 1
    ? "Uma já mandou, e está publicada."
    : N.respondeu + " já mandaram, e estão publicadas."),
  "",
  "E se você não é candidato:",
  "",
  "→ Manda este post para quem ainda não decidiu o voto para deputado.",
  "→ Acha o seu candidato na lista e manda para ele. Cobrança de eleitor pesa mais que a minha.",
  "",
  "Achou proposta de alguém que eu marquei como sem? Comenta aqui com o link. Eu corrijo, "
    + "publico a correção e ponho a data à vista. Errar e consertar em público é parte do combinado.",
  "",
  "As " + SITE_TOTAL + " candidaturas do DF — governo, Senado e deputado — uma a uma, com a "
    + "fonte de cada informação:",
  SITE,
  "",
  "Eleições 2026, Distrito Federal, Brasília. Página independente, feita por " + AUTOR + ", "
    + "pessoa física. Sem vínculo com candidatura, partido, coligação ou governo. Sem "
    + "financiamento e sem impulsionamento.",
].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
await writeFile(SAIDA + "/legenda.txt", legenda + "\n");

/* O Instagram corta em 2.200 caracteres, sem avisar e sem pedir confirmação —
   o fim da legenda simplesmente não existe. E o fim daqui é a linha de
   identificação, que a lei exige em propaganda eleitoral na internet. Perder
   essa linha em silêncio é o pior jeito possível de estourar um limite. */
const LIM = 2200;
if (legenda.length > LIM) {
  console.error("\n  ✕ A LEGENDA ESTOUROU: " + legenda.length + " caracteres, o limite é "
    + LIM + ".");
  console.error("  O Instagram corta o fim sem avisar — e o fim é a linha de identificação,");
  console.error("  que a lei exige. Encurte antes de postar.\n");
  process.exit(1);
}

/* ── 7. renderizar ─────────────────────────────────────────────────────── */
const ALVOS = [
  ["c0", "1-capa.png"],
  ["c1", "2-os-outros.png"],
  ["cg", "3-checamos.png"],
  ["c3", "4-partidos.png"],
  ["c4", "5-o-que-quer-dizer.png"],
  ["c2", "6-manda-a-sua.png"],
  ["c5", "7-confira.png"],
  ["story", "story.png"],
];

/* Dois pacotes servem: playwright (traz navegador próprio) e playwright-core
   (não traz, mas dirige o Chrome/Edge que já está na máquina). Tenta os dois.

   E guarda o erro de verdade em vez de engolir: "não está instalado" é um
   palpite, e palpite manda a pessoa rodar npm install de novo achando que
   resolve. O motivo real pode ser outro — versão de Node, instalação pela
   metade, pacote que não resolve no Windows. */
const { chromium, erros: errosImport } = await carregarChromium();

if (!chromium) {
  console.log("Não consegui carregar o Playwright — gerei só o HTML.");
  console.log("O motivo, com todas as letras:");
  console.log(errosImport.join("\n"));
  console.log("\nNode " + process.version + " · rodando de " + process.cwd());
  console.log("\nTente:  npm install playwright");
  console.log("Se insistir, " + SAIDA + "/placar.html abre no navegador com os cinco");
  console.log("cards em tamanho real — dá para capturar a tela de cada um.");
} else {
  const { nav, via, erros } = await abrirNavegador(chromium);
  if (!nav) {
    console.log("Não consegui abrir navegador nenhum. Gerei só o HTML.\n" + erros.join("\n"));
    console.log("\nResolve com:  npx playwright install chromium");
  } else {
    const pagina = await nav.newPage({
      viewport: { width: 1080, height: 1350 },
      deviceScaleFactor: 1,
    });
    await pagina.setContent(HTML, { waitUntil: "load" });
    await pagina.evaluate(() => document.fonts.ready);

    /* Trava de transbordo. Card tem altura fixa e o que não coube é cortado em
       silêncio — foi assim que o REPUBLICANOS sumiu do gráfico de partidos na
       primeira versão. Num card que se chama "o silêncio não tem lado", uma
       legenda faltando não é defeito de layout, é o argumento inteiro caindo.
       Então mede antes de gravar e para, dizendo onde. */
    /* As duas travas medem a página já renderizada, não o CSS. Um padding
       certo no papel não impede um parágrafo de crescer uma linha e empurrar
       o rodapé para fora — só medir de verdade pega isso. Moram no
       ambiente.mjs porque o gerador de cards individuais usa as mesmas. */
    const transbordos = await pagina.evaluate(MEDIR_TRANSBORDO);
    const cortados = await pagina.evaluate(MEDIR_ZONA_SEGURA);

    for (const [id, nome] of ALVOS) {
      await pagina.locator("#" + id).screenshot({ path: SAIDA + "/" + nome });
    }
    await nav.close();

    if (relatarProblemas(transbordos, cortados)) {
      console.error("  NÃO POSTE antes de resolver. No card de partidos, o caminho é subir");
      console.error("  MIN_PARTIDO (hoje " + MIN_PARTIDO + ") — some legenda pequena, não legenda grande.\n");
      process.exit(1);
    }

    console.log("imagens renderizadas com " + via
      + ", sem transbordo e dentro da zona segura do corte 1:1.");
  }
}

/* ── 8. relatório ──────────────────────────────────────────────────────── */
const pct = (n) => (n / N.urna * 100).toFixed(1).replace(".", ",") + "%";
console.log("");
console.log("  na urna                " + String(N.urna).padStart(4));
console.log("  com proposta no site   " + String(N.proposta).padStart(4) + "   " + pct(N.proposta));
console.log("  responderam            " + String(N.respondeu).padStart(4) + "   " + pct(N.respondeu));
console.log("  SILÊNCIO               " + String(N.silencio).padStart(4) + "   " + pct(N.silencio));
console.log("  sem canal de contato   " + String(N.semCanal).padStart(4));
console.log("");
console.log("  silêncio por partido (" + PARTIDOS.length + " legendas com " + MIN_PARTIDO + "+):");
for (const p of PARTIDOS) {
  const barra = "█".repeat(Math.round(p.pct / 5));
  console.log("    " + p.partido.padEnd(16) + String(p.calados).padStart(3) + "/"
    + String(p.total).padEnd(4) + barra + " " + p.pct.toFixed(0) + "%");
}
console.log("");
console.log("  " + SAIDA + "/ — " + (chromium ? ALVOS.length + " imagens, " : "")
  + "placar.html e legenda.txt");
if (responderam.length) {
  const partidosResp = [...new Set(responderam.map((c) => c.partido))];
  console.log("  quem respondeu cobre " + partidosResp.length + " partido(s): "
    + partidosResp.sort().join(", "));
}
