#!/usr/bin/env node
/**
 * gerar-avatar.mjs — promessasdebrasilia
 *
 *   node gerar-avatar.mjs
 *
 * Gera as opções de foto de perfil, 1080×1080, mais uma folha de prova com
 * cada uma nos tamanhos em que o Instagram realmente mostra.
 *
 * A restrição que manda aqui não é estética: o avatar aparece a 32 px no feed
 * e a 14 px nos comentários. Nesse tamanho, letra com serifa vira borrão,
 * duas letras viram uma mancha e qualquer desenho com detalhe some. Sobra
 * uma forma só, gorda, com muito contraste.
 *
 * E o Instagram recorta em círculo: o que estiver perto do canto do quadrado
 * não existe. Por isso a marca fica dentro de ~70% centrais.
 *
 * O "p" é desenhado como geometria (haste + anel), não como texto. Fonte
 * instalada muda de máquina para máquina e a marca não pode mudar junto.
 */

import { writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";

const SAIDA = "avatar";
const VERDE = "#0A7A45";
const VERDE_CLARO = "#43BE81";
const PAPEL = "#FAFAF8";
const TINTA = "#141A20";

/* ── o "p", em geometria pura ──────────────────────────────────────────── */
/* Proporções escolhidas para aguentar 14 px: haste grossa, contraforma
   grande. Contraforma pequena fecha e o "p" vira um "b" borrado. */
function pe(cor, cx = 540, cy = 540, escala = 1) {
  const s = escala;
  const haste = 78 * s;          // espessura da haste
  const anelR = 132 * s;         // raio externo do anel
  const anelI = 62 * s;          // raio interno (contraforma)
  const topo = cy - 200 * s;     // onde a haste começa
  const base = cy + 250 * s;     // onde a haste termina (descida do p)
  const anelCY = cy - 68 * s + anelR * 0;  // centro vertical do anel
  const hasteX = cx - 168 * s;
  const anelCX = hasteX + haste / 2 + anelR - 34 * s;

  return `
    <circle cx="${anelCX}" cy="${anelCY + 0}" r="${anelR}" fill="${cor}"/>
    <circle cx="${anelCX}" cy="${anelCY + 0}" r="${anelI}" fill="none"/>
    <rect x="${hasteX}" y="${topo}" width="${haste}" height="${base - topo}"
          rx="${haste / 2}" fill="${cor}"/>`;
}

/* O buraco do anel precisa ser recortado de verdade, senão fica um disco.
   mask resolve sem depender de fill-rule. */
function peComFuro(cor, fundo, id) {
  const anelR = 132, anelI = 62, haste = 78;
  const cx = 540, cy = 540;
  const hasteX = cx - 168;
  const anelCX = hasteX + haste / 2 + anelR - 34;
  const anelCY = cy - 68;
  return `
    <mask id="furo-${id}">
      <rect width="1080" height="1080" fill="#fff"/>
      <circle cx="${anelCX}" cy="${anelCY}" r="${anelI}" fill="#000"/>
    </mask>
    <g mask="url(#furo-${id})">
      <circle cx="${anelCX}" cy="${anelCY}" r="${anelR}" fill="${cor}"/>
      <rect x="${hasteX}" y="${cy - 200}" width="${haste}" height="${450}"
            rx="${haste / 2}" fill="${cor}"/>
    </g>`;
}

/* ── um balão de fala vazio ────────────────────────────────────────────── */
/* O silêncio como marca. Lê a 14 px porque é uma forma fechada e sólida. */
function balao(cor, id) {
  return `
    <mask id="balao-${id}">
      <rect width="1080" height="1080" fill="#fff"/>
      <rect x="392" y="398" width="296" height="188" rx="34" fill="#000"/>
      <path d="M 470 560 L 470 700 L 590 570 Z" fill="#000"/>
    </mask>
    <g mask="url(#balao-${id})">
      <rect x="318" y="324" width="444" height="336" rx="88" fill="${cor}"/>
      <path d="M 432 600 L 432 790 L 622 612 Z" fill="${cor}"/>
    </g>`;
}

/* ── referências do DF ─────────────────────────────────────────────────── */
/* O que está FORA, de propósito: bandeira e brasão do Distrito Federal. São
   insígnias oficiais, e uma página cuja tese é "não tenho vínculo com governo"
   não pode usar o símbolo do governo como cara. Prédio é outra coisa — o art.
   48 da Lei 9.610/98 permite representar livremente obra permanentemente
   situada em logradouro público.
   Todas aqui são reduções geométricas, não desenho de arquitetura: a 14 px o
   que sobrevive é a silhueta, então é a silhueta que foi desenhada. */

/* O Congresso: tigela da Câmara à esquerda, cúpula do Senado à direita, as
   duas torres no meio, tudo sobre a plataforma. */
function congresso(cor) {
  const base = 620, r = 118, t = 30;
  return `
    <g fill="${cor}">
      <path d="M ${192} ${base} a ${r} ${r} 0 0 0 ${r * 2} 0 Z"/>
      <path d="M ${652} ${base} a ${r} ${r} 0 0 1 ${r * 2} 0 Z"/>
      <rect x="497" y="318" width="34" height="${base - 318}" rx="6"/>
      <rect x="549" y="318" width="34" height="${base - 318}" rx="6"/>
      <rect x="180" y="${base - t / 2}" width="720" height="${t}" rx="${t / 2}"/>
    </g>`;
}

/* O Plano Piloto: o arco das asas cortado pelo Eixo Monumental, com a praça
   na ponta. É mapa, não prédio — e é a forma que todo brasiliense reconhece. */
function planoPiloto(cor) {
  return `
    <g fill="none" stroke="${cor}" stroke-width="72" stroke-linecap="round">
      <path d="M 452 268 Q 268 540 452 812"/>
      <path d="M 392 540 L 792 540"/>
    </g>
    <circle cx="806" cy="540" r="62" fill="${cor}"/>`;
}

/* A Catedral vista de cima: as colunas em coroa. Radial, fecha bem no
   círculo — e some antes das outras quando o tamanho cai. */
function catedral(cor) {
  const n = 16, cx = 540, cy = 540, ri = 132, ro = 300;
  let p = "";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    p += `<line x1="${cx + Math.cos(a) * ri}" y1="${cy + Math.sin(a) * ri}"
            x2="${cx + Math.cos(a) * ro}" y2="${cy + Math.sin(a) * ro}"/>`;
  }
  return `<g stroke="${cor}" stroke-width="44" stroke-linecap="round">${p}</g>
    <circle cx="${cx}" cy="${cy}" r="74" fill="${cor}"/>`;
}

