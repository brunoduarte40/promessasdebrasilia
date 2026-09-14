#!/usr/bin/env node
/**
 * coletar-deputados.mjs — promessasdebrasilia
 *
 * Monta a base dos 584 candidatos a deputado do DF (2026) a partir de fontes oficiais.
 *
 *   node coletar-deputados.mjs
 *
 * Sem dependências. Node 18+ (usa fetch nativo).
 *
 * Não depende de nenhum outro arquivo: basta este .mjs na pasta.
 *
 * Saídas:
 *   cache/          JSON bruto de cada request — se cair no meio, rode de novo
 *                   que ele continua de onde parou, sem rebaixar nada
 *   deputados.js    base final, pronta para publicar junto do index.html
 *   relatorio.txt   o que entrou, o que falhou, o que veio sujo
 *
 * Demora ~15 minutos: são ~1.200 requests com pausa entre elas, para não
 * sobrecarregar o TSE. Pode fechar e reabrir — o cache guarda o progresso.
 *
 * Exige HTTPS livre para divulgacandcontas.tse.jus.br e
 * dadosabertos.camara.leg.br.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ELEICAO = "20322002026";          // id da eleição 2026 no DivulgaCandContas
const UF = "DF";
const CARGOS = { 6: "federal", 8: "distrital" };
const LEGISLATURA = 57;                 // legislatura atual da Câmara dos Deputados

const TSE = "https://divulgacandcontas.tse.jus.br/divulga/rest/v1";
const CAMARA = "https://dadosabertos.camara.leg.br/api/v2";

const UA = "promessasdebrasilia/1.0 (coletor de dados públicos; contato: SEU-EMAIL)";
const THROTTLE_MS = 700;                // não reduza muito: são ~1.200 requests
const CACHE = "cache";

const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ *
 * fetch com cache em disco, throttle e retry exponencial
 * ------------------------------------------------------------------ */
let ultimaReq = 0;

async function getJSON(url, cacheKey) {
  const arquivo = path.join(CACHE, cacheKey + ".json");
  if (existsSync(arquivo)) {
    return JSON.parse(await readFile(arquivo, "utf8"));
  }

  for (let tentativa = 1; tentativa <= 5; tentativa++) {
    const espera = THROTTLE_MS - (Date.now() - ultimaReq);
    if (espera > 0) await sleep(espera);
    ultimaReq = Date.now();

    try {
      const r = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(45000),
      });

      if (r.status === 429 || r.status >= 500) {
        const backoff = 2000 * 2 ** (tentativa - 1);
        log(`  ${r.status} em ${url} — nova tentativa em ${backoff / 1000}s`);
        await sleep(backoff);
        continue;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);

      const dados = await r.json();
      await writeFile(arquivo, JSON.stringify(dados));
      return dados;
    } catch (e) {
      if (tentativa === 5) throw new Error(`${url} falhou: ${e.message}`);
      await sleep(2000 * 2 ** (tentativa - 1));
    }
  }
}

/* ------------------------------------------------------------------ *
 * normalização do campo `sites` do TSE
 *
 * O campo é digitado à mão pela campanha e vem sujo de nove maneiras
 * conhecidas. Cada regra abaixo corresponde a um padrão real observado.
 * ------------------------------------------------------------------ */
const REDES = [
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)instagran\.com$/, "instagram"],   // typo real observado
  [/(^|\.)facebook\.com$/, "facebook"],
  [/(^|\.)fb\.com$/, "facebook"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)youtube\.com$/, "youtube"],
  [/(^|\.)youtu\.be$/, "youtube"],
  [/(^|\.)x\.com$/, "x"],
  [/(^|\.)twitter\.com$/, "x"],
  [/(^|\.)linktr\.ee$/, "linktree"],
  [/(^|\.)threads\.(net|com)$/, "threads"],
];

// caminhos que são conteúdo, não perfil
const CONTEUDO = /^\/(p|reel|reels|share|posts|watch|video)\//i;

function normalizarSites(brutos) {
  const saida = [];
  const sujos = [];
  const vistos = new Set();

  for (const bruto of brutos ?? []) {
    if (typeof bruto !== "string" || !bruto.trim()) continue;
    const original = bruto.trim();

    let u;
    try {
      u = new URL(original.includes("://") ? original : "https://" + original);
    } catch {
      sujos.push({ valor: original, motivo: "não parseável como URL" });
      continue;
    }

    const host = u.hostname.toLowerCase();

    // padrão 1: "https://AGATHA LOPES" — nome de pessoa no lugar do host
    if (/\s/.test(decodeURIComponent(host)) || !host.includes(".")) {
      // padrão 2: "https://@ADERVALDF" ou "https://_AGATHALOPESDC" — é handle, não URL
      const handle = decodeURIComponent(host).replace(/^[@_]+/, "");
      sujos.push({
        valor: original,
        motivo: /^[@_]/.test(decodeURIComponent(host))
          ? `handle sem rede identificada: @${handle}`
          : "host inválido (nome com espaço)",
      });
      continue;
    }

    // padrão 8: URL de post/reel em vez de perfil
    if (CONTEUDO.test(u.pathname)) {
      sujos.push({ valor: original, motivo: "link de conteúdo, não de perfil" });
      continue;
    }

    const rede = REDES.find(([re]) => re.test(host))?.[1] ?? "site";

    // padrão 3: host em caixa alta pode ser minusculado com segurança;
    // o path NÃO (Instagram e TikTok são case-sensitive e o TSE já destruiu a caixa).
    u.hostname = host;
    u.hash = "";
    // padrão 9: parâmetros de rastreio que a rede acrescenta e não identificam nada
    for (const p of ["igsh", "si", "mibextid", "rdid", "share_url", "fbclid", "utm_source"]) {
      u.searchParams.delete(p);
    }
    const limpa = u.toString().replace(/\/$/, "");

    // padrão 6: duplicatas que diferem só por caixa
    const chave = (host + u.pathname).toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);

    saida.push({ rede, url: limpa, original: original !== limpa ? original : undefined });
  }

  return { sites: saida, sujos };
}

