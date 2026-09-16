/**
 * ambiente.mjs — promessasdebrasilia
 *
 * A ambientação visual dos cards, num lugar só.
 *
 * Existe pelo mesmo motivo do grupos.mjs: dois geradores diferentes publicam
 * peças que as pessoas veem lado a lado no mesmo perfil. Se o céu do card
 * individual não for exatamente o céu do placar, ninguém vai saber dizer o
 * porquê — só vai achar que uma das duas é falsificada. Cópia colada diverge
 * em uma semana; import não diverge nunca.
 *
 * Usam este módulo:
 *   gerar-placar.mjs   — os sete cards do carrossel e o story
 *   gerar-cards.mjs    — o card individual por candidatura
 */

/* ── paleta, a mesma do site ───────────────────────────────────────────── */
export const C = {
  ink: "#141A20", ink2: "#57646F", ink3: "#626F7A",
  papel: "#FAFAF8", linha: "#E4E4E0",
  verde: "#0A7A45", verdeEsc: "#075C34", verdeSuave: "#E3F1E9",
  claro: "#E7EDF2", claro2: "#9AA8B4", verdeClaro: "#43BE81",
};
export const SANS = '"Archivo",system-ui,-apple-system,"Segoe UI",sans-serif';
export const MONO = '"IBM Plex Mono",ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace';

/* ── zona segura ──────────────────────────────────────────────────────────
 * O Instagram corta em 1:1 por padrão. Num card 1080×1350 isso come 135px em
 * cima e 135 embaixo — e foi exatamente o que aconteceu no primeiro post: o
 * selo de cada card e o @ com o endereço do site sumiram dos sete.
 *
 * A correção não é lembrar de escolher 4:5 na hora de postar. É desenhar o
 * card de modo que a escolha não importe: tudo o que precisa sobreviver mora
 * dentro do quadrado central. O que fica de fora é só ambiente — céu em cima,
 * água embaixo —, que pode ser cortado sem perder informação nenhuma.
 *
 * Quem usa este módulo deve rodar travaZonaSegura() antes de gravar. */
export const CORTE  = (1350 - 1080) / 2;   /* 135px: o que o corte quadrado leva */
export const MARGEM = CORTE + 15;          /* 15px de folga, para o traço não encostar */

/* ── geometria da paisagem ────────────────────────────────────────────────
 * A LINHA DO HORIZONTE FICA NA MESMA ALTURA EM TODOS OS CARDS. Isso não é
 * decoração: é o fio que costura o carrossel e liga as peças avulsas ao
 * carrossel. Quem desliza sente que é um lugar só. Mexer nisso por card
 * desfaz o efeito inteiro. */
export const HORIZ   = 200;   /* px da base até a linha, no card 1080×1350 */
export const HORIZ_S = 330;   /* idem no story, mais alto e com rodapé mais fundo */
export const PREDIO  = 440;   /* largura da silhueta */

/* A viewBox tem de conter a cuia inteira: ela desce até PLAT_Y+ESP+r = 712.
   Cortar antes disso some com a cuia e o desenho vira um bloco sem leitura. */
const VB   = { x: 190, y: 320, w: 690, h: 400 };
const SLAB = (560 + 34 - VB.y) / VB.h;   /* fração da altura até o pé da laje */
const ALT  = PREDIO * VB.h / VB.w;       /* altura renderizada da silhueta */

/* A mesma silhueta do avatar. Aqui ela é paisagem, não ícone: pousa na linha
   e some no contraste. */