/* ── o "p" que é o Congresso ───────────────────────────────────────────── */
/* A ideia: a haste do p partida ao meio vira as duas torres, e o anel da
   pança, cortado pela plataforma, vira a cúpula do Senado em cima e a tigela
   da Câmara embaixo.
 *
 * O que faz isso funcionar não é o desenho, é como ele morre: quando o avatar
 * encolhe, o vão entre as torres fecha e a plataforma some, e o que sobra é
 * exatamente o "p" — a forma mais legível do lote. A marca degrada para o
 * lugar certo em vez de virar borrão. É o oposto do Congresso desenhado
 * literalmente, que a 14 px não é nada.
 *
 *   vao        largura do vão entre as torres
 *   plataforma 0 = sem, 1 = só à esquerda, 2 = atravessando
 */
function peCongresso(cor, id, { vao = 18, plataforma = 0, haste = 116, anelR = 152,
                                 traco = 54 } = {}) {
  const cx = 540, cy = 500;
  const anelI = anelR - traco;
  const hasteTotal = haste, hasteX = 372;
  const topo = 290, base = 812;
  const anelCX = hasteX + hasteTotal / 2 + anelR - 40;
  const larg = (hasteTotal - vao) / 2;

  const plat = plataforma === 0 ? "" : plataforma === 1
    ? `<rect x="186" y="${cy - 13}" width="${hasteX - 186 + 6}" height="26" rx="13" fill="${cor}"/>`
    : `<rect x="186" y="${cy - 13}" width="${anelCX + anelR + 40 - 186}" height="26" rx="13" fill="${cor}"/>`;

  return `
    <mask id="pc-${id}">
      <rect width="1080" height="1080" fill="#fff"/>
      <circle cx="${anelCX}" cy="${cy}" r="${anelI}" fill="#000"/>
    </mask>
    <g mask="url(#pc-${id})">
      <circle cx="${anelCX}" cy="${cy}" r="${anelR}" fill="${cor}"/>
      <rect x="${hasteX}" y="${topo}" width="${larg}" height="${base - topo}"
            rx="${larg / 2}" fill="${cor}"/>
      <rect x="${hasteX + larg + vao}" y="${topo}" width="${larg}"
            height="${base - topo}" rx="${larg / 2}" fill="${cor}"/>
      ${plat}
    </g>`;
}

