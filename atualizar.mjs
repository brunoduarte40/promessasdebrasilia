#!/usr/bin/env node
/**
 * atualizar.mjs — promessasdebrasilia
 *
 *   node atualizar.mjs
 *
 * Relê no TSE a SITUAÇÃO DE REGISTRO e os BENS das 626 candidaturas e funde o
 * resultado nos arquivos que já existem. Não é o coletor: é uma atualização.
 *
 * A diferença importa. O coletor original monta a base do zero e leva uns 15
 * minutos. Este aqui preserva tudo que foi acrescentado depois — leitura de
 * site, propostas, bandeiras, mandato, nome usado pela imprensa — e mexe
 * apenas nos campos de que o TSE é dono. Rodar o coletor completo às vésperas
 * da eleição apagaria meses de trabalho para corrigir uma palavra.
 *
 * Por que rodar: registro de candidatura muda até a véspera. Hoje há
 * candidaturas aguardando julgamento e outras indeferidas com recurso
 * pendente. Uma página que diz "deferido" sobre quem já caiu está errada, e
 * errada de um jeito que importa.
 *
 * O que ele NÃO toca, de propósito:
 *   sites          já passaram por limpeza (host compartilhado virou
 *                  "pagina-partido") e o site_lido aponta para eles
 *   site_lido      leitura feita uma vez, com data registrada
 *   mandato        vem da Câmara Legislativa, não do TSE
 *   nome_civil     de uma passagem própria, só para nomes de urna de uma palavra
 *   nome_imprensa  escolha editorial, não dado do TSE
 *
 * Precisa de:
 *   dados.js  deputados.js   na mesma pasta
 *   Node 18+  (fetch nativo, sem dependência nenhuma)
 *   HTTPS livre para divulgacandcontas.tse.jus.br
 *
 * Demora ~7 minutos: são 626 requisições com pausa entre elas, para não
 * sobrecarregar o TSE. Nada é gravado até o fim — se cair no meio, os
 * arquivos ficam como estavam.
 *
 * Saídas:
 *   dados.js       atualizado
 *   deputados.js   atualizado
 *   mudancas.txt   o que mudou, linha a linha
 */

import { readFile, writeFile } from "node:fs/promises";

const ELEICAO = "20322002026";
const UF = "DF";
const TSE = "https://divulgacandcontas.tse.jus.br/divulga/rest/v1";
const UA = "promessasdebrasilia/1.0 (atualizacao de dados publicos; contato: SEU-EMAIL)";
const PAUSA = 600;
const CARGOS = [
  [3, "governo"],
  [5, "senado"],
  [6, "federal"],
  [8, "distrital"],
];

/* Quem está na urna é o que o TSE DIZ, não o que eu deduzo do texto da
   situação. O campo descricaoSituacaoCandidato responde "Consta da urna" ou
   "Não consta da urna" — resposta direta, sem interpretação no meio.
   A regex antiga virou conferência: nas 602 candidaturas a deputado as duas
   concordaram, e onde discordarem quem vale é o TSE, com o caso relatado.
   Foi assim que o buraco apareceu — o campo nunca tinha sido lido para as
   candidaturas majoritárias, e uma delas já estava fora. */
const FORA = /renúncia|^indeferido$|não conhecido/i;
const naUrna = (det) => !/não consta/i.test(det.descricaoSituacaoCandidato || "Consta da urna");

/* O status dos majoritários é um código curto, porque a página desenha um
   selo diferente para cada um. Só estes quatro têm desenho: qualquer coisa
   fora da lista é relatada em voz alta em vez de virar um selo em branco. */
const STATUS = [
  [/^deferido/i,                                "deferido"],
  [/indeferido em prazo recursal|com recurso/i, "indeferido_recurso"],
  // o TSE trocou "Aguardando julgamento" por "Pendente de julgamento" no meio
  // da campanha; as duas formas caem no mesmo selo
  [/aguardando julgamento|pendente de julgamento|sub judice/i, "em_julgamento"],
  [/^indeferido$/i,                             "indeferido"],
  [/renúncia/i,                                 "renuncia"],
  [/não conhecido/i,                            "nao_conhecido"],
];
const DESENHADOS = new Set(["deferido", "indeferido_recurso", "em_julgamento"]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mudancas = [];
const avisos = [];

async function getJSON(url, tentativa = 0) {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } catch (e) {
    if (tentativa >= 3) throw e;
    await sleep(1500 * (tentativa + 1));
    return getJSON(url, tentativa + 1);
  }
}

