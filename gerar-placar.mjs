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

/* ── paleta, a mesma do site ───────────────────────────────────────────── */
const C = {
  ink: "#141A20", ink2: "#57646F", ink3: "#626F7A",
  papel: "#FAFAF8", linha: "#E4E4E0",
  verde: "#0A7A45", verdeEsc: "#075C34", verdeSuave: "#E3F1E9",
  claro: "#E7EDF2", claro2: "#9AA8B4", verdeClaro: "#43BE81",
};
const SANS = '"Archivo",system-ui,-apple-system,"Segoe UI",sans-serif';
const MONO = '"IBM Plex Mono",ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace';

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
};

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

const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{background:#888;font-family:${SANS};-webkit-font-smoothing:antialiased}
.card{width:1080px;height:1350px;padding:84px;display:flex;flex-direction:column;
  position:relative;overflow:hidden}
/* O story tem folga extra em cima e embaixo porque o Instagram desenha por cima:
   a barra do perfil no topo e a caixa de resposta no pé. Conteúdo colado na
   borda some debaixo da interface. */
.story{width:1080px;height:1920px;padding:150px 84px 250px}
.escuro{background:${C.ink};color:${C.claro}}
.claro{background:${C.papel};color:${C.ink}}
.selo{font-family:${MONO};font-size:25px;letter-spacing:.14em;text-transform:uppercase;
  font-weight:600}
.escuro .selo{color:${C.verdeClaro}}
.claro .selo{color:${C.verde}}
.numerao{font-size:330px;line-height:.82;font-weight:800;letter-spacing:-.045em;
  font-variant-numeric:tabular-nums;color:#fff}
.story .numerao{font-size:400px}
.frase{font-size:63px;line-height:1.17;font-weight:600;letter-spacing:-.02em;max-width:16ch}
.story .frase{font-size:72px}
.frase em{font-style:normal;color:${C.verdeClaro}}
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
.rodape{font-family:${MONO};font-size:21px;letter-spacing:.02em;display:flex;
  justify-content:space-between;align-items:flex-end;gap:20px}
.escuro .rodape{color:${C.claro2}}
.claro .rodape{color:${C.ink3}}
.titulo{font-size:58px;line-height:1.1;font-weight:700;letter-spacing:-.025em}
.sub{font-size:27px;line-height:1.45;color:${C.ink2};margin-top:20px;max-width:40ch}
.cresce{flex:1;min-height:0}
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
.barras{display:flex;flex-direction:column;gap:0;margin-top:26px}
.bar{display:flex;align-items:center;gap:16px;padding:6px 0}
.bar-p{font-family:${MONO};font-size:22px;line-height:1.15;font-weight:600;width:178px;
  flex:none;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bar-t{flex:1;height:22px;background:${C.verdeSuave};position:relative;border-radius:1px}
.bar-f{position:absolute;inset:0 auto 0 0;background:${C.verde};border-radius:1px}
.bar-v{font-family:${MONO};font-size:22px;font-weight:600;width:112px;flex:none;
  text-align:right;font-variant-numeric:tabular-nums;color:${C.ink2}}
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

/* Card 1 — o número. É o único que precisa parar o dedo de alguém rolando. */
function card1(story) {
  const cls = story ? "card story escuro" : "card escuro";
  return '<div class="' + cls + '" id="' + (story ? "story" : "c1") + '">'
    + '<div class="selo">placar do silêncio · ' + esc(DATA_CARD) + '</div>'
    + '<div class="cresce" style="display:flex;flex-direction:column;justify-content:center;gap:46px">'
      + '<div class="numerao">' + N.silencio + '</div>'
      /* "Não disseram o que pretendem fazer" é mais forte e é o que dá vontade de
         escrever. Só que é uma afirmação sobre o mundo, e o que foi verificado é
         menor: o canal que a própria candidatura declarou ao TSE não traz proposta.
         A frase menor é a que aguenta uma notificação. */
      + '<div class="frase">das ' + N.urna + ' candidaturas a deputado no DF '
        + '<em>não publicaram proposta nenhuma</em>.</div>'
      + '<div class="escopo">no canal que elas mesmas declararam ao TSE, '
        + 'conferido em ' + esc(VISITA) + '</div>'
    + '</div>'
    + '<div class="linhas" style="margin-bottom:40px">'
      /* Os três somam 582 de propósito: quem confere, fecha a conta sozinho. */
      + '<div><div class="ln-n">' + N.proposta + '</div>'
        + '<div class="ln-t">têm proposta no site que declararam</div></div>'
      + '<div><div class="ln-n">' + (G.vazio + G.quebrado) + '</div>'
        + '<div class="ln-t">declararam site, e ele não traz proposta</div></div>'
      + '<div><div class="ln-n">' + (G.so_rede + G.nada) + '</div>'
        + '<div class="ln-t">não declararam site de campanha</div></div>'
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
    + '<div class="selo" style="margin-bottom:34px">o silêncio não tem lado</div>'
    + '<div class="titulo">Candidaturas sem<br>proposta, por partido</div>'
    + '<div class="cresce" style="overflow:hidden"><div class="barras">' + barras + '</div></div>'
    + '<div class="nota">Legendas com ' + MIN_PARTIDO + ' ou mais candidaturas na urna. '
      + 'Abaixo disso a porcentagem diz mais sobre o tamanho do partido do que sobre o silêncio.</div>'
    + '<div style="height:26px"></div>' + rodape(false) + '</div>';
}

/* Card 4 — como conferir. O card que transforma acusação em dado: diz quando
   foi enviado, por onde, com que prazo, e onde a pessoa confere sozinha. */
function card4() {
  return '<div class="card claro" id="c4">'
    + '<div class="selo" style="margin-bottom:34px">como isto foi feito</div>'
    + '<div class="titulo">Confira você<br>mesmo</div>'
    + '<div class="met">'
      + '<div class="met-l"><span class="met-k">onde olhamos</span>'
        + '<span class="met-v">no canal que cada candidatura declarou ao TSE — é o '
        + 'endereço que ela mesma informou como sendo o dela.</span></div>'
      + '<div class="met-l"><span class="met-k">quando</span>'
        + '<span class="met-v">' + esc(VISITA) + '. Site que subiu depois disso ainda '
        + 'não entrou; é só avisar.</span></div>'
      /* A definição que impede o card de virar xingamento: a afirmação é sobre um
         documento não encontrado num endereço, numa data. Não é juízo sobre ninguém. */
      + '<div class="met-l"><span class="met-k">sem proposta</span>'
        + '<span class="met-v">quer dizer que não achamos proposta escrita ali naquele '
        + 'dia. Não quer dizer que a candidatura não tenha uma.</span></div>'
      + '<div class="met-l"><span class="met-k">nada foi deduzido</span>'
        + '<span class="met-v">de partido, de trajetória ou do que "seria coerente". '
        + 'Onde não havia fonte, o campo ficou vazio.</span></div>'
      + '<div class="met-l"><span class="met-k">está errado?</span>'
        + '<span class="met-v">manda a proposta pelo formulário da aba Metodologia. '
        + 'Publico inteira, com a fonte, no mesmo dia.</span></div>'
    + '</div>'
    + '<div class="caixa"><p>Todas as ' + N.urna + ' candidaturas, uma a uma:</p>'
      + '<span>' + esc(SITE_C) + '</span></div>'
    + '<div style="height:34px"></div>'
    + '<div class="rodape"><span>' + esc(PERFIL) + '</span>'
      + '<span>por ' + esc(AUTOR) + ' · pessoa física</span></div>'
    + '</div>';
}

const HTML = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
  + '<title>placar — promessas de Brasília</title><style>' + CSS + '</style></head>'
  + '<body>' + card1(false) + cardGrupos() + card2() + card3() + card4() + card1(true)
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
   TSE, num dia determinado. A frase mais fraca é a que se sustenta. */
const legenda = [
  "Fui atrás das " + N.urna + " candidaturas a deputado do DF, uma a uma, para achar o que cada "
    + "uma promete. Em " + VISITA + ", procurei no canal que a própria candidatura declarou ao TSE.",
  "",
  "Achei proposta escrita em " + N.proposta + ".",
  "",
  G.vazio + " declararam um site que está no ar e não traz proposta nenhuma. "
    + G.quebrado + " declararam um site que nem abriu. " + G.so_rede + " não declararam site, só rede social. "
    + "E " + G.nada + " não declararam canal nenhum — nem site, nem rede.",
  "",
  "Some: dá " + N.urna + ". A conta fecha e você pode conferir cada linha.",
  "",
  "Um card mostra isso por partido. Não tem lado: está em todos, da situação à oposição.",
  "",
  "IMPORTANTE, e vale ler com atenção: \"sem proposta\" aqui quer dizer que não encontrei "
    + "proposta escrita naquele endereço naquele dia. Não quer dizer que a candidatura não tenha uma.",
  "",
  "Então o convite, aberto desde " + CONVITE + " e igual para as " + N.urna + ": se você é candidata ou "
    + "candidato e acha que falta a sua, manda. Publico inteira, com a sua fonte, no mesmo dia, "
    + "sem corte e sem comentário meu. O formulário está na aba Metodologia da página.",
  "",
  N.respondeu === 0 ? "" : (N.respondeu === 1
    ? "Uma já mandou, e está publicada."
    : N.respondeu + " já mandaram, e estão publicadas."),
  N.respondeu === 0 ? "" : "",
  "Todas as " + N.urna + " candidaturas, uma a uma, com a fonte de cada informação:",
  SITE,
  "",
  "Página independente, feita por " + AUTOR + ", pessoa física, em Brasília. Sem vínculo com "
    + "candidatura, partido, coligação ou governo. Sem financiamento e sem impulsionamento.",
].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
await writeFile(SAIDA + "/legenda.txt", legenda + "\n");

/* ── 7. renderizar ─────────────────────────────────────────────────────── */
const ALVOS = [
  ["c1", "1-numero.png"],
  ["cg", "2-checamos.png"],
  ["c2", "3-manda-a-sua.png"],
  ["c3", "4-partidos.png"],
  ["c4", "5-conferir.png"],
  ["story", "story.png"],
];

/* Dois pacotes servem: playwright (traz navegador próprio) e playwright-core
   (não traz, mas dirige o Chrome/Edge que já está na máquina). Tenta os dois.

   E guarda o erro de verdade em vez de engolir: "não está instalado" é um
   palpite, e palpite manda a pessoa rodar npm install de novo achando que
   resolve. O motivo real pode ser outro — versão de Node, instalação pela
   metade, pacote que não resolve no Windows. */
let chromium = null;
const errosImport = [];
for (const pacote of ["playwright", "playwright-core"]) {
  try { ({ chromium } = await import(pacote)); break; }
  catch (e) { errosImport.push("  " + pacote + ": " + String(e.message).split("\n")[0]); }
}

/* Três caminhos até um navegador, do mais provável ao mais teimoso: o que o
   Playwright baixa, o Chrome que já está na máquina (poupa 150 MB de download)
   e um caminho apontado à mão. O primeiro que abrir, vale. */
async function abrirNavegador() {
  const tentativas = [
    ["o navegador do Playwright", {}],
    ["o Chrome instalado na máquina", { channel: "chrome" }],
    ["o Edge instalado na máquina", { channel: "msedge" }],
  ];
  if (process.env.PLACAR_CHROME) {
    tentativas.unshift(["PLACAR_CHROME", { executablePath: process.env.PLACAR_CHROME }]);
  }
  const erros = [];
  for (const [nome, opcoes] of tentativas) {
    try { return { nav: await chromium.launch(opcoes), via: nome }; }
    catch (e) { erros.push("  " + nome + ": " + String(e.message).split("\n")[0]); }
  }
  return { nav: null, erros };
}

if (!chromium) {
  console.log("Não consegui carregar o Playwright — gerei só o HTML.");
  console.log("O motivo, com todas as letras:");
  console.log(errosImport.join("\n"));
  console.log("\nNode " + process.version + " · rodando de " + process.cwd());
  console.log("\nTente:  npm install playwright");
  console.log("Se insistir, " + SAIDA + "/placar.html abre no navegador com os cinco");
  console.log("cards em tamanho real — dá para capturar a tela de cada um.");
} else {
  const { nav, via, erros } = await abrirNavegador();
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
    const transbordos = await pagina.evaluate(() => {
      const fora = [];
      for (const card of document.querySelectorAll(".card")) {
        const alvos = [card, ...card.querySelectorAll(".cresce, .lista, .barras, .met")];
        for (const el of alvos) {
          const sobra = el.scrollHeight - el.clientHeight;
          const largo = el.scrollWidth - el.clientWidth;
          if (sobra > 2 || largo > 2) {
            fora.push({
              card: card.id,
              onde: el === card ? "o card inteiro" : "." + el.className.split(" ")[0],
              altura: Math.max(0, sobra),
              largura: Math.max(0, largo),
            });
          }
        }
      }
      return fora;
    });

    for (const [id, nome] of ALVOS) {
      await pagina.locator("#" + id).screenshot({ path: SAIDA + "/" + nome });
    }
    await nav.close();

    if (transbordos.length) {
      console.error("\n  ✕ TRANSBORDOU — tem conteúdo cortado nas imagens:");
      for (const t of transbordos) {
        console.error("      " + t.card + " → " + t.onde
          + (t.altura ? "  sobra " + t.altura + "px de altura" : "")
          + (t.largura ? "  sobra " + t.largura + "px de largura" : ""));
      }
      console.error("\n  As imagens foram gravadas assim mesmo, para você ver o que ficou de fora.");
      console.error("  NÃO POSTE antes de resolver. No card de partidos, o caminho é subir");
      console.error("  MIN_PARTIDO (hoje " + MIN_PARTIDO + ") — some legenda pequena, não legenda grande.\n");
      process.exit(1);
    }
    console.log("imagens renderizadas com " + via + ", sem transbordo.");
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
