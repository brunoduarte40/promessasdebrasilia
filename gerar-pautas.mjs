#!/usr/bin/env node
/**
 * gerar-pautas.mjs — promessasdebrasilia
 *
 *   node gerar-pautas.mjs            todas as pautas
 *   node gerar-pautas.mjs saude      só uma
 *
 * Um carrossel por pauta. Cada carrossel traz TODAS as propostas daquela
 * pauta, de todas as candidaturas que publicaram, em ordem alfabética.
 *
 * ── por que todas, e não uma seleção ──────────────────────────────────────
 *
 * Educação tem 48 propostas. A tentação é escolher as oito melhores e fazer
 * um card bonito. No instante em que existe um critério nosso de "melhor", a
 * primeira pergunta que chega é "por que a dele entrou e a minha não?" — e
 * não existe resposta boa para essa pergunta.
 *
 * Publicar todas custa mais cards e resolve isso de vez: não há o que
 * contestar numa lista que não exclui ninguém. O Instagram aceita 20 no
 * carrossel e a maior pauta cabe em 13.
 *
 * ── a capa ────────────────────────────────────────────────────────────────
 *
 * A capa cita UMA proposta sem dizer de quem, e o card 2 revela. A curiosidade
 * é sobre a proposta, não sobre a pessoa: o enigma dura um card e a resposta
 * vem antes de qualquer outra coisa.
 *
 * Qual proposta vai para a capa é decidido por regra, não por gosto: A MAIS
 * CURTA QUE TRAZ UM NÚMERO. Número é o que torna uma promessa conferível — 60%
 * das emendas, 200 dias letivos, R$ 600 de auxílio —, e curta é o que cabe
 * numa capa. As duas condições são mecânicas, então a escolha da capa é tão
 * auditável quanto o resto da página. Se nenhuma proposta da pauta tiver
 * número, cai para a mais curta.
 *
 * ── a ordem ───────────────────────────────────────────────────────────────
 *
 * Alfabética pelo nome de urna. Ordenar por número de urna parecia mais
 * neutro, mas número de urna começa pelo número do partido — ordenar por ele
 * agruparia por legenda e daria às siglas de número baixo a primeira tela em
 * todas as pautas. Alfabética não tem esse viés.
 */

import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import {
  C, MONO, CORTE, MARGEM, amb, CSS_AMBIENTE,
  MEDIR_TRANSBORDO, MEDIR_ZONA_SEGURA, relatarProblemas,
  carregarChromium, abrirNavegador,
} from "./ambiente.mjs";

const SITE   = "https://brunoduarte40.github.io/promessasdebrasilia/";
const SITE_C = "brunoduarte40.github.io/promessasdebrasilia";
const PERFIL = "@promessasdebrasilia";
const AUTOR  = "Bruno Duarte";
const SAIDA  = "pautas";
const ARQ    = "questionario.json";

/* Quantas propostas por card de lista. Cinco cabem com folga; o ajuste no
   navegador aperta se alguma vier comprida. */
const POR_CARD = 7;
/* O Instagram aceita 20 imagens por carrossel. Se uma pauta passar disso, é
   melhor o script parar do que gerar um carrossel que não sobe inteiro. */
const MAX_CARROSSEL = 20;

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
               "agosto", "setembro", "outubro", "novembro", "dezembro"];
function porExtenso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  return m ? Number(m[3]) + " de " + MESES[Number(m[2]) - 1] : String(iso || "");
}

const EIXOS = {
  saude: "saúde", economia: "economia", gestao: "gestão", mobilidade: "mobilidade",
  seguranca: "segurança", social: "social", cultura_esporte: "cultura e esporte",
  meio_ambiente: "meio ambiente", educacao: "educação", moradia: "moradia",
};
const CARGO_CURTO = { federal: "federal", distrital: "distrital" };

const slug = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* ── 1. a base ─────────────────────────────────────────────────────────── */
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
const URNA = win.DEPUTADOS.candidatos.filter((c) => c.na_urna);

