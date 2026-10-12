"""Course datasets (N. Ben Amor, chapter 2) in notebook format."""

SPORT = """# Sport — course, slides 73 to 78
attribute Sport : football, hockey, gymnastics, handball, decathlon
attribute Type : team, individual
attribute Place : outdoor, indoor
attribute Level : national, world
attribute Day : Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday
+ football, team, outdoor, national, Saturday
+ hockey, team, outdoor, national, Saturday
- gymnastics, individual, indoor, world, Saturday
+ handball, team, indoor, national, Saturday
- decathlon, individual, outdoor, world, Sunday
"""

OISEAUX = """# Birds — course, slides 79 to 82
attribute Flat bill : True, False
attribute Size : interval 0 .. inf step 1
attribute Neck colour : russet, orange, grey
  group warm colour : russet, orange
  group cold colour : grey
+ True, 30, russet
- False, 70, grey
+ True, 40, orange
- False, 60, orange
"""

ENJOYSPORT = """# EnjoySport — Mitchell (1997), slides 85 to 87
attribute Sky : Sunny, Cloudy, Rainy
attribute Temp : Warm, Cold
attribute Humidity : Normal, High
attribute Wind : Strong, Weak
attribute Water : Warm, Cool
attribute Forecast : Same, Change
+ Sunny, Warm, Normal, Strong, Warm, Same
+ Sunny, Warm, High, Strong, Warm, Same
- Rainy, Cold, High, Strong, Warm, Change
+ Sunny, Warm, High, Strong, Cool, Change
"""

BRUIT = """# Noisy EnjoySport — slide 83 (limits)
attribute Sky : Sunny, Cloudy, Rainy
attribute Temp : Warm, Cold
attribute Humidity : Normal, High
attribute Wind : Strong, Weak
attribute Water : Warm, Cool
attribute Forecast : Same, Change
+ Sunny, Warm, Normal, Strong, Warm, Same
- Sunny, Warm, High, Strong, Warm, Same
- Rainy, Cold, High, Strong, Warm, Change
+ Sunny, Warm, High, Strong, Cool, Change
"""

CONTRADICTION = """# Contradictory labels
attribute Shape : circle, square, triangle
attribute Colour : red, green, blue
+ circle, red
- square, green
- circle, red
"""

TOUS = {
    "sport": {"nom": "Sport", "source": "slides 73–78", "texte": SPORT},
    "oiseaux": {"nom": "Birds", "source": "slides 79–82", "texte": OISEAUX},
    "enjoysport": {"nom": "EnjoySport", "source": "slides 85–87", "texte": ENJOYSPORT},
    "bruit": {"nom": "Noisy EnjoySport", "source": "slide 83", "texte": BRUIT},
    "contradiction": {"nom": "Contradiction", "source": "synthetic example", "texte": CONTRADICTION},
}
