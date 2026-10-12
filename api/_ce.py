"""
Moteur de l'algorithme d'élimination des candidats (Mitchell, 1977).

Représentation choisie :
  * une contrainte catégorielle est l'ENSEMBLE (frozenset) des valeurs qu'elle accepte ;
    le langage autorise : le domaine entier (« ? »), chaque valeur seule, et chaque groupe
    d'une hiérarchie arborescente (ex. couleur chaude = {roux, orange}) ;
  * une contrainte numérique est un couple (bas, haut) d'un intervalle fermé sur une grille
    min + k·pas ; l'intervalle du domaine entier vaut « ? » ;
  * une hypothèse est un tuple de contraintes ; l'hypothèse vide ⊥ = ⟨∅,…,∅⟩ est représentée
    par la constante BOTTOM (toute hypothèse contenant ∅ ne couvre rien, elles sont toutes égales).

Le module n'utilise que la bibliothèque standard.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Iterable, Optional

INF = math.inf
BOTTOM = None  # l'hypothèse ⊥


class LanguageError(ValueError):
    """Jeu de données ou hypothèse incompatible avec le langage d'hypothèses."""


# ───────────────────────────── attributs ─────────────────────────────


class Categorical:
    kind = "categoriel"

    def __init__(self, name: str, values: list[str], groups: Optional[dict[str, list[str]]] = None):
        if not values:
            raise LanguageError(f"L'attribut « {name} » n'a aucune valeur.")
        if len(set(values)) != len(values):
            raise LanguageError(f"L'attribut « {name} » contient des valeurs en double.")
        self.name = name
        self.values = list(values)
        self.domain = frozenset(values)
        self.groups = dict(groups or {})
        # nœuds du langage : nom -> ensemble de valeurs
        nodes: dict[str, frozenset] = {}
        for g, members in self.groups.items():
            ext = self._extension(g, set())
            nodes[g] = ext
        self._check_tree(nodes)
        self.named = {ext: g for g, ext in nodes.items()}  # pour l'affichage
        self.nodes = {self.domain} | {frozenset([v]) for v in values} | set(nodes.values())

    def _extension(self, g: str, seen: set) -> frozenset:
        if g in seen:
            raise LanguageError(f"« {self.name} » : la hiérarchie contient un cycle.")
        seen = seen | {g}
        out = set()
        for m in self.groups[g]:
            if m in self.domain:
                out.add(m)
            elif m in self.groups:
                out |= self._extension(m, seen)
            else:
                raise LanguageError(f"« {self.name} » : le groupe « {g} » contient « {m} », inconnu.")
        if not out:
            raise LanguageError(f"« {self.name} » : le groupe « {g} » est vide.")
        return frozenset(out)

    def _check_tree(self, nodes: dict[str, frozenset]) -> None:
        exts = list(nodes.values())
        for i, a in enumerate(exts):
            for b in exts[i + 1:]:
                if a & b and not (a <= b or b <= a):
                    raise LanguageError(f"« {self.name} » : deux groupes se chevauchent, la hiérarchie doit être un arbre.")

    # -- opérations du langage --
    def full(self):
        return self.domain

    def accepts(self, c, v) -> bool:
        if v is None:
            return c == self.domain
        return v in c

    def geq(self, a, b) -> bool:
        return b <= a

    def generalize(self, c, v):
        """Plus petite contrainte du langage contenant c et v."""
        if v is None:
            return self.domain
        need = (c or frozenset()) | {v}
        return min((n for n in self.nodes if need <= n), key=len)

    def specialize(self, c, v):
        """Contraintes maximales du langage strictement incluses dans c qui rejettent v."""
        cands = [n for n in self.nodes if n < c and (v is None or v not in n)]
        return [n for n in cands if not any(n < m for m in cands)]

    def between(self, low, high):
        """Contraintes n du langage avec low ⊆ n ⊆ high (low=None : aucune borne basse)."""
        return [n for n in self.nodes if n <= high and (low is None or low <= n)]

    def show(self, c) -> str:
        if c == self.domain:
            return "?"
        if len(c) == 1 and c not in self.named:
            return next(iter(c))
        if c in self.named:
            return self.named[c]
        return next(iter(c))

    def parse(self, token: str):
        t = token.strip()
        if t in ("?", "*"):
            return self.domain
        if t in self.domain:
            return frozenset([t])
        if t in self.groups:
            return self._extension(t, set())
        raise LanguageError(f"« {t} » n'est ni une valeur ni un groupe de « {self.name} ».")

    def check_value(self, v) -> Optional[str]:
        if v is None or v in self.domain:
            return None
        return f"« {v} » n'appartient pas au domaine de « {self.name} »"

    def describe(self) -> dict:
        return {"nom": self.name, "type": "categoriel", "valeurs": self.values, "groupes": self.groups}