/* ── o Congresso em contorno, traço único ──────────────────────────────── */
/* A silhueta da imagem cheia, percorrida como UM caminho só.
 *
 * Por que não dá para simplesmente tirar o preenchimento de cada peça: tigela,
 * torres, cúpula e plataforma se sobrepõem, e desenhando uma a uma as bordas
 * internas aparecem — o desenho vira rabisco. Contorno de verdade é o
 * perímetro da união, então o caminho abaixo anda por fora da forma inteira:
 * sobe e desce cada torre, passa por cima da cúpula, contorna a tigela por
 * baixo e fecha na plataforma.
 *
 *   PLAT_Y   topo da plataforma, que é também o diâmetro da tigela e da cúpula
 *   r        raio dos dois semicírculos
 */
function congressoUnido(cor, traco = 26, preenche = false, escala = 1) {
  const PLAT_Y = 560, ESP = 34, base = PLAT_Y + ESP;
  const r = 118;
  const bowlCX = 352, domoCX = 728;
  const t1a = 508, t1b = 540, t2a = 564, t2b = 596, topoT = 330;
  const platE = 200, platD = 870;
  /* onde a tigela corta a base da plataforma */
  const dx = Math.sqrt(r * r - ESP * ESP);

  const d = [
    `M ${platE} ${PLAT_Y}`,
    `L ${t1a} ${PLAT_Y}`, `L ${t1a} ${topoT}`, `L ${t1b} ${topoT}`, `L ${t1b} ${PLAT_Y}`,
    `L ${t2a} ${PLAT_Y}`, `L ${t2a} ${topoT}`, `L ${t2b} ${topoT}`, `L ${t2b} ${PLAT_Y}`,
    `L ${domoCX - r} ${PLAT_Y}`,
    `A ${r} ${r} 0 0 1 ${domoCX + r} ${PLAT_Y}`,
    `L ${platD} ${PLAT_Y}`, `L ${platD} ${base}`,
    `L ${bowlCX + dx} ${base}`,
    `A ${r} ${r} 0 0 1 ${bowlCX - dx} ${base}`,
    `L ${platE} ${base}`, "Z",
  ].join(" ");

  /* O desenho é largo e baixo: sozinho ele ocupa só a faixa central do
     círculo e desperdiça área, que é justamente o que falta quando o avatar
     encolhe. A escala centra a silhueta e amplia até quase encostar na borda
     do recorte circular. */
  const bbx = (platE + platD) / 2, bby = (topoT - traco / 2 + PLAT_Y + r + traco / 2) / 2;
  const t = escala === 1 ? ""
    : ` transform="translate(540,540) scale(${escala}) translate(${-bbx},${-bby})"`;
  return preenche
    ? `<path d="${d}" fill="${cor}"${t}/>`
    : `<path d="${d}" fill="none" stroke="${cor}" stroke-width="${traco}"
         stroke-linejoin="round" stroke-linecap="round"${t}/>`;
}


