// Dessin de l'espace des versions : couches par nombre de contraintes,
// ordre dans chaque couche par la méthode des barycentres, arêtes en courbes.

const NS = 'http://www.w3.org/2000/svg';
const H = 40;
const ECART_X = 26;
const ECART_Y = 92;

function el(name, attrs = {}, parent) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

const largeur = (n) => (n.label.length <= 2 ? 56 : Math.max(96, n.label.length * 7.1 + 28));

export function disposer(graphe) {
  const couches = new Map();
  for (const n of graphe.noeuds) {
    if (!couches.has(n.rang)) couches.set(n.rang, []);
    couches.get(n.rang).push(n);
  }
  const rangs = [...couches.keys()].sort((a, b) => a - b);
  const ordre = rangs.map((r) => couches.get(r).sort((a, b) => a.label.localeCompare(b.label)));
  const voisins = new Map(graphe.noeuds.map((n) => [n.id, []]));
  for (const a of graphe.aretes) {
    voisins.get(a.de)?.push(a.vers);
    voisins.get(a.vers)?.push(a.de);
  }
  const pos = () => {
    const p = new Map();
    ordre.forEach((c) => c.forEach((n, i) => p.set(n.id, i / Math.max(1, c.length - 1))));
    return p;
  };
  for (let passe = 0; passe < 6; passe++) {
    const p = pos();
    const indices = passe % 2 === 0 ? ordre.map((_, i) => i) : ordre.map((_, i) => ordre.length - 1 - i);
    for (const i of indices) {
      const bary = (n) => {
        const v = voisins.get(n.id).filter((id) => p.has(id));
        return v.length ? v.reduce((s, id) => s + p.get(id), 0) / v.length : p.get(n.id);
      };
      ordre[i].sort((a, b) => bary(a) - bary(b));
    }
  }
  const boites = new Map();
  ordre.forEach((couche, ligne) => {
    const w = couche.map(largeur);
    const total = w.reduce((s, x) => s + x, 0) + ECART_X * (couche.length - 1);
    let x = -total / 2;
    couche.forEach((n, i) => {
      boites.set(n.id, { x, y: ligne * ECART_Y, w: w[i], h: H, n });
      x += w[i] + ECART_X;
    });
  });
  return boites;
}