class Interval:
    kind = "intervalle"

    def __init__(self, name: str, low: float, high: float, step: float = 1):
        if not step > 0:
            raise LanguageError(f"« {name} » : le pas doit être positif.")
        if not low < high:
            raise LanguageError(f"« {name} » : le minimum doit être inférieur au maximum.")
        self.name, self.low, self.high, self.step = name, low, high, step
        self.digits = max(0, -int(math.floor(math.log10(step)))) if step < 1 else 0

    def _r(self, x):
        if math.isinf(x):
            return x
        x = round(x, self.digits + 6)
        return int(x) if float(x).is_integer() else x

    def _make(self, lo, hi):
        lo, hi = max(lo, self.low), min(hi, self.high)
        if lo > hi:
            return None
        return (self._r(lo), self._r(hi))

    def full(self):
        return (self._r(self.low), self._r(self.high))

    def accepts(self, c, v) -> bool:
        if v is None:
            return c == self.full()
        return c[0] <= v <= c[1]

    def geq(self, a, b) -> bool:
        return a[0] <= b[0] and b[1] <= a[1]

    def generalize(self, c, v):
        if v is None:
            return self.full()
        if c is None:
            return (self._r(v), self._r(v))
        return self._make(min(c[0], v), max(c[1], v))

    def specialize(self, c, v):
        lo, hi = c
        out = []
        if v is None:  # seul « ? » accepte une valeur manquante
            if not math.isinf(self.low):
                out.append(self._make(self.low + self.step, self.high))
            if not math.isinf(self.high):
                out.append(self._make(self.low, self.high - self.step))
        else:
            if v - self.step >= lo:
                out.append(self._make(lo, v - self.step))
            if v + self.step <= hi:
                out.append(self._make(v + self.step, hi))
        return [c2 for c2 in out if c2 is not None]

    def _points(self, a, b):
        if math.isinf(a) or math.isinf(b):
            return None
        n = int(math.floor((b - a) / self.step + 1e-9)) + 1
        return [self._r(a + k * self.step) for k in range(max(0, n))]

    def between(self, low, high):
        """Intervalles n avec low ⊆ n ⊆ high ; None si l'ensemble est infini."""
        if low is None:
            pts = self._points(*high)
            if pts is None:
                return None
            return [(a, b) for i, a in enumerate(pts) for b in pts[i:]]
        if low[0] < high[0] or low[1] > high[1]:
            return []
        lefts, rights = self._points(high[0], low[0]), self._points(low[1], high[1])
        if lefts is None or rights is None:
            return None
        return [(a, b) for a in lefts for b in rights]

    def show(self, c) -> str:
        if c == self.full():
            return "?"
        fmt = lambda x: "+∞" if x == INF else ("−∞" if x == -INF else str(x))
        return f"{']' if c[0] == -INF else '['}{fmt(c[0])}, {fmt(c[1])}{'[' if c[1] == INF else ']'}"

    def parse(self, token: str):
        t = token.strip()
        if t in ("?", "*"):
            return self.full()
        t2 = t.replace("∞", "inf").replace("−", "-")
        if t2[0] in "[]" and t2[-1] in "[]" and "," in t2:
            a, b = t2[1:-1].split(",")
            return self._make(_num(a), _num(b))
        raise LanguageError(f"« {t} » n'est pas un intervalle de « {self.name} ».")

    def check_value(self, v) -> Optional[str]:
        if v is None:
            return None
        if not isinstance(v, (int, float)):
            return f"« {v} » n'est pas un nombre (attribut « {self.name} »)"
        if not self.low <= v <= self.high:
            return f"{v} est hors du domaine de « {self.name} »"
        origin = 0 if math.isinf(self.low) else self.low
        k = (v - origin) / self.step
        if abs(k - round(k)) > 1e-9:
            return f"{v} n'est pas sur la grille de « {self.name} » (pas {self.step})"
        return None

    def describe(self) -> dict:
        b = lambda x: "inf" if x == INF else ("-inf" if x == -INF else x)
        return {"nom": self.name, "type": "intervalle", "min": b(self.low), "max": b(self.high), "pas": self.step}


