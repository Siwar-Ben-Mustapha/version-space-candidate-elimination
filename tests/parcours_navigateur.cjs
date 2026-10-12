const { chromium } = require('playwright');
const assert = require('assert');
const URL = process.env.URL ?? 'http://localhost:8000/';
(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(URL); await p.waitForSelector('#graphe .noeud');
  // navigation
  for (let i = 0; i < 5; i++) await p.click('#suivant');
  assert.equal(await p.textContent('#compteur'), 'Exemple 5 sur 5');
  assert.equal(await p.locator('#graphe .noeud.membre').count(), 3);
  assert.equal(await p.locator('#graphe .arete.couverture').count(), 7);
  // clic sur un noeud
  await p.locator('#graphe .noeud.S').click();
  assert.ok((await p.textContent('#legende-graphe')).includes('surlignés'));
  // quiz
  await p.check('#mode-quiz');
  await p.locator('.frise button').nth(3).click();
  assert.ok(!(await p.isHidden('#quiz')));
  assert.equal(await p.locator('#journal li').count(), 0);
  await p.click('#quiz-choix [data-rep="G"]');
  assert.equal(await p.textContent('#quiz-retour'), 'Bien vu !');
  assert.ok((await p.locator('#journal li').count()) > 0);
  await p.uncheck('#mode-quiz');
  // classement EnjoySport slide 87 D
  await p.click('#jeux button[data-jeu=enjoysport]'); await p.waitForTimeout(400);
  await p.click('#suivant'); await p.click('#suivant'); await p.click('#suivant'); await p.click('#suivant');
  const f = '#form-classer';
  for (const [i, v] of ['Sunny', 'Cold', 'Normal', 'Strong', 'Warm', 'Same'].entries()) await p.selectOption(`${f} [name=a${i}]`, v);
  await p.click(`${f} button`); await p.waitForSelector('.sentence');
  assert.ok((await p.textContent('#verdict')).includes('2 disent oui'));
  // Oiseaux : infini
  await p.click('#jeux button[data-jeu=oiseaux]'); await p.waitForTimeout(400);
  for (let i = 0; i < 4; i++) await p.click('#suivant');
  assert.ok((await p.textContent('#legende-graphe')).includes('infini'));
  assert.ok((await p.textContent('#liste-g')).includes('⟨?, [0, 59], ?⟩'));
  // contradiction
  await p.click('#jeux button[data-jeu=contradiction]'); await p.waitForTimeout(400);
  for (let i = 0; i < 3; i++) await p.click('#suivant');
  assert.ok((await p.textContent('#journal')).includes('Effondrement'));
  // erreur de syntaxe
  await p.fill('#editeur', 'attribut A : a, b\n+ c'); await p.click('#executer');
  await p.waitForSelector('#erreur:not([hidden])');
  assert.ok((await p.textContent('#erreur')).includes('ligne 2'));
  // export markdown
  await p.click('#jeux button[data-jeu=sport]'); await p.waitForTimeout(400);
  const [d] = await Promise.all([p.waitForEvent('download'), p.click('#export-md')]);
  const md = require('fs').readFileSync(await d.path(), 'utf8');
  assert.ok(md.includes('contient 6 hypothèses'));
  const [d2] = await Promise.all([p.waitForEvent('download'), p.click('#export-svg')]);
  assert.ok(require('fs').readFileSync(await d2.path(), 'utf8').startsWith('<svg'));
  // mobile
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(200);
  const w = await p.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(w <= 391, 'débordement horizontal ' + w);
  assert.deepEqual(errs, []);
  console.log('OK — parcours navigateur complet');
  await b.close();
})().catch((e) => { console.error('ECHEC', e.message); process.exit(1); });
