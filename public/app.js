import { dessiner } from './graphe.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const etat = {
  jeux: {},
  jeu: null,
  texte: '',
  res: null,
  etape: 0,
  lecture: null,
  enPause: false,
};

async function api(chemin, corps) {
  const r = await fetch(`/api/${chemin}`, corps ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) } : undefined);
  const data = await r.json().catch(() => ({ erreur: `Invalid server response (${r.status}).` }));
  if (!r.ok) throw Object.assign(new Error(data.erreur ?? 'Erreur'), { ligne: data.ligne });
  return data;
}

// ───────── jeux de données ─────────

async function initJeux() {
  etat.jeux = await api('exemples');
  const nav = $('jeux');
  nav.replaceChildren();
  for (const [id, j] of Object.entries(etat.jeux)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.jeu = id;
    b.innerHTML = `${esc(j.nom)}<small>${esc(j.source)}</small>`;
    b.addEventListener('click', () => choisirJeu(id));
    nav.appendChild(b);
  }
  choisirJeu('sport');
}

function choisirJeu(id) {
  etat.jeu = id;
  document.querySelectorAll('#jeux button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.jeu === id)));
  $('editeur').value = etat.jeux[id].texte;
  executer();
}

// ───────── exécution ─────────

async function executer() {
  arreterLecture();
  const texte = $('editeur').value;
  const err = $('erreur');
  try {
    etat.res = await api('executer', { texte });
    etat.texte = texte;
    etat.etape = 0;
    err.hidden = true;
    construireFormulaire();
    $('verdict').replaceChildren();
    rendu();
  } catch (e) {
    err.hidden = false;
    err.textContent = `The notebook contains an error: ${e.message}`;
    if (e.ligne) selectionnerLigne(e.ligne);
  }
}

function selectionnerLigne(n) {
  const ta = $('editeur');
  const lignes = ta.value.split('\n');
  const debut = lignes.slice(0, n - 1).reduce((s, l) => s + l.length + 1, 0);
  ta.focus();
  ta.setSelectionRange(debut, debut + (lignes[n - 1] ?? '').length);
}

// ───────── pseudo-code ─────────

// [line number, indent, branch, text]. Branch: init, boucle, pos or neg.
const PSEUDO = [
  [1, 0, 'init', 'Initialize <b>G</b> to {⟨?, …, ?⟩}'],
  [2, 0, 'init', 'Initialize <b>S</b> to {⟨∅, …, ∅⟩}'],
  [3, 0, 'boucle', '<k>For each</k> example xᵢ:'],
  [4, 1, 'pos', '<k>If</k> xᵢ is a positive example:'],
  [5, 2, 'pos', 'remove from G every g that does not cover xᵢ'],
  [6, 2, 'pos', '<k>for each</k> s ∈ S that does not cover xᵢ:'],
  [7, 3, 'pos', 'remove s from S'],
  [8, 3, 'pos', 'add every minimal generalization h of s covering xᵢ, with some g ∈ G, g ≥ h'],
  [9, 3, 'pos', 'remove from S every hypothesis more general than another of S'],
  [10, 1, 'neg', '<k>If</k> xᵢ is a negative example:'],
  [11, 2, 'neg', 'remove from S every s that covers xᵢ'],
  [12, 2, 'neg', '<k>for each</k> g ∈ G that covers xᵢ:'],
  [13, 3, 'neg', 'remove g from G'],
  [14, 3, 'neg', 'add every minimal specialization h of g rejecting xᵢ, with some s ∈ S, h ≥ s'],
  [15, 3, 'neg', 'remove from G every hypothesis more specific than another of G'],
];

/** Pseudo-code lines executed at step i, according to the operation log. */
function lignesActives(i) {
  if (i === 0) return { actives: new Set([1, 2]), branche: 'init' };
  const ex = etat.res.exemples[i - 1];
  const ops = etat.res.etats[i].operations;
  const a = new Set([3, ex.label ? 4 : 10]);
  const fait = (act, ens) => ops.some((o) => o.action === act && o.ensemble === ens);
  if (ex.label) {
    if (fait('retire', 'G')) a.add(5);
    if (fait('generalise', 'S') || fait('rejete', 'S')) [6, 7, 8].forEach((n) => a.add(n));
    if (fait('elague', 'S')) a.add(9);
  } else {
    if (fait('retire', 'S')) a.add(11);
    if (fait('specialise', 'G')) [12, 13, 14].forEach((n) => a.add(n));
    else if (fait('rejete', 'G')) a.add(14);
    if (fait('elague', 'G')) a.add(15);
  }
  return { actives: a, branche: ex.label ? 'pos' : 'neg' };
}

function rendrePseudo(i) {
  const { actives, branche } = lignesActives(i);
  $('algo').innerHTML = PSEUDO.map(([n, indent, b, txt]) => {
    const eteint = b === 'init' ? i > 0 : b === 'boucle' ? false : i === 0 || b !== branche;
    const cls = `${actives.has(n) ? 'active' : ''} ${eteint ? 'inactive' : ''}`.trim();
    const html = txt.replace(/<k>/g, '<span class="mot">').replace(/<\/k>/g, '</span>');
    return `<li class="${cls}" style="--r:${indent}"><span class="n">${n}</span><span class="t">${html}</span></li>`;
  }).join('');
}

// ───────── rendu ─────────

const derniere = () => etat.res.etats.length - 1;

function rendu() {
  const r = etat.res;
  if (!r) return;
  const i = etat.etape;
  const vue = i;
  const st = r.etats[vue];

  $('compteur').textContent = i === 0 ? 'Initialization' : `Example ${i} of ${derniere()}`;
  $('precedent').disabled = i === 0;
  $('suivant').disabled = i === derniere();

  // table des exemples
  const attrs = r.attributs;
  $('table-exemples').innerHTML =
    `<thead><tr><th>#</th>${attrs.map((a) => `<th>${esc(a.nom)}</th>`).join('')}<th>c(x)</th></tr></thead><tbody>` +
    r.exemples
      .map((e, k) => {
        const cls = k + 1 === i ? 'courant' : k + 1 > i ? 'futur' : '';
        const vals = e.valeurs.map((v) => (v === null ? '<td class="manquant">missing</td>' : `<td>${esc(v === Infinity ? '+∞' : v)}</td>`)).join('');
        return `<tr class="${cls}"><td>${k + 1}</td>${vals}<td><span class="etiq ${e.label ? 'pos' : 'neg'}">${e.label ? '+' : '−'}</span></td></tr>`;
      })
      .join('') +
    '</tbody>';

  // frise
  $('frise').innerHTML = r.etats
    .map((_, k) => {
      const cls = k === i ? 'actif' : k < i ? 'fait' : '';
      const lab = k === 0 ? 'start' : r.exemples[k - 1].label ? 'positive' : 'negative';
      return `<li class="${cls}"><button type="button" data-k="${k}"><span class="num">${k === 0 ? 'S₀ G₀' : `x${k}`}</span>${lab}</button></li>`;
    })
    .join('');
  $('frise').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => allerA(Number(b.dataset.k))));

  // frontières
  const prec = vue > 0 ? r.etats[vue - 1] : st;
  const liste = (hs, avant) => (hs.length ? hs.map((h) => `<li class="${avant.includes(h) ? '' : 'nouveau'}">${esc(h)}</li>`).join('') : '<li class="vide">∅ empty boundary</li>');
  $('liste-g').innerHTML = liste(st.G, prec.G);
  $('liste-s').innerHTML = liste(st.S, prec.S);

  // graphe
  const gr = st.graphe;
  const avantGr = i > 0 ? r.etats[i - 1].graphe : null;
  const precedents = avantGr && lisible(avantGr) ? new Set(avantGr.noeuds.map((n) => n.id)) : null;
  dessiner($('graphe'), gr, {
    precedents,
    surClic: (n) => {
      $('legende-graphe').textContent = n ? `${n.label} — the highlighted paths lead to more general hypotheses (upwards) and more specific ones (downwards).` : legende(gr);
    },
  });
  $('legende-graphe').textContent = legende(gr);

  $('commentaire-texte').innerHTML = commentaire(i, avantGr);
  rendrePseudo(i);
  rendreExemple(i);

  // journal
  const titre = $('titre-journal');
  const ul = $('journal');
  if (i === 0) {
    titre.textContent = 'Log';
    ul.innerHTML = '<li>G₀ holds the most general hypothesis ⟨?, …, ?⟩ and S₀ the most specific one ⟨∅, …, ∅⟩: every hypothesis of H lies between the two.</li>';
  } else {
    const ex = r.exemples[i - 1];
    titre.textContent = `Log for example ${i} (${ex.label ? 'positive' : 'negative'})`;
    ul.innerHTML = r.etats[i].operations.map((o, k) => ligneJournal(o, k)).join('') + (r.etats[i].S.length === 0 || r.etats[i].G.length === 0 ? '<li><span class="act retire">Collapse</span> — the version space is empty: the examples contain an error or the concept is not in H.</li>' : '');
  }
}

