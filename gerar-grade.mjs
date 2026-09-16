#!/usr/bin/env node
/**
 * gerar-grade.mjs — promessasdebrasilia
 *
 *   node gerar-grade.mjs
 *
 * O carrossel "quem escreveu sobre o quê": o cruzamento de partido por tema
 * entre as candidaturas que publicaram proposta.
 *
 * ── por que cheio e vazio, e não o número ─────────────────────────────────
 *
 * A matriz completa é 11 partidos por 10 temas: 110 números. Isso é planilha,
 * não post — ninguém lê 110 números no celular, e quem tentar desiste no
 * terceiro. O achado também não é a contagem: é ONDE estão os vazios, e que
 * eles não são os mesmos. Bolinha cheia e bolinha vazia entrega isso em dois
 * segundos. Os números vêm depois, nos cards de detalhe, para quem quiser.
 *
 * E nada de mapa de calor. Sombrear a célula pela quantidade fica bonito e é
 * um veredito disfarçado: escuro vira "melhor", claro vira "pior", e a página
 * passa a dar nota em vez de registrar. Cheio e vazio não opina.
 *
 * ── a trava que importa mais que todas as outras ──────────────────────────
 *
 * Isto NÃO fala de partidos. Fala de 63 candidaturas em 582 — cinco do PT
 * entre 26 na urna, oito do REPUBLICANOS entre 32. A frase que a base
 * sustenta é "as candidaturas do X que publicaram proposta no canal declarado
 * ao TSE não publicaram nenhuma de Y". A frase larga — "o X não tem proposta
 * de Y" — é falsa, e é exatamente a munição que um adversário usaria citando
 * esta página como fonte.
 *
 * Por isso o penúltimo card é a ressalva de amostra, com o denominador de cada
 * legenda. Sem ele, o print da grade viaja sozinho e vira arma. Ele não é
 * rodapé: é o card que mantém isto sendo achado.
 */

import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import {
  C, MONO, amb, CSS_AMBIENTE,
  MEDIR_TRANSBORDO, MEDIR_ZONA_SEGURA, relatarProblemas,
  carregarChromium, abrirNavegador,
} from "./ambiente.mjs";

const SITE   = "https://brunoduarte40.github.io/promessasdebrasilia/";
const SITE_C = "brunoduarte40.github.io/promessasdebrasilia";
const PERFIL = "@promessasdebrasilia";
const AUTOR  = "Bruno Duarte";
const SAIDA  = "grade";
const ARQ    = "questionario.json";

/* Abaixo de 3 candidaturas publicando, um partido teria vazios por acaso
   estatístico e não por escolha — uma candidatura só que escreveu sobre dois
   temas produz oito bolinhas vazias que não significam nada. Mesmo raciocínio
   do MIN_PARTIDO no placar. */
const MIN_CAND = 3;
/* Quantos partidos por card de detalhe numérico. */
const POR_TABELA = 6;

const EIXOS = [
  ["seguranca", "seg", "segurança"], ["saude", "saú", "saúde"],
  ["educacao", "edu", "educação"], ["social", "soc", "social"],
  ["meio_ambiente", "amb", "meio ambiente"], ["mobilidade", "mob", "mobilidade"],
  ["economia", "eco", "economia"], ["gestao", "ges", "gestão"],
  ["cultura_esporte", "cul", "cultura e esporte"], ["moradia", "mor", "moradia"],
];

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
               "agosto", "setembro", "outubro", "novembro", "dezembro"];
const porExtenso = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  return m ? Number(m[3]) + " de " + MESES[Number(m[2]) - 1] : String(iso || "");
};

