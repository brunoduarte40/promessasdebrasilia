/**
 * grupos.mjs — promessasdebrasilia
 *
 * Onde mora a resposta para "o que exatamente vocês checaram?".
 *
 * Por que isto é um módulo à parte, e não uma função copiada nos dois lugares:
 * o card do Instagram e a página do convite dizem o MESMO número em público, com
 * poucos minutos de diferença. Se as duas contas divergirem — porque um script
 * foi corrigido e o outro não —, a primeira pessoa que notar tem razão, e a
 * página inteira passa a valer menos. Um arquivo, uma conta.
 *
 * A regra que organiza tudo: cada candidatura cai em EXATAMENTE um grupo, e cada
 * grupo tem uma frase que é verdadeira sozinha. "Não tem proposta" é uma
 * afirmação sobre o mundo e não foi verificada. "O site que ela declarou ao TSE
 * não trazia proposta no dia X" foi. A diferença entre as duas é o que separa
 * um dado de uma acusação.
 */

export const temProposta = (c) =>
  !!(c.site_lido && Array.isArray(c.site_lido.propostas) && c.site_lido.propostas.length);

export const temSite = (c) => (c.sites || []).some((s) => s.rede === "site");

export const siteFalhou = (c) =>
  !!(c.site_lido && /^falhou/.test(String(c.site_lido.status)));

/* A ordem importa: o primeiro critério que casar é o grupo da candidatura.
   Quem tem proposta entra como quem tem proposta, e pronto — não interessa se
   o site também tinha outro problema. */
export const CRITERIOS = [
  {
    chave: "proposta",
    curta: "o site declarado ao TSE traz proposta",
    longa: "declararam um site ao TSE e ele traz proposta escrita",
    filtro: (c) => temProposta(c),
  },
  {
    chave: "vazio",
    curta: "o site declarado abriu e não traz nenhuma",
    longa: "declararam um site que está no ar e não traz proposta nenhuma",
    filtro: (c) => temSite(c) && c.site_lido && !siteFalhou(c),
  },
  {
    chave: "quebrado",
    curta: "o site declarado não abriu quando visitamos",
    longa: "declararam um site que não abriu quando visitei — domínio fora do ar, "
      + "certificado vencido, página inexistente ou acesso bloqueado",
    filtro: (c) => temSite(c) && siteFalhou(c),
  },
  {
    chave: "so_rede",
    curta: "declararam só rede social, nenhum site",
    longa: "não declararam site de campanha ao TSE, só perfil de rede social",
    filtro: (c) => !temSite(c) && c.sites && c.sites.length,
  },
  {
    chave: "nada",
    curta: "não declararam canal nenhum ao TSE",
    longa: "não declararam canal nenhum ao TSE — nem site, nem rede social",
    filtro: (c) => !temSite(c) && (!c.sites || !c.sites.length),
  },
];

export const classificar = (c) => CRITERIOS.find((g) => g.filtro(c)) || null;

/**
 * Conta os grupos e CONFERE se a soma fecha. Um buraco aqui — candidatura fora
 * de todos os grupos, ou em dois — vira número errado publicado, então isto
 * estoura em vez de devolver uma conta silenciosamente torta.
 */
export function contar(urna) {
  const grupos = CRITERIOS.map((g) => ({ ...g, n: 0 }));
  for (const c of urna) {
    const g = grupos.find((g) => g.filtro(c));
    if (g) g.n++;
  }
  const soma = grupos.reduce((s, g) => s + g.n, 0);
  if (soma !== urna.length) {
    throw new Error("os grupos somam " + soma + " e deviam somar " + urna.length
      + ". Tem candidatura fora de todos os grupos ou em dois — não publique isso.");
  }
  const G = Object.fromEntries(grupos.map((g) => [g.chave, g.n]));
  return {
    grupos,
    G,
    total: urna.length,
    comProposta: G.proposta,
    semProposta: urna.length - G.proposta,
  };
}

/**
 * O silêncio por partido. Só entram legendas com candidatura suficiente para a
 * porcentagem significar alguma coisa: com 3 candidaturas, uma proposta vira
 * 33% e o gráfico mente.
 */
export function porPartido(urna, minimo = 15, jaFalou = () => false) {
  const mapa = new Map();
  for (const c of urna) {
    const p = c.partido || "—";
    if (!mapa.has(p)) mapa.set(p, { partido: p, total: 0, falou: 0 });
    const r = mapa.get(p);
    r.total++;
    if (temProposta(c) || jaFalou(c)) r.falou++;
  }
  return [...mapa.values()]
    .filter((r) => r.total >= minimo)
    .map((r) => ({
      ...r,
      calados: r.total - r.falou,
      pct: (r.total - r.falou) / r.total * 100,
    }))
    .sort((a, b) => b.pct - a.pct || b.total - a.total);
}