/* ── o Congresso em casco ──────────────────────────────────────────────── */
/* A silhueta cheia com as duas conchas VAZADAS: plataforma e torres continuam
   em massa sólida, mas a cúpula e a tigela viram só a borda, com o fundo
   aparecendo por dentro.
 *
 * É o que faz a esfera aparecer. Preenchidas, cúpula e tigela são duas manchas
 * sem relação uma com a outra; vazadas, as duas bordas se leem como as metades
 * de cima e de baixo de uma mesma esfera cortada pela plataforma. O vazio é o
 * que conta a história — o mesmo vazio que a página inteira mede.
 *
 *   casco   espessura da borda das conchas
 *   escala  ampliação para ocupar o recorte circular do avatar */
function congressoCasco(cor, id, { casco = 32, escala = 1.3 } = {}) {
  const PLAT_Y = 560, ESP = 34, base = PLAT_Y + ESP;
  const r = 118;
  const bowlCX = 352, domoCX = 728;
  const t1a = 508, t1b = 540, t2a = 564, t2b = 596, topoT = 330;
  const platE = 200, platD = 870;

  /* O centro da escala leva em conta o que vai mais longe: as torres em cima,
     a borda externa da tigela embaixo. */
  const bbx = (platE + platD) / 2;
  const bby = (topoT + PLAT_Y + r) / 2;
  const t = ` transform="translate(540,540) scale(${escala}) translate(${-bbx},${-bby})"`;

  return `
    <defs>
      <clipPath id="cima-${id}"><rect x="0" y="0" width="1080" height="${PLAT_Y}"/></clipPath>
      <clipPath id="baixo-${id}"><rect x="0" y="${base}" width="1080" height="${1080 - base}"/></clipPath>
    </defs>
    <g${t}>
      <!-- O traço anda no raio r - casco/2, não em r. Centrado em r, a casca
           cresceria metade para fora e a cúpula ficaria maior do que é na
           silhueta cheia; assim o perfil externo é exatamente o mesmo da p4 e
           o vazio é escavado para dentro, que é o que se pediu. -->
      <circle cx="${domoCX}" cy="${PLAT_Y}" r="${r - casco / 2}" fill="none" stroke="${cor}"
              stroke-width="${casco}" clip-path="url(#cima-${id})"/>
      <circle cx="${bowlCX}" cy="${PLAT_Y}" r="${r - casco / 2}" fill="none" stroke="${cor}"
              stroke-width="${casco}" clip-path="url(#baixo-${id})"/>
      <rect x="${platE}" y="${PLAT_Y}" width="${platD - platE}" height="${ESP}" fill="${cor}"/>
      <rect x="${t1a}" y="${topoT}" width="${t1b - t1a}" height="${PLAT_Y - topoT}" fill="${cor}"/>
      <rect x="${t2a}" y="${topoT}" width="${t2b - t2a}" height="${PLAT_Y - topoT}" fill="${cor}"/>
    </g>`;
}

/* ── só a esfera dividida ──────────────────────────────────────────────── */
/* O que sobra quando se tira as torres do desenho: a cúpula do Senado e a
   tigela da Câmara reconhecidas como as duas metades da MESMA esfera, cortada
   pela plataforma. É a redução mais extrema do Congresso que ainda carrega o
   prédio — e a que melhor aproveita o recorte circular do avatar, porque a
   forma é redonda como o recorte.
 *
 *   r      raio da esfera
 *   traco  espessura da linha
 *   sobra  quanto a plataforma avança além da esfera (0 = corda, para dentro) */
function esferaDividida(cor, { r = 330, traco = 34, sobra = 62 } = {}) {
  const cx = 540, cy = 540;
  return `
    <g fill="none" stroke="${cor}" stroke-width="${traco}" stroke-linecap="round">
      <circle cx="${cx}" cy="${cy}" r="${r}"/>
      <line x1="${cx - r - sobra}" y1="${cy}" x2="${cx + r + sobra}" y2="${cy}"/>
    </g>`;
}

