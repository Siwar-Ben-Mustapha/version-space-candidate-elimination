# Espace des versions — l'élimination des candidats, à la craie

Application web pédagogique pour l'algorithme d'**élimination des candidats** (Mitchell, 1977), sur les
exemples du cours *Machine Learning Theory*, chapitre 2 (diapositives 72 à 87).

![Le tableau : espace des versions final de Sport](docs/tableau-sport.png)

## Ce que fait l'application

- **Le carnet** : on décrit le jeu de données dans un petit format texte. Les erreurs sont signalées
  avec leur numéro de ligne, et la ligne fautive est sélectionnée.
- **Le tableau** : on avance exemple par exemple, avec les flèches, la frise ou la lecture automatique.
  - S et G sont affichées de part et d'autre du dessin de l'espace des versions.
  - Le journal liste les opérations de l'exemple : retrait, généralisation, spécialisation, rejet
    par l'autre frontière, élagage.
- **Le dessin** est calculé à partir de S et G :
  - si l'espace des versions compte au plus 60 hypothèses, il est dessiné en entier avec ses arêtes
    de couverture (généralisations minimales) ;
  - sinon, seules les frontières apparaissent, reliées en pointillés ; c'est le cas des Oiseaux, dont
    l'espace est infini.
  - Un clic sur une hypothèse surligne les chemins vers les hypothèses plus générales et plus spécifiques.
- **Le mode quiz** : avant de découvrir chaque exemple, on parie sur la frontière qu'il va modifier
  (S, G, les deux ou aucune). Le score est affiché.
- **Le classement** d'une nouvelle instance donne quatre verdicts possibles :
  - positif certain, si tout S la couvre ;
  - négatif certain, si aucun élément de G ne la couvre ;
  - indéterminé, dans les autres cas ;
  - aucune hypothèse, si l'espace des versions est vide.

  Le détail est donné contrainte par contrainte, avec le décompte exact des hypothèses qui votent oui
  et non (un décompte, pas une probabilité).
- **Les exports** : compte rendu Markdown, résultats JSON et dessin SVG.

Jeux fournis : Sport (diapositives 73–78), Oiseaux avec intervalles et hiérarchie de couleurs
(diapositives 79–82), EnjoySport (diapositives 85–87), EnjoySport bruité (diapositive 83) et un exemple contradictoire.

## Architecture

```
api/                 fonctions serverless Python (Vercel), bibliothèque standard uniquement
  _ce.py             le moteur : attributs, ordre de généralité, algorithme, espace des versions
  _carnet.py         analyse du format carnet et construction des réponses JSON
  _exemples.py       jeux de données du cours
  _http.py           gestion commune des requêtes
  executer.py        POST /api/executer  { texte }               → états S/G, journal, graphe
  classer.py         POST /api/classer   { texte, valeurs, etape } → verdict
  exemples.py        GET  /api/exemples
public/              interface statique, JavaScript sans framework ni étape de build
  index.html  style.css  app.js  graphe.js
serveur.py           serveur de développement local (même routage que Vercel)
tests/               tests unitaires Python + parcours navigateur (Playwright)
```

Le calcul est entièrement fait côté serveur ; le navigateur se contente d'afficher les états renvoyés.

### Langage d'hypothèses

- **Attribut catégoriel** : une contrainte est l'ensemble des valeurs acceptées. Le langage contient
  `?` (tout le domaine), chaque valeur seule et, si on le déclare, chaque groupe d'une hiérarchie en
  arbre (par exemple `warm colour = {russet, orange}`). La plus petite généralisation est le plus petit
  nœud qui contient les deux ensembles. Les spécialisations minimales sont les nœuds maximaux strictement
  inclus qui rejettent la valeur.
- **Attribut numérique** : une contrainte est un intervalle fermé `[bas, haut]` sur la grille
  `min + k·pas`. Le domaine peut être non borné (`intervalle 0 .. inf pas 1`). Généraliser élargit
  l'intervalle jusqu'à la valeur. Spécialiser coupe autour de la valeur : `[bas, v − pas]` et
  `[v + pas, haut]`. On retrouve ainsi `[0, 69]` et `[71, +∞[` de la diapositive 80.
- **Valeur manquante** : on l'écrit `?` dans un exemple. Seule la contrainte `?` l'accepte.

## Format carnet

```
# Oiseaux
attribut Flat bill : True, False
attribut Size : intervalle 0 .. inf pas 1
attribut Neck colour : russet, orange, grey
  groupe warm colour : russet, orange
  groupe cold colour : grey
+ True, 30, russet
- False, 70, grey
```

## Lancer en local

Il faut Python 3.10 ou plus récent. Il n'y a rien à installer.

```bash
python serveur.py            # http://localhost:8000
```

## Tests

```bash
python -m unittest discover -s tests -v
```

Les tests couvrent :

- toutes les étapes de Sport, Oiseaux, EnjoySport et EnjoySport bruité ;
- la taille de H (1297, diapositive 78) et l'espace final à 6 hypothèses avec ses 7 arêtes ;
- les votes 3/3 et 2/4 de la diapositive 87 ;
- une **vérification par force brute** sur 250 jeux aléatoires : on énumère tout H, on garde les
  hypothèses cohérentes, on prend leurs éléments minimaux et maximaux, et on les compare à S et G ;
- les erreurs du format carnet et l'API HTTP, appelée en vrai.

Parcours dans le navigateur, avec le serveur lancé :

```bash
npm install --no-save playwright && npx playwright install chromium
node tests/parcours_navigateur.cjs
```

## Déployer sur Vercel

1. Pousser le dépôt sur GitHub.
2. Sur Vercel, choisir *Add New → Project* et importer le dépôt. Le *Framework Preset* est **Other** ;
   il n'y a ni commande de build ni variable d'environnement.
3. Déployer. Vercel sert `public/` en statique et transforme `api/*.py` en fonctions Python. Les
   fichiers qui commencent par `_` sont des modules partagés, pas des routes.

## Références

- N. Ben Amor, *Machine Learning Theory*, chapitre 2.
- T. M. Mitchell, *Machine Learning*, McGraw-Hill, 1997, chapitre 2.