if (!existsSync(ARQ)) {
  console.error(ARQ + " não existe. Rode o gerar-placar.mjs uma vez primeiro.");
  process.exit(1);
}
const reg = (JSON.parse(await readFile(ARQ, "utf8")).registro) || {};
if (!reg.visitamos) {
  console.error("questionario.json: 'registro.visitamos' está vazio. Sem ela não gero nada.");
  process.exit(1);
}
const VISITA = porExtenso(reg.visitamos);

/* ── as fotos de capa ──────────────────────────────────────────────────────
 *
 * Opcional. Se existir pautas-fotos/fotos.json, a capa daquela pauta vira a
 * foto em vez do fundo de céu. Sem o arquivo, tudo segue como está — foto em
 * algumas pautas e texto em outras convivem bem; o que não pode é foto em
 * metade dos cards do MESMO carrossel.
 *
 * As fotos têm de ser SUAS. Street View é do Google e republicar viola os
 * termos; banco de imagens custa e vem com moldura embutida; foto de jornal é
 * de alguém e carrega o ângulo de quem publicou. Numa página cujo contrato é
 * "todo elemento tem fonte", a foto seria o único item da tela que ninguém
 * pode conferir.
 *
 * E por isso 'local' e 'data' são OBRIGATÓRIOS: a foto afirma alguma coisa
 * sobre um lugar num momento, e afirmação sem data aqui não entra. Se a rua
 * foi asfaltada depois, a legenda datada protege você; "foto da Rua 14" sem
 * data, não.
 *
 * Formato de pautas-fotos/fotos.json:
 *   {
 *     "saude": {
 *       "arquivo": "saude.jpg",
 *       "local": "Rua 25 com a Rua Babaçu, Águas Claras",
 *       "data": "2026-09-17",
 *       "proposta": "Unidade Básica de Saúde na Rua 25"
 *     }
 *   }
 *
 * 'proposta' é opcional e serve para casar a foto com a proposta certa: é um
 * trecho que tem de bater com EXATAMENTE uma proposta daquela pauta. Bateu em
 * zero ou em duas, o script para — fotografar uma esquina e legendar com a
 * proposta de outra pessoa seria o pior erro possível aqui. */
const PASTA_FOTOS = "pautas-fotos";
const FOTOS = new Map();
if (existsSync(PASTA_FOTOS + "/fotos.json")) {
  const cru = JSON.parse(await readFile(PASTA_FOTOS + "/fotos.json", "utf8"));
  for (const [eixo, f] of Object.entries(cru)) {
    if (!f || !f.arquivo) continue;
    const caminho = PASTA_FOTOS + "/" + f.arquivo;
    if (!existsSync(caminho)) {
      console.error("fotos.json aponta para " + caminho + ", que não existe.");
      process.exit(1);
    }
    if (!f.local || !f.data) {
      console.error("fotos.json: a foto de \"" + eixo + "\" está sem 'local' ou sem 'data'.");
      console.error("Os dois são obrigatórios — foto é afirmação sobre um lugar num momento,");
      console.error("e sem a data você não tem como se defender se o lugar mudou depois.");
      process.exit(1);
    }
    const bytes = await readFile(caminho);
    if (bytes.length > 8 * 1024 * 1024) {
      console.warn("AVISO: " + caminho + " tem " + (bytes.length / 1048576).toFixed(1)
        + " MB. Vai funcionar, mas reduza para o script rodar mais rápido.\n");
    }
    const ext = (f.arquivo.split(".").pop() || "jpg").toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    FOTOS.set(eixo, {
      dataUri: "data:" + mime + ";base64," + bytes.toString("base64"),
      local: f.local, data: f.data, proposta: f.proposta || "",
    });
  }
}

/* ── 2. agrupar por pauta ──────────────────────────────────────────────── */
/* Cada proposta carrega a candidatura junto, porque o card mostra as duas
   coisas e separá-las seria a forma mais fácil de trocar a autoria de alguém. */
const PAUTAS = new Map();
for (const c of URNA) {
  const ps = (c.site_lido && c.site_lido.propostas) || [];
  for (const p of ps) {
    if (!PAUTAS.has(p.eixo)) PAUTAS.set(p.eixo, []);
    PAUTAS.get(p.eixo).push({
      texto: p.texto, nome: c.nome, numero: c.numero, partido: c.partido,
      cargo: c.cargo, url: (c.site_lido.url || ""), data: c.site_lido.data || reg.visitamos,
    });
  }
}
for (const lista of PAUTAS.values()) {
  lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")
    || String(a.numero).localeCompare(String(b.numero)));
}