/* ── em contorno ───────────────────────────────────────────────────────── */
/* O Congresso desenhado a traço, não em massa cheia. Os semicírculos viram
   arcos, as torres viram duas linhas, a plataforma corta tudo. */
function congressoContorno(cor, id, traco = 30) {
  const base = 560, r = 122;
  return `
    <defs>
      <clipPath id="baixo-${id}"><rect x="0" y="${base}" width="1080" height="540"/></clipPath>
      <clipPath id="cima-${id}"><rect x="0" y="0" width="1080" height="${base}"/></clipPath>
    </defs>
    <g fill="none" stroke="${cor}" stroke-width="${traco}" stroke-linecap="round">
      <circle cx="312" cy="${base}" r="${r}" clip-path="url(#baixo-${id})"/>
      <circle cx="768" cy="${base}" r="${r}" clip-path="url(#cima-${id})"/>
      <line x1="500" y1="330" x2="500" y2="${base}"/>
      <line x1="560" y1="330" x2="560" y2="${base}"/>
      <line x1="196" y1="${base}" x2="884" y2="${base}"/>
    </g>`;
}

/* A esfera inteira, cortada pela plataforma: cúpula em cima, tigela embaixo,
   no mesmo lugar. Ao lado das duas torres — que descem abaixo da linha — o
   conjunto é um "p". É a leitura dupla que o Bruno viu: o prédio e a letra
   ocupando o mesmo desenho, sem um atrapalhar o outro.
 *
 *   cheio   massa sólida em vez de traço
 *   plat    quanto a plataforma avança para a esquerda das torres */
function esferaP(cor, id, { traco = 44, cheio = false, plat = 84, platDir = 0 } = {}) {
  const cy = 486, r = 168;
  const cx = 668;
  const t1 = 470, t2 = 470 + traco + 26;
  const topo = 300, base = 836;
  const platX = cx - r - plat;
  const platFim = cx + r + platDir;

  if (!cheio) {
    return `
      <g fill="none" stroke="${cor}" stroke-width="${traco}" stroke-linecap="round">
        <circle cx="${cx}" cy="${cy}" r="${r}"/>
        <line x1="${t1}" y1="${topo}" x2="${t1}" y2="${base}"/>
        <line x1="${t2}" y1="${topo}" x2="${t2}" y2="${base}"/>
        <line x1="${platX}" y1="${cy}" x2="${platFim}" y2="${cy}"/>
      </g>`;
  }
  /* Na versão cheia o anel precisa do furo recortado, senão vira disco. */
  return `
    <mask id="ep-${id}">
      <rect width="1080" height="1080" fill="#fff"/>
      <circle cx="${cx}" cy="${cy}" r="${r - traco}" fill="#000"/>
    </mask>
    <g fill="${cor}">
      <g mask="url(#ep-${id})"><circle cx="${cx}" cy="${cy}" r="${r}"/></g>
      <rect x="${t1 - traco / 2}" y="${topo}" width="${traco}" height="${base - topo}"
            rx="${traco / 2}"/>
      <rect x="${t2 - traco / 2}" y="${topo}" width="${traco}" height="${base - topo}"
            rx="${traco / 2}"/>
      <rect x="${platX}" y="${cy - traco / 2}" width="${platFim - platX}"
            height="${traco}" rx="${traco / 2}"/>
    </g>`;
}