function legende(gr) {
  if (gr.statut === 'vide') return 'No hypothesis is consistent with all the examples.';
  if (gr.complet) return `Complete version space: ${gr.taille} hypothes${gr.taille > 1 ? 'es' : 'is'}. Each arrow is a minimal generalization; ⊤ and ⊥ are outside the space.`;
  if (gr.statut === 'infini') return 'Infinite version space (unbounded intervals): only the S and G boundaries are drawn, joined by dotted lines.';
  return `Version space too large to draw${gr.taille ? ` (${gr.taille} hypotheses)` : ''}: only the S and G boundaries are shown, joined by dotted lines.`;
}

/** The drawing is only comparable from one step to the next if it shows the complete space. */
const lisible = (gr) => gr.complet && gr.noeuds.length > 0;

function rendreExemple(i) {
  const box = $('exemple');
  if (i === 0) {
    box.innerHTML = '<h3>Current example</h3><p class="aucun">No example processed yet: G₀ and S₀ bound the whole hypothesis space.</p>';
    return;
  }
  const ex = etat.res.exemples[i - 1];
  const cases = etat.res.attributs.map((a, k) => {
    const v = ex.valeurs[k];
    return `<div class="case"><span class="attr">${esc(a.nom)}</span><span class="val${v === null ? ' manquant' : ''}">${v === null ? 'missing' : esc(v === Infinity ? '+∞' : v)}</span></div>`;
  }).join('');
  box.innerHTML = `<h3>Example ${i} of ${derniere()}</h3><div class="cases">${cases}<div class="case verdict-ex ${ex.label ? 'pos' : 'neg'}"><span class="attr">c(x)</span><span class="val">${ex.label ? '+ positive' : '− negative'}</span></div></div>`;
}

