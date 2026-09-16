#!/usr/bin/env node
/**
 * gerar-cards.mjs — promessasdebrasilia
 *
 *   node gerar-cards.mjs
 *
 * Um card 1080×1350 por candidatura que PUBLICOU proposta. Hoje são 63.
 *
 * ── por que só os que publicaram ──────────────────────────────────────────
 *
 * A ideia que apareceu primeiro foi o contrário: um card por candidatura em
 * silêncio. Espalha mais, e por isso mesmo é a versão pior.
 *
 * O card do silêncio é uma peça que NÓS publicamos sobre alguém que não pediu.
 * Ele viaja por indignação, e cada compartilhamento aumenta a chance de um
 * assessor levar aquilo a um advogado. Nós carregamos o custo de distribuição
 * e o risco, os dois.
 *
 * Este card é uma peça que o PRÓPRIO CANDIDATO posta. Ele tem seguidor, tem
 * interesse em parecer transparente, e o card é bom para ele. A distribuição
 * sai de graça, feita por 63 pessoas com audiência, e nós não publicamos nada
 * sobre ninguém que não tenha publicado primeiro.
 *
 * O efeito sobre os 519 é o mesmo, e mais barato: quando um candidato posta o
 * card dele, os adversários da mesma legenda ficam com uma pergunta na
 * timeline que ninguém precisou fazer em voz alta. Pressão por contraste não
 * tem réu.
 *
 * ── as três regras que mantêm isto sendo registro, e não santinho ─────────
 *
 *   1. O HERÓI É O FATO, NÃO A PESSOA. O elemento maior do card é o número de
 *      propostas, não o nome nem o número de urna. Card com número de urna
 *      gigante é santinho, e aí a página deixou de ser isenta.
 *   2. SEM COR DE VEREDITO. Nada de verde para bom, vermelho para ruim, joia,
 *      selo de aprovado. Cor de julgamento transforma registro em nota.
 *   3. A RESSALVA NO PRÓPRIO CARD. "Não é apoio, recomendação nem avaliação
 *      do conteúdo." Sai impressa, não na legenda — legenda não viaja junto
 *      com print.
 *
 * As propostas saem NA ORDEM DO SITE, sem escolha editorial nenhuma. Qualquer
 * critério de "as melhores" seria nosso, e aí a página estaria opinando.
 */

import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { temProposta } from "./grupos.mjs";
import {
  C, MONO, CORTE, MARGEM, amb, CSS_AMBIENTE,
  MEDIR_TRANSBORDO, MEDIR_ZONA_SEGURA, relatarProblemas,
  carregarChromium, abrirNavegador,
} from "./ambiente.mjs";

const SITE_C = "brunoduarte40.github.io/promessasdebrasilia";
const PERFIL = "@promessasdebrasilia";
const SAIDA  = "cards";
const ARQ    = "questionario.json";

/* Quantas propostas cabem no card. Acima disso sai "+ N no site" — que é
   melhor do que cortar uma proposta no meio, porque proposta cortada muda de
   sentido e a página inteira existe para não mudar o sentido de ninguém. */
const MOSTRAR = 3;
/* O story mostra menos porque ele é visto em dois segundos e porque precisa
   sobrar espaço para o adesivo de menção. */
const MOSTRAR_STORY = 2;

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
               "agosto", "setembro", "outubro", "novembro", "dezembro"];
function porExtenso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  return m ? Number(m[3]) + " de " + MESES[Number(m[2]) - 1] : String(iso || "");
}

/* Os eixos vêm da base sem acento, porque são chave. Na tela viram palavra. */
const EIXOS = {
  saude: "saúde", economia: "economia", gestao: "gestão", mobilidade: "mobilidade",
  seguranca: "segurança", social: "social", cultura_esporte: "cultura e esporte",
  meio_ambiente: "meio ambiente", educacao: "educação", moradia: "moradia",
};
const CARGOS = { federal: "deputado federal", distrital: "deputado distrital" };

/* nome de arquivo previsível e sem acento, para não quebrar em nenhum sistema */
const slug = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

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
const COM = URNA.filter(temProposta);

if (!COM.length) {
  console.error("nenhuma candidatura com proposta na base. Nada a gerar.");
  process.exit(1);
}

/* ── 2. a data da conferência ──────────────────────────────────────────── */
/* A data sai do site_lido de cada candidatura, não do relógio: é o dia em que
   AQUELE endereço foi lido. Se um dia a base for atualizada em lotes, cada
   card carrega a sua própria data e continua verdadeiro. O questionario.json
   entra só como conferência de que as duas fontes concordam. */