const OPCOES = [
  {
    id: "a",
    nome: "p branco sobre verde",
    nota: "a mesma marca do favicon do site — tab, perfil e página viram a mesma coisa",
    svg: `<rect width="1080" height="1080" fill="${VERDE}"/>` + peComFuro("#fff", VERDE, "a"),
  },
  {
    id: "b",
    nome: "p verde sobre papel",
    nota: "mais discreto; some no fundo branco do feed do Instagram",
    svg: `<rect width="1080" height="1080" fill="${PAPEL}"/>` + peComFuro(VERDE, PAPEL, "b"),
  },
  {
    id: "c",
    nome: "balão vazio sobre verde",
    nota: "o silêncio como marca; mais falante, menos ligado ao site",
    svg: `<rect width="1080" height="1080" fill="${VERDE}"/>` + balao("#fff", "c"),
  },
  {
    id: "d",
    nome: "p sobre tinta",
    nota: "o verde vira a letra; combina com o card 1 do carrossel, que é escuro",
    svg: `<rect width="1080" height="1080" fill="${TINTA}"/>` + peComFuro(VERDE_CLARO, TINTA, "d"),
  },
  {
    id: "e",
    nome: "Congresso sobre verde",
    nota: "diz DF e diz política antes de qualquer palavra; é a silhueta mais reconhecível",
    svg: `<rect width="1080" height="1080" fill="${VERDE}"/>` + congresso("#fff"),
  },
  {
    id: "f",
    nome: "Plano Piloto sobre verde",
    nota: "todo brasiliense reconhece; quem é de fora vê uma forma abstrata",
    svg: `<rect width="1080" height="1080" fill="${VERDE}"/>` + planoPiloto("#fff"),
  },
  {
    id: "g",
    nome: "Catedral sobre tinta",
    nota: "radial, fecha bem no círculo — mas é a que some primeiro quando encolhe",
    svg: `<rect width="1080" height="1080" fill="${TINTA}"/>` + catedral(VERDE_CLARO),
  },
  /* As três abaixo são a mesma ideia com pesos diferentes. O que se ajusta é
     a relação entre a torre e o anel: se a torre for mais fina que o anel, a
     letra fica capenga e some antes da hora. Elas têm de ser quase iguais. */
  {
    id: "h",
    nome: "p-Congresso, vão fino",
    nota: "torre de 49 px contra anel de 54 — o vão só aparece de perto",
    svg: `<rect width="1080" height="1080" fill="${VERDE}"/>`
      + peCongresso("#fff", "h", { haste: 116, vao: 18, traco: 54 }),
  },
  {
    id: "i",
    nome: "p-Congresso, vão médio",
    nota: "as torres se leem no perfil e o p se mantém no comentário",
    svg: `<rect width="1080" height="1080" fill="${VERDE}"/>`
      + peCongresso("#fff", "i", { haste: 124, vao: 26, traco: 52 }),
  },
  {
    id: "j",
    nome: "p-Congresso, vão largo",
    nota: "duas torres inequívocas; o p sofre quando encolhe",
    svg: `<rect width="1080" height="1080" fill="${VERDE}"/>`
      + peCongresso("#fff", "j", { haste: 134, vao: 38, traco: 50 }),
  },
  {
    id: "k",
    nome: "p-Congresso com plataforma",
    nota: "a plataforma entrando pela esquerda, na altura do anel",
    svg: `<rect width="1080" height="1080" fill="${VERDE}"/>`
      + peCongresso("#fff", "k", { haste: 124, vao: 26, traco: 52, plataforma: 1 }),
  },
  {
    id: "l",
    nome: "Congresso em contorno",
    nota: "a imagem cheia virada a traço, com a tigela e a cúpula nas pontas",
    svg: `<rect width="1080" height="1080" fill="${VERDE}"/>` + congressoContorno("#fff", "l"),
  },
  {
    id: "m",
    nome: "esfera cortada, plataforma curta",
    nota: "a plataforma só marca o corte; o círculo e as torres mandam — vira p",
    svg: `<rect width="1080" height="1080" fill="${VERDE}"/>`
      + esferaP("#fff", "m", { traco: 44, plat: 84, platDir: 0 }),
  },
  {
    id: "n",
    nome: "esfera cortada, plataforma média",
    nota: "a esplanada aparece mais; ganha prédio e perde letra",
    svg: `<rect width="1080" height="1080" fill="${VERDE}"/>`
      + esferaP("#fff", "n", { traco: 44, plat: 150, platDir: 30 }),
  },
  {
    id: "o",
    nome: "esfera cortada, massa cheia",
    nota: "a mesma da m, em massa sólida — para medir o que o contorno custa",
    svg: `<rect width="1080" height="1080" fill="${VERDE}"/>`
      + esferaP("#fff", "o", { traco: 52, plat: 84, platDir: 0, cheio: true }),
  },
  {
    id: "p1",
    nome: "Congresso em contorno, traço 26",
    nota: "o perímetro da silhueta unida, num traço só",
    svg: `<rect width="1080" height="1080" fill="${VERDE}"/>` + congressoUnido("#fff", 26),
  },
  {
    id: "p2",
    nome: "contorno ampliado, traço 26",
    nota: "o mesmo desenho ocupando o círculo inteiro — ganha tamanho de graça",
    svg: `<rect width="1080" height="1080" fill="${VERDE}"/>` + congressoUnido("#fff", 26, false, 1.3),
  },
  {
    id: "p3",
    nome: "contorno ampliado, traço 34",
    nota: "ampliado e com traço mais gordo — o mais resistente dos contornos",
    svg: `<rect width="1080" height="1080" fill="${VERDE}"/>` + congressoUnido("#fff", 34, false, 1.3),
  },
  {
    id: "p4",
    nome: "silhueta cheia, ampliada",
    nota: "o caminho unido preenchido, no mesmo tamanho — a régua do contorno",
    svg: `<rect width="1080" height="1080" fill="${VERDE}"/>` + congressoUnido("#fff", 0, true, 1.3),
  },
  {
    id: "p5",
    nome: "esfera dividida, plataforma passando",
    nota: "a cúpula e a tigela como as duas metades da mesma esfera",
    svg: `<rect width="1080" height="1080" fill="${VERDE}"/>`
      + esferaDividida("#fff", { r: 330, traco: 34, sobra: 62 }),
  },
  {
    id: "p6",
    nome: "esfera dividida, corda",
    nota: "a plataforma para na borda; a forma fecha num círculo perfeito",
    svg: `<rect width="1080" height="1080" fill="${VERDE}"/>`
      + esferaDividida("#fff", { r: 330, traco: 34, sobra: 0 }),
  },
  {
    id: "p7",
    nome: "esfera dividida, traço grosso",
    nota: "linha de 58 — vira símbolo em vez de desenho, e aguenta o tamanho pequeno",
    svg: `<rect width="1080" height="1080" fill="${VERDE}"/>`
      + esferaDividida("#fff", { r: 320, traco: 58, sobra: 70 }),
  },
  {
    id: "q1",
    nome: "casco, borda 32",
    nota: "torres e plataforma cheias, cúpula e tigela vazadas",
    svg: `<rect width="1080" height="1080" fill="${VERDE}"/>`
      + congressoCasco("#fff", "q1", { casco: 32 }),
  },
  {
    id: "q2",
    nome: "casco, borda 44",
    nota: "borda mais gorda — o vazio fica menor e a forma aguenta mais",
    svg: `<rect width="1080" height="1080" fill="${VERDE}"/>`
      + congressoCasco("#fff", "q2", { casco: 44 }),
  },
  {
    id: "q3",
    nome: "casco, borda 22",
    nota: "borda fina — o vazio manda, mais elegante e mais frágil",
    svg: `<rect width="1080" height="1080" fill="${VERDE}"/>`
      + congressoCasco("#fff", "q3", { casco: 22 }),
  },
];