function commentaire(i, avantGr) {
  const r = etat.res;
  const st = r.etats[i];
  const gr = st.graphe;
  const p = (t) => `<p class="etape">${t}</p>`;
  if (i === 0) {
    return p('<b>Start.</b> G₀ is the most general hypothesis: it accepts everything. S₀ is the most specific one: it accepts nothing.')
      + p('The target concept lies somewhere between the two. Each example will narrow this gap: click › to begin.');
  }
  const ex = r.exemples[i - 1];
  const vals = ex.valeurs.map((v) => (v === null ? 'missing' : v === Infinity ? '+∞' : v)).join(', ');
  let html = p(`<b>Example ${i}: ⟨${esc(vals)}⟩, ${ex.label ? 'positive' : 'negative'}.</b> ` + (ex.label
    ? 'The concept must accept it. We generalize S just enough to cover it, and remove from G the hypotheses that reject it.'
    : 'The concept must reject it. We specialize G just enough to exclude it, and remove from S the hypotheses that accept it.'));
  if (st.S.length === 0 || st.G.length === 0) {
    return html + p('<b>Collapse.</b> No hypothesis fits any more: the examples contradict each other, or the concept cannot be written in this language.');
  }
  const ch = st.change;
  html += p(ch.S && ch.G ? 'Result: <b>both S and G changed</b>, the two boundaries move closer.'
    : ch.S ? 'Result: <b>S changed</b> (it was generalized), G is unchanged.'
    : ch.G ? 'Result: <b>G changed</b> (it was specialized), S is unchanged.'
    : 'Result: <b>neither S nor G changed</b>. This example was already predicted correctly, it teaches nothing new.');
  if (avantGr && lisible(avantGr) && lisible(gr)) {
    const avant = new Set(avantGr.noeuds.map((n) => n.id));
    const apres = new Set(gr.noeuds.map((n) => n.id));
    const partis = [...avant].filter((x) => !apres.has(x) && !['⊤', '⊥'].includes(x)).length;
    const pl = (n) => `${n} hypothes${n > 1 ? 'es' : 'is'}`;
    html += p(partis
      ? `In the drawing, <b>${pl(partis)} disappear${partis > 1 ? '' : 's'}</b>: ${partis > 1 ? 'they' : 'it'} contradicted this example. ${pl(gr.taille)} remain${gr.taille > 1 ? '' : 's'} possible.`
      : `In the drawing, no hypothesis disappears. ${pl(gr.taille)} remain${gr.taille > 1 ? '' : 's'} possible.`);
  } else if (gr.statut === 'infini') {
    html += p('The version space is infinite (unbounded intervals): only its S and G boundaries are drawn.');
  } else if (!gr.complet) {
    html += p('The version space is too large to draw in full: only its S and G boundaries are shown.');
  }
  if (i === derniere()) {
    html += p(`<b>Done.</b> All ${i} examples have been processed.` + (gr.taille ? ` The version space contains ${gr.taille} hypothes${gr.taille > 1 ? 'es' : 'is'}, between S and G.` : ' It is bounded by S and G.') + ' You can now classify a new instance below.');
  }
  return html;
}