def _num(s: str) -> float:
    s = s.strip().lower().replace("+", "")
    if s in ("inf", "infinity"):
        return INF
    if s in ("-inf", "-infinity"):
        return -INF
    v = float(s)
    return int(v) if v.is_integer() else v


# ───────────────────────────── espace d'hypothèses ─────────────────────────────


@dataclass
class Space:
    attrs: list

    def top(self):
        return tuple(a.full() for a in self.attrs)

    def covers(self, h, x) -> bool:
        if h is BOTTOM:
            return False
        return all(a.accepts(c, v) for a, c, v in zip(self.attrs, h, x))

    def geq(self, h1, h2) -> bool:
        """h1 ⪰ h2 : tout exemple couvert par h2 l'est par h1."""
        if h2 is BOTTOM:
            return True
        if h1 is BOTTOM:
            return False
        return all(a.geq(c1, c2) for a, c1, c2 in zip(self.attrs, h1, h2))

    def gt(self, h1, h2) -> bool:
        return h1 != h2 and self.geq(h1, h2)

    def generalize(self, s, x):
        """Généralisation minimale (unique dans ce langage)."""
        return tuple(a.generalize(None if s is BOTTOM else c, v) for a, c, v in zip(self.attrs, s or [None] * len(self.attrs), x))

    def specialize(self, g, x):
        """Spécialisations minimales de g rejetant x : on restreint UN attribut."""
        out = []
        for i, a in enumerate(self.attrs):
            for c in a.specialize(g[i], x[i]):
                h = g[:i] + (c,) + g[i + 1:]
                if h not in out:
                    out.append(h)
        return out or [BOTTOM]

    def show(self, h) -> str:
        if h is BOTTOM:
            return "⟨" + ", ".join("∅" for _ in self.attrs) + "⟩"
        return "⟨" + ", ".join(a.show(c) for a, c in zip(self.attrs, h)) + "⟩"

    def parse(self, text: str):
        body = text.strip().strip("⟨⟩<>()")
        tokens = re.findall(r"\s*([\[\]][^,\[\]]*,[^,\[\]]*[\[\]]|[^,]+?)\s*(?:,|$)", body)
        if len(tokens) != len(self.attrs):
            raise LanguageError(f"{len(self.attrs)} contraintes attendues, {len(tokens)} reçues.")
        if any(t.strip() == "∅" for t in tokens):
            return BOTTOM
        return tuple(a.parse(t) for a, t in zip(self.attrs, tokens))

    def nb_constraints(self, h) -> int:
        if h is BOTTOM:
            return len(self.attrs) + 1
        return sum(1 for a, c in zip(self.attrs, h) if c != a.full())


# ───────────────────────────── algorithme ─────────────────────────────


@dataclass
class Operation:
    action: str  # retire, generalise, specialise, rejete, elague, rien
    ensemble: str  # "S" ou "G"
    avant: Optional[str] = None
    apres: list = field(default_factory=list)
    raison: str = ""


def _most_specific(space, hs):
    return [h for h in hs if not any(space.gt(h, o) for o in hs if o != h)]


def _most_general(space, hs):
    return [h for h in hs if not any(space.gt(o, h) for o in hs if o != h)]


