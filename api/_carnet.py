"""
Format texte « carnet » pour décrire un jeu de données, et service JSON de l'API.

    # commentaire
    attribut Sport : football, hockey, gymnastics
    attribut Taille : intervalle 0 .. inf pas 1
    attribut Couleur : roux, orange, gris
      groupe chaude : roux, orange
    + football, 30, roux        ← exemple positif
    - hockey, 70, gris          ← exemple négatif  (« ? » = valeur manquante)
"""
from __future__ import annotations

import re

import _ce
from _ce import BOTTOM, Categorical, Interval, LanguageError, Space


class CarnetError(ValueError):
    def __init__(self, line: int, message: str):
        super().__init__(f"ligne {line} : {message}")
        self.line = line
        self.message = message


def parse_carnet(text: str):
    """Renvoie (titre, Space, exemples [(valeurs, label)])."""
    attrs_spec = []  # [nom, type, données, ligne]
    examples = []
    title = None
    for n, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line:
            continue
        if line.startswith("#"):
            if title is None:
                title = line.lstrip("#").strip()
            continue
        low = line.lower()
        if low.startswith("attribut "):
            if examples:
                raise CarnetError(n, "les attributs doivent être déclarés avant les exemples.")
            body = line[len("attribut "):]
            if ":" not in body:
                raise CarnetError(n, "syntaxe attendue : attribut Nom : valeur1, valeur2, …")
            name, rest = (p.strip() for p in body.split(":", 1))
            m = re.fullmatch(r"intervalle\s+(\S+)\s*\.\.\s*(\S+)(?:\s+pas\s+(\S+))?", rest, re.IGNORECASE)
            if m:
                try:
                    lo, hi = _ce._num(m.group(1)), _ce._num(m.group(2))
                    step = _ce._num(m.group(3)) if m.group(3) else 1
                except ValueError:
                    raise CarnetError(n, "bornes ou pas de l'intervalle invalides.")
                attrs_spec.append([name, "intervalle", (lo, hi, step), n])
            else:
                values = [v.strip() for v in rest.split(",") if v.strip()]
                attrs_spec.append([name, "categoriel", {"values": values, "groups": {}}, n])
            continue
        if low.startswith("groupe "):
            if not attrs_spec or attrs_spec[-1][1] != "categoriel":
                raise CarnetError(n, "un groupe doit suivre un attribut catégoriel.")
            body = line[len("groupe "):]
            if ":" not in body:
                raise CarnetError(n, "syntaxe attendue : groupe nom : valeur1, valeur2")
            g, rest = (p.strip() for p in body.split(":", 1))
            attrs_spec[-1][2]["groups"][g] = [v.strip() for v in rest.split(",") if v.strip()]
            continue
        if line[0] in "+-−":
            if not attrs_spec:
                raise CarnetError(n, "déclarez les attributs avant les exemples.")
            label = line[0] == "+"
            cells = [c.strip() for c in line[1:].split(",")]
            if len(cells) != len(attrs_spec):
                raise CarnetError(n, f"{len(attrs_spec)} valeurs attendues, {len(cells)} trouvées.")
            values = []
            for (name, kind, _, _), c in zip(attrs_spec, cells):
                if c in ("?", ""):
                    values.append(None)
                elif kind == "intervalle":
                    try:
                        values.append(_ce._num(c))
                    except ValueError:
                        raise CarnetError(n, f"« {c} » n'est pas un nombre (attribut « {name} »).")
                else:
                    values.append(c)
            examples.append((tuple(values), label, n))
            continue
        raise CarnetError(n, "ligne non reconnue (attendu : attribut, groupe, + exemple, - exemple ou # commentaire).")
    if not attrs_spec:
        raise CarnetError(1, "aucun attribut déclaré.")
    attrs = []
    for name, kind, data, n in attrs_spec:
        try:
            if kind == "intervalle":
                attrs.append(Interval(name, *data))
            else:
                attrs.append(Categorical(name, data["values"], data["groups"]))
        except LanguageError as e:
            raise CarnetError(n, str(e))
    space = Space(attrs)
    for values, _, n in examples:
        for a, v in zip(attrs, values):
            err = a.check_value(v)
            if err:
                raise CarnetError(n, err + ".")
    if len(examples) > 500:
        raise CarnetError(1, "au plus 500 exemples.")
    return title or "Jeu de données", space, [(v, y) for v, y, _ in examples]