/* Lê um arquivo window.X = {...} sem avaliar nada além dele. */
async function lerBase(arquivo, chave) {
  const src = await readFile(arquivo, "utf8");
  const g = {};
  new Function("window", src)(g);
  if (!g[chave]) throw new Error(`${arquivo} não define window.${chave}`);
  return g[chave];
}

function statusCurto(descricao) {
  for (const [re, codigo] of STATUS) if (re.test(descricao || "")) return codigo;
  return null;
}

function motivoDe(det) {
  const m = det.motivoSituacao;
  if (!Array.isArray(m) || !m.length) return null;
  return m.map((x) => x.nmMotivoIndeferimento).filter(Boolean).join(" · ") || null;
}

/* Anota uma diferença só quando ela existe de verdade, para o relatório não
   virar uma lista de 626 linhas dizendo "igual". */
function anota(quem, campo, de, para) {
  if (String(de ?? "") === String(para ?? "")) return false;
  mudancas.push(`${quem} · ${campo}: ${de ?? "—"} → ${para ?? "—"}`);
  return true;
}

async function main() {
  console.log("lendo as bases locais…");
  const D = await lerBase("dados.js", "DADOS");
  const B = await lerBase("deputados.js", "DEPUTADOS");

  const porNumero = {};                       // majoritários: a chave é o número na urna
  D.governo.forEach((c) => (porNumero["governo:" + c.numero] = c));
  D.senado.forEach((c) => (porNumero["senado:" + c.numero] = c));
  const porId = {};                           // deputados: a chave é o id do TSE
  B.candidatos.forEach((c) => (porId[String(c.id)] = c));

  let lidos = 0, falhas = 0, tocados = 0;
  const novos = [];
  const vistos = new Set();

  for (const [cargo, rotulo] of CARGOS) {
    const { candidatos = [] } = await getJSON(
      `${TSE}/candidatura/listar/2026/${UF}/${ELEICAO}/${cargo}/candidatos`);
    console.log(`\n${rotulo}: ${candidatos.length} candidaturas no TSE`);

    for (const [i, c] of candidatos.entries()) {
      if (i % 20 === 0) process.stdout.write(`  ${i}/${candidatos.length}   \r`);
      await sleep(PAUSA);
      let det;
      try {
        det = await getJSON(`${TSE}/candidatura/buscar/2026/${UF}/${ELEICAO}/candidato/${c.id}`);
        lidos++;
      } catch (e) {
        falhas++;
        avisos.push(`não deu para ler ${c.nomeUrna} (${c.id}): ${e.message}`);
        continue;
      }

      const situacao = det.descricaoSituacao ?? null;
      const bens = det.totalDeBens ? Number(Number(det.totalDeBens).toFixed(2)) : 0;
      const bensQtd = Array.isArray(det.bens) ? det.bens.length : 0;
      const motivo = motivoDe(det);
      const nome = det.nomeUrna ?? c.nomeUrna;

      if (rotulo === "governo" || rotulo === "senado") {
        const alvo = porNumero[rotulo + ":" + String(det.numero ?? c.numero)];
        if (!alvo) {                           // candidatura nova entre as majoritárias
          novos.push(`${rotulo} · ${nome} (${det.numero}) — NÃO está em dados.js`);
          continue;
        }
        vistos.add(rotulo + ":" + alvo.numero);
        const curto = statusCurto(situacao);
        if (!curto) avisos.push(`${nome}: o TSE devolveu "${situacao}", que não está na tabela de status`);
        else if (!DESENHADOS.has(curto) && curto !== alvo.status)
          avisos.push(`${nome} passou para "${curto}" — a página NÃO tem selo desenhado para esse estado. `
            + `Ou some o selo, ou a candidatura deveria sair da lista. Decida antes de publicar.`);

        let mexeu = false;
        mexeu = anota(nome, "status", alvo.status, curto ?? situacao) || mexeu;
        mexeu = anota(nome, "patrimônio", alvo.bens, bens) || mexeu;
        mexeu = anota(nome, "motivo", alvo.motivo, motivo) || mexeu;
        if (curto) alvo.status = curto;
        const naU = naUrna(det);
        mexeu = anota(nome, "na urna", alvo.na_urna === false ? "não" : "sim", naU ? "sim" : "não") || mexeu;
        alvo.na_urna = naU;
        alvo.bens = bens;
        if (bensQtd) alvo.bens_qtd = bensQtd;
        if (motivo) alvo.motivo = motivo; else delete alvo.motivo;
        if (mexeu) tocados++;
        continue;
      }

      /* ---- deputados ---- */
      const alvo = porId[String(c.id)];
      if (!alvo) {
        novos.push(`${rotulo} · ${nome} (${det.numero}) id ${c.id} — NÃO está em deputados.js`);
        B.candidatos.push({
          id: String(c.id), cargo: rotulo, nome, numero: String(det.numero ?? c.numero),
          partido: det.partido?.sigla ?? null, coligacao: det.nomeColigacao ?? null,
          situacao, na_urna: !FORA.test(situacao || ""),
          reeleicao: det.st_REELEICAO === true,
          ocupacao: det.ocupacao ?? null, instrucao: det.grauInstrucao ?? null,
          bens, sites: [], mandato: null, questionario: null,
          motivo: motivo || undefined,
        });
        tocados++;
        continue;
      }
      vistos.add(String(c.id));

      let mexeu = false;
      mexeu = anota(alvo.nome, "situação", alvo.situacao, situacao) || mexeu;
      mexeu = anota(alvo.nome, "patrimônio", alvo.bens, bens) || mexeu;
      mexeu = anota(alvo.nome, "motivo", alvo.motivo, motivo) || mexeu;
      mexeu = anota(alvo.nome, "partido", alvo.partido, det.partido?.sigla ?? null) || mexeu;
      mexeu = anota(alvo.nome, "coligação", alvo.coligacao, det.nomeColigacao ?? null) || mexeu;

      /* O site NÃO é sobrescrito: a lista local passou por limpeza e o
         site_lido aponta para ela. Mas uma mudança no TSE precisa aparecer no
         relatório, senão a página fica mostrando um endereço que a própria
         candidatura já trocou. */
      /* Compara por HOST, não pela URL inteira: os endereços locais já tiveram
         parâmetro de rastreamento removido, então comparar string com string
         acusaria diferença em quase todos. Host novo é que é notícia. */
      const host = (u) => { try { return new URL(String(u).includes("://") ? u : "https://" + u)
        .hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; } };
      const jaTem = new Set((alvo.sites || []).map((s) => host(s.url)).filter(Boolean));
      /* Só avisa sobre host que PARECE endereço de verdade. A primeira versão
         comparava contra a lista já limpa e acusava justamente a sujeira que o
         coletor havia descartado de propósito — "instagran", "https",
         "facebookhttps", nome de usuário solto. Deram 182 avisos e nenhum era
         notícia. Host real tem ponto e um TLD de pelo menos duas letras. */
      const real = (h) => h && /\.[a-z]{2,}$/i.test(h);
      const novosHosts = [...new Set((Array.isArray(det.sites) ? det.sites : [])
        .map(host).filter((h) => real(h) && !jaTem.has(h)))];
      if (novosHosts.length)
        avisos.push(`${alvo.nome}: o TSE passou a listar endereço em ${novosHosts.join(", ")}, `
          + `que não está na base (não mexi nos sites — decida se vale reler a campanha dessa candidatura)`);

      alvo.situacao = situacao;
      alvo._urnaTSE = naUrna(det);
      alvo.bens = bens;
      alvo.partido = det.partido?.sigla ?? alvo.partido;
      alvo.coligacao = det.nomeColigacao ?? alvo.coligacao;
      if (motivo) alvo.motivo = motivo; else delete alvo.motivo;
      if (mexeu) tocados++;
    }
    process.stdout.write("                         \r");
  }

  /* ---- deriva o que a página lê, com a mesma regra de sempre ---- */
  let entraram = 0, sairam = 0;
  for (const c of B.candidatos) {
    const antes = c.na_urna;
    const porRegex = !FORA.test(c.situacao || "");
    if (c._urnaTSE !== undefined) {            // o TSE tem a palavra final
      if (c._urnaTSE !== porRegex)
        avisos.push(`${c.nome}: o TSE diz "${c._urnaTSE ? "consta" : "não consta"} da urna" e a regra do `
          + `texto ("${c.situacao}") diria o contrário. Vale o TSE — mas a regra precisa de ajuste.`);
      c.na_urna = c._urnaTSE;
      delete c._urnaTSE;
    } else {
      c.na_urna = porRegex;
    }
    if (antes === true && c.na_urna === false) { sairam++; mudancas.push(`${c.nome} · SAIU DA URNA (${c.situacao})`); }
    if (antes === false && c.na_urna === true) { entraram++; mudancas.push(`${c.nome} · VOLTOU PARA A URNA (${c.situacao})`); }
  }
  const C = B.candidatos;
  B.resumo = Object.assign({}, B.resumo, {
    total: C.length,
    na_urna: C.filter((c) => c.na_urna).length,
    fora_da_urna: C.filter((c) => !c.na_urna).length,
    distrital: C.filter((c) => c.cargo === "distrital").length,
    federal: C.filter((c) => c.cargo === "federal").length,
    com_site: C.filter((c) => (c.sites || []).some((s) => s.rede === "site")).length,
    sem_canal: C.filter((c) => !(c.sites || []).length).length,
    com_mandato: C.filter((c) => c.mandato).length,
  });

  /* ---- freio de mão ---- */
  if (falhas > lidos * 0.05) {
    console.error(`\nABORTADO: ${falhas} de ${lidos + falhas} candidaturas não puderam ser lidas.`);
    console.error("Gravar agora deixaria a base pela metade. Nada foi alterado — rode de novo.");
    process.exit(1);
  }

  /* ---- grava ---- */
  const hoje = new Date();
  const MES = ["janeiro","fevereiro","março","abril","maio","junho","julho",
               "agosto","setembro","outubro","novembro","dezembro"];
  D.atualizado = `${hoje.getDate()} de ${MES[hoje.getMonth()]} de ${hoje.getFullYear()}`;
  D.bens_atualizado = hoje.toISOString().slice(0, 10);
  B.atualizado = D.atualizado;

  await writeFile("dados.js",
    "/* dados.js — promessas das candidaturas majoritárias no DF, 2026\n" +
    "   fonte: planos de governo no TSE e imprensa do DF\n" +
    "   situação de registro e bens atualizados em " + D.bens_atualizado + " */\n" +
    "window.DADOS=" + JSON.stringify(D) + ";\n");

  await writeFile("deputados.js",
    "/* deputados.js — candidaturas a deputado distrital e federal no DF, 2026\n" +
    "   fontes: DivulgaCandContas/TSE e PLE da Câmara Legislativa do DF\n" +
    "   coletado em " + B.atualizado + " */\n" +
    "window.DEPUTADOS=" + JSON.stringify(B) + ";\n");

  const relatorio = [
    "atualização de " + D.atualizado,
    "candidaturas lidas no TSE: " + lidos + " · falharam: " + falhas,
    "candidaturas com alguma mudança: " + tocados,
    "saíram da urna agora: " + sairam + " · voltaram: " + entraram,
    "majoritários fora da urna: " + (D.governo.concat(D.senado)
      .filter((c) => c.na_urna === false).map((c) => c.nome).join(", ") || "nenhum"),
    "",
    "--- MUDANÇAS ---",
    mudancas.length ? mudancas.join("\n") : "nenhuma",
    "",
    "--- PRECISA DE DECISÃO SUA ---",
    avisos.length ? avisos.join("\n") : "nada",
    "",
    "--- CANDIDATURAS NOVAS ---",
    novos.length ? novos.join("\n") + "\n(entraram sem retrato e sem leitura de site)" : "nenhuma",
  ].join("\n");
  await writeFile("mudancas.txt", relatorio + "\n");

  console.log("\n" + relatorio);
  console.log("\ndados.js e deputados.js atualizados · relatório em mudancas.txt");
  if (avisos.length) console.log("\nATENÇÃO: há avisos acima que precisam de decisão antes de publicar.");
  console.log("\nMande os dois arquivos e o mudancas.txt no chat.");
}

main().catch((e) => {
  console.error("\nfalhou:", e.message);
  console.error("Nada foi gravado — os arquivos continuam como estavam.");
  process.exit(1);
});
