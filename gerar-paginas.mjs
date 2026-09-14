#!/usr/bin/env node
/**
 * gerar-paginas.mjs — promessasdebrasilia
 *
 *   node montar-site.mjs && node gerar-paginas.mjs
 *
 * Escreve uma página de verdade para cada uma das 626 candidaturas.
 *
 * Por que isto precisa existir: a plataforma já dá endereço próprio a cada
 * candidatura — #candidato/sardinha-33123 —, mas esse endereço só existe depois
 * que o JavaScript roda, e buscador não espera. Quem procura "Delegada Doutora
 * Jane" no Google não acha esta página. São 626 fichas prontas, invisíveis.
 *
 * O que sai daqui:
 *   docs/c/<apelido>/index.html   626 páginas estáticas, sem JavaScript nenhum
 *   docs/c/index.html             o índice, que é por onde o robô entra
 *   docs/c/ficha.css              a folha de estilo, uma só para todas
 *   docs/sitemap.xml              o mapa que o buscador lê
 *   docs/robots.txt               o ponteiro para o mapa
 *
 * Decisões que valem registrar:
 *
 * - Sem JavaScript. O conteúdo está escrito no HTML. É o que separa "indexável"
 *   de "tecnicamente acessível se o robô resolver executar scripts".
 *
 * - Retrato embutido como data URI. São ~2 KB por candidatura no pacote WebP do
 *   TSE — mais barato que uma requisição a mais, e a página abre inteira de
 *   primeira mesmo em rede ruim.
 *
 * - A prévia de link usa o og.png comum, mas o TÍTULO e a DESCRIÇÃO são de cada
 *   candidatura. É o que muda um link cru num grupo de WhatsApp para uma linha
 *   que diz de quem é a ficha.
 *
 * - Nada aqui é inferido. Cada campo sai do mesmo lugar que alimenta a
 *   plataforma; onde não havia fonte, a página diz que não havia.
 */

import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/* Tem de ser o mesmo endereço do envelope, senão o canonical de uma página
   aponta para um lugar e o da outra para outro, e o buscador escolhe sozinho. */
const DOMINIO = "https://brunoduarte40.github.io/promessasdebrasilia";

const envelope = await readFile("montar-site.mjs", "utf8");
const m = envelope.match(/const DOMINIO = "([^"]+)"/);
if (!m || m[1] !== DOMINIO) {
  console.error("DOMINIO não bate com montar-site.mjs:");
  console.error("  aqui:            " + DOMINIO);
  console.error("  montar-site.mjs: " + (m ? m[1] : "não encontrado"));
  process.exit(1);
}

/* ---- dados ---- */
global.window = {};
require("./docs/dados.js");
require("./docs/deputados.js");
require("./docs/noticias.js");
require("./docs/fotos.js");
require("./docs/fotos-deputados.js");

const D = window.DADOS;
const DEP = window.DEPUTADOS;
const NOT = window.NOTICIAS || { por_candidato: {} };
const FOTOS = window.FOTOS || {};
const FOTOS_DEP = window.FOTOS_DEP || {};

const EIXO = {};
D.eixos.forEach((e) => (EIXO[e.id] = e));

const CARGO = {
  governo: "governo do DF",
  senado: "senado",
  distrital: "deputado distrital",
  federal: "deputado federal",
};

/* O cargo escrito por extenso, para título e descrição. Separado do mapa acima
   porque lá "governo do DF" entra depois de "candidatura a", e aqui a frase
   inteira precisa ler bem sozinha na aba do navegador e no resultado do Google —
   "candidatura a governo do DF no DF" é o que sai se juntar os dois. */
const CARGO_FRASE = {
  governo:   "candidatura ao governo do DF",
  senado:    "candidatura ao Senado pelo DF",
  distrital: "candidatura a deputado distrital no DF",
  federal:   "candidatura a deputado federal pelo DF",
};

/* ---- utilidades, iguais às da plataforma ---- */
const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const slug = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const apelido = (c) => slug(c.nome) + "-" + c.numero;

const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency", currency: "BRL", maximumFractionDigits: 0,
});