export function congresso(cor, op) {
  const PLAT_Y = 560, ESP = 34, r = 118;
  const bowlCX = 352, domoCX = 728;
  const platE = 200, platD = 870;
  const dx = Math.sqrt(r * r - ESP * ESP);
  const d = [
    "M " + platE + " " + PLAT_Y,
    "L 508 " + PLAT_Y, "L 508 330", "L 540 330", "L 540 " + PLAT_Y,
    "L 564 " + PLAT_Y, "L 564 330", "L 596 330", "L 596 " + PLAT_Y,
    "L " + (domoCX - r) + " " + PLAT_Y,
    "A " + r + " " + r + " 0 0 1 " + (domoCX + r) + " " + PLAT_Y,
    "L " + platD + " " + PLAT_Y, "L " + platD + " " + (PLAT_Y + ESP),
    "L " + (bowlCX + dx) + " " + (PLAT_Y + ESP),
    "A " + r + " " + r + " 0 0 1 " + (bowlCX - dx) + " " + (PLAT_Y + ESP),
    "L " + platE + " " + (PLAT_Y + ESP), "Z",
  ].join(" ");
  return '<svg viewBox="' + VB.x + " " + VB.y + " " + VB.w + " " + VB.h + '"'
    + ' preserveAspectRatio="none" style="opacity:' + op + '">'
    + '<path d="' + d + '" fill="' + cor + '"/></svg>';
}

/* Grão. feTurbulence roda no Chromium sem depender de arquivo externo — o que
   importa, porque estes scripts rodam numa máquina Windows sem asset ao lado. */
export const GRAO = '<svg class="grao"><filter id="grao-f">'
  + '<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="4" stitchTiles="stitch"/>'
  + '<feColorMatrix type="saturate" values="0"/>'
  + '</filter><rect width="100%" height="100%" filter="url(#grao-f)"/></svg>';

/**
 * Um bloco só com todas as camadas, para não espalhar oito divs por card.
 *
 * .amb não leva z-index de propósito: com z-index ela viraria contexto de
 * empilhamento e o mix-blend-mode do grão passaria a misturar com o vazio
 * dentro dela em vez de com o fundo do card — o grão simplesmente sumiria.
 *
 * @param tom     "escuro" (céu) ou "claro" (papel)
 * @param marca   o que sai no canto superior direito. Número = índice de
 *                carrossel e vira "03 / 07"; string = sai como está; vazio =
 *                não desenha nada.
 * @param total   só para o formato "03 / 07"
 */
export function amb(tom, marca, total) {
  const escuro = tom === "escuro";
  const cor = escuro ? "#BFE8D3" : "#0A7A45";
  const op  = escuro ? 0.22 : 0.10;
  const opR = escuro ? 0.10 : 0.055;
  let reg = "";
  if (typeof marca === "number") {
    reg = String(marca).padStart(2, "0") + " / " + String(total).padStart(2, "0");
  } else if (marca) {
    reg = String(marca);
  }
  return '<div class="amb">'
    + '<div class="brilho"></div>'
    + '<div class="agua"></div>'
    + '<div class="predio">' + congresso(cor, op) + '</div>'
    + '<div class="reflexo"><div class="rfl">' + congresso(cor, opR) + '</div></div>'
    + '<div class="veu"></div>'
    + '<div class="horizonte"></div>'
    + '<div class="reticula"></div>'
    + GRAO
    + '</div>'
    + (reg ? '<div class="reg"><span class="idx">' + reg + '</span>'
        + '<span class="cruz">+</span></div>' : "");
}

/* ── o CSS das camadas ─────────────────────────────────────────────────────
   Só o ambiente e o mobiliário editorial. Tipografia e componentes de
   conteúdo ficam em cada gerador, porque são de cada peça. */