/* ── 1. a base ─────────────────────────────────────────────────────────── */
const BASE = ["deputados.js", "docs/deputados.js"].find((p) => existsSync(p));
if (!BASE) {
  console.error("não achei deputados.js nem em ./ nem em docs/. Rode da raiz do projeto.");
  process.exit(1);
}
const win = {};
new Function("window", await readFile(BASE, "utf8"))(win);
const URNA = (win.DEPUTADOS && win.DEPUTADOS.candidatos || []).filter((c) => c.na_urna);
if (!URNA.length) { console.error(BASE + " sem candidaturas na urna."); process.exit(1); }

if (!existsSync(ARQ)) {
  console.error(ARQ + " não existe. Rode o gerar-placar.mjs uma vez primeiro.");
  process.exit(1);
}
const reg = (JSON.parse(await readFile(ARQ, "utf8")).registro) || {};
if (!reg.visitamos) { console.error("questionario.json sem 'registro.visitamos'."); process.exit(1); }
const VISITA = porExtenso(reg.visitamos);

/* ── 2. a matriz ───────────────────────────────────────────────────────── */
const COM = URNA.filter((c) => c.site_lido && (c.site_lido.propostas || []).length);
const naUrna = {};
for (const c of URNA) naUrna[c.partido] = (naUrna[c.partido] || 0) + 1;

const M = new Map();
for (const c of COM) {
  if (!M.has(c.partido)) M.set(c.partido, { cands: new Set(), tot: 0, temas: {} });
  const p = M.get(c.partido);
  p.cands.add(c.id);
  for (const x of c.site_lido.propostas) {
    p.temas[x.eixo] = (p.temas[x.eixo] || 0) + 1;
    p.tot++;
  }
}
const LINHAS = [...M.entries()]
  .filter(([, v]) => v.cands.size >= MIN_CAND)
  .sort((a, b) => b[1].tot - a[1].tot)
  .map(([partido, v]) => ({
    partido, ...v,
    buracos: EIXOS.filter(([e]) => !v.temas[e]).map(([e]) => e),
  }));

if (LINHAS.length < 6) {
  console.error("só " + LINHAS.length + " legendas passaram do corte de " + MIN_CAND
    + " candidaturas. A grade fica fraca e parece recorte. Confira a base.");
  process.exit(1);
}

/* volume global de cada tema — é o que mede o quanto uma ausência é notável */
const VOL = {};
for (const c of COM) for (const x of c.site_lido.propostas) VOL[x.eixo] = (VOL[x.eixo] || 0) + 1;

const comBuraco = LINHAS.filter((l) => l.buracos.length).length;

/* ── 3. as três ausências da capa ──────────────────────────────────────────
   Regra: a ausência mais notável é a do tema sobre o qual MAIS gente escreveu.
   Ordena por esse volume, desempata pelo total do partido, e não repete tema —
   três capas dizendo "e nenhuma sobre segurança" seria a mesma frase três
   vezes. Tudo mecânico: nenhuma das três foi escolhida a dedo. */
const candidatasCapa = LINHAS
  .filter((l) => l.buracos.length)
  .map((l) => {
    const pior = l.buracos.slice().sort((a, b) => (VOL[b] || 0) - (VOL[a] || 0)
      || a.localeCompare(b))[0];
    return { partido: l.partido, tot: l.tot, tema: pior, vol: VOL[pior] || 0 };
  })
  .sort((a, b) => b.vol - a.vol || b.tot - a.tot);
const CAPA = [];
for (const c of candidatasCapa) {
  if (CAPA.length === 3) break;
  if (CAPA.some((x) => x.tema === c.tema)) continue;
  CAPA.push(c);
}
const rotulo = (e) => (EIXOS.find(([k]) => k === e) || [, , e])[2];

