const DB = 'hackis-kochbuch-db';
const STORE = 'recipes';
let recipes = [];
let filter = 'all';
let editing = null;

const $ = id => document.getElementById(id);

function openDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('Dieser Browser unterstützt den lokalen Rezept-Speicher nicht.'));
      return;
    }
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error || new Error('Die Rezept-Datenbank konnte nicht geöffnet werden.'));
    request.onblocked = () => reject(new Error('Die Rezept-Datenbank ist noch in einem anderen Fenster geöffnet. Bitte schließe andere Kochbuch-Fenster und versuche es erneut.'));
  });
}

async function all() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).getAll();
    let result = [];
    request.onsuccess = () => { result = request.result || []; };
    request.onerror = () => reject(request.error || new Error('Rezepte konnten nicht gelesen werden.'));
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Fehler beim Lesen der Rezepte.')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Lesen der Rezepte wurde abgebrochen.')); };
  });
}

async function put(item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Rezept konnte nicht gespeichert werden.')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Speichern wurde abgebrochen.')); };
  });
}

async function remove(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Rezept konnte nicht gelöscht werden.')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Löschen wurde abgebrochen.')); };
  });
}

function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function render() {
  const q = $('search').value.toLowerCase();
  const shown = recipes.filter(r =>
    (filter === 'all' || r.favorite) &&
    (`${r.name} ${r.category} ${r.ingredients}`).toLowerCase().includes(q)
  );
  $('count').textContent = recipes.length;
  $('favCount').textContent = recipes.filter(r => r.favorite).length;
  $('recipeList').innerHTML = shown.length ? shown.map(r => `
    <article class="recipe">
      ${r.photo ? `<img src="${r.photo}" alt="">` : '<div style="height:90px;display:grid;place-items:center;background:#e8eee8;font-size:38px">🍲</div>'}
      <div class="recipe-body">
        <h3>${escapeHTML(r.name)}</h3>
        <div class="muted">${escapeHTML(r.category)} · ${r.portions || 4} Portionen${r.minutes ? ` · ${r.minutes} Min.` : ''}</div>
        <div class="recipe-actions">
          <button data-open="${r.id}">Ansehen</button>
          <button data-fav="${r.id}">${r.favorite ? '♥' : '♡'}</button>
        </div>
      </div>
    </article>`).join('') : `
      <div class="empty"><div>📖</div><h2>Noch nichts gefunden</h2><p>Lege unten dein erstes Rezept an.</p></div>`;
  $('recipeList').querySelectorAll('[data-open]').forEach(button => {
    button.onclick = () => show(Number(button.dataset.open));
  });
  $('recipeList').querySelectorAll('[data-fav]').forEach(button => {
    button.onclick = async () => {
      try {
        const recipe = recipes.find(x => x.id === Number(button.dataset.fav));
        if (!recipe) return;
        recipe.favorite = !recipe.favorite;
        await put(recipe);
        await refresh();
      } catch (error) {
        alert('Das hat leider nicht geklappt: ' + error.message);
      }
    };
  });
}

async function refresh() {
  recipes = await all();
  render();
}

function reset() {
  editing = null;
  $('recipeForm').reset();
  $('portions').value = 4;
  $('formTitle').textContent = '＋ Neues Rezept';
  $('saveBtn').textContent = 'Rezept speichern';
  $('cancelEdit').hidden = true;
}

