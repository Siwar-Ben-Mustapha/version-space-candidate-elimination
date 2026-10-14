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

/**
 * Zoom et déplacement : on ne touche qu'au viewBox. Molette = zoom vers le curseur,
 * glisser = déplacer, double-clic = tout afficher. svg._vue expose zoomer() et ajuster()
 * pour les boutons. La vue complète (base) est conservée pour l'export.
 */
const ZOOM_MIN = 0.05; // fois la vue complète
const ZOOM_MAX = 6;

function initialiserVue(svg, base) {
  const v = svg._vue ?? (svg._vue = { base, vb: [...base], echelle: 1 });
  v.base = base;
  v.vb = [...base];
  v.echelle = 1;
  appliquer(svg);
  if (v.pret) return;
  v.pret = true;

  const versSvg = (e) => {
    const r = svg.getBoundingClientRect();
    const [x, y, w, h] = v.vb;
    // preserveAspectRatio « meet » : la plus petite échelle s'applique, avec des marges
    const k = Math.min(r.width / w, r.height / h) || 1; // 1 si le dessin n'a pas de taille (onglet masqué)
    const offX = (r.width - w * k) / 2, offY = (r.height - h * k) / 2;
    return { x: x + (e.clientX - r.left - offX) / k, y: y + (e.clientY - r.top - offY) / k, k };
  };

  v.zoomer = (facteur, centre) => {
    const cible = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.echelle * facteur));
    facteur = cible / v.echelle;
    const [x, y, w, h] = v.vb;
    const c = centre ?? { x: x + w / 2, y: y + h / 2 };
    // le point sous le curseur reste immobile
    v.vb = [c.x - (c.x - x) / facteur, c.y - (c.y - y) / facteur, w / facteur, h / facteur];
    v.echelle = cible;
    appliquer(svg);
  };
  v.ajuster = () => { v.vb = [...v.base]; v.echelle = 1; appliquer(svg); };

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    v.zoomer(Math.exp(-e.deltaY * 0.0015), versSvg(e));
  }, { passive: false });
  svg.addEventListener('dblclick', (e) => { if (!e.target.closest('.noeud')) v.ajuster(); });

  let drag = null;
  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = { cx: e.clientX, cy: e.clientY, vb: [...v.vb], k: versSvg(e).k, bouge: false };
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.cx, dy = e.clientY - drag.cy;
    if (!drag.bouge && Math.hypot(dx, dy) < 4) return;
    if (!drag.bouge) { drag.bouge = true; svg.setPointerCapture(e.pointerId); svg.classList.add('deplace'); }
    v.vb = [drag.vb[0] - dx / drag.k, drag.vb[1] - dy / drag.k, drag.vb[2], drag.vb[3]];
    appliquer(svg);
  });
  const fin = () => { svg.classList.remove('deplace'); setTimeout(() => (drag = null), 0); };
  svg.addEventListener('pointerup', fin);
  svg.addEventListener('pointercancel', fin);
  // un glisser ne doit pas être pris pour un clic sur un nœud
  svg.addEventListener('click', (e) => { if (drag?.bouge) { e.stopPropagation(); e.preventDefault(); } }, true);
}

function appliquer(svg) {
  svg.setAttribute('viewBox', svg._vue.vb.join(' '));
  svg.dispatchEvent(new CustomEvent('vue', { detail: svg._vue.echelle }));
}

export function dessiner(svg, graphe, { surClic, precedents } = {}) {
  svg.replaceChildren();
  if (!graphe.noeuds.length) {
    svg.setAttribute('viewBox', '0 0 400 200');
    initialiserVue(svg, [0, 0, 400, 200]);
    const t = el('text', { x: 200, y: 100, 'text-anchor': 'middle', class: 'tag', fill: 'var(--rouge)', 'font-size': 22 }, svg);
    t.textContent = 'Empty version space: ∅';
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
  initialiserVue(svg, [minX, minY, maxX - minX, maxY - minY]);

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
    const neuve = precedents && (!precedents.has(a.de) || !precedents.has(a.vers));
    const p = el('path', { d: `M${x1},${y1} C${x1},${ym} ${x2},${ym} ${x2},${y2}`, class: `arete ${a.type}${neuve ? ' neuf' : ''}`, filter: 'url(#craie)', 'marker-end': a.type === 'hors' ? '' : 'url(#fleche)' }, gA);
    aretes.push({ p, a });
  }
  const noeuds = [];
  for (const b of all) {
    const neuf = precedents && !precedents.has(b.n.id) && !['haut', 'bas'].includes(b.n.role);
    const g = el('g', { class: `noeud ${b.n.role}${neuf ? ' neuf' : ''}`, transform: `translate(${b.x},${b.y})`, tabindex: 0, role: 'button', 'aria-label': b.n.label }, gN);
    el('rect', { width: b.w, height: b.h, rx: 8, filter: 'url(#craie)' }, g);
    const t = el('text', { x: b.w / 2, y: b.h / 2 + 4, 'text-anchor': 'middle' }, g);
    t.textContent = b.n.label;
    if (['G', 'S', 'SG'].includes(b.n.role)) {
      const tag = el('text', { x: b.w - 6, y: -5, 'text-anchor': 'end', class: 'tag', fill: b.n.role === 'G' ? 'var(--accent)' : b.n.role === 'S' ? 'var(--rose)' : 'var(--craie)' }, g);
      tag.textContent = b.n.role === 'SG' ? 'S = G' : b.n.role;
    }
    if (neuf) g.style.animationDelay = `${0.15 + b.n.rang * 0.12}s`;
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