/* ── 4. o CSS ──────────────────────────────────────────────────────────── */
const CSS = CSS_AMBIENTE + `
.titulo{font-size:54px;line-height:1.08;font-weight:700;letter-spacing:-.025em}
.sub{font-size:25px;line-height:1.4;color:${C.ink2};margin-top:16px;max-width:42ch}
.nota{font-size:21px;line-height:1.45;color:${C.ink3};margin-top:24px;max-width:46ch}
.fatos{display:flex;flex-direction:column;gap:38px}
.fato{border-left:4px solid ${C.verdeClaro};padding-left:26px}
.fato b{display:block;font-size:52px;line-height:1.1;font-weight:700;letter-spacing:-.02em}
.fato span{display:block;font-size:28px;line-height:1.35;color:${C.claro2};margin-top:10px}
.pergunta{font-size:38px;line-height:1.3;font-weight:600;color:${C.verdeClaro};margin-top:44px}
.reveal{display:flex;flex-direction:column;gap:24px;margin-top:34px}
.rv{display:flex;align-items:baseline;gap:20px;padding-bottom:20px;
  border-bottom:1px solid ${C.linha}}
.rv-p{font-family:${MONO};font-size:30px;font-weight:700;color:${C.ink};width:200px;flex:none}
.rv-t{font-size:26px;line-height:1.35;flex:1;color:${C.ink2}}

table{width:100%;border-collapse:collapse;margin-top:30px;font-family:${MONO}}
th.t{font-size:17px;letter-spacing:.06em;color:${C.ink3};font-weight:600;
  text-transform:uppercase;padding-bottom:14px;text-align:center;width:62px}
td.p,th.p{text-align:left;font-size:21px;font-weight:700;color:${C.ink};
  padding:9px 14px 9px 0;white-space:nowrap}
td.n{font-size:19px;color:${C.ink3};text-align:right;padding-right:18px;
  font-variant-numeric:tabular-nums}
td.c{text-align:center;padding:9px 0;font-size:21px;font-variant-numeric:tabular-nums;
  color:${C.ink}}
td.c.z{color:rgba(20,32,28,.22)}
.pt{width:26px;height:26px;border-radius:50%;display:inline-block;background:${C.verde}}
.pt.v{background:none;border:2px solid rgba(20,32,28,.17);width:22px;height:22px}
tr.l{border-bottom:1px solid ${C.linha}}
.caixa{background:${C.verdeSuave};border-left:8px solid ${C.verde};padding:34px 38px;
  margin-top:auto}
.caixa p{font-size:29px;line-height:1.4;font-weight:600;color:${C.verdeEsc}}
.caixa span{display:block;font-family:${MONO};font-size:27px;margin-top:14px;
  color:${C.ink};font-weight:600;white-space:nowrap}
.amostra{display:flex;flex-wrap:wrap;gap:0 44px;margin-top:30px}
.am{display:flex;align-items:baseline;gap:12px;width:calc(50% - 22px);
  padding:11px 0;border-bottom:1px solid ${C.linha};font-family:${MONO}}
.am-p{font-size:20px;font-weight:700;color:${C.ink};flex:1;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis}
.am-n{font-size:20px;color:${C.ink3};font-variant-numeric:tabular-nums;flex:none}
.destaque{font-size:31px;line-height:1.35;font-weight:600;color:${C.verdeEsc};
  margin-top:30px;max-width:30ch}
`;

const rodape = '<div class="rodape"><span>' + esc(PERFIL) + '</span>'
  + '<span>' + esc(SITE_C) + '</span></div>';

/* ── 5. os cards ───────────────────────────────────────────────────────── */
const tabelas = [];
for (let i = 0; i < LINHAS.length; i += POR_TABELA) tabelas.push(LINHAS.slice(i, i + POR_TABELA));
const TOTAL = 4 + tabelas.length + 1;   /* capa, revelação, grade, tabelas, amostra, fecho */
const cards = [];
let n = 0;
const id = () => "g" + (n++);

