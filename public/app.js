import { dessiner, exporterSvg } from './graphe.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const etat = {
  jeux: {},
  jeu: null,
  texte: '',
  res: null,
  etape: 0,
  quiz: false,
  reponses: new Map(), // étape -> réponse donnée
  lecture: null,
};

async function api(chemin, corps) {
  const r = await fetch(`/api/${chemin}`, corps ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) } : undefined);
  const data = await r.json().catch(() => ({ erreur: `Réponse invalide du serveur (${r.status}).` }));
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
    etat.reponses = new Map();
    err.hidden = true;
    construireFormulaire();
    $('verdict').replaceChildren();
    rendu();
  } catch (e) {
    err.hidden = false;
    err.textContent = `Le carnet contient une erreur, ${e.message}`;
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

// ───────── rendu ─────────

const derniere = () => etat.res.etats.length - 1;
/** En mode quiz, une étape non répondue montre encore l'état précédent. */
const etapeAffichee = () => (etat.quiz && etat.etape > 0 && !etat.reponses.has(etat.etape) ? etat.etape - 1 : etat.etape);

function rendu() {
  const r = etat.res;
  if (!r) return;
  const i = etat.etape;
  const vue = etapeAffichee();
  const st = r.etats[vue];

  $('compteur').textContent = i === 0 ? 'Initialisation' : `Exemple ${i} sur ${derniere()}`;
  $('precedent').disabled = i === 0;
  $('suivant').disabled = i === derniere();

  // table des exemples
  const attrs = r.attributs;
  $('table-exemples').innerHTML =
    `<thead><tr><th>#</th>${attrs.map((a) => `<th>${esc(a.nom)}</th>`).join('')}<th>c(x)</th></tr></thead><tbody>` +
    r.exemples
      .map((e, k) => {
        const cls = k + 1 === i ? 'courant' : k + 1 > i ? 'futur' : '';
        const vals = e.valeurs.map((v) => (v === null ? '<td class="manquant">manquant</td>' : `<td>${esc(v === Infinity ? '+∞' : v)}</td>`)).join('');
        return `<tr class="${cls}"><td>${k + 1}</td>${vals}<td><span class="etiq ${e.label ? 'pos' : 'neg'}">${e.label ? '+' : '−'}</span></td></tr>`;
      })
      .join('') +
    '</tbody>';

  // frise
  $('frise').innerHTML = r.etats
    .map((_, k) => {
      const cls = k === i ? 'actif' : k < i ? 'fait' : '';
      const lab = k === 0 ? 'départ' : r.exemples[k - 1].label ? 'positif' : 'négatif';
      return `<li class="${cls}"><button type="button" data-k="${k}"><span class="num">${k === 0 ? 'S₀ G₀' : `x${k}`}</span>${lab}</button></li>`;
    })
    .join('');
  $('frise').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => allerA(Number(b.dataset.k))));

  // frontières
  const prec = vue > 0 ? r.etats[vue - 1] : st;
  const liste = (hs, avant) => (hs.length ? hs.map((h) => `<li class="${avant.includes(h) ? '' : 'nouveau'}">${esc(h)}</li>`).join('') : '<li class="vide">∅ frontière vide</li>');
  $('liste-g').innerHTML = liste(st.G, prec.G);
  $('liste-s').innerHTML = liste(st.S, prec.S);

  // graphe
  const gr = st.graphe;
  dessiner($('graphe'), gr, {
    surClic: (n) => {
      $('legende-graphe').textContent = n ? `${n.label} — les chemins surlignés mènent aux hypothèses plus générales (vers le haut) et plus spécifiques (vers le bas).` : legende(gr);
    },
  });
  $('legende-graphe').textContent = legende(gr);

  // journal / quiz
  const quizActif = etat.quiz && i > 0 && !etat.reponses.has(i);
  $('quiz').hidden = !(etat.quiz && i > 0);
  if (etat.quiz && i > 0) rendreQuiz(i);
  const titre = $('titre-journal');
  const ul = $('journal');
  if (quizActif) {
    titre.textContent = 'Journal — répondez au quiz pour le découvrir';
    ul.innerHTML = '';
  } else if (i === 0) {
    titre.textContent = 'Journal';
    ul.innerHTML = '<li>G₀ contient l\'hypothèse la plus générale ⟨?, …, ?⟩ et S₀ la plus spécifique ⟨∅, …, ∅⟩ : toutes les hypothèses de H sont entre les deux.</li>';
  } else {
    const ex = r.exemples[i - 1];
    titre.textContent = `Journal de l'exemple ${i} (${ex.label ? 'positif' : 'négatif'})`;
    ul.innerHTML = r.etats[i].operations.map(ligneJournal).join('') + (r.etats[i].S.length === 0 || r.etats[i].G.length === 0 ? '<li><span class="act retire">Effondrement</span> — l\'espace des versions est vide : les exemples contiennent une erreur ou le concept n\'est pas dans H.</li>' : '');
  }
}