const pedido = process.argv[2];
if (pedido && !PAUTAS.has(pedido)) {
  console.error("não conheço a pauta \"" + pedido + "\". As que existem na base:");
  console.error("  " + [...PAUTAS.keys()].join(", "));
  process.exit(1);
}
const ALVOS = pedido ? [pedido] : [...PAUTAS.keys()];

/* ── 3. o CSS ──────────────────────────────────────────────────────────── */
const CSS = CSS_AMBIENTE + `
/* a capa: a proposta é o elemento inteiro, sem nome em lugar nenhum */
.aspas{font-size:170px;line-height:.6;font-weight:800;color:${C.verdeClaro};
  opacity:.55;height:92px}
.citacao{font-size:62px;line-height:1.2;font-weight:600;letter-spacing:-.02em;
  max-width:19ch}
.citacao.media{font-size:54px}
.citacao.curta{font-size:46px}
.pergunta{font-size:38px;line-height:1.3;font-weight:600;color:${C.verdeClaro};
  margin-top:40px}
.contexto{font-size:29px;line-height:1.35;color:${C.claro2};margin-top:20px;max-width:28ch}

/* ── a capa com foto ──────────────────────────────────────────────────────
   A foto sangra o card inteiro. O véu é escuro embaixo e quase transparente
   em cima: sem ele o texto branco cai em cima de céu claro e some, e com ele
   uniforme a foto vira papel de parede cinza. */
.foto{position:absolute;inset:0;background-size:cover;background-position:center;
  z-index:0}
.foto-veu{position:absolute;inset:0;z-index:1;background:
  linear-gradient(180deg, rgba(5,10,14,.38) 0%, rgba(5,10,14,.62) 38%,
  rgba(5,10,14,.84) 72%, rgba(6,20,17,.93) 100%)}
.comfoto .citacao{text-shadow:0 2px 26px rgba(0,0,0,.6)}
.credito{font-family:${MONO};font-size:19px;line-height:1.4;color:rgba(220,230,236,.62);
  margin-bottom:18px;max-width:52ch}

/* a revelação */
.quem{font-size:64px;line-height:1.08;font-weight:800;letter-spacing:-.03em;
  text-transform:uppercase;margin-top:26px}
.quem.longo{font-size:52px}
.ident{font-family:${MONO};font-size:25px;letter-spacing:.06em;color:${C.ink2};
  margin-top:16px}
.numeros{display:flex;gap:0;margin-top:40px;padding-top:32px;
  border-top:3px solid ${C.verde}}
.numeros > div{flex:1;border-left:1px solid ${C.linha};padding-left:22px}
.numeros > div:first-child{border-left:0;padding-left:0}
.nm-n{font-family:${MONO};font-size:56px;font-weight:700;line-height:1;
  color:${C.verde};font-variant-numeric:tabular-nums}
.nm-t{font-size:22px;line-height:1.3;color:${C.ink2};margin-top:12px;max-width:13ch}

/* a lista */
.itens{display:flex;flex-direction:column;gap:26px}
.item{display:block;border-left:3px solid ${C.verdeSuave};padding-left:22px}
.it-q{font-family:${MONO};font-size:18px;letter-spacing:.08em;color:${C.verde};
  font-weight:600;text-transform:uppercase}
.it-t{font-size:26px;line-height:1.34;margin-top:8px}
.itens.compacta{gap:19px}
.itens.compacta .it-t{font-size:23px;line-height:1.3}
.itens.mini{gap:14px}
.itens.mini .it-q{font-size:16px}
.itens.mini .it-t{font-size:21px;line-height:1.28;margin-top:6px}

.titulo{font-size:58px;line-height:1.1;font-weight:700;letter-spacing:-.025em}
.sub{font-size:27px;line-height:1.45;color:${C.ink2};margin-top:20px;max-width:40ch}
.nota{font-size:22px;line-height:1.45;color:${C.ink3};margin-top:26px;max-width:44ch}
.escopo{font-size:21px;line-height:1.45;color:${C.ink3};margin-top:24px;
  border-left:3px solid ${C.linha};padding-left:18px;max-width:46ch}
.caixa{background:${C.verdeSuave};border-left:8px solid ${C.verde};padding:34px 38px;
  margin-top:auto}
.caixa p{font-size:29px;line-height:1.4;font-weight:600;color:${C.verdeEsc}}
.caixa span{display:block;font-family:${MONO};font-size:27px;margin-top:14px;
  color:${C.ink};font-weight:600;white-space:nowrap}
`;