/* ------------------------------------------------------------------ *
 * TSE
 * ------------------------------------------------------------------ */
async function listarCandidatos(cargo) {
  const d = await getJSON(
    `${TSE}/candidatura/listar/2026/${UF}/${ELEICAO}/${cargo}/candidatos`,
    `tse-lista-${cargo}`
  );
  return d.candidatos ?? [];
}

async function detalharCandidato(id) {
  return getJSON(
    `${TSE}/candidatura/buscar/2026/${UF}/${ELEICAO}/candidato/${id}`,
    `tse-cand-${id}`
  );
}

/* ------------------------------------------------------------------ *
 * Câmara dos Deputados — só para os federais em exercício
 * ------------------------------------------------------------------ */
async function deputadosFederaisDF() {
  const lista = await getJSON(`${CAMARA}/deputados?siglaUf=${UF}&itens=100`, "camara-lista-df");
  const out = [];
  for (const d of lista.dados ?? []) {
    // o CPF só existe no detalhe — é ele que casa com o TSE
    const det = await getJSON(`${CAMARA}/deputados/${d.id}`, `camara-dep-${d.id}`);
    out.push({
      id: d.id,
      nome: d.nome,
      partido: d.siglaPartido,
      cpf: (det.dados?.cpf ?? "").replace(/\D/g, ""),
      nascimento: det.dados?.dataNascimento ?? null,
      email: d.email ?? null,
    });
  }
  return out;
}

async function proposicoesDe(idDeputado, ano) {
  const props = [];
  let pagina = 1;
  while (pagina <= 40) {   // teto de segurança
    const url = `${CAMARA}/proposicoes?idDeputadoAutor=${idDeputado}&ano=${ano}`
      + `&ordem=DESC&ordenarPor=id&itens=100&pagina=${pagina}`;
    const d = await getJSON(url, `camara-prop-${idDeputado}-${ano}-p${pagina}`);
    const itens = d.dados ?? [];
    props.push(...itens.map((p) => ({
      id: p.id,
      tipo: p.siglaTipo,
      numero: p.numero,
      ano: p.ano,
      ementa: p.ementa,
      data: p.dataApresentacao,
    })));
    if (!(d.links ?? []).some((l) => l.rel === "next")) break;
    pagina++;
  }
  return props;
}

/* ------------------------------------------------------------------ *
 * CLDF — NÃO IMPLEMENTADO DE PROPÓSITO
 *
 * O endpoint é POST https://ple.cl.df.gov.br/pleservico/api/public/proposicao/filter
 * com body { autoria, ano, ... } e query ?page=0&size=N.
 * O contrato veio da documentação, não de execução — ninguém confirmou
 * se `autoria` aceita nome (string) ou id.
 *
 * ANTES DE CODIFICAR: abra https://ple.cl.df.gov.br/#/proposicao/buscar
 * com o DevTools na aba Network, faça uma busca por autor, e copie o
 * corpo real do POST. Aí implemente aqui.
 *
 * Cuidado: GET /proposicao/{id} NÃO é detalhe-por-id — retorna array com
 * comportamento não decifrado. Não use.
 * ------------------------------------------------------------------ */
async function proposicoesCLDF(/* nomeParlamentar, ano */) {
  return null;
}

/* ------------------------------------------------------------------ *
 * principal
 * ------------------------------------------------------------------ */