const VERBES = { retire: 'Removed', generalise: 'Generalized', specialise: 'Specialized', rejete: 'Rejected', elague: 'Pruned', rien: 'Nothing to do' };

function ligneJournal(o, k = 0) {
  const avant = o.avant ? ` <code>${esc(o.avant)}</code>` : '';
  const apres = o.apres?.length ? ` → ${o.apres.map((h) => `<code>${esc(h)}</code>`).join(' ')}` : o.action === 'specialise' ? ' → none' : '';
  return `<li style="--i:${k}"><span class="act ${o.action}">${VERBES[o.action]}</span> (${esc(o.ensemble)})${avant}${apres} — ${esc(o.raison)}</li>`;
}

// ───────── navigation ─────────

function allerA(k) {
  etat.etape = Math.max(0, Math.min(derniere(), k));
  rendu();
}

function arreterLecture(pause = false) {
  if (etat.lecture) clearInterval(etat.lecture);
  etat.lecture = null;
  etat.enPause = pause;
  $('lecture').textContent = pause ? 'Resume' : 'Build step by step';
}

$('precedent').addEventListener('click', () => { arreterLecture(); allerA(etat.etape - 1); });
$('suivant').addEventListener('click', () => { arreterLecture(); allerA(etat.etape + 1); });
// « Construire pas à pas » : repart de l'initialisation et déroule tous les exemples, un par un.
$('lecture').addEventListener('click', () => {
  if (etat.lecture) return arreterLecture(true);
  if (!etat.enPause || etat.etape >= derniere()) allerA(0);
  etat.enPause = false;
  $('lecture').textContent = 'Pause';
  etat.lecture = setInterval(() => {
    if (etat.etape >= derniere()) return arreterLecture();
    allerA(etat.etape + 1);
    if (etat.etape >= derniere()) arreterLecture();
  }, 3500);
});
$('zoom-plus').addEventListener('click', () => $('graphe')._vue?.zoomer(1.4));
$('zoom-moins').addEventListener('click', () => $('graphe')._vue?.zoomer(1 / 1.4));
$('zoom-ajuster').addEventListener('click', () => $('graphe')._vue?.ajuster());
$('graphe').addEventListener('vue', (e) => { $('zoom-niveau').textContent = `${Math.round(e.detail * 100)} %`; });
$('executer').addEventListener('click', executer);
$('editeur').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); executer(); }
});
document.addEventListener('keydown', (e) => {
  if (e.target.closest('textarea, input, select')) return;
  if (e.key === 'ArrowRight') allerA(etat.etape + 1);
  if (e.key === 'ArrowLeft') allerA(etat.etape - 1);
});

// ───────── classement ─────────

function construireFormulaire() {
  const f = $('form-classer');
  const ex = etat.res.exemples.find((e) => e.label) ?? etat.res.exemples[0];
  f.innerHTML =
    etat.res.attributs
      .map((a, i) => {
        const v = ex?.valeurs[i];
        if (a.type === 'intervalle') return `<label>${esc(a.nom)}<input name="a${i}" type="number" step="${a.pas}" value="${v ?? ''}" /></label>`;
        return `<label>${esc(a.nom)}<select name="a${i}">${a.valeurs.map((x) => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join('')}<option value="?">missing</option></select></label>`;
      })
      .join('') + '<button class="craie" type="submit">Classify</button>';
}