const rodape = '<div class="rodape"><span>' + esc(PERFIL) + '</span>'
  + '<span>' + esc(SITE_C) + '</span></div>';

/* ── 4. montar um carrossel ────────────────────────────────────────────── */
function montar(eixo) {
  const todas = PAUTAS.get(eixo);
  const rotulo = EIXOS[eixo] || eixo;

  const foto = FOTOS.get(eixo) || null;

  /* a capa: a mais curta COM número; sem nenhuma com número, a mais curta.
     Se a foto disser a qual proposta pertence, é essa — e ela tem de bater com
     exatamente uma, senão o script para. */
  let capa;
  if (foto && foto.proposta) {
    const alvo = todas.filter((p) =>
      p.texto.toLowerCase().includes(foto.proposta.toLowerCase()));
    if (alvo.length !== 1) {
      console.error("\n  ✕ fotos.json: em \"" + eixo + "\", o trecho \"" + foto.proposta
        + "\" bateu em " + alvo.length + " propostas.");
      console.error("  Tem de bater em exatamente uma. Fotografar uma esquina e legendar com");
      console.error("  a proposta de outra pessoa é o pior erro que este script pode cometer.");
      if (alvo.length > 1) for (const a of alvo) console.error("      · " + a.texto);
      process.exit(1);
    }
    capa = alvo[0];
  } else {
    const comNumero = todas.filter((p) => /\d/.test(p.texto));
    const pool = comNumero.length ? comNumero : todas;
    capa = pool.slice().sort((a, b) => a.texto.length - b.texto.length)[0];
  }
  /* ela já aparece no card 2, então sai da lista para não contar duas vezes */
  const resto = todas.filter((p) => p !== capa);

  const candidaturas = new Set(todas.map((p) => p.numero)).size;
  const partidos = new Set(todas.map((p) => p.partido)).size;

  const paginas = [];
  for (let i = 0; i < resto.length; i += POR_CARD) paginas.push(resto.slice(i, i + POR_CARD));
  const total = 2 + paginas.length + 1;   /* capa + revelação + lista + fecho */

  const cls = capa.texto.length > 88 ? " curta" : capa.texto.length > 62 ? " media" : "";
  const nomeLongo = capa.nome.length > 17 ? " longo" : "";
  const cards = [];

  /* 1 — a capa. Com foto, a foto sangra o card inteiro e o ambiente desenhado
     sai de cena: céu falso por cima de céu de verdade fica sujo. O que fica é
     o véu escuro, que é o que garante o contraste do texto. */
  cards.push('<div class="card escuro' + (foto ? " comfoto" : "") + '" id="p0">'
    /* As camadas da foto entram DENTRO de .amb. Não é arrumação: o seletor
       `.card > *:not(.amb):not(.reg)` do ambiente.mjs sobrescreveria o
       position:absolute delas e a foto viraria um item do flex. Foi esse
       mesmo seletor que derrubou o índice do placar semana passada. */
    + (foto
        ? '<div class="amb">'
          + '<div class="foto" style="background-image:url(' + foto.dataUri + ')"></div>'
          + '<div class="foto-veu"></div></div>'
          + '<div class="reg"><span class="idx">01 / '
          + String(total).padStart(2, "0") + '</span><span class="cruz">+</span></div>'
        : amb("escuro", 1, total))
    + '<div class="selo">' + esc(rotulo) + ' · uma das ' + todas.length + '</div>'
    + '<div class="cresce" style="display:flex;flex-direction:column;justify-content:center">'
      + '<div class="aspas">&ldquo;</div>'
      + '<div class="citacao' + cls + '">' + esc(capa.texto) + '</div>'
      + '<div class="pergunta">De quem é?</div>'
      + '<div class="contexto">Uma das ' + todas.length + ' propostas de ' + esc(rotulo)
        + ' que eu encontrei nas candidaturas a deputado do DF. A resposta é o próximo card.</div>'
    + '</div>'
    /* A legenda da foto diz lugar e data e mais nada. Não diz que o lugar está
       ruim, não diz que a proposta faz falta — isso seria afirmação não
       apurada, e é o que separa registro de peça de campanha. */
    + (foto ? '<div class="credito">' + esc(foto.local) + ' · foto minha, '
        + esc(porExtenso(foto.data)) + '</div>' : "")
    + rodape + '</div>');

  /* 2 — a revelação */
  cards.push('<div class="card claro" id="p1">'
    + amb("claro", 2, total)
    + '<div class="selo">é de quem</div>'
    + '<div class="quem' + nomeLongo + '">' + esc(capa.nome) + '</div>'
    + '<div class="ident">' + esc(capa.partido) + ' · ' + esc(capa.numero)
      + ' · candidato a deputado ' + esc(CARGO_CURTO[capa.cargo] || capa.cargo) + '</div>'
    + '<div class="numeros">'
      + '<div><div class="nm-n">' + todas.length + '</div>'
        + '<div class="nm-t">propostas de ' + esc(rotulo) + '</div></div>'
      + '<div><div class="nm-n">' + candidaturas + '</div>'
        + '<div class="nm-t">candidaturas</div></div>'
      + '<div><div class="nm-n">' + partidos + '</div>'
        + '<div class="nm-t">partidos diferentes</div></div>'
    + '</div>'
    + '<div class="cresce"></div>'
    /* A frase muda conforme o critério que escolheu a capa. Com foto, a capa
       deixa de ser "a mais curta com número" e vira "a que eu fui fotografar"
       — e dizer o contrário seria uma mentira pequena no card que existe
       justamente para provar que não há escolha escondida. */
    + '<div class="nota">Vêm todas a seguir, em ordem alfabética. Nenhuma ficou de fora. '
      + (foto
          ? 'A desta capa foi a que eu fui até o lugar fotografar.'
          : 'E nenhuma foi escolhida por mim — a desta capa é só a mais curta que traz um número.')
      + '</div>'
    + '<div class="escopo">Cada proposta está como a candidatura escreveu, no canal que '
      + 'ela mesma declarou ao TSE, lido em ' + esc(VISITA) + '. Sem resumo e sem interpretação.</div>'
    + '<div style="height:24px"></div>' + rodape + '</div>');

  /* 3..N — a lista */
  paginas.forEach((pagina, k) => {
    cards.push('<div class="card claro" id="p' + (k + 2) + '">'
      + amb("claro", k + 3, total)
      + '<div class="selo" style="margin-bottom:34px">' + esc(rotulo)
        + ' · ' + (k + 1) + ' de ' + paginas.length + '</div>'
      + '<div class="cresce" style="overflow:hidden">'
        + '<div class="itens">'
        + pagina.map((p) => '<div class="item">'
            + '<div class="it-q">' + esc(p.nome) + ' · ' + esc(p.numero) + ' · '
              + esc(p.partido) + '</div>'
            + '<div class="it-t">' + esc(p.texto) + '</div></div>').join("")
        + '</div>'
      + '</div>'
      + '<div style="height:26px"></div>' + rodape + '</div>');
  });

  /* N+1 — o fecho */
  cards.push('<div class="card claro" id="p' + (paginas.length + 2) + '">'
    + amb("claro", total, total)
    + '<div class="selo" style="margin-bottom:34px">e as que faltam</div>'
    + '<div class="titulo">Faltou a sua<br>proposta aqui?</div>'
    + '<div class="sub">Se você é candidata ou candidato e não apareceu nesta lista, é porque '
      + 'eu não encontrei proposta de ' + esc(rotulo) + ' no canal que você declarou ao TSE. '
      + 'Manda a sua: publico inteira, com a sua fonte, no mesmo dia.</div>'
    + '<div class="cresce"></div>'
    + '<div class="caixa"><p>As propostas de todas as candidaturas do DF:</p>'
      + '<span>' + esc(SITE_C) + '</span></div>'
    + '<div class="nota" style="margin-top:22px">Achou um erro? Manda com a fonte — a correção '
      + 'sai no mesmo dia, com a data à vista.</div>'
    + '<div style="height:26px"></div>'
    + '<div class="rodape"><span>' + esc(PERFIL) + '</span>'
      + '<span>por ' + esc(AUTOR) + ' · pessoa física</span></div>'
    + '</div>');

  /* A legenda repete a capa de propósito: quem vê o post no feed lê a legenda
     antes de deslizar, e a citação é o que prende. */
  const legenda = [
    '"' + capa.texto + '"',
    "",
    "É do " + capa.nome + ", " + capa.numero + ", " + capa.partido + ".",
    "",
    "E é uma das " + todas.length + " propostas de " + rotulo + " que eu encontrei nas "
      + "candidaturas a deputado do DF. As outras " + resto.length + " estão no carrossel. Todas.",
    "",
    candidaturas + " candidaturas, " + partidos + " partidos diferentes, em ordem alfabética. "
      + (foto
          ? "Nenhuma ficou de fora. A da capa é a que eu fui até o lugar fotografar — a foto é "
            + "minha, tirada em " + porExtenso(foto.data) + " em " + foto.local + "."
          : "Não escolhi nenhuma: a da capa é só a mais curta que traz um número."),
    "",
    "Como eu achei: fui ao canal que cada candidatura declarou ao próprio TSE e li o que estava "
      + "publicado em " + VISITA + ". Copiei como estava escrito, sem resumir e sem interpretar.",
    "",
    "Se você é candidata ou candidato e não está aqui, é porque eu não encontrei proposta de "
      + rotulo + " no canal que você declarou. Manda a sua e eu publico inteira, com a sua fonte, "
      + "no mesmo dia.",
    "",
    "As propostas de todas as candidaturas do DF — governo, Senado e deputado:",
    SITE,
    "",
    "Eleições 2026, Distrito Federal, Brasília. Página independente, feita por " + AUTOR + ", "
      + "pessoa física. Sem vínculo com candidatura, partido, coligação ou governo. Sem "
      + "financiamento e sem impulsionamento.",
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");

  return { cards, total, legenda, todas, resto, candidaturas, partidos, capa, rotulo };
}

/* ── 5. gerar ──────────────────────────────────────────────────────────── */
const montados = ALVOS.map((e) => ({ eixo: e, ...montar(e) }));

const grandes = montados.filter((m) => m.total > MAX_CARROSSEL);
if (grandes.length) {
  console.error("\n  ✕ CARROSSEL GRANDE DEMAIS — o Instagram aceita " + MAX_CARROSSEL + ":");
  for (const m of grandes) {
    console.error("      " + m.eixo + ": " + m.total + " cards ("
      + m.todas.length + " propostas a " + POR_CARD + " por card)");
  }
  console.error("\n  Suba o POR_CARD (hoje " + POR_CARD + ") — apertar o card é melhor do que");
  console.error("  partir a pauta em dois posts, porque \"todas\" deixa de ser verdade.\n");
  process.exit(1);
}

if (existsSync(SAIDA)) await rm(SAIDA, { recursive: true });
await mkdir(SAIDA, { recursive: true });

/* ── a lista de locação ────────────────────────────────────────────────────
 * Quais propostas nomeiam um lugar que existe e dá para fotografar. Sai em
 * markdown para caber no celular na hora de sair de casa.
 *
 * A precisão importa e por isso está separada em dois níveis: rua e quadra
 * dão uma foto; nome de região administrativa inteira, não — "Ceilândia" não
 * é uma esquina, e fotografar "a Ceilândia" produz uma imagem que ilustra
 * qualquer coisa, que é exatamente o tipo de foto genérica que a gente
 * decidiu não usar. */
/* Sem a flag /i e exigindo o que vem DEPOIS. "Rua" sozinho casava com
   "pessoas em situação de rua" e, pior, com "Consultório na Rua", que é nome
   de programa federal e não um endereço — a lista mandava o Bruno fotografar
   uma rua que não existe. Um logradouro de verdade é sempre seguido de número
   ou de nome próprio: Rua 25, Rua Babaçu, Estrada do Sol. */
const RUA = new RegExp(
  "\\b(?:Rua|Avenida|Av\\.|Quadra|Estrada|Trecho)\\s+(?:d[oae]s?\\s+)?(?:\\d|[A-ZÁÂÃÉÊÍÓÔÕÚÇ])"
  + "|\\b(?:QN[A-Z]|QS[A-Z]|QE\\s*\\d+|QI\\s*\\d+|EQ[A-Z]{2}|SHIS|SQN|SQS|CLN|CLS|DF-\\d+)\\b"
  + "|\\b(?:Pistão|Eixão|Saída Norte|Saída Sul)\\b");
/* Equipamento com nome próprio — "Cine Itapuã", "Escola de Música de Brasília".
   "hospital ginecológico" em minúscula e sem região não é lugar, é categoria. */
const LUGAR = new RegExp(
  "\\b(?:Hospital|Escola|Cine|Teatro|Parque|Rodoviária|Metrô|Terminal|Museu|Estádio"
  + "|Ginásio|Praça|Feira|Mercado|Centro|Núcleo Rural)\\s+(?:d[oae]s?\\s+)?[A-ZÁÂÃÉÊÍÓÔÕÚÇ]");
const RAS = ["Ceilândia", "Taguatinga", "Samambaia", "Planaltina", "Águas Claras",
  "Recanto das Emas", "Gama", "Guará", "Santa Maria", "Sobradinho", "São Sebastião",
  "Vicente Pires", "Paranoá", "Riacho Fundo", "Brazlândia", "Sudoeste", "Octogonal",
  "Lago Sul", "Lago Norte", "Itapoã", "Jardim Botânico", "Estrutural", "Sol Nascente",
  "Pôr do Sol", "Cruzeiro", "Candangolândia", "Núcleo Bandeirante", "Varjão",
  "Park Way", "Arniqueira", "Plano Piloto", "Asa Norte", "Asa Sul"];

const linhasLoc = [
  "# Lista de locação — capas de pauta",
  "",
  "Propostas que nomeiam um lugar fotografável, por pauta.",
  "",
  "Regras que valem na hora de fotografar, e que não são frescura:",
  "",
  "- **A foto é sua.** Street View é do Google e republicar viola os termos.",
  "- **Luz do dia, enquadramento reto.** Foto da esquina é registro; foto composta",
  "  em cima do lixo é editorial, e aí a página virou o que promete não ser.",
  "- **Anote o dia.** A legenda sai com lugar e data. Se asfaltarem a rua depois,",
  "  a data protege você; \"foto da Rua 14\" sem data, não.",
  "- **Não fotografe pessoa identificável.** Não é só imagem de terceiro: é gente",
  "  que não escolheu aparecer num post sobre eleição.",
  "",
  "Gerado por `gerar-pautas.mjs`. Para usar uma foto, veja o bloco",
  "\"as fotos de capa\" no script.",
  "",
];
let nLoc = 0;
for (const [eixo, lista] of PAUTAS) {
  const rotulo = EIXOS[eixo] || eixo;
  const marcadas = lista.map((p) => {
    const ra = RAS.filter((r) => p.texto.toLowerCase().includes(r.toLowerCase()));
    /* nível 1 = endereço; 2 = equipamento com nome, ou equipamento genérico
       numa região administrativa nomeada — "a nova rodoviária de Taguatinga"
       é fotografável mesmo em minúscula, porque a região resolve o lugar.
       Nível 3 = só o nome da RA: "Ceilândia" não é uma esquina, e fotografar
       "a Ceilândia" dá uma imagem que ilustra qualquer coisa. Fica de fora. */
    const generico = /\b(hospital|escola|creche|posto|rodoviária|parque|praça|quadra|viaduto|passarela|terminal|delegacia|biblioteca|ginásio)\b/i;
    const nivel = RUA.test(p.texto) ? 1
      : (LUGAR.test(p.texto) || (ra.length && generico.test(p.texto))) ? 2
      : ra.length ? 3 : 0;
    return { ...p, ra, nivel };
  }).filter((p) => p.nivel === 1 || p.nivel === 2)
    .sort((a, b) => a.nivel - b.nivel || a.texto.length - b.texto.length);
  if (!marcadas.length) continue;
  linhasLoc.push("## " + rotulo + "  (" + marcadas.length + ")", "");
  for (const p of marcadas) {
    nLoc++;
    linhasLoc.push("- " + (p.nivel === 1 ? "**endereço** — " : "lugar com nome — ")
      + p.texto);
    linhasLoc.push("  <br>`" + p.nome + " · " + p.numero + " · " + p.partido + "`"
      + (p.ra.length ? "  ·  " + p.ra.join(", ") : ""));
  }
  linhasLoc.push("");
}
await writeFile(SAIDA + "/locacoes.md", linhasLoc.join("\n") + "\n");

const HTML = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
  + '<title>pautas — promessas de Brasília</title><style>' + CSS + '</style></head><body>'
  /* Cada pauta vira uma página só; renderizo uma de cada vez para os ids não
     colidirem entre carrosséis. */
  + '</body></html>';

const { chromium, erros: errosImport } = await carregarChromium();
if (!chromium) {
  console.log("Não consegui carregar o Playwright.\n" + errosImport.join("\n"));
  process.exit(1);
}
const { nav, via, erros } = await abrirNavegador(chromium);
if (!nav) {
  console.log("Não consegui abrir navegador nenhum.\n" + erros.join("\n"));
  process.exit(1);
}
const pagina = await nav.newPage({
  viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1,
});

let problemas = false;
const resumo = [];
for (const m of montados) {
  const pasta = SAIDA + "/" + slug(m.eixo);
  await mkdir(pasta, { recursive: true });
  const html = HTML.replace("</body>", m.cards.join("") + "</body>");
  await pagina.setContent(html, { waitUntil: "load" });
  await pagina.evaluate(() => document.fonts.ready);

  /* mesmo ajuste dos cards individuais: mede e desce a escada até caber */
  await pagina.evaluate(() => {
    for (const card of document.querySelectorAll(".card")) {
      const cresce = card.querySelector(".cresce");
      const itens = card.querySelector(".itens");
      if (!cresce || !itens) continue;
      const sobra = () => cresce.scrollHeight - cresce.clientHeight > 2;
      for (const t of ["compacta", "mini"]) {
        if (!sobra()) break;
        itens.className = "itens " + t;
      }
    }
  });

  const transbordos = await pagina.evaluate(MEDIR_TRANSBORDO);
  const cortados = await pagina.evaluate(MEDIR_ZONA_SEGURA);

  for (let i = 0; i < m.cards.length; i++) {
    const n = String(i + 1).padStart(2, "0");
    await pagina.locator("#p" + i).screenshot({ path: pasta + "/" + n + ".png" });
  }
  await writeFile(pasta + "/legenda.txt", m.legenda + "\n");

  if (relatarProblemas(transbordos, cortados)) {
    console.error("  ^ na pauta " + m.eixo + "\n");
    problemas = true;
  }
  resumo.push(m);
}
await nav.close();

if (problemas) {
  console.error("  NÃO POSTE as pautas marcadas acima antes de resolver.\n");
  process.exit(1);
}

console.log("carrosséis renderizados com " + via + ", sem transbordo e dentro da zona segura.");
console.log("");
for (const m of resumo) {
  console.log("  " + m.rotulo.padEnd(18) + String(m.total).padStart(2) + " cards · "
    + String(m.todas.length).padStart(2) + " propostas · "
    + String(m.candidaturas).padStart(2) + " candidaturas · "
    + String(m.partidos).padStart(2) + " partidos");
}
console.log("");
console.log("  " + SAIDA + "/<pauta>/ — as imagens numeradas na ordem de postagem e a legenda.");
console.log("  " + SAIDA + "/locacoes.md — " + nLoc + " propostas com lugar fotografável,");
console.log("  para você sair de casa com o roteiro na mão.");
if (FOTOS.size) {
  console.log("");
  console.log("  capas com foto: " + [...FOTOS.keys()].map((e) => EIXOS[e] || e).join(", "));
} else {
  console.log("  Nenhuma foto de capa configurada — todas as capas saíram em texto.");
}
