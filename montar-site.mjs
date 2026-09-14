#!/usr/bin/env node
/**
 * montar-site.mjs — promessasdebrasilia
 *
 *   node montar-site.mjs
 *
 * Monta a pasta docs/, pronta para subir no GitHub Pages.
 *
 * Por que isto precisa existir: o index.html do projeto não tem <!doctype>,
 * <head> nem <body>. Não é esquecimento — é exigência do visualizador de
 * artefato, que embrulha o conteúdo por conta própria. Servido direto num
 * domínio, esse mesmo arquivo perderia título, viewport e prévia de link.
 *
 * Então aqui o conteúdo ganha o envelope de verdade, e com ele três coisas
 * que o artefato nunca pôde ter:
 *   - título e descrição próprios, para o buscador
 *   - Open Graph, para o link chegar no WhatsApp com rosto em vez de cru
 *   - favicon embutido, sem arquivo extra
 */

import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";

/* Trocar aqui quando o domínio estiver no ar. É o único lugar.
   Enquanto não estiver, tem de apontar para o endereço que EXISTE: um
   canonical para domínio que não resolve manda o buscador ignorar a página
   que está no ar, e a prévia do link chega sem imagem no WhatsApp.
   Quando promessasdebrasilia.com.br subir, é só trocar a linha e rodar de novo. */
const DOMINIO = "https://brunoduarte40.github.io/promessasdebrasilia";

const TITULO = "promessas de Brasília — o que cada candidato prometeu ao DF";
const DESC = "As promessas das 605 candidaturas do Distrito Federal em 2026, "
  + "com a fonte de cada uma. Página independente, sem financiamento e sem "
  + "vínculo com candidatura, partido ou governo.";

/* Favicon como SVG embutido: o "p" da marca sobre o verde da página. Evita
   um arquivo a mais e some do relatório de requisições. */
const FAVICON = "data:image/svg+xml,"
  + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
    + '<rect width="64" height="64" rx="10" fill="#0A7A45"/>'
    + '<text x="32" y="46" font-family="Archivo,Helvetica,Arial,sans-serif" font-size="42" '
    + 'font-weight="700" fill="#fff" text-anchor="middle">p</text></svg>');

const ARQUIVOS = ["dados.js", "fotos.js", "deputados.js", "noticias.js",
                  "fotos-deputados.js", "proposicoes.js", "og.png"];

/* A constante PAGINAS nasce vazia no arquivo, porque no visualizador de
   artefato as páginas estáticas não existem. Aqui ela ganha valor: é o que faz
   o botão "copiar o link desta página" entregar o endereço que o Google enxerga
   em vez do fragmento, e o que acende o link do índice no rodapé. */
const corpo = (await readFile("index.html", "utf8"))
  .replace('var PAGINAS = "";', 'var PAGINAS = "' + DOMINIO + '/c/";');
if (!corpo.includes('var PAGINAS = "' + DOMINIO + '/c/"')) {
  console.error("não achei a constante PAGINAS em index.html — o link público ficaria errado");
  process.exit(1);
}

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${TITULO}</title>
<meta name="description" content="${DESC}">
<link rel="canonical" href="${DOMINIO}/">
<meta name="theme-color" content="#0A7A45" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0E1215" media="(prefers-color-scheme: dark)">
<meta name="author" content="Bruno Duarte">
<link rel="icon" href="${FAVICON}">

<!-- Open Graph: é o que faz o link chegar com rosto num grupo de WhatsApp,
     que é por onde esta página vai circular de verdade. -->
<meta property="og:type" content="website">
<meta property="og:locale" content="pt_BR">
<meta property="og:site_name" content="promessas de Brasília">
<meta property="og:title" content="${TITULO}">
<meta property="og:description" content="${DESC}">
<meta property="og:url" content="${DOMINIO}/">
<meta property="og:image" content="${DOMINIO}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="promessas de Brasília — 626 candidaturas, 552 propostas com fonte, zero financiamento">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${TITULO}">
<meta name="twitter:description" content="${DESC}">
<meta name="twitter:image" content="${DOMINIO}/og.png">

<style>
:root{color-scheme:light dark}
body{margin:0;font:14px system-ui,sans-serif;background:#fafafa}
img{max-width:100%}
[hidden]{display:none!important}
</style>
</head>
<body>
${corpo}
</body>
</html>
`;

if (!existsSync("docs")) await mkdir("docs");
await writeFile("docs/index.html", html);

/* .nojekyll: sem ele o GitHub Pages passa tudo pelo Jekyll e ignora
   arquivos começados por _ . Nenhum dos nossos começa, mas é um byte de
   seguro contra uma hora de confusão. */
await writeFile("docs/.nojekyll", "");

/* Os dados podem já estar publicados em docs/ e ausentes na raiz — é o caso de
   quem clonou o repositório, onde a cópia que vale é a de docs/. Só é falta de
   verdade quando não existe nos dois lugares. */
let faltando = [], jaEmDocs = [];
for (const f of ARQUIVOS) {
  if (existsSync(f)) { await copyFile(f, "docs/" + f); continue; }
  if (existsSync("docs/" + f)) { jaEmDocs.push(f); continue; }
  faltando.push(f);
}

const { size } = await import("node:fs").then((m) => m.promises.stat("docs/index.html"));
console.log("docs/index.html  " + Math.round(size / 1024) + " KB");
for (const f of ARQUIVOS.filter((f) => !faltando.includes(f))) {
  const s = await import("node:fs").then((m) => m.promises.stat("docs/" + f));
  console.log("docs/" + f.padEnd(20) + Math.round(s.size / 1024) + " KB"
    + (jaEmDocs.includes(f) ? "   (já estava em docs/, mantido)" : ""));
}
if (faltando.length) console.log("\nFALTANDO: " + faltando.join(", "));
console.log("\nAgora rode  node gerar-paginas.mjs  para as 626 páginas de candidatura.");
console.log("\nDomínio configurado: " + DOMINIO);
console.log("Se mudar, é só a constante DOMINIO no alto deste arquivo.");