const iniciais = (nome) => {
  const ignorar = ["de", "da", "do", "dos", "das", "e"];
  const p = String(nome).split(/\s+/).filter((x) => x && !ignorar.includes(x.toLowerCase()));
  return ((p[0] || "")[0] + (p.length > 1 ? (p[p.length - 1] || "")[0] : "")).toUpperCase();
};

/* ---- buscas na imprensa: mesma regra da plataforma, incluindo o recorte
       geográfico que impede "Sardinha" de devolver o peixe ---- */
const GEO = ' (Brasília OR "Distrito Federal")';
function buscaNoticias(formas, dominio) {
  const f = [].concat(formas).filter(Boolean);
  const alvo = f.length > 1
    ? "(" + f.map((x) => '"' + x + '"').join(" OR ") + ")"
    : '"' + f[0] + '"';
  return "https://news.google.com/search?q="
    + encodeURIComponent(alvo + GEO + (dominio ? " site:" + dominio : ""))
    + "&hl=pt-BR&gl=BR&ceid=BR:pt-419";
}

const fichaTSE = (id) =>
  "https://divulgacandcontas.tse.jus.br/divulga/#/candidato/2026/20322002026/DF/" + encodeURIComponent(id);

/* ---- o registro das 626, como a plataforma monta ---- */
const REGISTRO = [];
const poe = (cargo, c) => REGISTRO.push({ cargo, c, apelido: apelido(c) });
D.governo.forEach((c) => poe("governo", c));
D.senado.forEach((c) => poe("senado", c));
DEP.candidatos.forEach((c) => poe(c.cargo, c));

const vistos = new Set();
for (const r of REGISTRO) {
  if (vistos.has(r.apelido)) {
    console.error("colisão de apelido: " + r.apelido);
    process.exit(1);
  }
  vistos.add(r.apelido);
}