/* 1 — a capa: os três fatos, sem nome */
cards.push('<div class="card escuro" id="' + id() + '">'
  + amb("escuro", 1, TOTAL)
  + '<div class="selo">quem escreveu sobre o quê</div>'
  + '<div class="cresce" style="display:flex;flex-direction:column;justify-content:center">'
    + '<div class="fatos">'
    + CAPA.map((c) => '<div class="fato"><b>' + c.tot + ' propostas</b>'
        + '<span>e nenhuma sobre ' + esc(rotulo(c.tema)) + '</span></div>').join("")
    + '</div>'
    + '<div class="pergunta">Três partidos diferentes.</div>'
  + '</div>' + rodape + '</div>');

/* 2 — a revelação */
cards.push('<div class="card claro" id="' + id() + '">'
  + amb("claro", 2, TOTAL)
  + '<div class="selo">são estes</div>'
  + '<div class="titulo" style="margin-top:26px">Cada um escreveu<br>sobre outra coisa</div>'
  + '<div class="reveal">'
  + CAPA.map((c) => '<div class="rv"><span class="rv-p">' + esc(c.partido) + '</span>'
      + '<span class="rv-t">' + c.tot + ' propostas publicadas, nenhuma sobre '
      + esc(rotulo(c.tema)) + '</span></div>').join("")
  + '</div>'
  + '<div class="cresce"></div>'
  + '<div class="nota">Não escolhi estes três: são as ausências mais notáveis, ou seja, '
    + 'as que faltam justamente nos temas sobre os quais mais gente escreveu. '
    + 'E o padrão não é ideológico — o que vem a seguir mostra por quê.</div>'
  + '<div style="height:24px"></div>' + rodape + '</div>');

/* 3 — a grade */
cards.push('<div class="card claro" id="' + id() + '">'
  + amb("claro", 3, TOTAL)
  + '<div class="selo" style="margin-bottom:26px">a grade inteira</div>'
  /* o título sai da contagem, nunca digitado: a primeira versão dizia "todo
     partido tem um buraco" e era falsa — dois preencheram os dez temas */
  + '<div class="titulo">' + comBuraco + ' dos ' + LINHAS.length
    + ' deixaram<br>algum tema de fora</div>'
  + '<div class="sub">Círculo cheio = publicou pelo menos uma proposta daquele tema. '
    + 'Vazio = não publicou nenhuma.</div>'
  + '<table><tr><th class="p"></th><th class="t"></th>'
  + EIXOS.map(([, r]) => '<th class="t">' + r + '</th>').join("") + '</tr>'
  + LINHAS.map((l) => '<tr class="l"><td class="p">' + esc(l.partido) + '</td>'
      + '<td class="n">' + l.tot + '</td>'
      + EIXOS.map(([e]) => '<td class="c"><span class="pt' + (l.temas[e] ? "" : " v")
          + '"></span></td>').join("") + '</tr>').join("")
  + '</table>'
  + '<div class="nota">Só as legendas com ' + MIN_CAND + ' ou mais candidaturas entre as que '
    + 'publicaram. O número ao lado é o total de propostas daquela legenda.</div>'
  + '<div class="cresce"></div>' + rodape + '</div>');

/* 4..N — o detalhe numérico, para quem quiser conferir */
tabelas.forEach((bloco, k) => {
  cards.push('<div class="card claro" id="' + id() + '">'
    + amb("claro", k + 4, TOTAL)
    + '<div class="selo" style="margin-bottom:26px">os números · '
      + (k + 1) + ' de ' + tabelas.length + '</div>'
    + '<div class="titulo">Quantas propostas,<br>tema por tema</div>'
    + '<table><tr><th class="p"></th><th class="t"></th>'
    + EIXOS.map(([, r]) => '<th class="t">' + r + '</th>').join("") + '</tr>'
    + bloco.map((l) => '<tr class="l"><td class="p">' + esc(l.partido) + '</td>'
        + '<td class="n">' + l.tot + '</td>'
        + EIXOS.map(([e]) => '<td class="c' + (l.temas[e] ? "" : " z") + '">'
            + (l.temas[e] || "—") + '</td>').join("") + '</tr>').join("")
    + '</table>'
    + '<div class="cresce"></div>'
    + '<div class="nota">' + EIXOS.map(([, r, nome]) => r + " = " + nome).join(" · ") + '</div>'
    + '<div style="height:22px"></div>' + rodape + '</div>');
});