const svgCompleto = (o) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080" width="1080" height="1080">`
  + o.svg + `</svg>`;

if (existsSync(SAIDA)) await rm(SAIDA, { recursive: true });
await mkdir(SAIDA, { recursive: true });

for (const o of OPCOES) {
  await writeFile(SAIDA + "/" + o.id + ".svg", svgCompleto(o));
}

/* ── a folha de prova ──────────────────────────────────────────────────── */
/* O ponto inteiro: ver cada opção do tamanho em que ela vai ser vista.
   320 px é o perfil, 56 é o story, 32 é o feed, 14 é o comentário. */
const TAMANHOS = [320, 56, 32, 14];
const prova = `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#fff;font:14px "Archivo",system-ui,-apple-system,"Segoe UI",sans-serif;
  color:#141A20;padding:44px}
h1{font-size:19px;margin-bottom:6px}
.sub{font-size:13px;color:#57646F;margin-bottom:30px}
.linha{display:flex;align-items:center;gap:34px;padding:26px 0;
  border-top:1px solid #E4E4E0}
.rot{width:230px;flex:none}
.rot b{display:block;font-size:14px}
.rot span{display:block;font-size:12px;color:#57646F;line-height:1.4;margin-top:4px}
.tams{display:flex;align-items:center;gap:30px}
.t{display:flex;flex-direction:column;align-items:center;gap:7px}
.t i{font-style:normal;font-size:10px;color:#626F7A;font-family:ui-monospace,monospace}
.av{border-radius:50%;overflow:hidden;display:block;flex:none;
  box-shadow:0 0 0 1px rgba(0,0,0,.08)}
.feed{margin-left:auto;display:flex;align-items:center;gap:9px;
  background:#fff;padding:9px 13px;border:1px solid #E4E4E0;border-radius:9px}
.feed b{font-size:12.5px}
.feed span{font-size:11.5px;color:#626F7A}
</style></head><body>
<h1>Foto de perfil — como cada uma aparece de verdade</h1>
<p class="sub">320 px é a página do perfil. 56 é o story. 32 é o feed. 14 é o
nome em cima de um comentário — o tamanho que decide se a marca funciona.</p>
${OPCOES.map((o) => `
<div class="linha">
  <div class="rot"><b>${o.nome}</b><span>${o.nota}</span></div>
  <div class="tams">
    ${TAMANHOS.map((t) => `<div class="t">
      <img class="av" src="${o.id}.svg" width="${t}" height="${t}">
      <i>${t}</i></div>`).join("")}
  </div>
  <div class="feed">
    <img class="av" src="${o.id}.svg" width="32" height="32">
    <div><b>promessasdebrasilia</b><br><span>seguir</span></div>
  </div>
