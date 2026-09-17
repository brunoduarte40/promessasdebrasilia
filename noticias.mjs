/**
 * noticias.mjs — promessasdebrasilia
 *
 * Coleta manchetes dos portais do DF e casa com os candidatos por menção no
 * título. Acumula: cada execução soma ao que já existe em noticias.js, porque
 * os feeds só guardam ~20 itens e não têm paginação.
 *
 *   node noticias.mjs
 *
 * Rode algumas vezes por dia até a eleição. Sem dependências.
 *
 * Por que menção no título e não etiqueta: os portais só etiquetam por nome os
 * candidatos de maior projeção. Coletar pela etiqueta ignoraria notícia
 * relevante sobre candidato pouco conhecido.
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const UA = "promessasdebrasilia/1.0 (agregador apartidario; contato: SEU-EMAIL)";
const THROTTLE = 250;
/* Janela larga de propósito: a etiqueta de um deputado pode ter como item mais
   recente algo de meses atrás, e essa matéria é mais informativa que uma nota
   genérica de agenda de campanha. Cada manchete mostra a data, então o leitor
   julga a atualidade. */
const JANELA_DIAS = 540;
const MAX_POR_CANDIDATO = 12;

const FEEDS = [
  ["Metrópoles", "https://www.metropoles.com/feed"],
  ["Metrópoles", "https://www.metropoles.com/distrito-federal/feed"],
  ["Metrópoles", "https://www.metropoles.com/tag/eleicoes-2026/feed"],
  ["Metrópoles", "https://www.metropoles.com/politica/feed"],
  ["Jornal de Brasília", "https://www.jornaldebrasilia.com.br/feed/"],
  ["Jornal de Brasília", "https://www.jornaldebrasilia.com.br/tag/eleicoes-2026/feed/"],
];

// candidaturas majoritárias, embutidas para o script rodar sozinho
const MAJORITARIOS = [
  "Celina Leão","Ricardo Cappelli","Leandro Grass","José Roberto Arruda","Paula Belmonte",
  "Kiko Caputo","Elisson","Professor Robson","Professora Samara Mineiro","Expedito Mendonça",
  "Michelle Bolsonaro","Bia Kicis","Erika Kokay","Leila do Vôlei","Ronaldo Fonseca",
  "Sebastião Coelho","Professor Guilherme Amorim","David Horn","Tiago","Zanata",
  "Guto Felício dos Santos","Marley","Avenir Rosa",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/\s+/g, " ").trim();
const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function baixar(url) {
  await sleep(THROTTLE);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml" },
      signal: AbortSignal.timeout(30000) });
    if (!r.ok) { console.log("  " + r.status + "  " + url); return ""; }
    return r.text();
  } catch (e) { console.log("  falhou  " + url + " — " + e.message); return ""; }
}

const limpar = (s) => (s || "")
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/<[^>]+>/g, " ")
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#8217;|&rsquo;/g, "'").replace(/&nbsp;/g, " ")
  .replace(/\s+/g, " ").trim();

function parseRSS(xml) {
  const itens = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const b = m[0];
    const campo = (t) => { const x = new RegExp("<" + t + "[^>]*>([\\s\\S]*?)</" + t + ">", "i").exec(b); return x ? limpar(x[1]) : ""; };
    const titulo = campo("title"), link = campo("link");
    if (!titulo || !link) continue;
    itens.push({ titulo, url: link, descricao: campo("description"), pub: campo("pubDate") });
  }
  return itens;
}

/* Nomes curtos e de uma palavra dão falso positivo ("Pepa", "Tiago", "Abadia"
   aparecem em qualquer texto), então não entram por menção.
   Para quem tem nome de urna curto mas é tratado pela imprensa pelo nome
   completo, a variante vai aqui — senão a candidatura fica invisível quando
   o portal não aplica etiqueta de nome, que é o caso do Elisson. */