if (!existsSync(ARQ)) {
  console.error(ARQ + " não existe. Rode o gerar-placar.mjs uma vez primeiro.");
  process.exit(1);
}
const reg = (JSON.parse(await readFile(ARQ, "utf8")).registro) || {};
if (!reg.visitamos) {
  console.error("questionario.json: 'registro.visitamos' está vazio. É a data que\n"
    + "autoriza dizer 'conferido em'. Sem ela não gero nada.");
  process.exit(1);
}
const datasBase = [...new Set(COM.map((c) => c.site_lido.data).filter(Boolean))];
const divergentes = datasBase.filter((d) => d !== reg.visitamos);
if (divergentes.length) {
  console.warn("AVISO: o questionario.json diz que visitamos em " + reg.visitamos
    + ", mas a base traz leitura em " + divergentes.join(", ") + ".");
  console.warn("Cada card usa a data da própria leitura. Confira se é isso mesmo.\n");
}

/* ── 3. o card ─────────────────────────────────────────────────────────── */
const CSS = CSS_AMBIENTE + `
.nome{font-size:58px;line-height:1.08;font-weight:800;letter-spacing:-.03em;
  margin-top:30px;text-transform:uppercase}
.ident{font-family:${MONO};font-size:24px;letter-spacing:.06em;color:${C.ink2};
  margin-top:16px}
/* O fato é o maior elemento do card. Se o maior elemento fosse o número de
   urna, isto seria material de campanha e a página perderia a isenção. */
.fato{display:flex;align-items:baseline;gap:22px;margin-top:34px;
  padding-top:28px;border-top:3px solid ${C.verde}}
.fato-n{font-family:${MONO};font-size:104px;line-height:.9;font-weight:700;
  color:${C.verde};font-variant-numeric:tabular-nums}
.fato-t{font-size:33px;line-height:1.22;font-weight:600;max-width:24ch}
.props{margin-top:34px;display:flex;flex-direction:column;gap:22px}
.prop{display:block}
.prop-e{font-family:${MONO};font-size:19px;letter-spacing:.12em;
  text-transform:uppercase;color:${C.verde};font-weight:600}
.prop-t{font-size:26px;line-height:1.35;margin-top:7px}
/* Os dois degraus de aperto. Quem decide qual usar não é um limiar de
   caracteres chutado aqui: é a medição no navegador, em ajustarCards(). */
.props.compacta{gap:17px}
.props.compacta .prop-t{font-size:23px;line-height:1.32}
.props.mini{gap:13px}
.props.mini .prop-e{font-size:17px}
.props.mini .prop-t{font-size:21px;line-height:1.3;margin-top:5px}
.mais{font-family:${MONO};font-size:21px;color:${C.ink3};margin-top:20px}
.mais:empty{display:none}
.fonte{font-family:${MONO};font-size:21px;line-height:1.5;color:${C.ink3};
  margin-top:26px;word-break:break-all}
.fonte b{color:${C.ink};font-weight:600}
/* A ressalva vai IMPRESSA no card, não na legenda: print viaja sozinho e
   legenda não vai junto. É ela que impede o card de ser lido como apoio. */
.escopo{font-size:20px;line-height:1.45;color:${C.ink3};margin-top:22px;
  border-left:3px solid ${C.linha};padding-left:18px;max-width:46ch}

/* ── a versão 9:16 ─────────────────────────────────────────────────────────
 * O story existe por um motivo mecânico, não estético: quando você MARCA uma
 * conta num story, o Instagram dá para ela um botão de "adicionar ao seu
 * story". Repost em um toque. Post de feed não tem isso — lá o candidato
 * precisa querer, aqui ele só precisa tocar.
 *
 * Por isso o story mostra MENOS: duas propostas em vez de três, tipografia
 * maior, e uma faixa livre embaixo. A faixa é onde o adesivo de menção vai
 * ficar. Sem ela, o adesivo cobre a fonte ou a ressalva — e aí some
 * justamente o que faz a peça ser registro. */
.story .nome{font-size:76px;margin-top:40px}
.story .ident{font-size:29px;margin-top:20px}
.story .fato{margin-top:46px;padding-top:36px}
.story .fato-n{font-size:132px}
.story .fato-t{font-size:41px;max-width:22ch}
.story .props{margin-top:46px;gap:32px}
.story .prop-e{font-size:23px}
.story .prop-t{font-size:33px;line-height:1.34;margin-top:9px}
.story .props.compacta{gap:24px}
.story .props.compacta .prop-t{font-size:29px}
.story .props.mini{gap:18px}
.story .props.mini .prop-t{font-size:26px}
.story .mais{font-size:26px;margin-top:26px}
.story .fonte{font-size:26px;margin-top:34px}
.story .escopo{font-size:25px;margin-top:30px;max-width:40ch}
/* 22px e não 25: o rodapé é mono e tem 63 caracteres entre o @ e o endereço.
   A 25px isso dá 965px numa caixa de 912 e estoura a largura — foi o que a
   trava pegou nos 63 stories de uma vez. */
.story .rodape{font-size:22px}
/* a faixa livre para o adesivo de menção */
.vaga{height:230px;flex:none}
`;