/* N+1 — A RESSALVA. O card mais importante do carrossel. */
cards.push('<div class="card claro" id="' + id() + '">'
  + amb("claro", TOTAL - 1, TOTAL)
  + '<div class="selo" style="margin-bottom:26px">o tamanho disto</div>'
  + '<div class="titulo">Isto não fala<br>de partidos</div>'
  + '<div class="sub">Fala das ' + COM.length + ' candidaturas que publicaram proposta, '
    + 'entre as ' + URNA.length + ' que estão na urna. Quantas de cada legenda:</div>'
  + '<div class="amostra">'
  + LINHAS.map((l) => '<div class="am"><span class="am-p">' + esc(l.partido) + '</span>'
      + '<span class="am-n">' + l.cands.size + ' de ' + (naUrna[l.partido] || "?")
      + '</span></div>').join("")
  + '</div>'
  + '<div class="destaque">&ldquo;O partido X não tem proposta sobre Y&rdquo; '
    + 'não é o que está escrito aqui — e não seria verdade.</div>'
  + '<div class="cresce"></div>'
  + '<div class="nota">O que está escrito é que as candidaturas daquela legenda '
    + '<b>que publicaram proposta no canal declarado ao TSE</b> não publicaram nenhuma '
    + 'daquele tema, quando visitei em ' + esc(VISITA) + '. As outras podem ter — '
    + 'só não estavam lá.</div>'
  + '<div style="height:22px"></div>' + rodape + '</div>');

/* N+2 — o fecho */
cards.push('<div class="card claro" id="' + id() + '">'
  + amb("claro", TOTAL, TOTAL)
  + '<div class="selo" style="margin-bottom:34px">confira você mesmo</div>'
  + '<div class="titulo">Cada proposta,<br>com a fonte ao lado</div>'
  + '<div class="sub">A grade acima sai de ' + COM.length + ' candidaturas e de cada uma '
    + 'das propostas que elas publicaram. Está tudo aberto, uma a uma, e o código que '
    + 'gera isto é público.</div>'
  + '<div class="cresce"></div>'
  + '<div class="caixa"><p>Está tudo aqui:</p><span>' + esc(SITE_C) + '</span></div>'
  + '<div class="nota" style="margin-top:22px">É candidata ou candidato e acha que falta a '
    + 'sua? Manda — publico inteira, com a sua fonte, no mesmo dia.</div>'
  + '<div style="height:24px"></div>'
  + '<div class="rodape"><span>' + esc(PERFIL) + '</span>'
    + '<span>por ' + esc(AUTOR) + ' · pessoa física</span></div></div>');