export const CSS_AMBIENTE = `
*{margin:0;padding:0;box-sizing:border-box}
body{background:#888;font-family:${SANS};-webkit-font-smoothing:antialiased}
.card{width:1080px;height:1350px;padding:${MARGEM}px 84px;display:flex;flex-direction:column;
  position:relative;overflow:hidden;isolation:isolate;--horiz:${HORIZ}px}
/* O story tem folga extra em cima e embaixo porque o Instagram desenha por cima:
   a barra do perfil no topo e a caixa de resposta no pé. Conteúdo colado na
   borda some debaixo da interface. */
.story{width:1080px;height:1920px;padding:150px 84px 250px;--horiz:${HORIZ_S}px}

/* ── o céu ────────────────────────────────────────────────────────────────
   Entardecer de Brasília: azul fundo em cima, abrindo para o verde da marca
   perto da linha. Sete paradas, não duas — é o que impede a banda chapada. */
.escuro{color:${C.claro};background:linear-gradient(180deg,
  #05080D 0%, #070D15 18%, #0A1622 38%, #0E2231 56%,
  #123040 70%, #133C3C 82%, #10402F 92%, #0C3526 100%)}
/* ── o papel ──────────────────────────────────────────────────────────────
   Papel, não tela: quente e um pouco sujo, com a tinta verde escorrendo do
   pé. Branco puro é o que faz card parecer slide de apresentação. */
.claro{color:${C.ink};background:linear-gradient(180deg,
  #F7F4EC 0%, #F4F1E7 46%, #EFEFE3 74%, #E7EEE2 100%)}

/* ── as camadas de ambiente ───────────────────────────────────────────────
   Tudo o que não é conteúdo mora dentro de .amb, que é absoluta e SEM
   z-index (ver o comentário da função amb()). O conteúdo real do card sobe
   para z-index 6 com o seletor abaixo, que é o que dispensa embrulhar o
   miolo de cada card numa div a mais. */
.amb{position:absolute;inset:0;pointer-events:none}
/* .reg fica de fora junto com .amb: ela é absoluta, e este seletor é mais
   específico do que a regra dela — sem a exceção, o índice vira item do flex
   e desce para debaixo do selo. */
.card > *:not(.amb):not(.reg){position:relative;z-index:6}

/* a luz — um foco atrás do prédio, na linha */
.brilho{position:absolute;left:0;right:0;z-index:0;height:620px;
  bottom:calc(var(--horiz) - 120px)}
.escuro .brilho{background:
  radial-gradient(52% 100% at 68% 100%, rgba(67,190,129,.30) 0%, rgba(67,190,129,0) 68%),
  radial-gradient(90% 62% at 68% 100%, rgba(232,198,120,.13) 0%, rgba(232,198,120,0) 70%)}
.claro .brilho{background:
  radial-gradient(56% 100% at 68% 100%, rgba(10,122,69,.10) 0%, rgba(10,122,69,0) 70%)}

/* a água, e o véu que passa POR CIMA do que está submerso: a cuia entra no
   espelho d'água em vez de flutuar sobre ele */
.agua{position:absolute;left:0;right:0;bottom:0;height:var(--horiz);z-index:0}
.escuro .agua{background:linear-gradient(180deg,
  rgba(3,12,10,.16) 0%, rgba(3,12,10,.46) 34%, rgba(3,12,10,.60) 100%)}
.claro .agua{background:linear-gradient(180deg,
  rgba(10,122,69,.02) 0%, rgba(10,122,69,.07) 34%, rgba(10,122,69,.09) 100%)}
/* O véu começa transparente na linha e fecha para baixo. Começando já opaco
   ele cria uma borda reta atravessando o card, e aí a água deixa de ler como
   horizonte e passa a ler como retângulo colado por cima. */
.veu{position:absolute;left:0;right:0;bottom:0;height:var(--horiz);z-index:2}
.escuro .veu{background:linear-gradient(180deg,
  rgba(6,20,17,0) 0%, rgba(6,20,17,.50) 26%, rgba(6,20,17,.68) 72%, rgba(6,20,17,.74) 100%)}
.claro .veu{background:linear-gradient(180deg,
  rgba(244,241,231,0) 0%, rgba(242,240,230,.58) 26%,
  rgba(240,240,228,.72) 72%, rgba(238,241,229,.78) 100%)}

.horizonte{position:absolute;left:0;right:0;bottom:var(--horiz);height:1.5px;z-index:3}
.escuro .horizonte{background:linear-gradient(90deg,
  rgba(67,190,129,0) 0%, rgba(67,190,129,.16) 12%,
  rgba(120,220,170,.72) 66%, rgba(67,190,129,.20) 92%, rgba(67,190,129,0) 100%)}
.claro .horizonte{background:linear-gradient(90deg,
  rgba(10,122,69,0) 0%, rgba(10,122,69,.22) 12%,
  rgba(10,122,69,.48) 66%, rgba(10,122,69,.18) 92%, rgba(10,122,69,0) 100%)}

/* o prédio, com o pé da laje pousado exatamente na linha */
.predio{position:absolute;right:58px;width:${PREDIO}px;height:${Math.round(ALT)}px;
  z-index:1;line-height:0;bottom:calc(var(--horiz) - ${Math.round(ALT * (1 - SLAB))}px)}
.predio svg{width:100%;height:100%;display:block}
.reflexo{position:absolute;right:58px;bottom:0;width:${PREDIO}px;height:var(--horiz);
  z-index:1;line-height:0;transform:scaleY(-1);overflow:hidden;
  -webkit-mask-image:linear-gradient(0deg,#000 0%,rgba(0,0,0,.30) 55%,rgba(0,0,0,0) 92%);
  mask-image:linear-gradient(0deg,#000 0%,rgba(0,0,0,.30) 55%,rgba(0,0,0,0) 92%)}
.rfl{position:absolute;left:0;right:0;top:${Math.round(-ALT * SLAB)}px;
  height:${Math.round(ALT)}px}
.rfl svg{width:100%;height:100%;display:block}

/* impressão: retícula por baixo, grão por cima */
.reticula{position:absolute;inset:0;z-index:4;background-size:5px 5px}
.escuro .reticula{opacity:.16;
  background-image:radial-gradient(circle at 50% 50%, #fff .8px, transparent .9px)}
.claro .reticula{opacity:.20;
  background-image:radial-gradient(circle at 50% 50%, #0A7A45 .7px, transparent .8px)}
.grao{position:absolute;inset:0;width:100%;height:100%;z-index:5;
  mix-blend-mode:overlay}
.escuro .grao{opacity:.34}
.claro .grao{opacity:.26}

/* mobiliário editorial: fio na margem, índice e marca de registro */
.card::before{content:"";position:absolute;left:52px;top:52px;bottom:52px;width:1px;z-index:6}
.escuro.card::before{background:rgba(220,230,236,.14)}
.claro.card::before{background:rgba(20,32,28,.12)}
/* o índice fica na mesma linha do selo, dentro da zona segura — antes ele
   morava a 52px do topo, que é terra cortada */
.reg{position:absolute;top:${MARGEM + 4}px;left:0;right:84px;z-index:7;display:flex;
  justify-content:flex-end;align-items:center;gap:22px;
  font-family:${MONO};font-size:19px;letter-spacing:.16em}
.escuro .reg{color:rgba(220,230,236,.40)}
.claro .reg{color:rgba(20,32,28,.34)}
.cruz{font-size:26px;line-height:1}

.selo{font-family:${MONO};font-size:25px;letter-spacing:.14em;text-transform:uppercase;
  font-weight:600}
.escuro .selo{color:${C.verdeClaro}}
.claro .selo{color:${C.verde}}
.cresce{flex:1;min-height:0}
.rodape{font-family:${MONO};font-size:21px;letter-spacing:.02em;display:flex;
  justify-content:space-between;align-items:flex-end;gap:20px}
.escuro .rodape{color:${C.claro2}}
.claro .rodape{color:${C.ink3}}
`;

