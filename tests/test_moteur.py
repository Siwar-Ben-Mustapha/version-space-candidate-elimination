"""Tests du moteur : python -m unittest discover -s tests -v"""
import json
import os
import random
import sys
import threading
import unittest
import urllib.request
from http.server import ThreadingHTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))

import _ce  # noqa: E402
from _carnet import CarnetError, classify, parse_carnet, run  # noqa: E402
from _exemples import BRUIT, CONTRADICTION, ENJOYSPORT, OISEAUX, SPORT  # noqa: E402


def etats(texte):
    _, space, ex = parse_carnet(texte)
    return space, ex, _ce.candidate_elimination(space, ex)


def montre(space, hs):
    return sorted(space.show(h) for h in hs)


class TestSport(unittest.TestCase):
    """Diapositives 75 à 77."""

    def setUp(self):
        self.space, self.ex, self.st = etats(SPORT)

    def test_etapes(self):
        sp, st = self.space, self.st
        self.assertEqual(montre(sp, st[0]["S"]), ["⟨∅, ∅, ∅, ∅, ∅⟩"])
        self.assertEqual(montre(sp, st[0]["G"]), ["⟨?, ?, ?, ?, ?⟩"])
        self.assertEqual(montre(sp, st[1]["S"]), ["⟨football, team, outdoor, national, Saturday⟩"])
        self.assertEqual(montre(sp, st[2]["S"]), ["⟨?, team, outdoor, national, Saturday⟩"])
        self.assertEqual(montre(sp, st[3]["G"]), sorted(["⟨?, team, ?, ?, ?⟩", "⟨?, ?, outdoor, ?, ?⟩", "⟨?, ?, ?, national, ?⟩"]))
        self.assertEqual(montre(sp, st[4]["G"]), sorted(["⟨?, team, ?, ?, ?⟩", "⟨?, ?, ?, national, ?⟩"]))
        self.assertEqual(montre(sp, st[4]["S"]), ["⟨?, team, ?, national, Saturday⟩"])
        self.assertEqual(montre(sp, st[5]["S"]), montre(sp, st[4]["S"]))
        self.assertEqual(montre(sp, st[5]["G"]), montre(sp, st[4]["G"]))

    def test_espace_final_six_hypotheses(self):
        statut, vs = _ce.version_space(self.space, self.st[-1]["S"], self.st[-1]["G"])
        self.assertEqual(statut, "complet")
        self.assertEqual(
            montre(self.space, vs),
            sorted([
                "⟨?, ?, ?, national, ?⟩",
                "⟨?, team, ?, ?, ?⟩",
                "⟨?, team, ?, national, ?⟩",
                "⟨?, team, ?, ?, Saturday⟩",
                "⟨?, ?, ?, national, Saturday⟩",
                "⟨?, team, ?, national, Saturday⟩",
            ]),
        )
        self.assertEqual(len(_ce.hasse(self.space, vs)), 7)

    def test_taille_de_H(self):
        statut, vs = _ce.version_space(self.space, self.st[0]["S"], self.st[0]["G"])
        self.assertEqual(len(vs), 6 * 3 * 3 * 3 * 8 + 1)  # 1297, diapositive 78


class TestOiseaux(unittest.TestCase):
    """Diapositives 79 à 82 : intervalles et hiérarchie de couleurs."""

    def setUp(self):
        self.space, self.ex, self.st = etats(OISEAUX)

    def test_etapes(self):
        sp, st = self.space, self.st
        self.assertEqual(montre(sp, st[1]["S"]), ["⟨True, [30, 30], russet⟩"])
        self.assertEqual(montre(sp, st[2]["G"]), sorted(["⟨True, ?, ?⟩", "⟨?, [0, 69], ?⟩", "⟨?, ?, warm colour⟩"]))
        self.assertEqual(montre(sp, st[3]["S"]), ["⟨True, [30, 40], warm colour⟩"])
        self.assertEqual(montre(sp, st[4]["G"]), sorted(["⟨True, ?, ?⟩", "⟨?, [0, 59], ?⟩"]))

    def test_specialisations_diapo_80(self):
        sp = self.space
        x = (False, 70, "grey")
        specs = sp.specialize(sp.top(), ("False", 70, "grey"))
        self.assertEqual(sorted(map(sp.show, specs)), sorted(["⟨True, ?, ?⟩", "⟨?, [0, 69], ?⟩", "⟨?, [71, +∞[, ?⟩", "⟨?, ?, warm colour⟩"]))
        del x

    def test_specialisations_diapo_81(self):
        sp = self.space
        g = sp.parse("(?, [0, 69], ?)")
        specs = sorted(map(sp.show, sp.specialize(g, ("False", 60, "orange"))))
        self.assertEqual(specs, sorted(["⟨True, [0, 69], ?⟩", "⟨?, [0, 59], ?⟩", "⟨?, [61, 69], ?⟩", "⟨?, [0, 69], russet⟩", "⟨?, [0, 69], cold colour⟩"]))

    def test_h1_h2_h3_et_infini(self):
        sp, last = self.space, self.st[-1]
        for t in ("(True, [30, 55], ?)", "(True, [0, 59], warm colour)", "(?, [0, 42], ?)"):
            h = sp.parse(t)
            self.assertTrue(any(sp.geq(h, s) for s in last["S"]) and any(sp.geq(g, h) for g in last["G"]), t)
        self.assertEqual(_ce.version_space(sp, last["S"], last["G"])[0], "infini")