$('recipeForm').onsubmit = async event => {
  event.preventDefault();
  const name = $('name').value.trim();
  const ingredients = $('ingredients').value.trim();
  const instructions = $('instructions').value.trim();
  if (!name || !ingredients || !instructions) {
    alert('Bitte fülle Rezeptname, Zutaten und Zubereitung aus.');
    return;
  }

  $('saveBtn').disabled = true;
  const originalText = $('saveBtn').textContent;
  $('saveBtn').textContent = 'Speichert …';
  try {
    const old = recipes.find(r => r.id === editing);
    let photo = old?.photo || '';
    const file = $('photo').files[0];
    if (file) {
      photo = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Das Foto konnte nicht gelesen werden.'));
        reader.readAsDataURL(file);
      });
    }
    const item = {
      id: editing || Date.now(),
      name,
      category: $('category').value,
      portions: Number($('portions').value) || 4,
      minutes: Number($('minutes').value) || 0,
      ingredients,
      instructions,
      photo,
      favorite: old?.favorite || false
    };
    await put(item);
    await refresh();
    reset();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    alert('Rezept wurde gespeichert. ❤️');
  } catch (error) {
    console.error('Hackis Kochbuch – Speicherfehler:', error);
    alert('Dein Rezept konnte leider nicht gespeichert werden.\n\nFehler: ' + (error?.message || 'Unbekannter Speicherfehler') + '\n\nBitte schließe das Kochbuch und versuche es erneut. Deine Eingaben sind möglicherweise noch im Formular.');
  } finally {
    $('saveBtn').disabled = false;
    $('saveBtn').textContent = editing === null ? originalText : 'Änderungen speichern';
  }
};

$('cancelEdit').onclick = reset;

function show(id) {
  const recipe = recipes.find(x => x.id === id);
  if (!recipe) return;
  $('detailContent').innerHTML = `
    ${recipe.photo ? `<img src="${recipe.photo}" alt="">` : ''}
    <h2>${escapeHTML(recipe.name)}</h2>
    <p class="muted">${escapeHTML(recipe.category)} · ${recipe.portions} Portionen${recipe.minutes ? ` · ${recipe.minutes} Min.` : ''}</p>
    <h3>Zutaten</h3><pre>${escapeHTML(recipe.ingredients)}</pre>
    <h3>Zubereitung</h3><pre>${escapeHTML(recipe.instructions)}</pre>
    <div class="actions">
      <button class="secondary" id="editRecipe">Bearbeiten</button>
      <button class="secondary" id="deleteRecipe">Löschen</button>
    </div>`;
  $('detailDialog').showModal();
  $('editRecipe').onclick = () => {
    editing = recipe.id;
    $('name').value = recipe.name;
    $('category').value = recipe.category;
    $('portions').value = recipe.portions;
    $('minutes').value = recipe.minutes;
    $('ingredients').value = recipe.ingredients;
    $('instructions').value = recipe.instructions;
    $('formTitle').textContent = 'Rezept bearbeiten';
    $('saveBtn').textContent = 'Änderungen speichern';
    $('cancelEdit').hidden = false;
    $('detailDialog').close();
    document.querySelector('.panel').scrollIntoView({ behavior: 'smooth' });
  };
  $('deleteRecipe').onclick = async () => {
    if (confirm('Dieses Rezept wirklich löschen?')) {
      try {
        await remove(id);
        $('detailDialog').close();
        await refresh();
      } catch (error) {
        alert('Löschen fehlgeschlagen: ' + error.message);
      }
    }
  };
}

$('closeDialog').onclick = () => $('detailDialog').close();
$('search').oninput = render;

document.querySelectorAll('[data-filter]').forEach(button => {
  button.onclick = () => {
    filter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(item => item.classList.toggle('active', item === button));
    render();
  };
});

$('exportBtn').onclick = () => {
  const blob = new Blob([JSON.stringify({ app: 'Hackis Kochbuch', version: 1, recipes }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'hackis-kochbuch-backup.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

$('importFile').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.recipes)) throw new Error('Die Sicherungsdatei enthält keine Rezeptliste.');
    for (const recipe of data.recipes) {
      if (!recipe.id) recipe.id = Date.now() + Math.random();
      await put(recipe);
    }
    await refresh();
    alert('Backup erfolgreich importiert.');
  } catch (error) {
    alert('Die Datei konnte nicht importiert werden: ' + error.message);
  }
  event.target.value = '';
};

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Service Worker:', error));
  });
}

refresh().catch(error => {
  console.error('Hackis Kochbuch – Startfehler:', error);
  $('recipeList').innerHTML = `<div class="empty"><h2>Speicher nicht erreichbar</h2><p>${escapeHTML(error.message)}</p><p>Bitte öffne das Kochbuch in Samsung Internet und lade die Seite neu.</p></div>`;
});