$('form-classer').addEventListener('submit', async (e) => {
  e.preventDefault();
  const valeurs = etat.res.attributs.map((_, i) => e.target.elements[`a${i}`].value);
  const out = $('verdict');
  try {
    const r = await api('classer', { texte: etat.texte, valeurs, etape: etat.etape });
    const mots = { positif: 'Positive, beyond doubt', negatif: 'Negative, beyond doubt', indetermine: 'Undetermined', aucune: 'No hypothesis available' };
    const votes = r.votes ? `<p>Of the ${r.votes.positif + r.votes.negatif} hypotheses in the version space: <b class="ok">${r.votes.positif} say yes</b>, <b class="ko">${r.votes.negatif} say no</b> (a count, not a probability).</p>` : '';
    const lignes = r.detail
      .map((d) => `<tr><td>${d.ensemble}</td><td>${esc(d.hypothese)}</td><td>${d.contraintes.map((c) => `<span class="${c.ok ? 'ok' : 'ko'}">${c.ok ? '✓' : '✗'} ${esc(c.contrainte)}</span>`).join(' · ') || '—'}</td><td class="${d.couvre ? 'ok' : 'ko'}">${d.couvre ? 'covers' : 'rejects'}</td></tr>`)
      .join('');
    out.innerHTML = `<p class="sentence ${r.verdict}">${mots[r.verdict]}</p><p>${esc(r.explication)}</p>${votes}<div class="defile"><table><thead><tr><th></th><th>Hypothesis</th><th>Constraints</th><th></th></tr></thead><tbody>${lignes}</tbody></table></div>`;
  } catch (err) {
    out.innerHTML = `<p class="erreur">${esc(err.message)}</p>`;
  }
});

// ───────── exports ─────────

function telecharger(contenu, nom, type) {
  const url = URL.createObjectURL(new Blob([contenu], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nom });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const slug = () => (etat.res?.titre ?? 'dataset').split('—')[0].trim().toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'dataset';

$('export-json').addEventListener('click', () => etat.res && telecharger(JSON.stringify(etat.res, null, 2), `${slug()}-results.json`, 'application/json'));
$('export-md').addEventListener('click', () => {
  const r = etat.res;
  if (!r) return;
  const L = [`# ${r.titre}`, '', '## Attributes', ''];
  for (const a of r.attributs) {
    L.push(a.type === 'intervalle' ? `- **${a.nom}**: interval from ${a.min} to ${a.max}, step ${a.pas}` : `- **${a.nom}**: ${a.valeurs.join(', ')}${Object.keys(a.groupes).length ? `; groups ${Object.entries(a.groupes).map(([g, m]) => `${g} = {${m.join(', ')}}`).join(', ')}` : ''}`);
  }
  L.push('', '## Walkthrough', '', `**Initialization** — S₀ = {${r.etats[0].S.join(', ')}}, G₀ = {${r.etats[0].G.join(', ')}}`, '');
  r.exemples.forEach((e, k) => {
    const s = r.etats[k + 1];
    L.push(`### Example ${k + 1} (${e.label ? 'positive' : 'negative'}): (${e.valeurs.map((v) => (v === null ? '?' : v)).join(', ')})`, '');
    s.operations.forEach((o) => L.push(`- ${VERBES[o.action]} (${o.ensemble})${o.avant ? ` \`${o.avant}\`` : ''}${o.apres?.length ? ` → ${o.apres.map((h) => `\`${h}\``).join(', ')}` : ''} — ${o.raison}`));
    L.push('', `S${k + 1} = {${s.S.join(', ') || '∅'}}  `, `G${k + 1} = {${s.G.join(', ') || '∅'}}`, '');
  });
  const fin = r.etats[derniere()].graphe;
  L.push('## Result', '');
  if (r.vide) L.push('The version space is empty.');
  else if (fin.statut === 'complet') L.push(`The version space contains ${fin.taille} hypotheses:`, '', ...fin.membres.map((h) => `- \`${h}\``));
  else L.push(`The version space is ${fin.statut === 'infini' ? 'infinite' : fin.statut}.`);
  telecharger(L.join('\n') + '\n', `${slug()}-report.md`, 'text/markdown');
});

initJeux().catch((e) => {
  $('erreur').hidden = false;
  $('erreur').textContent = `Cannot reach the server: ${e.message}`;
});