function card(c, i, story) {
  const props = c.site_lido.propostas;
  const vistas = props.slice(0, story ? MOSTRAR_STORY : MOSTRAR);
  const url = String(c.site_lido.url || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const data = porExtenso(c.site_lido.data || reg.visitamos);
  return '<div class="card ' + (story ? "story " : "") + 'claro" id="'
      + (story ? "s" : "c") + i + '">'
    + amb("claro", c.numero)
    + '<div class="selo">registro · ' + esc(data) + '</div>'
    + '<div class="nome">' + esc(c.nome) + '</div>'
    + '<div class="ident">' + esc(c.partido) + ' · ' + esc(c.numero) + ' · candidato a '
      + esc(CARGOS[c.cargo] || c.cargo) + '</div>'
    + '<div class="fato"><span class="fato-n">' + props.length + '</span>'
      + '<span class="fato-t">' + (props.length === 1 ? "proposta publicada" : "propostas publicadas")
      + ' no canal declarado ao TSE</span></div>'
    /* data-total é o que o ajuste no navegador usa para recontar o "+ N no
       site" quando precisa esconder uma proposta. Sem ele o card mentiria o
       resto, que é o pior jeito de economizar espaço. */
    + '<div class="cresce" style="overflow:hidden">'
      + '<div class="props" data-total="' + props.length + '">'
      + vistas.map((p) => '<div class="prop">'
          + '<div class="prop-e">' + esc(EIXOS[p.eixo] || p.eixo) + '</div>'
          + '<div class="prop-t">' + esc(p.texto) + '</div></div>').join("")
      + '</div>'
      + '<div class="mais"></div>'
    + '</div>'
    + '<div class="fonte">fonte: <b>' + esc(url) + '</b><br>conferido em ' + esc(data) + '</div>'
    + '<div class="escopo">Registro do que estava publicado naquele endereço naquele dia. '
      + 'Não é apoio, recomendação nem avaliação do conteúdo da proposta.</div>'
    + (story ? '<div class="vaga"></div>' : '<div style="height:24px"></div>')
    + '<div class="rodape"><span>' + esc(PERFIL) + '</span>'
      + '<span>' + esc(SITE_C) + '</span></div>'
    + '</div>';
}

const HTML = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
  + '<title>cards — promessas de Brasília</title><style>' + CSS + '</style></head>'
  + '<body>'
  + COM.map((c, i) => card(c, i, false)).join("")
  + COM.map((c, i) => card(c, i, true)).join("")
  + '</body></html>';

/* ── 4. gravar ─────────────────────────────────────────────────────────── */
if (existsSync(SAIDA)) await rm(SAIDA, { recursive: true });
await mkdir(SAIDA, { recursive: true });
await writeFile(SAIDA + "/cards.html", HTML);

/* Um índice para saber a quem mandar cada card. O @ sai da própria declaração
   ao TSE — não foi garimpado, não foi adivinhado. Quem não declarou Instagram
   fica com o campo vazio, e vazio é informação. */
const linhas = ["numero;nome;partido;cargo;propostas;arquivo;instagram"];
for (const c of COM) {
  const ig = (c.sites || []).find((s) => s.rede === "instagram");
  linhas.push([
    c.numero, c.nome, c.partido, CARGOS[c.cargo] || c.cargo,
    c.site_lido.propostas.length,
    c.numero + "-" + slug(c.nome) + ".png",
    ig ? ig.url : "",
  ].join(";"));
}
await writeFile(SAIDA + "/indice.csv", linhas.join("\n") + "\n");

/* ── 5. renderizar ─────────────────────────────────────────────────────── */
const { chromium, erros: errosImport } = await carregarChromium();
if (!chromium) {
  console.log("Não consegui carregar o Playwright — gerei só o HTML e o índice.");
  console.log(errosImport.join("\n"));
  console.log("\n" + SAIDA + "/cards.html abre no navegador com todos em tamanho real.");
  process.exit(0);
}
const { nav, via, erros } = await abrirNavegador(chromium);
if (!nav) {
  console.log("Não consegui abrir navegador nenhum. Gerei só o HTML.\n" + erros.join("\n"));
  process.exit(0);
}
const pagina = await nav.newPage({
  viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1,
});
await pagina.setContent(HTML, { waitUntil: "load" });
await pagina.evaluate(() => document.fonts.ready);

/* ── o ajuste ──────────────────────────────────────────────────────────────
 * São 63 cards com nome e proposta de tamanhos que ninguém controla. Escolher
 * um tamanho de fonte que sirva para todos significa escolher o pior caso e
 * deixar os outros 60 pequenos à toa.
 *
 * Então cada card mede a si mesmo e desce a escada até caber: tamanho cheio,
 * compacto, mini e, só se ainda não couber, esconde a última proposta — e
 * nesse caso RECONTA o "+ N no site", porque um card que esconde uma proposta
 * e não diz é um card que mente sobre a quantidade.
 *
 * Medir é melhor do que adivinhar por número de caracteres: caractere não é
 * pixel, "MMM" e "iii" não ocupam o mesmo, e a fonte na máquina do Bruno não é
 * a mesma que a do container onde eu testo. */
const ajustes = await pagina.evaluate(() => {
  const relato = [];
  for (const card of document.querySelectorAll(".card")) {
    const cresce = card.querySelector(".cresce");
    const props = card.querySelector(".props");
    const mais = card.querySelector(".mais");
    if (!cresce || !props) continue;
    const total = Number(props.dataset.total || 0);
    const sobra = () => cresce.scrollHeight - cresce.clientHeight > 2;

    const recontar = () => {
      const vis = [...props.children].filter((p) => p.style.display !== "none").length;
      const resto = total - vis;
      mais.textContent = resto > 0
        ? "+ " + resto + (resto === 1 ? " outra no site" : " outras no site") : "";
    };
    recontar();

    let passo = "cheio";
    for (const t of ["compacta", "mini"]) {
      if (!sobra()) break;
      props.className = "props " + t;
      passo = t;
    }
    let escondidas = 0;
    while (sobra()) {
      const vis = [...props.children].filter((p) => p.style.display !== "none");
      if (vis.length <= 1) break;              /* uma proposta sempre fica */
      vis[vis.length - 1].style.display = "none";
      escondidas++;
      recontar();
    }
    if (passo !== "cheio" || escondidas) {
      relato.push({ card: card.id, passo, escondidas });
    }
  }
  return relato;
});

const transbordos = await pagina.evaluate(MEDIR_TRANSBORDO);
const cortados = await pagina.evaluate(MEDIR_ZONA_SEGURA);

await mkdir(SAIDA + "/story", { recursive: true });
for (let i = 0; i < COM.length; i++) {
  const c = COM[i];
  const nome = c.numero + "-" + slug(c.nome) + ".png";
  await pagina.locator("#c" + i).screenshot({ path: SAIDA + "/" + nome });
  await pagina.locator("#s" + i).screenshot({ path: SAIDA + "/story/" + nome });
}
await nav.close();

/* Num lote de 63 o transbordo é quase certo em alguém: nome comprido, proposta
   comprida. Por isso a trava aponta o card por ID e o ID é o índice — e o
   índice.csv diz de quem é. Errar em um card e não saber qual é pior do que
   não gerar. */
if (relatarProblemas(transbordos, cortados)) {
  const quem = [...new Set([...transbordos, ...cortados].map((x) => x.card))]
    .map((id) => {
      const c = COM[Number(String(id).slice(1))];
      const onde = String(id).startsWith("s") ? " [story]" : " [feed]";
      return c ? id + onde + " = " + c.nome + " (" + c.numero + ")" : id;
    });
  console.error("  De quem são os cards com problema:");
  for (const q of quem) console.error("      " + q);
  console.error("\n  NÃO POSTE esses. Os outros estão bons.\n");
  process.exit(1);
}

console.log("cards renderizados com " + via + ", sem transbordo e dentro da zona segura.");
console.log("");
if (ajustes.length) {
  const apertados = ajustes.filter((a) => a.passo !== "cheio").length;
  const cortadas = ajustes.filter((a) => a.escondidas).length;
  console.log("  " + apertados + " cards precisaram apertar o texto para caber"
    + (cortadas ? ", e em " + cortadas + " uma proposta saiu do card" : "") + ".");
  if (cortadas) {
    console.log("  Nesses, o \"+ N no site\" foi recontado — o card não esconde a conta.");
  }
  console.log("");
}
console.log("  " + COM.length + " candidaturas com proposta publicada");
console.log("  " + COM.filter((c) => c.cargo === "federal").length + " a deputado federal · "
  + COM.filter((c) => c.cargo === "distrital").length + " a distrital");
console.log("  " + COM.filter((c) => (c.sites || []).some((s) => s.rede === "instagram")).length
  + " declararam Instagram ao TSE (estão no indice.csv)");
console.log("");
console.log("  " + SAIDA + "/ — " + COM.length + " imagens 4:5, cards.html e indice.csv");
console.log("  " + SAIDA + "/story/ — as mesmas " + COM.length + " em 9:16, com faixa livre");
console.log("  para o adesivo de menção. É o story marcado que dá ao candidato o botão");
console.log("  de repostar em um toque — post de feed não tem esse botão.");