const VARIANTES = {
  "Elisson": ["Elisson Ferreira"],
  "Tiago": ["Tiago Társis"],
  "Marley": ["Marley Mendonça"],
  "Zanata": ["Eduardo Zanata"],
  "Pepa": ["Deputado Pepa"],
  "Hermeto": ["Deputado Hermeto"],
  "Iolando": ["Deputado Iolando"],
};

function formasDe(nome) {
  return [nome, ...(VARIANTES[nome] || [])].filter((f) => {
    const t = norm(f).split(" ").filter(Boolean);
    return t.length >= 2 || (t.length === 1 && t[0].length >= 8);
  });
}
function mencionado(nome, texto) {
  return formasDe(nome).some((f) => {
    const alvo = norm(f).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp("(^|[^a-z0-9])" + alvo + "([^a-z0-9]|$)").test(texto);
  });
}

/* ── A SEGUNDA ARMADILHA: A SEÇÃO ───────────────────────────────────────────
 *
 * A trava da etiqueta (mais abaixo) só reprova a etiqueta INTEIRA, e há
 * etiqueta misturada: metropoles.com/tag/michel-platini junta o dirigente de
 * futebol com o candidato do PSOL que é intérprete de Libras. Como a etiqueta
 * tem item do DF, ela passa — e as manchetes da Fifa entram junto.
 *
 * A trava por palavra também não resolve: "Federação Francesa retira apoio à
 * reeleição de Infantino" tem "eleic" dentro de "reeleição".
 *
 * O que separa de verdade é a editoria. Estas seções não publicam política do
 * DF, e foi nelas que entrou tudo que era de outra pessoa: o Platini do
 * futebol, a França país no candidato FRANÇA, o humorista no LUÍS MIRANDA —
 * este último com notícia de cirurgia, que é informação de saúde colada em
 * quem não é o paciente. Sem exceção por palavra: "reeleição" aparece em
 * eleição de federação esportiva, e a exceção anularia a regra.
 *
 * Custo: se um candidato virar notícia em esportes ou em coluna de
 * celebridade, essa manchete não aparece. É uma linha a menos numa página. */
const SECAO_FORA = new RegExp(
  "^/(esportes|mundo|sao-paulo|rio-de-janeiro|minas-gerais|celebridades"
  + "|entretenimento|vida-e-estilo|gastronomia|viagem)(/|$)"
  + "|^/colunas/(fabia-oliveira|claudia-meireles|pouca-vergonha|leo-dias)(/|$)");

function secaoFora(url) {
  try { return SECAO_FORA.test(new URL(url).pathname); } catch { return false; }
}

