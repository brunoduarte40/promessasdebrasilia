#!/usr/bin/env node
/**
 * gerar-fotos.mjs — promessasdebrasilia
 *
 * Baixa os retratos oficiais registrados no TSE e gera fotos.js,
 * com as imagens embutidas como data URI.
 *
 *   node gerar-fotos.mjs
 *
 * Por que embutir em vez de linkar: a página publicada bloqueia imagens de
 * hosts externos por CSP. Um <img src="https://divulgacandcontas..."> não
 * carrega — e falha em silêncio, sem erro visível.
 *
 * Não depende de nenhum outro arquivo: basta este .mjs na pasta.
 *
 * Opcional, mas recomendado:  npm i sharp
 * Sem o sharp o script embute o JPEG original (~15 KB cada, ~500 KB no total).
 * Com o sharp, converte para WebP de 160px (~4 KB cada, ~120 KB no total).
 *
 * Exige HTTPS livre para divulgacandcontas.tse.jus.br.
 */

import { writeFile } from "node:fs/promises";

const ELEICAO = "20322002026";
const UF = "DF";
const TSE = "https://divulgacandcontas.tse.jus.br/divulga/rest/v1";
const UA = "promessasdebrasilia/1.0 (retratos oficiais; contato: SEU-EMAIL)";

// cargo 3 = governador, 5 = senador. São os que a página cobre hoje.
// Para incluir deputados, acrescente 8 (distrital) e 6 (federal) — mas
// repare que 584 retratos, mesmo em WebP, passam de 2 MB.
const CARGOS = { 3: "governo", 5: "senado" };

const LARGURA = 160;          // suficiente para o maior slot da página (44px @3x)
const THROTTLE_MS = 700;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let sharp = null;
try {
  ({ default: sharp } = await import("sharp"));
} catch {
  console.warn("sharp não encontrado — embutindo os JPEGs originais.");
  console.warn("Para arquivos bem menores: npm i sharp\n");
}

async function getJSON(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
  return r.json();
}

/**
 * Números na urna das candidaturas que a página exibe.
 * Embutidos aqui de propósito, para o script rodar sozinho.
 * Se a página mudar de escopo, atualize estas duas listas.
 */
const ALVO = {
  governo: new Set(["11", "40", "13", "55", "45", "30", "36", "16", "80", "29", "28"]),
  senado: new Set(["222", "223", "131", "123", "555", "300", "800", "290", "360", "161", "456", "700", "355"]),
};

async function main() {
  const alvo = ALVO;
  console.log(`alvo: ${alvo.governo.size} ao governo, ${alvo.senado.size} ao senado\n`);

  const fotos = {};
  const faltando = [];
  let bytes = 0;

  for (const [cargo, rotulo] of Object.entries(CARGOS)) {
    const { candidatos = [] } = await getJSON(
      `${TSE}/candidatura/listar/2026/${UF}/${ELEICAO}/${cargo}/candidatos`
    );

    for (const c of candidatos) {
      const numero = String(c.numero);
      // casa pelo número na urna: é único dentro do cargo e não sofre com
      // a divergência de nomeUrna entre lista e detalhe
      if (!alvo[rotulo].has(numero)) continue;

      await sleep(THROTTLE_MS);
      const det = await getJSON(`${TSE}/candidatura/buscar/2026/${UF}/${ELEICAO}/candidato/${c.id}`);

      if (!det.fotoUrlPublicavel || !det.fotoUrl) {
        faltando.push(`${rotulo} ${numero} ${c.nomeUrna} — retrato não publicável`);
        continue;
      }

      await sleep(THROTTLE_MS);
      const r = await fetch(det.fotoUrl, { headers: { "User-Agent": UA } });
      if (!r.ok) {
        faltando.push(`${rotulo} ${numero} ${c.nomeUrna} — HTTP ${r.status}`);
        continue;
      }

      let buf = Buffer.from(await r.arrayBuffer());
      let mime = "image/jpeg";

      if (sharp) {
        buf = await sharp(buf)
          .resize({ width: LARGURA, withoutEnlargement: true })
          .webp({ quality: 78 })
          .toBuffer();
        mime = "image/webp";
      }

      bytes += buf.length;
      fotos[`${rotulo}:${numero}`] = `data:${mime};base64,${buf.toString("base64")}`;
      console.log(`  ${rotulo} ${numero.padStart(3)} ${c.nomeUrna} — ${(buf.length / 1024).toFixed(1)} KB`);
    }
  }

  const saida =
    `/* fotos.js — retratos oficiais registrados no TSE\n` +
    `   gerado por gerar-fotos.mjs em ${new Date().toISOString().slice(0, 10)}\n` +
    `   chave: cargo:numeroNaUrna · fonte: DivulgaCandContas/TSE */\n\n` +
    `window.FOTOS = ${JSON.stringify(fotos, null, 0)};\n`;

  await writeFile("fotos.js", saida);

  console.log(`\n${Object.keys(fotos).length} retratos · ${(bytes / 1024).toFixed(0)} KB de imagem`);
  console.log(`fotos.js gravado (${(saida.length / 1024).toFixed(0)} KB com o base64).`);
  if (faltando.length) {
    console.log(`\nsem retrato (${faltando.length}) — a página mostra as iniciais:`);
    faltando.forEach((f) => console.log(`  ${f}`));
  }
  console.log(`\nPublique fotos.js junto do index.html e do dados.js.`);
}

main().catch((e) => {
  console.error("\nfalhou:", e.message);
  process.exit(1);
});