async function main() {
  await mkdir(CACHE, { recursive: true });
  const problemas = [];
  const candidatos = [];

  for (const [cargo, rotulo] of Object.entries(CARGOS)) {
    const lista = await listarCandidatos(cargo);
    log(`\n${rotulo}: ${lista.length} candidaturas na lista do TSE`);

    for (const [i, c] of lista.entries()) {
      if (i % 25 === 0) log(`  ${i}/${lista.length}…`);
      let det;
      try {
        det = await detalharCandidato(c.id);
      } catch (e) {
        problemas.push(`detalhe falhou — ${c.nomeUrna} (${c.id}): ${e.message}`);
        continue;
      }

      const { sites, sujos } = normalizarSites(det.sites);
      for (const s of sujos) problemas.push(`site sujo — ${det.nomeUrna}: ${s.valor} (${s.motivo})`);

      candidatos.push({
        id: String(c.id),
        cargo: rotulo,
        // o nomeUrna da LISTA difere do nomeUrna do DETALHE. O detalhe é o correto.
        nome: det.nomeUrna ?? c.nomeUrna,
        nome_completo: det.nomeCompleto ?? null,
        numero: String(det.numero ?? c.numero),
        partido: det.partido?.sigla ?? c.partido?.sigla ?? null,
        coligacao: det.nomeColigacao ?? null,
        situacao: det.descricaoSituacao ?? null,      // do REGISTRO
        na_urna: det.descricaoSituacaoCandidato ?? null,
        reeleicao: det.st_REELEICAO === true,
        ocupacao: det.ocupacao ?? null,
        instrucao: det.grauInstrucao ?? null,
        // float com lixo de precisão na origem — arredonda para centavos
        bens: det.totalDeBens ? Number(Number(det.totalDeBens).toFixed(2)) : 0,
        sites,
        cpf: (det.cpf ?? "").replace(/\D/g, ""),      // só para casar com a Câmara; não publicar
        foto: det.fotoUrlPublicavel ? det.fotoUrl : null,
        ficha_limpa_flag: det.st_MOTIVO_FICHA_LIMPA === true,
        // preenchidos depois
        mandato: null,
        questionario: null,
      });
    }
  }

  /* --- casa candidatos federais com deputados em exercício, por CPF --- */
  log("\nCâmara dos Deputados: buscando bancada do DF…");
  const bancada = await deputadosFederaisDF();
  let casados = 0;

  for (const dep of bancada) {
    const cand = candidatos.find((c) => c.cpf && dep.cpf && c.cpf === dep.cpf);
    if (!cand) {
      problemas.push(`deputado em exercício sem candidatura correspondente: ${dep.nome} (pode não estar concorrendo)`);
      continue;
    }
    casados++;
    const props = await proposicoesDe(dep.id, 2026);
    cand.mandato = {
      casa: "Câmara dos Deputados",
      id_camara: dep.id,
      proposicoes_2026: props.length,
      // as 10 mais recentes, para exibir sem inchar o arquivo
      amostra: props.slice(0, 10),
      fonte: `https://dadosabertos.camara.leg.br/api/v2/proposicoes?idDeputadoAutor=${dep.id}&ano=2026`,
    };
  }
  log(`  ${casados}/${bancada.length} casados por CPF`);

  /* --- saída --- */
  const semNada = candidatos.filter((c) => c.sites.length === 0).length;
  const comSitePessoal = candidatos.filter((c) => c.sites.some((s) => s.rede === "site")).length;

  const base = {
    atualizado: new Date().toISOString().slice(0, 10),
    total: candidatos.length,
    // o CPF sai da base pública — serviu só para casar com a Câmara
    candidatos: candidatos.map(({ cpf, ...resto }) => resto),
  };

  // .js e não .json: a página publicada bloqueia fetch de arquivos externos
  // por CSP, então a base precisa entrar como <script> que define um global.
  await writeFile(
    "deputados.js",
    `/* deputados.js — candidaturas a deputado distrital e federal no DF, 2026\n` +
      `   fonte: DivulgaCandContas/TSE e dados abertos da Câmara dos Deputados\n` +
      `   gerado por coletar-deputados.mjs em ${base.atualizado} */\n\n` +
      `window.DEPUTADOS = ${JSON.stringify(base)};\n`
  );

  const relatorio = [
    `promessasdebrasilia — coleta de ${new Date().toLocaleString("pt-BR")}`,
    ``,
    `candidaturas coletadas ......... ${candidatos.length}`,
    `  distrital .................... ${candidatos.filter((c) => c.cargo === "distrital").length}`,
    `  federal ...................... ${candidatos.filter((c) => c.cargo === "federal").length}`,
    `registro deferido .............. ${candidatos.filter((c) => /deferido/i.test(c.situacao || "") && !/indeferido/i.test(c.situacao || "")).length}`,
    `com alguma rede declarada ...... ${candidatos.length - semNada}`,
    `com site próprio (não rede) .... ${comSitePessoal}`,
    `sem nenhuma rede declarada ..... ${semNada}`,
    `com mandato federal casado ..... ${casados}`,
    ``,
    `O TSE não obriga candidato a deputado a registrar propostas. Esta base tem`,
    `ficha e histórico — não tem promessa. O campo "questionario" fica null até`,
    `a resposta chegar, e "com site próprio" é a pista de onde procurar propostas.`,
    ``,
    `--- ocorrências (${problemas.length}) ---`,
    ...problemas,
  ].join("\n");

  await writeFile("relatorio.txt", relatorio);
  log(`\n${relatorio.split("--- ocorrências")[0]}`);
  log(`deputados.js e relatorio.txt gravados. ${problemas.length} ocorrências no relatório.`);
  log(`\nMande o deputados.js de volta no chat para publicar.`);
}

main().catch((e) => {
  console.error("\nfalhou:", e.message);
  process.exit(1);
});