/* ================= a folha de estilo, uma só ================= */
const CSS = `:root{
  --ground:#F4F6F8; --surface:#FFFFFF; --surface-2:#EDF1F4;
  --ink:#141A20; --ink-2:#57646F; --ink-3:#626F7A;
  --line:#D6DDE3; --line-2:#C0CAD2;
  --accent:#0A7A45; --accent-ink:#075C34; --accent-soft:#E3F1E9;
  --warn:#A4670B; --warn-soft:#F7EDDC;
  --stop:#A83A38; --stop-soft:#F7E5E4;
  --sans:"Archivo",system-ui,-apple-system,"Segoe UI",sans-serif;
  --serif:"Source Serif 4",Georgia,"Times New Roman",serif;
  --mono:"IBM Plex Mono",ui-monospace,"SFMono-Regular",Menlo,monospace;
}
@media (prefers-color-scheme:dark){:root{
  --ground:#0E1318; --surface:#161D24; --surface-2:#1D262E;
  --ink:#E7EDF2; --ink-2:#9AA8B4; --ink-3:#8593A0;
  --line:#28323B; --line-2:#374450;
  --accent:#43BE81; --accent-ink:#7FD6A8; --accent-soft:#153025;
  --warn:#D9A24B; --warn-soft:#2D2517;
  --stop:#E07A77; --stop-soft:#2E1B1A;
}}
*{box-sizing:border-box}
body{background:var(--ground); color:var(--ink); font-family:var(--sans);
  font-size:16px; line-height:1.55; -webkit-font-smoothing:antialiased; margin:0}
.wrap{max-width:760px; margin:0 auto; padding-inline:20px; padding-block:0 60px}
a{color:var(--accent-ink)}
:focus-visible{outline:2px solid var(--accent); outline-offset:2px}

.topo-site{border-bottom:1px solid var(--line); background:var(--surface); margin-bottom:26px}
.topo-site .wrap{padding-block:14px; display:flex; flex-wrap:wrap; gap:8px 18px; align-items:baseline}
.topo-site a{font-weight:700; font-size:1.05rem; letter-spacing:-.02em; text-decoration:none; color:var(--ink)}
.topo-site a .b{color:var(--accent)}
.topo-site span{font-family:var(--mono); font-size:.66rem; letter-spacing:.06em; color:var(--ink-3)}

.cd-topo{display:flex; gap:18px; align-items:flex-start; flex-wrap:wrap}
.ava{flex:none; width:96px; height:125px; object-fit:cover; object-position:center top;
  background:var(--surface-2); border:1px solid var(--line)}
.ava-ph{display:grid; place-items:center; font-family:var(--mono); font-weight:600;
  font-size:1.6rem; color:var(--ink-3)}
.cd-id{flex:1 1 260px; min-width:0}
.cd-cargo{font-family:var(--mono); font-size:.63rem; letter-spacing:.12em;
  text-transform:uppercase; color:var(--ink-3); margin-bottom:5px}
h1{font-size:clamp(1.5rem,4.6vw,2.2rem); font-weight:650; letter-spacing:-.02em;
  line-height:1.08; margin:0 0 10px}
.cd-linha{display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; margin-bottom:8px}
.cd-partido{font-family:var(--mono); font-size:.76rem; letter-spacing:.05em; color:var(--ink-2)}
.num{display:inline-flex; gap:2px; vertical-align:middle}
.num span{font-family:var(--mono); font-size:.76rem; font-weight:600;
  background:var(--surface-2); border:1px solid var(--line);
  width:17px; height:22px; display:grid; place-items:center; color:var(--ink-2)}
.badge{display:inline-flex; align-items:center; gap:5px; font-family:var(--mono);
  font-size:.63rem; text-transform:uppercase; letter-spacing:.07em; padding:3px 7px;
  border:1px solid var(--line)}
.badge.warn{color:var(--warn); background:var(--warn-soft); border-color:transparent}
.badge.stop{color:var(--stop); background:var(--stop-soft); border-color:transparent}
.cd-colig{font-size:.82rem; color:var(--ink-3); line-height:1.45}
.cd-civil{font-size:.82rem; color:var(--ink-3); margin-top:4px}

.aviso{border:1px solid var(--stop); background:var(--stop-soft); padding:15px 17px;
  margin-top:22px; font-size:.9rem; line-height:1.55}
.aviso b{color:var(--ink)}

section{margin-top:34px}
h2{font-size:1.1rem; font-weight:650; letter-spacing:-.01em; margin:0 0 4px;
  padding-bottom:7px; border-bottom:1px solid var(--line)}
h2 i{font-style:normal; font-family:var(--mono); font-size:.62rem; letter-spacing:.08em;
  color:var(--ink-3); font-weight:400; margin-left:8px; text-transform:uppercase}
section > p{margin:12px 0 0; line-height:1.62}
.nota{font-size:.86rem; color:var(--ink-2); line-height:1.55}

.prop{border-left:3px solid var(--line-2); background:var(--surface);
  padding:13px 16px; margin-top:10px}
.prop-eixo{font-family:var(--mono); font-size:.6rem; letter-spacing:.1em;
  text-transform:uppercase; color:var(--ink-3); margin-bottom:5px}
.prop p{margin:0; font-size:.95rem; line-height:1.55}
.src{display:block; margin-top:7px; font-family:var(--mono); font-size:.68rem;
  color:var(--ink-3); letter-spacing:.01em}
.vazio{border:1px dashed var(--line-2); padding:15px 17px; margin-top:14px;
  font-size:.9rem; color:var(--ink-2); line-height:1.55}
.vazio b{color:var(--ink)}
.band{display:flex; flex-wrap:wrap; gap:7px; margin-top:12px}
.band span{font-size:.84rem; padding:6px 12px; background:var(--surface-2);
  border-left:2px solid var(--accent)}
.mandato{font-family:var(--mono); font-size:.68rem; letter-spacing:.05em;
  color:var(--accent-ink); background:var(--accent-soft); padding:4px 9px;
  display:inline-block; margin-top:12px}
.etiquetas{display:flex; flex-wrap:wrap; gap:6px; margin-top:8px}
.etiquetas span{display:inline-flex; align-items:center; gap:7px; font-size:.78rem;
  padding:5px 10px; background:var(--surface-2); border-left:2px solid var(--accent)}
.etiquetas span.ra{border-left-color:var(--ink-3)}
.etiquetas i{font-family:var(--mono); font-style:normal; font-size:.68rem; color:var(--ink-3)}
.rot{font-family:var(--mono); font-size:.62rem; text-transform:uppercase;
  letter-spacing:.1em; color:var(--ink-3); margin:16px 0 2px}
.grande{font-size:1.35rem; font-weight:650; letter-spacing:-.01em; margin:4px 0 0}
.grande i{font-style:normal; font-family:var(--mono); font-size:.7rem;
  font-weight:400; color:var(--ink-3)}

ul.noticias{list-style:none; margin:12px 0 0; padding:0;
  display:flex; flex-direction:column; gap:11px}
ul.noticias a{font-family:var(--serif); font-size:.92rem; line-height:1.35;
  color:var(--ink); text-decoration:none; border-bottom:1px solid var(--line-2)}
ul.noticias a:hover{color:var(--accent-ink); border-bottom-color:var(--accent)}
ul.noticias em{display:block; font-style:normal; font-family:var(--mono);
  font-size:.64rem; letter-spacing:.05em; color:var(--ink-3); margin-top:3px}

.links{display:flex; flex-wrap:wrap; gap:7px; margin-top:12px}
.links a{font-family:var(--mono); font-size:.68rem; letter-spacing:.04em;
  color:var(--ink-2); text-decoration:none; border:1px solid var(--line);
  padding:9px 12px; min-height:44px; display:inline-flex; align-items:center}
.links a:hover{border-color:var(--accent); color:var(--accent-ink)}

.rodape{margin-top:44px; padding-top:18px; border-top:1px solid var(--line);
  font-size:.82rem; color:var(--ink-3); line-height:1.6}
.voltar{display:inline-flex; align-items:center; min-height:44px;
  font-family:var(--mono); font-size:.7rem; letter-spacing:.05em; margin-top:10px}

/* índice */
.indice{columns:2; column-gap:26px}
@media (max-width:640px){ .indice{columns:1} }
.indice a{display:block; padding:9px 0; border-bottom:1px solid var(--line);
  text-decoration:none; color:var(--ink); break-inside:avoid; font-size:.92rem}
.indice a:hover{color:var(--accent-ink)}
.indice a em{font-style:normal; font-family:var(--mono); font-size:.66rem;
  color:var(--ink-3); margin-left:6px}
.grupo{font-family:var(--mono); font-size:.66rem; text-transform:uppercase;
  letter-spacing:.1em; color:var(--ink-3); margin:26px 0 6px}
`;

