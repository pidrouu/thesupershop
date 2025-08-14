// ---------- tiny DOM helpers ----------
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const by = (fn) => (a,b) => (fn(a) < fn(b) ? -1 : fn(a) > fn(b) ? 1 : 0);
const idize = s => (s || 'misc').toLowerCase().replace(/[^a-z0-9]+/g,'-');

// ---------- countdown ----------
function updateCountdown() {
  const now = new Date();
  const nextReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
  const diff = Math.max(0, nextReset - now);
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const el = $('#countdown');
  if (el) el.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
setInterval(updateCountdown, 1000); updateCountdown();

// ---------- modal ----------
const modal = {
  el: $('#modalBackdrop'),
  body: $('#modalBody'),
  title: $('#modalTitle'),
  closeBtn: $('#modalClose'),
  open({title, video, audio, poster}) {
    this.title.textContent = title || 'Preview';
    this.body.innerHTML = '';
    if (video) {
      const v = document.createElement('video');
      v.src = video; v.controls = true; v.autoplay = true; v.playsInline = true;
      this.body.appendChild(v);
    } else if (audio) {
      const img = document.createElement('img');
      img.src = poster || ''; img.alt = title || 'Preview'; img.loading = 'lazy';
      this.body.appendChild(img);
      const wrap = document.createElement('div'); wrap.className = 'modal-audio';
      const a = document.createElement('audio'); a.src = audio; a.controls = true; a.autoplay = true;
      wrap.appendChild(a); this.body.appendChild(wrap);
    } else {
      const img = document.createElement('img');
      img.src = poster || ''; img.alt = title || 'Preview'; img.loading = 'lazy';
      this.body.appendChild(img);
    }
    this.el.style.display = 'flex';
  },
  close(){ this.el.style.display = 'none'; this.body.innerHTML = ''; }
};
modal.closeBtn.addEventListener('click', ()=> modal.close());
modal.el.addEventListener('click', (e)=>{ if(e.target === modal.el) modal.close(); });

// ---------- data ----------
async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

async function getShop() {
  try {
    const live = await fetchJSON('/api/shop');
    if (live && (Array.isArray(live.shop) || Array.isArray(live.items))) return live;
    throw new Error('unexpected format');
  } catch {
    return fetchJSON('./data/fallback-shop.json');
  }
}

let mediaIndex = null;
async function loadMediaIndex() {
  if (!mediaIndex) {
    try { mediaIndex = await fetchJSON('./data/item-media.min.json'); }
    catch { mediaIndex = {}; }
  }
  return mediaIndex;
}

async function getItemDetails(id) {
  try { return await fetchJSON(`/api/item?id=${encodeURIComponent(id)}`); }
  catch { return null; }
}

// ---------- shape normalizers ----------
function pickPoster(it) {
  // displayAssets can be array or object; images can exist too
  const da = it.displayAssets;
  if (Array.isArray(da) && da.length) {
    const x = da[0] || {};
    return x.full_background || x.background || x.url || x.icon || '';
  }
  if (da && typeof da === 'object') {
    return da.full_background || da.background || da.url || da.icon || '';
  }
  const im = it.images || it.displayImage || {};
  return im.full_background || im.background || im.icon || im.featured || it.full_background || it.icon || '';
}

function rarityText(r) {
  if (!r) return '';
  if (typeof r === 'string') return r;
  // API often returns { id, name }
  return r.name || r.id || '';
}

function mainTypeText(t) {
  if (!t) return '';
  if (typeof t === 'string') return t;
  return t.value || t.name || '';
}

function priceValue(it) {
  const p = it.price || {};
  return (p.finalPrice ?? p.regularPrice ?? it.vbucks ?? it.finalPrice ?? it.regularPrice ?? '');
}

function sectionNameOf(it) {
  const s = it.section;
  return (s && (s.name || s.displayName)) || s || 'Misc';
}

function displayNameOf(it) {
  return it.displayName || it.display_name || it.name || (it.devName ? String(it.devName).replace(/^.*:\s*/, '') : 'Item');
}

function rarityClass(r) {
  const name = rarityText(r);
  const map = {
    'Common':'rarity-common','Uncommon':'rarity-uncommon','Rare':'rarity-rare',
    'Epic':'rarity-epic','Legendary':'rarity-legendary','Marvel':'rarity-marvel',
    'Icon':'rarity-icon','DC':'rarity-dc'
  };
  return map[name] || 'rarity-common';
}

// ---------- UI ----------
function card({item, poster, onClick}) {
  const div = document.createElement('div');
  div.className = 'item-card';
  div.innerHTML = `
    <div class="item-media">
      <img class="item-image" src="${poster || ''}" alt="${item.displayName || 'Item'}" loading="lazy"/>
      <span class="item-rarity ${rarityClass(item.rarity)}">${rarityText(item.rarity)}</span>
    </div>
    <div class="item-info">
      <div class="item-name">${item.displayName || ''}</div>
      <div class="item-type">${String(mainTypeText(item.mainType) || '').replace(/_/g,' ')}</div>
      <div class="item-price"><span class="vbucks-icon">V</span><span>${item.price ?? ''}</span></div>
    </div>`;
  div.addEventListener('click', onClick);
  return div;
}

async function resolveMedia({title, ids, poster}) {
  const idx = await loadMediaIndex();
  for (const id of ids) {
    const m = idx[id];
    if (m && (m.video || m.audio)) {
      return { title, video: m.video || '', audio: m.audio || '', poster: m.poster || poster };
    }
  }
  for (const id of ids) {
    const d = await getItemDetails(id);
    if (d) {
      const video = d.video || (d.videos && (d.videos[0]?.url || d.videos[0])) || '';
      const audio = d.audio || '';
      const images = d.images || {};
      const fallbackPoster = images.full_background || images.icon || poster || '';
      if (video || audio) return { title, video, audio, poster: fallbackPoster };
    }
  }
  return { title, video: '', audio: '', poster };
}

function render(shopData) {
  const sectionsRoot = $('#sections');
  const nav = $('#categoryNav');
  sectionsRoot.innerHTML = '';
  nav.innerHTML = '';

  const raw = shopData.shop || shopData.items || [];
  const groups = new Map();

  for (const it of raw) {
    const sectionName = sectionNameOf(it);
    if (!groups.has(sectionName)) groups.set(sectionName, []);
    const poster = pickPoster(it);
    const ids = it.grantedIds
      || (Array.isArray(it.granted) ? it.granted.map(g=>g.id).filter(Boolean) : [])
      || (Array.isArray(it.grants) ? it.grants.map(g=>g.id).filter(Boolean) : []);
    const normalized = {
      displayName: displayNameOf(it),
      mainType: mainTypeText(it.mainType || it.type),
      price: priceValue(it),
      rarity: rarityText(it.rarity)
    };
    groups.get(sectionName).push({ item: normalized, poster, ids });
  }

  const cats = [...groups.keys()].sort(by(v=>v.toLowerCase()));
  cats.forEach((name, i) => {
    const chip = document.createElement('button');
    chip.className = 'category-chip' + (i===0 ? ' active' : '');
    chip.textContent = name;
    chip.addEventListener('click', () => {
      $$('.category-chip', nav).forEach(c=>c.classList.remove('active'));
      chip.classList.add('active');
      const anchor = document.getElementById('section-' + idize(name));
      if (anchor) anchor.scrollIntoView({ behavior:'smooth', block:'start' });
    });
    nav.appendChild(chip);
  });

  for (const name of cats) {
    const sec = document.createElement('section');
    sec.id = 'section-' + idize(name);
    sec.innerHTML = `<h2 class="section-title">${name}</h2><div class="shop-grid"></div>`;
    const grid = $('.shop-grid', sec);
    for (const { item, poster, ids } of groups.get(name)) {
      const el = card({
        item, poster,
        onClick: async () => {
          const media = await resolveMedia({ title: item.displayName, ids, poster });
          modal.open(media);
        }
      });
      grid.appendChild(el);
    }
    sectionsRoot.appendChild(sec);
  }
}

getShop().then(render).catch(err => {
  console.error(err);
  $('#sections').innerHTML = `<div style="opacity:.8">Failed to load shop. Try again in a bit.</div>`;
});
