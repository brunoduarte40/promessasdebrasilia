#!/usr/bin/env node
/**
 * fotos-deputados.mjs — promessasdebrasilia
 *
 * Baixa os retratos oficiais das 582 candidaturas a deputado que estão na urna
 * e gera fotos-deputados.js, com as imagens embutidas como data URI.
 *
 *   npm i sharp
 *   node fotos-deputados.mjs
 *
 * O sharp é OBRIGATÓRIO aqui, ao contrário do gerar-fotos.mjs dos 24
 * majoritários. Motivo de tamanho: o JPEG que o TSE entrega tem ~5 KB, e 582
 * deles viram 3 MB antes do base64 — inaceitável numa página que já pesa 290 KB
 * e que muita gente vai abrir com plano de dados limitado. Reduzidos a 96px de
 * largura em WebP, os mesmos 582 ficam perto de 700 KB.
 *
 * O avatar na lista aparece com 44px; 96px cobre tela retina com folga.
 *
 * Guarda o que já baixou em cache/, então rodar de novo é rápido e só busca
 * o que faltou. Exige HTTPS livre para divulgacandcontas.tse.jus.br.
 */

import { writeFile, readFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const ELEICAO = "20322002026";
const TSE = "https://divulgacandcontas.tse.jus.br/divulga/rest/v1";
const UA = "promessasdebrasilia/1.0 (retratos oficiais; contato: SEU-EMAIL)";
const CARGOS = [6, 8];              // 6 = federal, 8 = distrital
const LARGURA = 96;
const QUALIDADE = 62;
const THROTTLE = 220;
const CACHE = "cache-fotos";

let sharp;
try {
  ({ default: sharp } = await import("sharp"));
} catch {
  console.error("\nEste script precisa do sharp para reduzir as imagens.");
  console.error("Sem ele os 582 retratos passariam de 3 MB e a página ficaria pesada demais.\n");
  console.error("  npm i sharp\n");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

if (!existsSync(CACHE)) await mkdir(CACHE);
const jaTem = new Set((await readdir(CACHE)).map((f) => f.replace(/\.webp$/, "")));
if (jaTem.size) console.log("cache: " + jaTem.size + " retratos já baixados\n");

// 1. lista de quem está na urna
const alvos = [];
for (const cargo of CARGOS) {
  const { candidatos = [] } = await getJSON(
    `${TSE}/candidatura/listar/2026/DF/${ELEICAO}/${cargo}/candidatos`);
  candidatos.forEach((c) => alvos.push({ id: String(c.id), nome: c.nomeUrna, cargo }));
}
console.log(alvos.length + " candidaturas a deputado no TSE");
console.log("faltam baixar: " + alvos.filter((a) => !jaTem.has(a.id)).length + "\n");

// 2. baixa e reduz o que falta
let baixados = 0, semRetrato = 0, erros = 0;
for (const [i, a] of alvos.entries()) {
  if (i % 25 === 0) process.stdout.write("  " + i + "/" + alvos.length + "   \r");
  if (jaTem.has(a.id)) continue;
  try {
    await sleep(THROTTLE);
    const det = await getJSON(`${TSE}/candidatura/buscar/2026/DF/${ELEICAO}/candidato/${a.id}`);
    if (!det.fotoUrlPublicavel || !det.fotoUrl) { semRetrato++; continue; }

    await sleep(THROTTLE);
    const r = await fetch(det.fotoUrl, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) { erros++; continue; }

    const buf = await sharp(Buffer.from(await r.arrayBuffer()))
      .resize({ width: LARGURA, withoutEnlargement: true })
      .webp({ quality: QUALIDADE })
      .toBuffer();
    await writeFile(CACHE + "/" + a.id + ".webp", buf);
    baixados++;
  } catch (e) {
    erros++;
  }
}
console.log("                         ");
console.log("baixados agora: " + baixados + " · sem retrato publicável: " + semRetrato + " · falharam: " + erros);

// 3. monta o pacote
const fotos = {};
let bytes = 0;
for (const a of alvos) {
  const f = CACHE + "/" + a.id + ".webp";
  if (!existsSync(f)) continue;
  const buf = await readFile(f);
  bytes += buf.length;
  fotos[a.id] = "data:image/webp;base64," + buf.toString("base64");
}

const saida =
  "/* fotos-deputados.js — retratos oficiais das candidaturas a deputado\n" +
  "   fonte: DivulgaCandContas/TSE · chave: id da candidatura no TSE\n" +
  "   " + LARGURA + "px WebP q" + QUALIDADE + " · gerado em " + new Date().toISOString().slice(0, 10) + " */\n" +
  "window.FOTOS_DEP=" + JSON.stringify(fotos) + ";\n";
await writeFile("fotos-deputados.js", saida);

const n = Object.keys(fotos).length;
console.log("\n" + n + " retratos no pacote · " + (bytes / 1024).toFixed(0) + " KB de imagem");
console.log("fotos-deputados.js gravado: " + (saida.length / 1024).toFixed(0) + " KB com o base64");
console.log("média por retrato: " + (bytes / Math.max(n, 1)).toFixed(0) + " bytes");
console.log("\nMande fotos-deputados.js no chat. A página carrega esse arquivo");
console.log("só quando alguém abre a aba de deputados, não no primeiro acesso.");