async function main() {
  // nomes: majoritários embutidos + deputados, se deputados.js estiver na pasta
  const nomes = [...MAJORITARIOS];
  if (existsSync("deputados.js")) {
    const g = {};
    new Function("window", await readFile("deputados.js", "utf8"))(g);
    for (const c of g.DEPUTADOS.candidatos) if (c.na_urna !== false) nomes.push(c.nome);
    console.log("nomes: " + MAJORITARIOS.length + " majoritários + " + (nomes.length - MAJORITARIOS.length) + " deputados");
  } else {
    console.log("deputados.js não encontrado — coletando só os " + nomes.length + " majoritários");
  }

  // acumula sobre o que já foi coletado antes
  const base = { atualizado: null, por_candidato: {} };
  if (existsSync("noticias.js")) {
    const g = {};
    new Function("window", await readFile("noticias.js", "utf8"))(g);
    Object.assign(base.por_candidato, (g.NOTICIAS || {}).por_candidato || {});
    console.log("acumulando sobre coleta anterior");
  }

  /* O acervo é cumulativo: o que entrou errado antes desta trava existir fica
     lá para sempre se ninguém varrer. Esta varredura roda toda vez e é
     idempotente — depois da primeira, não acha mais nada. */
  {
    const fora = [];
    for (const [k, lista] of Object.entries(base.por_candidato)) {
      const fica = lista.filter((it) => !secaoFora(it.url));
      if (fica.length === lista.length) continue;
      lista.filter((it) => secaoFora(it.url)).forEach((it) => fora.push([k, it.titulo]));
      if (fica.length) base.por_candidato[k] = fica; else delete base.por_candidato[k];
    }
    if (fora.length) {
      console.log("\n  ✕ SEÇÃO QUE NÃO É POLÍTICA DO DF — removidas do acervo:");
      for (const [k, t] of fora) console.log("      " + k.padEnd(22) + "  " + t.slice(0, 66));
      console.log("  Confira: se alguma for mesmo sobre a candidatura, me avise.\n");
    }
  }

  console.log("\nfeeds gerais:");
  const itens = [];
  for (const [veiculo, url] of FEEDS) {
    const xml = await baixar(url);
    const is = parseRSS(xml);
    console.log("  " + String(is.length).padStart(3) + "  " + url);
    is.forEach((i) => itens.push({ ...i, veiculo }));
  }

  /* Etiqueta de TODOS, não só dos majoritários. Sem isso, um deputado só
     apareceria se caísse nos ~120 itens recentes dos feeds gerais — e nenhum
     dos 602 caiu na primeira coleta, embora vários tenham etiqueta cheia.
   *
   * ── A ARMADILHA DA ETIQUETA ─────────────────────────────────────────────
   *
   * A URL da etiqueta é montada a partir do nome: metropoles.com/tag/<slug>.
   * Quando o nome de urna coincide com o de uma pessoa famosa, essa URL é a
   * etiqueta DA OUTRA PESSOA — e como o item vinha com forcarNome, ele pulava
   * a checagem de menção e era colado no candidato sem ninguém conferir.
   *
   * Foi o que aconteceu com MICHEL PLATINI, candidato a distrital pelo PSOL:
   * a página dele recebeu as manchetes do dirigente de futebol, incluindo as
   * de punição por infração ética. Isso não é um engano engraçado — é
   * associar o nome de um candidato a um escândalo que não é dele, na única
   * página que promete não afirmar nada que não possa sustentar.
   *
   * A trava: a etiqueta só vale se pelo menos um item dela citar o DF, a
   * política local ou a eleição. Etiqueta de futebol internacional não cita.
   * Perder notícia legítima por excesso de rigor custa uma linha a menos numa
   * página; deixar entrar notícia de outra pessoa custa o projeto. */
  const MARCA_DF = /(brasilia|distrito federal|\bdf\b|ceilandia|taguatinga|samambaia|planaltina|recanto das emas|santa maria|sobradinho|guara|gama|paranoa|riacho fundo|brazlandia|itapoa|estrutural|sol nascente|vicente pires|aguas claras|camara legislativa|cldf|gdf|buriti|esplanada|eleic|candidat|deputad|senad|governador)/;

  console.log("\netiquetas por candidato (" + nomes.length + ", ~" + Math.ceil(nomes.length * THROTTLE / 60000) + " min):");
  let comEtiqueta = 0;
  const homonimos = [];
  let curtos = 0;
  for (const [n, nome] of nomes.entries()) {
    if (n % 50 === 0) process.stdout.write("  " + n + "/" + nomes.length + "\r");
    /* A URL da etiqueta sai do nome. Nome de uma palavra e curta tem etiqueta
       de outra coisa: /tag/franca é o país, não o candidato FRANÇA do PODE.
       São exatamente os nomes que formasDe já recusa por menção — recusar
       aqui também só fecha a porta que tinha ficado aberta. */
    if (!formasDe(nome).length) { curtos++; continue; }
    const xml = await baixar("https://www.metropoles.com/tag/" + slug(nome) + "/feed");
    const is = parseRSS(xml);
    if (!is.length) continue;
    const daqui = is.some((i) => MARCA_DF.test(norm(i.titulo + " " + i.descricao)));
    if (!daqui) {
      /* a etiqueta existe e não fala do DF: é de outra pessoa com o mesmo nome */
      homonimos.push(nome);
      continue;
    }
    comEtiqueta++;
    is.forEach((i) => itens.push({ ...i, veiculo: "Metrópoles", forcarNome: nome }));
  }
  console.log("  " + comEtiqueta + " de " + nomes.length + " têm etiqueta com matéria"
    + (curtos ? "  (" + curtos + " nomes curtos demais para ter etiqueta própria)" : ""));

  if (homonimos.length) {
    console.log("\n  ✕ ETIQUETA DE OUTRA PESSOA — descartada, e o acervo desses foi limpo:");
    for (const nome of homonimos) {
      const k = slug(nome);
      const tinha = (base.por_candidato[k] || []).length;
      delete base.por_candidato[k];
      console.log("      " + nome + (tinha ? "  (" + tinha + " manchetes removidas)" : ""));
    }
    console.log("  A etiqueta existe no Metrópoles mas não fala do DF nem de eleição.");
    console.log("  Nome de urna igual ao de gente famosa cai aqui — confira se algum");
    console.log("  desses é candidatura de verdade que ficou de fora por excesso de rigor.\n");
  }
  const suspeitos = new Set(homonimos);

  const corte = Date.now() - JANELA_DIAS * 86400000;
  let novas = 0;

  for (const it of itens) {
    if (secaoFora(it.url)) continue;
    const d = new Date(it.pub);
    if (isNaN(d) || d.getTime() < corte) continue;
    const data = d.toISOString().slice(0, 10);
    const texto = norm(it.titulo + " " + it.descricao);

    /* Os feeds gerais têm o mesmo buraco da etiqueta: uma matéria do Metrópoles
       sobre o Platini do futebol menciona "Michel Platini" e casaria com o
       candidato. A detecção já foi feita lá em cima — aqui ela é reaproveitada:
       nome marcado como homônimo só entra se a manchete também falar do DF ou
       da eleição. Os outros nomes continuam como estavam. */
    const alvos = it.forcarNome ? [it.forcarNome]
      : nomes.filter((n) => mencionado(n, texto)
          && (!suspeitos.has(n) || MARCA_DF.test(texto)));

    for (const nome of alvos) {
      const k = slug(nome);
      const lista = (base.por_candidato[k] = base.por_candidato[k] || []);
      if (lista.some((x) => x.url === it.url)) continue;
      lista.push({ titulo: it.titulo, url: it.url, veiculo: it.veiculo, data });
      novas++;
    }
  }

  // mais recentes primeiro, com teto por candidato
  for (const k of Object.keys(base.por_candidato)) {
    base.por_candidato[k] = base.por_candidato[k]
      .sort((a, b) => b.data.localeCompare(a.data))
      .slice(0, MAX_POR_CANDIDATO);
    if (!base.por_candidato[k].length) delete base.por_candidato[k];
  }

  base.atualizado = new Date().toISOString().slice(0, 16).replace("T", " ");

  await writeFile("noticias.js",
    "/* noticias.js — manchetes dos portais do DF casadas por menção no título\n" +
    "   coletado em " + base.atualizado + " */\n" +
    "window.NOTICIAS=" + JSON.stringify(base) + ";\n");

  const comCobertura = Object.keys(base.por_candidato).length;
  const total = Object.values(base.por_candidato).reduce((a, l) => a + l.length, 0);
  console.log("\n" + novas + " manchetes novas · " + total + " no acervo · " + comCobertura + " candidatos com cobertura");

  const rank = Object.entries(base.por_candidato).sort((a, b) => b[1].length - a[1].length).slice(0, 10);
  console.log("\nmais citados:");
  rank.forEach(([k, l]) => console.log("  " + String(l.length).padStart(3) + "  " + k));
  console.log("\nnoticias.js gravado. Mande o arquivo no chat para publicar.");
}

main().catch((e) => { console.error("\nfalhou:", e.message); process.exit(1); });