/* ── as duas travas ────────────────────────────────────────────────────────
   Rodam na página já renderizada, não no CSS. Medir o layout de verdade é a
   única forma de saber: um padding certo no papel não impede um parágrafo de
   crescer uma linha e empurrar o rodapé para fora. */

/** Conteúdo cortado pela altura fixa do card. */
export const MEDIR_TRANSBORDO = () => {
  const fora = [];
  for (const card of document.querySelectorAll(".card")) {
    const alvos = [card, ...card.querySelectorAll(".cresce, .lista, .barras, .met, .props")];
    for (const el of alvos) {
      const sobra = el.scrollHeight - el.clientHeight;
      const largo = el.scrollWidth - el.clientWidth;
      if (sobra > 2 || largo > 2) {
        fora.push({
          card: card.id,
          onde: el === card ? "o card inteiro" : "." + el.className.split(" ")[0],
          altura: Math.max(0, sobra),
          largura: Math.max(0, largo),
        });
      }
    }
  }
  return fora;
};

/** Elementos que não sobreviveriam ao corte 1:1 do Instagram. */
export const MEDIR_ZONA_SEGURA = () => {
  const PRECISA_SOBREVIVER = ".selo, .reg, .rodape, .titulo, .sub, .nota, .numerao,"
    + " .frase, .frase-topo, .frase-pe, .escopo, .grp, .item, .bar, .vz-item,"
    + " .def-sim, .def-nao, .caixa, .met-l, .ln-n, .ln-t,"
    + " .nome, .ident, .prop, .fonte, .conta";
  const risco = [];
  for (const card of document.querySelectorAll(".card:not(.story)")) {
    const cr = card.getBoundingClientRect();
    const corte = (cr.height - cr.width) / 2;      /* o que o 1:1 leva */
    if (corte <= 0) continue;
    const topo = cr.top + corte, base = cr.bottom - corte;
    for (const el of card.querySelectorAll(PRECISA_SOBREVIVER)) {
      const r = el.getBoundingClientRect();
      if (!r.height) continue;
      const acima = topo - r.top, abaixo = r.bottom - base;
      if (acima > 0.5 || abaixo > 0.5) {
        risco.push({
          card: card.id,
          onde: "." + el.className.split(" ")[0],
          texto: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 46),
          acima: Math.max(0, Math.round(acima)),
          abaixo: Math.max(0, Math.round(abaixo)),
        });
      }
    }
  }
  return risco;
};