/* ── 6. a legenda ──────────────────────────────────────────────────────── */
const legenda = [
  CAPA[0].tot + " propostas publicadas e nenhuma sobre " + rotulo(CAPA[0].tema) + ".",
  CAPA[1].tot + " propostas e nenhuma sobre " + rotulo(CAPA[1].tema) + ".",
  CAPA[2].tot + " e nenhuma sobre " + rotulo(CAPA[2].tema) + ".",
  "",
  "São " + CAPA.map((c) => c.partido).join(", ") + " — três partidos que não se parecem em nada.",
  "",
  "Cruzei as " + COM.length + " candidaturas a deputado do DF que publicaram proposta com os "
    + EIXOS.length + " temas que elas escreveram. " + comBuraco + " das " + LINHAS.length
    + " legendas deixaram algum tema de fora, e os buracos não são os mesmos.",
  "",
  "O padrão não é ideológico, e é isso que torna o dado interessante: os dois únicos que "
    + "escreveram sobre todos os " + EIXOS.length + " temas são "
    + LINHAS.filter((l) => !l.buracos.length).map((l) => l.partido).join(" e ")
    + " — que não têm nada em comum.",
  "",
  "LEIA ESTA PARTE: isto não fala de partidos, fala de " + COM.length + " candidaturas em "
    + URNA.length + ". \"O partido X não tem proposta sobre Y\" não é o que está escrito aqui, "
    + "e não seria verdade. O que está escrito é que as candidaturas daquela legenda que "
    + "publicaram proposta no canal que declararam ao TSE não publicaram nenhuma daquele tema, "
    + "em " + VISITA + ". As outras podem ter — só não estavam lá.",
  "",
  "Cada proposta está na página, inteira, com a fonte ao lado, e o código que gera tudo isto "
    + "é público:",
  SITE,
  "",
  "Eleições 2026, Distrito Federal, Brasília. Página independente, feita por " + AUTOR + ", "
    + "pessoa física. Sem vínculo com candidatura, partido, coligação ou governo. Sem "
    + "financiamento e sem impulsionamento.",
].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");

const LIM = 2200;
if (legenda.length > LIM) {
  console.error("\n  ✕ A LEGENDA ESTOUROU: " + legenda.length + " de " + LIM + ".");
  console.error("  O Instagram corta o fim sem avisar — e o fim é a identificação que a lei exige.\n");
  process.exit(1);
}

/* ── 7. renderizar ─────────────────────────────────────────────────────── */
if (existsSync(SAIDA)) await rm(SAIDA, { recursive: true });
await mkdir(SAIDA, { recursive: true });
await writeFile(SAIDA + "/legenda.txt", legenda + "\n");

const HTML = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
  + '<title>grade — promessas de Brasília</title><style>' + CSS + '</style></head>'
  + '<body>' + cards.join("") + '</body></html>';
await writeFile(SAIDA + "/grade.html", HTML);

const { chromium, erros: errosImport } = await carregarChromium();
if (!chromium) { console.log("Playwright não carregou.\n" + errosImport.join("\n")); process.exit(1); }
const { nav, via, erros } = await abrirNavegador(chromium);
if (!nav) { console.log("Nenhum navegador abriu.\n" + erros.join("\n")); process.exit(1); }

const pagina = await nav.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
await pagina.setContent(HTML, { waitUntil: "load" });
await pagina.evaluate(() => document.fonts.ready);
const transbordos = await pagina.evaluate(MEDIR_TRANSBORDO);
const cortados = await pagina.evaluate(MEDIR_ZONA_SEGURA);
for (let i = 0; i < cards.length; i++) {
  await pagina.locator("#g" + i).screenshot({
    path: SAIDA + "/" + String(i + 1).padStart(2, "0") + ".png",
  });
}
await nav.close();

if (relatarProblemas(transbordos, cortados)) {
  console.error("  Caminho mais provável: baixar POR_TABELA (hoje " + POR_TABELA
    + ") ou subir MIN_CAND (hoje " + MIN_CAND + ").\n");
  process.exit(1);
}

console.log("grade renderizada com " + via + ", sem transbordo e dentro da zona segura.");
console.log("");
console.log("  " + COM.length + " candidaturas com proposta · " + LINHAS.length
  + " legendas acima do corte de " + MIN_CAND);
console.log("  " + comBuraco + " deixaram algum tema de fora");
const cheios = LINHAS.filter((l) => !l.buracos.length).map((l) => l.partido);
console.log("  escreveram sobre os " + EIXOS.length + " temas: "
  + (cheios.length ? cheios.join(", ") : "nenhuma"));
console.log("");
console.log("  capa: " + CAPA.map((c) => c.partido + " (sem " + rotulo(c.tema) + ")").join(" · "));
console.log("");
console.log("  " + SAIDA + "/ — " + cards.length + " imagens, grade.html e legenda.txt ("
  + legenda.length + " caracteres)");