function legende(gr) {
  if (gr.statut === 'vide') return 'Aucune hypothèse n\'est cohérente avec tous les exemples.';
  if (gr.complet) return `Espace des versions complet : ${gr.taille} hypothèse${gr.taille > 1 ? 's' : ''}. Chaque flèche est une généralisation minimale ; ⊤ et ⊥ sont hors de l'espace.`;
  if (gr.statut === 'infini') return 'Espace des versions infini (intervalles non bornés) : seules les frontières S et G sont dessinées, reliées en pointillés.';
  return `Espace des versions trop grand pour être dessiné${gr.taille ? ` (${gr.taille} hypothèses)` : ''} : seules les frontières S et G apparaissent, reliées en pointillés.`;
}

const VERBES = { retire: 'Retirée', generalise: 'Généralisée', specialise: 'Spécialisée', rejete: 'Rejetée', elague: 'Élaguée', rien: 'Rien à faire' };

function ligneJournal(o) {
  const avant = o.avant ? ` <code>${esc(o.avant)}</code>` : '';
  const apres = o.apres?.length ? ` → ${o.apres.map((h) => `<code>${esc(h)}</code>`).join(' ')}` : o.action === 'specialise' ? ' → aucune' : '';
  return `<li><span class="act ${o.action}">${VERBES[o.action]}</span> (${esc(o.ensemble)})${avant}${apres} — ${esc(o.raison)}</li>`;
}

// ───────── quiz ─────────

function bonneReponse(k) {
  const c = etat.res.etats[k].change;
  return c.S && c.G ? 'SG' : c.S ? 'S' : c.G ? 'G' : 'aucun';
}

function rendreQuiz(k) {
  const ex = etat.res.exemples[k - 1];
  $('quiz-question').textContent = `L'exemple ${k} est ${ex.label ? 'positif' : 'négatif'}. Quelle frontière va-t-il modifier ?`;
  const rep = etat.reponses.get(k);
  const juste = bonneReponse(k);
  document.querySelectorAll('#quiz-choix button').forEach((b) => {
    b.disabled = rep !== undefined;
    b.classList.toggle('juste', rep !== undefined && b.dataset.rep === juste);
    b.classList.toggle('faux', rep !== undefined && b.dataset.rep === rep && rep !== juste);
  });
  $('quiz-retour').textContent = rep === undefined ? '' : rep === juste ? 'Bien vu !' : 'Pas tout à fait : regardez le journal ci-dessous.';
  const total = etat.reponses.size;
  const bons = [...etat.reponses].filter(([kk, r]) => r === bonneReponse(kk)).length;
  $('quiz-score').textContent = total ? `Score : ${bons} / ${total}` : '';
}

document.querySelectorAll('#quiz-choix button').forEach((b) =>
  b.addEventListener('click', () => {
    etat.reponses.set(etat.etape, b.dataset.rep);
    rendu();
  }),
);

// ───────── navigation ─────────

function allerA(k) {
  etat.etape = Math.max(0, Math.min(derniere(), k));
  rendu();
}

function arreterLecture() {
  if (etat.lecture) clearInterval(etat.lecture);
  etat.lecture = null;
  $('lecture').textContent = 'Lecture';
}

$('precedent').addEventListener('click', () => { arreterLecture(); allerA(etat.etape - 1); });
$('suivant').addEventListener('click', () => { arreterLecture(); allerA(etat.etape + 1); });
$('lecture').addEventListener('click', () => {
  if (etat.lecture) return arreterLecture();
  if (etat.etape === derniere()) allerA(0);
  $('lecture').textContent = 'Pause';
  etat.lecture = setInterval(() => {
    if (etat.etape >= derniere()) return arreterLecture();
    allerA(etat.etape + 1);
  }, 1800);
});
$('mode-quiz').addEventListener('change', (e) => {
  etat.quiz = e.target.checked;
  arreterLecture();
  $('lecture').disabled = etat.quiz;
  rendu();
});
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
        return `<label>${esc(a.nom)}<select name="a${i}">${a.valeurs.map((x) => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join('')}<option value="?">manquant</option></select></label>`;
      })
      .join('') + '<button class="craie" type="submit">Classer</button>';
}