export function dessiner(svg, graphe, { surClic } = {}) {
  svg.replaceChildren();
  if (!graphe.noeuds.length) {
    svg.setAttribute('viewBox', '0 0 400 200');
    const t = el('text', { x: 200, y: 100, 'text-anchor': 'middle', class: 'tag', fill: 'var(--rouge)', 'font-size': 22 }, svg);
    t.textContent = 'Espace des versions vide : ∅';
    return;
  }
  const boites = disposer(graphe);
  const all = [...boites.values()];
  let minX = Math.min(...all.map((b) => b.x)) - 30;
  let maxX = Math.max(...all.map((b) => b.x + b.w)) + 30;
  let minY = Math.min(...all.map((b) => b.y)) - 30;
  let maxY = Math.max(...all.map((b) => b.y + b.h)) + 30;
  // un petit graphe ne doit pas être agrandi : cadre minimal de 760 × 400
  const padX = Math.max(0, (760 - (maxX - minX)) / 2);
  const padY = Math.max(0, (400 - (maxY - minY)) / 2);
  minX -= padX; maxX += padX; minY -= padY; maxY += padY;
  svg.setAttribute('viewBox', `${minX} ${minY} ${maxX - minX} ${maxY - minY}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  const defs = el('defs', {}, svg);
  const f = el('filter', { id: 'craie', x: '-5%', y: '-5%', width: '110%', height: '110%' }, defs);
  el('feTurbulence', { type: 'fractalNoise', baseFrequency: '1.2', numOctaves: '1', result: 'bruit' }, f);
  el('feDisplacementMap', { in: 'SourceGraphic', in2: 'bruit', scale: '0.9' }, f);
  const m = el('marker', { id: 'fleche', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, defs);
  el('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'var(--craie-pale)' }, m);

  const gA = el('g', {}, svg);
  const gN = el('g', {}, svg);
  const aretes = [];
  for (const a of graphe.aretes) {
    const s = boites.get(a.de);
    const t = boites.get(a.vers);
    if (!s || !t) continue;
    const x1 = s.x + s.w / 2, y1 = s.y, x2 = t.x + t.w / 2, y2 = t.y + t.h, ym = (y1 + y2) / 2;
    const p = el('path', { d: `M${x1},${y1} C${x1},${ym} ${x2},${ym} ${x2},${y2}`, class: `arete ${a.type}`, filter: 'url(#craie)', 'marker-end': a.type === 'hors' ? '' : 'url(#fleche)' }, gA);
    aretes.push({ p, a });
  }
  const noeuds = [];
  for (const b of all) {
    const g = el('g', { class: `noeud ${b.n.role}`, transform: `translate(${b.x},${b.y})`, tabindex: 0, role: 'button', 'aria-label': b.n.label }, gN);
    el('rect', { width: b.w, height: b.h, rx: 8, filter: 'url(#craie)' }, g);
    const t = el('text', { x: b.w / 2, y: b.h / 2 + 4, 'text-anchor': 'middle' }, g);
    t.textContent = b.n.label;
    if (['G', 'S', 'SG'].includes(b.n.role)) {
      const tag = el('text', { x: b.w - 6, y: -5, 'text-anchor': 'end', class: 'tag', fill: b.n.role === 'G' ? 'var(--jaune)' : b.n.role === 'S' ? 'var(--rose)' : 'var(--vert)' }, g);
      tag.textContent = b.n.role === 'SG' ? 'S = G' : b.n.role;
    }
    noeuds.push({ g, b });
  }

  // clic : chemins vers les hypothèses plus générales et plus spécifiques
  let choisi = null;
  const surligner = (id) => {
    choisi = choisi === id ? null : id;
    if (!choisi) {
      noeuds.forEach(({ g }) => g.classList.remove('eteint'));
      aretes.forEach(({ p }) => p.classList.remove('eteint', 'chaude'));
      surClic?.(null);
      return;
    }
    const lies = new Set([choisi]);
    const monter = [choisi], descendre = [choisi];
    while (monter.length) { const c = monter.pop(); for (const { a } of aretes) if (a.de === c && !lies.has(a.vers)) { lies.add(a.vers); monter.push(a.vers); } }
    const bas = new Set([choisi]);
    while (descendre.length) { const c = descendre.pop(); for (const { a } of aretes) if (a.vers === c && !bas.has(a.de)) { bas.add(a.de); descendre.push(a.de); } }
    bas.forEach((x) => lies.add(x));
    noeuds.forEach(({ g, b }) => g.classList.toggle('eteint', !lies.has(b.n.id)));
    aretes.forEach(({ p, a }) => {
      const on = lies.has(a.de) && lies.has(a.vers);
      p.classList.toggle('chaude', on);
      p.classList.toggle('eteint', !on);
    });
    surClic?.(boites.get(choisi).n);
  };
  noeuds.forEach(({ g, b }) => {
    g.addEventListener('click', () => surligner(b.n.id));
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); surligner(b.n.id); } });
  });
}

/** SVG autonome (styles intégrés) pour l'export. */
export function exporterSvg(svg) {
  const copie = svg.cloneNode(true);
  copie.setAttribute('xmlns', NS);
  const vb = copie.getAttribute('viewBox').split(' ').map(Number);
  copie.setAttribute('width', vb[2]);
  copie.setAttribute('height', vb[3]);
  const style = document.createElementNS(NS, 'style');
  style.textContent = `
    svg { background: #F5F0EA; }
    .noeud rect { fill: #FBF8F4; stroke-width: 1.8; }
    .noeud text { font-family: monospace; font-size: 11.5px; fill: #2A2135; }
    .noeud.G rect { stroke: #A854F6; fill: #A854F6; } .noeud.G > text:not(.tag) { fill: #fff; }
    .noeud.S rect { stroke: #5A1FA8; fill: #EFE4FD; stroke-width: 2.2; }
    .noeud.SG rect { stroke: #5A1FA8; fill: #A854F6; } .noeud.SG > text:not(.tag) { fill: #fff; }
    .noeud.membre rect { stroke: #C9A5FA; } .noeud.haut rect, .noeud.bas rect { stroke: #8E8399; stroke-dasharray: 4 4; }
    .arete { fill: none; stroke: #5C4F6B; stroke-width: 1.4; } .arete.ordre { stroke-dasharray: 6 5; } .arete.hors { stroke: #8E8399; stroke-dasharray: 2 5; }
    .tag { font-family: cursive; font-size: 12px; }`;
  copie.insertBefore(style, copie.firstChild);
  const fond = document.createElementNS(NS, 'rect');
  fond.setAttribute('x', vb[0]); fond.setAttribute('y', vb[1]); fond.setAttribute('width', vb[2]); fond.setAttribute('height', vb[3]); fond.setAttribute('fill', '#F5F0EA');
  copie.insertBefore(fond, style.nextSibling);
  copie.querySelectorAll('[fill^="var("]').forEach((n) => n.setAttribute('fill', { 'var(--jaune)': '#A854F6', 'var(--rose)': '#5A1FA8', 'var(--vert)': '#2F7A55', 'var(--rouge)': '#B83A2E', 'var(--craie-pale)': '#5C4F6B' }[n.getAttribute('fill')] ?? '#2A2135'));
  return new XMLSerializer().serializeToString(copie);
}