# ───────────────────────────── service JSON ─────────────────────────────


def _graph(space: Space, S, G, max_nodes: int = 60):
    status, members = _ce.version_space(space, S, G)
    complete = status == "complet" and len(members) <= max_nodes
    hs = members if complete else list(dict.fromkeys(list(G) + list(S)))
    in_vs = len(hs)
    top = space.top()
    extra = []
    if status != "vide":
        if top not in hs:
            extra.append(("haut", top))
        if BOTTOM not in hs:
            extra.append(("bas", BOTTOM))
    nodes = []
    for h in hs:
        role = "SG" if (h in G and h in S) else "G" if h in G else "S" if h in S else "membre"
        nodes.append({"id": space.show(h), "label": space.show(h), "role": role, "rang": space.nb_constraints(h)})
    edges = [{"de": nodes[i]["id"], "vers": nodes[j]["id"], "type": "couverture" if complete else "ordre"} for i, j in _ce.hasse(space, hs)]
    for kind, h in extra:
        label = "⊤" if kind == "haut" else "⊥"
        nodes.append({"id": label, "label": label, "role": kind, "rang": space.nb_constraints(h)})
        for i, n in enumerate(hs):
            if kind == "haut" and not any(space.gt(o, n) for o in hs):
                edges.append({"de": nodes[i]["id"], "vers": "⊤", "type": "hors"})
            if kind == "bas" and not any(space.gt(n, o) for o in hs):
                edges.append({"de": "⊥", "vers": nodes[i]["id"], "type": "hors"})
    size = len(members) if status == "complet" else (0 if status == "vide" else None)
    return {
        "statut": status,
        "taille": size,
        "complet": complete,
        "noeuds": nodes,
        "aretes": edges,
        "membres": [space.show(h) for h in members] if status == "complet" and len(members) <= 200 else [],
        "nb_affiches": in_vs,
    }


def run(text: str) -> dict:
    title, space, examples = parse_carnet(text)
    states = _ce.candidate_elimination(space, examples)
    out_states = []
    for i, st in enumerate(states):
        prev = states[i - 1] if i else None
        out_states.append(
            {
                "S": [space.show(h) for h in st["S"]],
                "G": [space.show(h) for h in st["G"]],
                "operations": [o.__dict__ for o in st["ops"]],
                "change": {
                    "S": prev is not None and set(map(space.show, prev["S"])) != set(map(space.show, st["S"])),
                    "G": prev is not None and set(map(space.show, prev["G"])) != set(map(space.show, st["G"])),
                },
                "graphe": _graph(space, st["S"], st["G"]),
            }
        )
    return {
        "titre": title,
        "attributs": [a.describe() for a in space.attrs],
        "exemples": [{"valeurs": list(v), "label": y} for v, y in examples],
        "etats": out_states,
        "vide": not states[-1]["S"] or not states[-1]["G"],
    }


def classify(text: str, values: list, step: int | None = None) -> dict:
    _, space, examples = parse_carnet(text)
    states = _ce.candidate_elimination(space, examples)
    st = states[-1 if step is None else max(0, min(step, len(states) - 1))]
    x = []
    for a, v in zip(space.attrs, values):
        if v in (None, "", "?"):
            x.append(None)
        elif isinstance(a, Interval):
            x.append(_ce._num(str(v)))
        else:
            x.append(str(v))
    for a, v in zip(space.attrs, x):
        err = a.check_value(v)
        if err:
            raise LanguageError(err + ".")
    verdict, reason = _ce.classify(space, st["S"], st["G"], x)
    detail = []
    for kind, hs in (("G", st["G"]), ("S", st["S"])):
        for h in hs:
            checks = [] if h is BOTTOM else [{"attribut": a.name, "contrainte": a.show(c), "ok": a.accepts(c, v)} for a, c, v in zip(space.attrs, h, x)]
            detail.append({"ensemble": kind, "hypothese": space.show(h), "couvre": space.covers(h, x), "contraintes": checks})
    status, members = _ce.version_space(space, st["S"], st["G"])
    votes = None
    if status == "complet":
        pos = sum(1 for h in members if space.covers(h, x))
        votes = {"positif": pos, "negatif": len(members) - pos}
    return {"verdict": verdict, "explication": reason, "detail": detail, "votes": votes}