/** Imprime as duas listas e devolve true se alguma coisa está errada. */
export function relatarProblemas(transbordos, cortados) {
  let ruim = false;
  if (transbordos.length) {
    ruim = true;
    console.error("\n  ✕ TRANSBORDOU — tem conteúdo cortado nas imagens:");
    for (const t of transbordos) {
      console.error("      " + t.card + " → " + t.onde
        + (t.altura ? "  sobra " + t.altura + "px de altura" : "")
        + (t.largura ? "  sobra " + t.largura + "px de largura" : ""));
    }
  }
  if (cortados.length) {
    ruim = true;
    console.error("\n  ✕ FORA DA ZONA SEGURA — isto some se o post entrar em 1:1:");
    for (const c of cortados) {
      console.error("      " + c.card + " → " + c.onde
        + (c.acima ? "  " + c.acima + "px acima do corte" : "")
        + (c.abaixo ? "  " + c.abaixo + "px abaixo do corte" : "")
        + (c.texto ? "   \"" + c.texto + "\"" : ""));
    }
    console.error("\n  O card tem 1080×1350 e o Instagram corta " + CORTE + "px de cada ponta");
    console.error("  quando o post vai em 1:1. O que estiver nessas faixas não existe para");
    console.error("  quem vê o post. Aumente MARGEM (hoje " + MARGEM + "px) ou encurte o conteúdo.");
  }
  if (ruim) console.error("\n  As imagens foram gravadas assim mesmo, para você ver o que ficou de fora.\n");
  return ruim;
}

/* ── abrir navegador ───────────────────────────────────────────────────────
   Dois pacotes servem: playwright (traz navegador próprio) e playwright-core
   (não traz, mas dirige o Chrome/Edge que já está na máquina). Tenta os dois,
   e guarda o erro de verdade em vez de engolir: "não está instalado" é um
   palpite, e palpite manda a pessoa rodar npm install achando que resolve. */
export async function carregarChromium() {
  const erros = [];
  for (const pacote of ["playwright", "playwright-core"]) {
    try { return { chromium: (await import(pacote)).chromium, erros }; }
    catch (e) { erros.push("  " + pacote + ": " + String(e.message).split("\n")[0]); }
  }
  return { chromium: null, erros };
}

export async function abrirNavegador(chromium) {
  const tentativas = [
    ["o navegador do Playwright", {}],
    ["o Chrome instalado na máquina", { channel: "chrome" }],
    ["o Edge instalado na máquina", { channel: "msedge" }],
  ];
  if (process.env.PLACAR_CHROME) {
    tentativas.unshift(["PLACAR_CHROME", { executablePath: process.env.PLACAR_CHROME }]);
  }
  const erros = [];
  for (const [nome, opcoes] of tentativas) {
    try { return { nav: await chromium.launch(opcoes), via: nome, erros }; }
    catch (e) { erros.push("  " + nome + ": " + String(e.message).split("\n")[0]); }
  }
  return { nav: null, via: null, erros };
}