class TestEnjoySport(unittest.TestCase):
    def test_classement_diapos_86_87(self):
        cas = {
            "Sunny, Warm, Normal, Strong, Cool, Change": ("positif", 6, 0),
            "Rainy, Cold, Normal, Weak, Warm, Same": ("negatif", 0, 6),
            "Sunny, Warm, Normal, Weak, Warm, Same": ("indetermine", 3, 3),
            "Sunny, Cold, Normal, Strong, Warm, Same": ("indetermine", 2, 4),
        }
        for inst, (verdict, p, n) in cas.items():
            r = classify(ENJOYSPORT, [v.strip() for v in inst.split(",")])
            self.assertEqual(r["verdict"], verdict, inst)
            self.assertEqual(r["votes"], {"positif": p, "negatif": n}, inst)


class TestLimites(unittest.TestCase):
    def test_bruit_diapo_83(self):
        sp, _, st = etats(BRUIT)
        self.assertEqual(montre(sp, st[2]["G"]), ["⟨?, ?, Normal, ?, ?, ?⟩"])
        self.assertEqual(st[4]["G"], [])
        self.assertTrue(run(BRUIT)["vide"])

    def test_contradiction(self):
        self.assertTrue(run(CONTRADICTION)["vide"])

    def test_valeur_manquante(self):
        _, sp, ex = parse_carnet("attribut A : a, b\nattribut B : x, y\n+ a, x\n+ ?, x")
        st = _ce.candidate_elimination(sp, ex)
        self.assertEqual(montre(sp, st[-1]["S"]), ["⟨?, x⟩"])


class TestForceBrute(unittest.TestCase):
    """S et G doivent être exactement les éléments minimaux/maximaux des hypothèses cohérentes."""

    def test_aleatoire(self):
        rnd = random.Random(2026)
        non_vides = 0
        for _ in range(250):
            attrs = []
            for i in range(rnd.randint(2, 4)):
                r = rnd.random()
                if r < 0.25:
                    attrs.append(_ce.Interval(f"N{i}", 0, rnd.randint(3, 5), 1))
                else:
                    k = rnd.randint(2, 4)
                    vals = [f"v{j}" for j in range(k)]
                    groups = {"bas": vals[:2]} if k >= 3 and r < 0.5 else None
                    attrs.append(_ce.Categorical(f"C{i}", vals, groups))
            sp = _ce.Space(attrs)

            def val(a):
                if rnd.random() < 0.05:
                    return None
                return rnd.randint(int(a.low), int(a.high)) if isinstance(a, _ce.Interval) else rnd.choice(a.values)

            ex = [(tuple(val(a) for a in attrs), rnd.random() < 0.5) for _ in range(rnd.randint(1, 6))]
            st = _ce.candidate_elimination(sp, ex)[-1]
            ok, S, G = _ce.brute_force(sp, ex)
            if not ok:
                self.assertTrue(not st["S"] or not st["G"])
                continue
            non_vides += 1
            self.assertEqual(montre(sp, st["S"]), montre(sp, S))
            self.assertEqual(montre(sp, st["G"]), montre(sp, G))
            statut, vs = _ce.version_space(sp, st["S"], st["G"], limit=100000)
            self.assertEqual(montre(sp, vs), montre(sp, ok))
        self.assertGreater(non_vides, 80)


class TestCarnet(unittest.TestCase):
    def test_erreurs_avec_numero_de_ligne(self):
        with self.assertRaises(CarnetError) as e:
            parse_carnet("attribut A : a, b\n+ a, b")
        self.assertEqual(e.exception.line, 2)
        with self.assertRaises(CarnetError) as e:
            parse_carnet("attribut A : a, b\n+ c")
        self.assertIn("domain", str(e.exception))
        with self.assertRaises(CarnetError):
            parse_carnet("attribut T : intervalle 0 .. 10 pas 2\n+ 3")
        with self.assertRaises(CarnetError):
            parse_carnet("attribut C : a, b, c\n  groupe g1 : a, b\n  groupe g2 : b, c\n+ a")

    def test_run_json(self):
        r = run(SPORT)
        self.assertEqual(len(r["etats"]), 6)
        self.assertEqual(r["etats"][-1]["graphe"]["taille"], 6)
        self.assertTrue(r["etats"][3]["change"]["G"])
        self.assertFalse(r["etats"][5]["change"]["S"])
        json.dumps(r)


class TestAPI(unittest.TestCase):
    """Démarre le serveur local et appelle les points d'accès comme le ferait le navigateur."""

    @classmethod
    def setUpClass(cls):
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
        import serveur

        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), serveur.Dev)
        cls.url = f"http://127.0.0.1:{cls.srv.server_address[1]}"
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def post(self, path, data):
        req = urllib.request.Request(self.url + path, data=json.dumps(data).encode(), headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, json.load(r)
        except urllib.error.HTTPError as e:
            return e.code, json.load(e)

    def test_executer_et_classer(self):
        code, r = self.post("/api/executer", {"texte": SPORT})
        self.assertEqual(code, 200)
        self.assertEqual(r["etats"][-1]["S"], ["⟨?, team, ?, national, Saturday⟩"])
        code, r = self.post("/api/classer", {"texte": OISEAUX, "valeurs": ["True", 35, "russet"]})
        self.assertEqual((code, r["verdict"]), (200, "positif"))

    def test_erreur_422(self):
        code, r = self.post("/api/executer", {"texte": "attribut A : a\n+ b"})
        self.assertEqual(code, 422)
        self.assertEqual(r["ligne"], 2)

    def test_exemples(self):
        with urllib.request.urlopen(self.url + "/api/exemples") as r:
            self.assertIn("sport", json.load(r))


if __name__ == "__main__":
    unittest.main()