def candidate_elimination(space: Space, examples: list, max_boundary: int = 3000):
    """Renvoie la liste des états successifs et le journal des opérations par exemple."""
    S, G = [BOTTOM], [space.top()]
    states = [{"S": list(S), "G": list(G), "ops": []}]
    for x, label in examples:
        ops: list[Operation] = []
        if label:
            kept = []
            for g in G:
                if space.covers(g, x):
                    kept.append(g)
                else:
                    ops.append(Operation("retire", "G", space.show(g), raison="ne couvre pas l'exemple positif"))
            G = kept
            newS = []
            for s in S:
                if space.covers(s, x):
                    newS.append(s)
                    continue
                h = space.generalize(s, x)
                if any(space.geq(g, h) for g in G):
                    newS.append(h)
                    ops.append(Operation("generalise", "S", space.show(s), [space.show(h)], "généralisation minimale couvrant l'exemple"))
                else:
                    ops.append(Operation("rejete", "S", space.show(s), [space.show(h)], "aucune hypothèse de G n'est plus générale"))
            uniq = list(dict.fromkeys(newS))
            S = _most_specific(space, uniq)
            for h in uniq:
                if h not in S:
                    ops.append(Operation("elague", "S", space.show(h), raison="plus générale qu'un autre élément de S"))
        else:
            kept = []
            for s in S:
                if space.covers(s, x):
                    ops.append(Operation("retire", "S", space.show(s), raison="couvre l'exemple négatif"))
                else:
                    kept.append(s)
            S = kept
            newG = []
            for g in G:
                if not space.covers(g, x):
                    newG.append(g)
                    continue
                specs = space.specialize(g, x)
                good = [h for h in specs if any(space.geq(h, s) for s in S)]
                bad = [h for h in specs if h not in good]
                newG.extend(good)
                ops.append(Operation("specialise", "G", space.show(g), [space.show(h) for h in good], f"{len(specs)} spécialisations minimales, {len(good)} plus générales qu'un élément de S"))
                if bad:
                    ops.append(Operation("rejete", "G", None, [space.show(h) for h in bad], "aucun élément de S n'est plus spécifique"))
                if len(newG) > max_boundary:
                    raise LanguageError(f"La frontière G dépasse {max_boundary} hypothèses : réduisez le nombre d'attributs ou de valeurs.")
            uniq = list(dict.fromkeys(newG))
            G = _most_general(space, uniq)
            for h in uniq:
                if h not in G:
                    ops.append(Operation("elague", "G", space.show(h), raison="plus spécifique qu'un autre élément de G"))
        if not ops:
            ops.append(Operation("rien", "S/G", raison="S et G sont déjà cohérents avec cet exemple"))
        states.append({"S": list(S), "G": list(G), "ops": ops})
    return states


def version_space(space: Space, S, G, limit: int = 5000):
    """Énumère { h : ∃s∈S, ∃g∈G, s ⪯ h ⪯ g }. Renvoie (statut, liste)."""
    if not S or not G:
        return "vide", []
    found: dict = {}
    for s in S:
        for g in G:
            if not space.geq(g, s):
                continue
            if g is BOTTOM:
                found[None] = BOTTOM
                continue
            if s is BOTTOM:
                found[None] = BOTTOM
            choices = []
            for i, a in enumerate(space.attrs):
                opts = a.between(None if s is BOTTOM else s[i], g[i])
                if opts is None:
                    return "infini", []
                choices.append(opts)
            total = math.prod(len(c) for c in choices)
            if total + len(found) > limit:
                return "trop grand", []
            for h in _product(choices):
                found[h] = h
    return "complet", list(found.values())


def _product(choices):
    if not choices:
        yield ()
        return
    for c in choices[0]:
        for rest in _product(choices[1:]):
            yield (c,) + rest


def hasse(space: Space, hs: list):
    """Arêtes de couverture (réduction transitive de ≺) entre les hypothèses données."""
    edges = []
    for i, lo in enumerate(hs):
        for j, hi in enumerate(hs):
            if i == j or not space.gt(hi, lo):
                continue
            if not any(k not in (i, j) and space.gt(hi, m) and space.gt(m, lo) for k, m in enumerate(hs)):
                edges.append((i, j))
    return edges


def classify(space: Space, S, G, x):
    if not S or not G:
        return "aucune", "L'espace des versions est vide : aucune hypothèse n'est cohérente."
    if all(space.covers(s, x) for s in S):
        return "positif", "Tous les éléments de S couvrent l'instance, donc toutes les hypothèses de l'espace des versions la classent positive."
    if not any(space.covers(g, x) for g in G):
        return "negatif", "Aucun élément de G ne couvre l'instance, donc aucune hypothèse de l'espace des versions ne la classe positive."
    return "indetermine", "Certaines hypothèses la classent positive, d'autres négative : il faut plus d'exemples."


def brute_force(space: Space, examples: list):
    """Vérification indépendante : énumère tout H (petits domaines finis uniquement)."""
    lists = []
    for a in space.attrs:
        opts = a.between(None, a.full())
        if opts is None:
            raise LanguageError("Domaine infini : force brute impossible.")
        lists.append(opts)
    allh = [BOTTOM] + list(_product(lists))
    ok = [h for h in allh if all(space.covers(h, x) == y for x, y in examples)]
    S = [h for h in ok if not any(space.gt(h, o) for o in ok)]
    G = [h for h in ok if not any(space.gt(o, h) for o in ok)]
    return ok, S, G
