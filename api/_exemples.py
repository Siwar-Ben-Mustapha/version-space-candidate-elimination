"""Jeux de données du cours (N. Ben Amor, chapitre 2) au format carnet."""

SPORT = """# Sport — cours, diapositives 73 à 78
attribut Sport : football, hockey, gymnastics, handball, decathlon
attribut Type : team, individual
attribut Place : outdoor, indoor
attribut Level : national, world
attribut Day : Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday
+ football, team, outdoor, national, Saturday
+ hockey, team, outdoor, national, Saturday
- gymnastics, individual, indoor, world, Saturday
+ handball, team, indoor, national, Saturday
- decathlon, individual, outdoor, world, Sunday
"""

OISEAUX = """# Oiseaux — cours, diapositives 79 à 82
attribut Flat bill : True, False
attribut Size : intervalle 0 .. inf pas 1
attribut Neck colour : russet, orange, grey
  groupe warm colour : russet, orange
  groupe cold colour : grey
+ True, 30, russet
- False, 70, grey
+ True, 40, orange
- False, 60, orange
"""

ENJOYSPORT = """# EnjoySport — Mitchell (1997), diapositives 85 à 87
attribut Sky : Sunny, Cloudy, Rainy
attribut Temp : Warm, Cold
attribut Humidity : Normal, High
attribut Wind : Strong, Weak
attribut Water : Warm, Cool
attribut Forecast : Same, Change
+ Sunny, Warm, Normal, Strong, Warm, Same
+ Sunny, Warm, High, Strong, Warm, Same
- Rainy, Cold, High, Strong, Warm, Change
+ Sunny, Warm, High, Strong, Cool, Change
"""

BRUIT = """# EnjoySport bruité — diapositive 83 (limites)
attribut Sky : Sunny, Cloudy, Rainy
attribut Temp : Warm, Cold
attribut Humidity : Normal, High
attribut Wind : Strong, Weak
attribut Water : Warm, Cool
attribut Forecast : Same, Change
+ Sunny, Warm, Normal, Strong, Warm, Same
- Sunny, Warm, High, Strong, Warm, Same
- Rainy, Cold, High, Strong, Warm, Change
+ Sunny, Warm, High, Strong, Cool, Change
"""

CONTRADICTION = """# Étiquettes contradictoires
attribut Forme : cercle, carre, triangle
attribut Couleur : rouge, vert, bleu
+ cercle, rouge
- carre, vert
- cercle, rouge
"""

TOUS = {
    "sport": {"nom": "Sport", "source": "diapositives 73–78", "texte": SPORT},
    "oiseaux": {"nom": "Oiseaux", "source": "diapositives 79–82", "texte": OISEAUX},
    "enjoysport": {"nom": "EnjoySport", "source": "diapositives 85–87", "texte": ENJOYSPORT},
    "bruit": {"nom": "EnjoySport bruité", "source": "diapositive 83", "texte": BRUIT},
    "contradiction": {"nom": "Contradiction", "source": "exemple synthétique", "texte": CONTRADICTION},
}