/* ================= o envelope de cada página ================= */
function envelopeHTML({ titulo, descricao, url, corpo }) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}">
<link rel="canonical" href="${esc(url)}">
<meta name="author" content="Bruno Duarte">
<meta name="theme-color" content="#0A7A45" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0E1215" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="article">
<meta property="og:locale" content="pt_BR">
<meta property="og:site_name" content="promessas de Brasília">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descricao)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${DOMINIO}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(titulo)}">
<meta name="twitter:description" content="${esc(descricao)}">
<meta name="twitter:image" content="${DOMINIO}/og.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,400&display=swap">
<link rel="stylesheet" href="../ficha.css">
</head>
<body>
<header class="topo-site"><div class="wrap">
  <a href="${DOMINIO}/">promessas de <span class="b">brasília</span></a>
  <span>o que cada candidatura prometeu ao DF · eleições 2026</span>
</div></header>
<main class="wrap">
${corpo}
</main>
</body>
</html>
`;
}

/* ================= uma ficha ================= */
function ficha(r) {
  const c = r.c;
  const cargo = r.cargo;
  const dep = cargo === "distrital" || cargo === "federal";
  const S = c.site_lido || null;
  const M = c.mandato || null;
  const url = DOMINIO + "/c/" + r.apelido + "/";
  const foraDaUrna = c.na_urna === false;
  const situacao = c.situacao || String(c.status || "").replace(/_/g, " ");

  /* ---- retrato ---- */
  const src = FOTOS[cargo + ":" + c.numero] || FOTOS_DEP[c.id] || null;
  const retrato = src
    ? `<img class="ava" src="${src}" width="96" height="125" alt="Retrato oficial de ${esc(c.nome)}, registrado no TSE">`
    : `<span class="ava ava-ph" role="img" aria-label="${esc(c.nome)} (sem foto oficial)">${esc(iniciais(c.nome))}</span>`;

  const numBox = '<span class="num">'
    + String(c.numero).split("").map((d) => "<span>" + d + "</span>").join("")
    + "</span>";

  let h = "";

  /* ---- identidade ---- */
  h += '<div class="cd-topo">' + retrato + '<div class="cd-id">'
    + '<div class="cd-cargo">candidatura a ' + esc(CARGO[cargo] || cargo) + " · DF 2026</div>"
    + "<h1>" + esc(c.nome) + "</h1>"
    + '<div class="cd-linha"><span class="cd-partido">' + esc(c.partido || "") + "</span>"
    + numBox
    + (foraDaUrna
        ? '<span class="badge stop">' + esc(situacao) + " · fora da urna</span>"
        : /indeferid|julgamento|cassad/i.test(situacao)
          ? '<span class="badge ' + (/indeferid|cassad/i.test(situacao) ? "stop" : "warn") + '">'
            + esc(situacao) + "</span>"
          : "")
    + "</div>"
    + (c.coligacao && slug(c.coligacao) !== slug(c.partido || "")
        ? '<div class="cd-colig">' + esc(c.coligacao) + "</div>" : "")
    + (c.nome_civil ? '<div class="cd-civil">nome no registro: ' + esc(c.nome_civil) + "</div>" : "")
    + (dep && (c.ocupacao || c.instrucao)
        ? '<div class="cd-civil">'
          + esc([c.ocupacao, c.instrucao].filter(Boolean).join(" · ").toLowerCase()) + "</div>"
        : "")
    + "</div></div>";

  if (foraDaUrna) {
    h += '<p class="aviso"><b>Esta candidatura não estará na urna.</b> A Justiça Eleitoral '
      + "registrou a situação como <b>" + esc(situacao) + "</b>"
      + (c.motivo ? ", pelo motivo publicado: <b>" + esc(c.motivo) + "</b>" : "")
      + ". A ficha continua publicada porque quem procurar por este nome merece encontrar "
      + "o que aconteceu, e não uma página em branco.</p>";
  }

  const secao = (titulo, nota, corpo) =>
    corpo ? "<section><h2>" + esc(titulo) + (nota ? "<i>" + esc(nota) + "</i>" : "")
            + "</h2>" + corpo + "</section>"
          : "";

  /* ---- o que promete ---- */
  const props = dep ? ((S || {}).propostas || []) : (c.propostas || []);
  if (props.length) {
    const lista = props.map((p) => {
      const e = EIXO[p.eixo] || { nome: "geral", cor: "var(--line-2)" };
      return '<div class="prop" style="border-left-color:' + e.cor + '">'
        + '<div class="prop-eixo">' + esc(e.nome) + "</div>"
        + "<p>" + esc(p.texto) + "</p>"
        + ((p.url || (S && S.url))
            ? '<a class="src" href="' + esc(p.url || S.url) + '" rel="noopener">fonte: '
              + esc(p.fonte || "Site da campanha") + " ↗</a>"
            : "")
        + "</div>";
    }).join("");
    h += secao("O que promete",
      dep ? props.length + " propostas publicadas no site da campanha"
          : props.length + " propostas, uma por tema",
      (dep
        ? '<p class="nota">Lidas do site de campanha declarado no TSE. São palavras da '
          + "própria candidatura, não de plano de governo — a lei não exige plano de quem "
          + "concorre a deputado.</p>"
        : "") + lista);
  } else if (dep) {
    h += secao("O que promete", null,
      '<p class="vazio"><b>Nada registrado até agora.</b> Candidaturas a deputado não '
      + "protocolam plano de governo no TSE — a lei não obriga. "
      + ((c.sites || []).length
          ? (S && !/^ok/i.test(S.status || "")
              ? "O site declarado por esta candidatura não pôde ser lido"
                + (S.status ? " (" + esc(String(S.status).replace(/^falhou:\s*/i, "")) + ")" : "") + "."
              : "O site declarado não trazia proposta verificável no dia da leitura.")
          : "Esta candidatura não declarou site no TSE.")
      + " E ela ainda não respondeu ao questionário da plataforma.</p>");
  }

  /* ---- quem é ---- */
  const traj = dep ? (S || {}).trajetoria : c.trajetoria;
  if (traj) h += secao("Quem é", dep ? "segundo o site da campanha" : null, "<p>" + esc(traj) + "</p>");

  if (!dep && (c.vice || c.suplentes)) {
    h += secao(cargo === "governo" ? "Vice na chapa" : "Suplentes", null,
      "<p>" + esc(c.vice || c.suplentes) + "</p>");
  }

  const bands = (S || {}).bandeiras || [];
  if (bands.length) {
    h += secao("Bandeiras declaradas", "como a própria campanha as escreve",
      '<div class="band">' + bands.map((b) => "<span>" + esc(b) + "</span>").join("") + "</div>");
  }

  /* ---- mandato ---- */
  if (M && M.projetos_como_primeiro_autor != null) {
    let corpo = '<span class="mandato">mandato ' + esc(M.legislatura || "atual") + " · "
      + M.projetos_como_primeiro_autor + " projetos como primeiro autor</span>"
      + '<p class="nota" style="margin-top:10px">' + M.proposicoes + " proposições no total, sendo "
      + M.apenas_coautor + " só como coautor. Requerimento, indicação e moção ficam fora da conta "
      + "de projetos — é o item mais barato de produzir, e contá-los junto viraria ranking de "
      + "quem protocola mais.</p>";
    if ((M.temas || []).length) {
      corpo += '<p class="rot">temas dos projetos que apresentou</p><div class="etiquetas">'
        + M.temas.map((t) => "<span>" + esc(t.nome) + "<i>" + t.projetos + "</i></span>").join("")
        + "</div>";
    }
    if ((M.regioes || []).length) {
      corpo += '<p class="rot">regiões que mais aparecem nas proposições</p><div class="etiquetas">'
        + M.regioes.map((x) => '<span class="ra">' + esc(x.nome) + "<i>" + x.proposicoes + "</i></span>").join("")
        + "</div>";
    }
    corpo += '<p class="nota" style="margin-top:14px">Os dois quadros acima são contagem do que a '
      + "pessoa de fato apresentou na Câmara Legislativa — não são bandeiras declaradas. "
      + "A classificação de tema é da própria Câmara, não nossa.</p>";
    h += secao("O que fez no mandato", esc(M.legislatura || "atual"), corpo);
  }

  /* ---- patrimônio ---- */
  if (c.bens !== undefined) {
    h += secao("Patrimônio declarado", "informado no registro da candidatura",
      (c.bens > 0
        ? '<p class="grande">' + esc(moeda.format(c.bens))
          + (c.bens_qtd ? " <i>" + c.bens_qtd + (c.bens_qtd === 1 ? " bem" : " bens") + "</i>" : "")
          + "</p>"
        : '<p class="nota">Não declarou bens.</p>')
      + '<p class="nota" style="margin-top:10px">É o valor que a candidatura declarou à Justiça '
      + "Eleitoral, não uma avaliação de mercado: bens podem estar em nome de terceiros e imóveis "
      + "entram pelo valor de aquisição. Patrimônio alto ou baixo não diz nada sobre a "
      + "candidatura — está aqui porque é público.</p>");
  }

  /* ---- registro ---- */
  const motivo = c.motivo || c.status_nota || "";
  h += secao("Situação do registro", null,
    '<p class="nota">'
    + (foraDaUrna
        ? "<b>" + esc(situacao) + "</b> — esta candidatura não estará na urna. "
        : /^deferido/i.test(situacao)
          ? "Registro <b>deferido</b>: a Justiça Eleitoral aceitou a candidatura, sem restrição publicada. "
          : "Registro <b>" + esc(situacao.toLowerCase()) + "</b>. ")
    + (motivo ? "Motivo publicado pelo TSE: <b>" + esc(motivo) + "</b>. " : "")
    + "A situação muda até a véspera da eleição, e a ficha oficial abaixo é a fonte que vale. "
    + "Esta página não classifica processos nem investigações.</p>");

  /* ---- imprensa ---- */
  const itens = (NOT.por_candidato[slug(c.nome)] || []).slice(0, 8);
  const alvo = c.nome_imprensa && slug(c.nome_imprensa) !== slug(c.nome)
    ? [c.nome, c.nome_imprensa] : [c.nome];
  const buscas = '<div class="links">'
    + '<a href="' + esc(buscaNoticias(alvo, "metropoles.com")) + '" rel="noopener">Metrópoles ↗</a>'
    + '<a href="' + esc(buscaNoticias(alvo, "correiobraziliense.com.br")) + '" rel="noopener">Correio Braziliense ↗</a>'
    + '<a href="' + esc(buscaNoticias(alvo, null)) + '" rel="noopener">todos os veículos ↗</a>'
    + "</div>";
  h += secao("Na imprensa", itens.length ? "manchetes coletadas dos portais do DF" : "busca, não curadoria",
    (itens.length
      ? '<ul class="noticias">' + itens.map((n) =>
          '<li><a href="' + esc(n.url) + '" rel="noopener">' + esc(n.titulo) + "</a>"
          + "<em>" + esc(n.veiculo) + " · " + esc(n.data) + "</em></li>").join("") + "</ul>"
      : '<p class="nota">Nenhuma manchete coletada até agora. As buscas abaixo são geradas por '
        + "regra, iguais para todas as candidaturas, e já vêm recortadas para o DF — sem isso, "
        + "procurar por um nome curto devolve qualquer coisa.</p>")
    + buscas);

  /* ---- onde conferir ---- */
  let conferir = "";
  if (dep && (c.sites || []).length) {
    conferir += '<div class="links">' + c.sites.map((s) =>
      '<a href="' + esc(s.url) + '" rel="noopener">' + esc(s.rede) + " ↗</a>").join("") + "</div>";
  }
  if (!dep && c.plano) {
    conferir += '<div class="links"><a href="' + esc(c.plano) + '" rel="noopener">plano de governo ↗</a></div>';
  }
  conferir += '<div class="links">'
    + (c.id && dep ? '<a href="' + esc(fichaTSE(c.id)) + '" rel="noopener">ficha oficial no TSE ↗</a>' : "")
    + (M && M.fonte ? '<a href="' + esc(M.fonte) + '" rel="noopener">proposições na Câmara Legislativa ↗</a>' : "")
    + '<a href="' + DOMINIO + "/#candidato/" + esc(r.apelido) + '">abrir no comparador →</a>'
    + "</div>";
  h += secao("Onde conferir", null, conferir);

  h += '<p class="rodape">Esta página reúne o que é público sobre uma candidatura: registro e '
    + "bens do DivulgaCandContas do TSE, proposições da Câmara Legislativa do DF, texto lido do "
    + "site declarado pela própria campanha e manchetes dos portais do DF. <b>Nada foi "
    + "inferido</b> — onde não havia fonte, o campo ficou vazio.<br>"
    + "Feita por <b>Bruno Duarte</b>, em Brasília, pessoa física, por conta própria. Sem vínculo "
    + "com candidatura, partido, coligação ou governo, e sem financiamento de ninguém. "
    + 'Atualizado em ' + esc(D.atualizado) + ".<br>"
    + '<a class="voltar" href="' + DOMINIO + '/">← voltar para a plataforma</a> · '
    + '<a class="voltar" href="../">todas as candidaturas</a></p>';

  /* ---- título e descrição: é o que aparece no Google e no WhatsApp ---- */
  const quePromete = props.length
    ? props.length + (props.length === 1 ? " proposta" : " propostas") + " com fonte"
    : "sem proposta pública registrada";
  const frase = CARGO_FRASE[cargo] || "candidatura no DF";
  const titulo = c.nome + " (" + (c.partido || "") + ", " + c.numero + ") — " + frase + " em 2026";
  const descricao = c.nome + ", " + (c.partido || "") + ", número " + c.numero + " na urna, "
    + frase + " em 2026: " + quePromete
    + (foraDaUrna ? ". Esta candidatura não estará na urna" : "")
    + (M ? ". " + M.projetos_como_primeiro_autor + " projetos apresentados no mandato "
         + (M.legislatura || "atual") : "")
    + ". Página independente, sem financiamento.";

  return { url, html: envelopeHTML({ titulo, descricao, url, corpo: h }) };
}

/* ================= escrever ================= */
if (existsSync("docs/c")) await rm("docs/c", { recursive: true });
await mkdir("docs/c", { recursive: true });
await writeFile("docs/c/ficha.css", CSS);

let bytes = 0;
const urls = [];
for (const r of REGISTRO) {
  const { url, html } = ficha(r);
  await mkdir("docs/c/" + r.apelido, { recursive: true });
  await writeFile("docs/c/" + r.apelido + "/index.html", html);
  bytes += Buffer.byteLength(html);
  urls.push(url);
}

/* ---- o índice: é por onde o robô entra, e onde uma pessoa acha um nome ---- */
const grupos = [
  ["governo", "Governo do DF"],
  ["senado", "Senado"],
  ["distrital", "Deputado distrital"],
  ["federal", "Deputado federal"],
];
let ind = "<h1>Todas as candidaturas do DF em 2026</h1>"
  + '<p class="nota" style="margin-top:12px">' + REGISTRO.length + " candidaturas, uma página cada, "
  + "com o que é público sobre ela: registro, número na urna, patrimônio declarado, propostas "
  + "onde existirem, atividade no mandato para quem tem, e as manchetes dos portais do DF. "
  + "Ordem alfabética dentro de cada cargo.</p>";
for (const [cg, rot] of grupos) {
  const doGrupo = REGISTRO.filter((r) => r.cargo === cg)
    .sort((a, b) => a.c.nome.localeCompare(b.c.nome, "pt-BR"));
  if (!doGrupo.length) continue;
  ind += '<p class="grupo">' + esc(rot) + " · " + doGrupo.length + "</p>";
  ind += '<div class="indice">' + doGrupo.map((r) =>
    '<a href="' + esc(r.apelido) + '/">' + esc(r.c.nome)
    + "<em>" + esc(r.c.partido || "") + " · " + esc(r.c.numero)
    + (r.c.na_urna === false ? " · fora da urna" : "") + "</em></a>").join("") + "</div>";
}
ind += '<p class="rodape">Feita por <b>Bruno Duarte</b>, em Brasília, pessoa física, por conta '
  + "própria. Sem vínculo com candidatura, partido, coligação ou governo, e sem financiamento de "
  + "ninguém. Atualizado em " + esc(D.atualizado) + ".<br>"
  + '<a class="voltar" href="' + DOMINIO + '/">← voltar para a plataforma</a></p>';

const indiceHTML = envelopeHTML({
  titulo: "Todas as " + REGISTRO.length + " candidaturas do DF em 2026 — promessas de Brasília",
  descricao: "Índice das " + REGISTRO.length + " candidaturas a governador, senador e deputado no "
    + "Distrito Federal em 2026, uma página por candidatura, com a fonte de cada informação.",
  url: DOMINIO + "/c/",
  corpo: ind,
}).replace('href="../ficha.css"', 'href="ficha.css"');
await writeFile("docs/c/index.html", indiceHTML);
urls.unshift(DOMINIO + "/c/");
urls.unshift(DOMINIO + "/");

/* ---- sitemap e robots: sem eles o buscador não sabe que as 626 existem ---- */
const hoje = new Date().toISOString().slice(0, 10);
await writeFile("docs/sitemap.xml",
  '<?xml version="1.0" encoding="UTF-8"?>\n'
  + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  + urls.map((u, i) =>
      "  <url><loc>" + u + "</loc><lastmod>" + hoje + "</lastmod>"
      + "<priority>" + (i < 2 ? "1.0" : "0.7") + "</priority></url>").join("\n")
  + "\n</urlset>\n");

await writeFile("docs/robots.txt",
  "User-agent: *\nAllow: /\n\nSitemap: " + DOMINIO + "/sitemap.xml\n");

console.log("páginas de candidatura : " + REGISTRO.length);
console.log("  governo " + REGISTRO.filter((r) => r.cargo === "governo").length
  + " · senado " + REGISTRO.filter((r) => r.cargo === "senado").length
  + " · distrital " + REGISTRO.filter((r) => r.cargo === "distrital").length
  + " · federal " + REGISTRO.filter((r) => r.cargo === "federal").length);
console.log("  média " + Math.round(bytes / REGISTRO.length / 1024) + " KB, total "
  + Math.round(bytes / 1024 / 1024 * 10) / 10 + " MB");
console.log("índice                 : docs/c/index.html");
console.log("sitemap                : " + urls.length + " endereços");
console.log("robots.txt             : aponta para o sitemap");
console.log("\nEndereço de exemplo: " + DOMINIO + "/c/" + REGISTRO[0].apelido + "/");