$('form-classer').addEventListener('submit', async (e) => {
  e.preventDefault();
  const valeurs = etat.res.attributs.map((_, i) => e.target.elements[`a${i}`].value);
  const out = $('verdict');
  try {
    const r = await api('classer', { texte: etat.texte, valeurs, etape: etapeAffichee() });
    const mots = { positif: 'Positif, sans aucun doute', negatif: 'Négatif, sans aucun doute', indetermine: 'Indéterminé', aucune: 'Aucune hypothèse disponible' };
    const votes = r.votes ? `<p>Sur les ${r.votes.positif + r.votes.negatif} hypothèses de l'espace des versions : <b class="ok">${r.votes.positif} disent oui</b>, <b class="ko">${r.votes.negatif} disent non</b> (un décompte, pas une probabilité).</p>` : '';
    const lignes = r.detail
      .map((d) => `<tr><td>${d.ensemble}</td><td>${esc(d.hypothese)}</td><td>${d.contraintes.map((c) => `<span class="${c.ok ? 'ok' : 'ko'}">${c.ok ? '✓' : '✗'} ${esc(c.contrainte)}</span>`).join(' · ') || '—'}</td><td class="${d.couvre ? 'ok' : 'ko'}">${d.couvre ? 'couvre' : 'rejette'}</td></tr>`)
      .join('');
    out.innerHTML = `<p class="sentence ${r.verdict}">${mots[r.verdict]}</p><p>${esc(r.explication)}</p>${votes}<div class="defile"><table><thead><tr><th></th><th>Hypothèse</th><th>Contraintes</th><th></th></tr></thead><tbody>${lignes}</tbody></table></div>`;
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

const slug = () => (etat.res?.titre ?? 'jeu').split('—')[0].trim().toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'jeu';

$('export-json').addEventListener('click', () => etat.res && telecharger(JSON.stringify(etat.res, null, 2), `${slug()}-resultats.json`, 'application/json'));
$('export-svg').addEventListener('click', () => etat.res && telecharger(exporterSvg($('graphe')), `${slug()}-tableau.svg`, 'image/svg+xml'));
$('export-md').addEventListener('click', () => {
  const r = etat.res;
  if (!r) return;
  const L = [`# ${r.titre}`, '', '## Attributs', ''];
  for (const a of r.attributs) {
    L.push(a.type === 'intervalle' ? `- **${a.nom}** : intervalle de ${a.min} à ${a.max}, pas ${a.pas}` : `- **${a.nom}** : ${a.valeurs.join(', ')}${Object.keys(a.groupes).length ? ` ; groupes ${Object.entries(a.groupes).map(([g, m]) => `${g} = {${m.join(', ')}}`).join(', ')}` : ''}`);
  }
  L.push('', '## Déroulement', '', `**Initialisation** — S₀ = {${r.etats[0].S.join(', ')}}, G₀ = {${r.etats[0].G.join(', ')}}`, '');
  r.exemples.forEach((e, k) => {
    const s = r.etats[k + 1];
    L.push(`### Exemple ${k + 1} (${e.label ? 'positif' : 'négatif'}) : (${e.valeurs.map((v) => (v === null ? '?' : v)).join(', ')})`, '');
    s.operations.forEach((o) => L.push(`- ${VERBES[o.action]} (${o.ensemble})${o.avant ? ` \`${o.avant}\`` : ''}${o.apres?.length ? ` → ${o.apres.map((h) => `\`${h}\``).join(', ')}` : ''} — ${o.raison}`));
    L.push('', `S${k + 1} = {${s.S.join(', ') || '∅'}}  `, `G${k + 1} = {${s.G.join(', ') || '∅'}}`, '');
  });
  const fin = r.etats[derniere()].graphe;
  L.push('## Résultat', '');
  if (r.vide) L.push("L'espace des versions est vide.");
  else if (fin.statut === 'complet') L.push(`L'espace des versions contient ${fin.taille} hypothèses :`, '', ...fin.membres.map((h) => `- \`${h}\``));
  else L.push(`L'espace des versions est ${fin.statut}.`);
  telecharger(L.join('\n') + '\n', `${slug()}-compte-rendu.md`, 'text/markdown');
});

initJeux().catch((e) => {
  $('erreur').hidden = false;
  $('erreur').textContent = `Impossible de joindre le serveur : ${e.message}`;
});