</div>`).join("")}
</body></html>`;
await writeFile(SAIDA + "/prova.html", prova);

/* ── PNG ───────────────────────────────────────────────────────────────── */
let chromium = null;
for (const p of ["playwright", "playwright-core"]) {
  try { ({ chromium } = await import(p)); break; } catch { /* tenta o próximo */ }
}
if (!chromium) {
  console.log("Sem Playwright — gerei os SVG e a folha de prova.");
  console.log("Abra " + SAIDA + "/prova.html no navegador para comparar.");
} else {
  const tentativas = [{}, { channel: "chrome" }, { channel: "msedge" }];
  if (process.env.PLACAR_CHROME) {
    tentativas.unshift({ executablePath: process.env.PLACAR_CHROME });
  }
  let nav = null;
  for (const op of tentativas) {
    try { nav = await chromium.launch(op); break; } catch { /* próxima */ }
  }
  if (!nav) {
    console.log("Não abri navegador nenhum — ficaram os SVG e a prova.html.");
  } else {
    const pg = await nav.newPage({ viewport: { width: 1080, height: 1080 },
                                   deviceScaleFactor: 1 });
    for (const o of OPCOES) {
      await pg.setContent(svgCompleto(o));
      await pg.locator("svg").screenshot({ path: SAIDA + "/" + o.id + ".png" });
    }
    const pv = await nav.newPage({ viewport: { width: 1180, height: 700 },
                                   deviceScaleFactor: 2 });
    await pv.goto("file://" + process.cwd() + "/" + SAIDA + "/prova.html",
                  { waitUntil: "networkidle" });
    await pv.screenshot({ path: SAIDA + "/prova.png", fullPage: true });
    await nav.close();
    console.log("  " + OPCOES.length + " opções em PNG 1080×1080 + prova.png");
  }
}
console.log("\n  " + SAIDA + "/ — escolha uma e suba como foto de perfil.");
console.log("  O Instagram recorta em círculo; todas já estão desenhadas para isso.");
