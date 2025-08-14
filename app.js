
// Minimal helpers
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const by = (fn) => (a,b) => fn(a) < fn(b) ? -1 : fn(a) > fn(b) ? 1 : 0;
const sanitizeId = s => (s || 'Unknown').toLowerCase().replace(/[^a-z0-9]+/g,'-');

// Countdown (visual)
function updateCountdown() {
  const now = new Date();
  const nextReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
  const diff = Math.max(0, nextReset - now);
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const countdown = $('#countdown');
  if (countdown) countdown.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
setInterval(updateCountdown, 1000); updateCountdown();

// Modal
const modal = {
  backdrop: $('#modalBackdrop'),
  body: $('#modalBody'),
  title: $('#modalTitle'),
  closeBtn: $('#modalClose'),
  open({title, video, audio, poster}) {
    this.title.textContent = title || 'Preview';
    this.body.innerHTML = '';
    if (video) {
      const v = document.createElement('video');
      v.src = video; v.controls = true; v.autoplay = true; v.playsInline = true; v.muted = false;
      this.body.appendChild(v);
    } else if (audio) {
      const img = document.createElement('img');
      img.src = poster || ''; img.alt = title || 'Poster';
      this.body.appendChild(img);
      const wrap = document.createElement('div');
      wrap.className = 'modal-audio';
      const a = document.createElement('audio');
      a.src = audio; a.controls = true; a.autoplay = true;
      wrap.appendChild(a);
      this.body.appendChild(wrap);
    } else {
      const img = document.createElement('img');
      img.src = poster || ''; img.alt = title || 'Preview';
      this.body.appendChild(img);
    }
    this.backdrop.style.display = 'flex';
  },
  close() { this.backdrop.style.display = 'none'; this.body.innerHTML=''; }
};
modal.closeBtn.addEventListener('click', ()=> modal.close());
modal.backdrop.addEventListener('click', (e)=> { if(e.target === modal.backdrop) modal.close(); });

// Data sources
async function fetchJSON(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}

async function getShop() {
  try {
    // Your serverless proxy (protects your key)
    const live = await fetchJSON('/api/shop');
    if (live && (live.shop || live.result)) {
      // Normalize: /v2/shop returns {result, shop: [...]}
      return live;
    }
    throw new Error('Unexpected live format');
  } catch (e) {
    // Local fallback (trimmed)
    return await fetchJSON('./data/fallback-shop.json');
  }
}

let itemMediaIndex = null;
async function loadMediaIndex() {
  if (!itemMediaIndex) {
    try {
      itemMediaIndex = await fetchJSON('./data/item-media.min.json');
    } catch {
      itemMediaIndex = {};
    }
  }
  return itemMediaIndex;
}

// Fetch item details on-demand (via proxy)
async function fetchItemDetails(id) {
  try {
    const data = await fetchJSON(`/api/item?id=${encodeURIComponent(id)}`);
    return data;
  } catch (e) {
    return null;
  }
}

// Build UI
function rarityClass(r) {
  if (!r) return 'rarity-common';
  const map = {
    'Common':'rarity-common', 'Uncommon':'rarity-uncommon', 'Rare':'rarity-rare',
    'Epic':'rarity-epic', 'Legendary':'rarity-legendary', 'Marvel':'rarity-marvel', 'Icon':'rarity-icon', 'DC':'rarity-dc'
  };
  return map[r] || 'rarity-common';
}

function card({item, poster, onClick}) {
  const div = document.createElement('div');
  div.className = 'item-card';
  div.innerHTML = `
    <div class="item-media">
      <img class="item-image" src="${poster || ''}" alt="${item.displayName || 'Item'}">
      <span class="item-rarity ${rarityClass(item.rarity)}">${item.rarity || ''}</span>
    </div>
    <div class="item-info">
      <div class="item-name">${item.displayName || ''}</div>
      <div class="item-type">${(item.mainType || '').replace(/_/g,' ')}</div>
      <div class="item-price"><span class="vbucks-icon">V</span><span>${item.price ?? ''}</span></div>
    </div>`;
  div.addEventListener('click', onClick);
  return div;
}

async function resolveMedia({title, ids, poster}) {
  // Try local media index first for instant preview
  const mediaIndex = await loadMediaIndex();
  for (const id of ids) {
    const m = mediaIndex[id];
    if (m && (m.video || m.audio)) {
      return {title, video: m.video || '', audio: m.audio || '', poster: m.poster || poster};
    }
  }
  // Else, query details endpoint (serverless proxy)
  for (const id of ids) {
    const details = await fetchItemDetails(id);
    if (details) {
      // Try a few possible shapes
      const video = details.video || (details.videos && (details.videos[0]?.url || details.videos[0])) || '';
      const audio = details.audio || '';
      const images = details.images || {};
      const fallbackPoster = images.full_background || images.icon || poster || '';
      if (video || audio) return {title, video, audio, poster: fallbackPoster};
    }
  }
  // Fallback to poster only
  return {title, video: '', audio: '', poster};
}

function render(shopData) {
  const sectionsRoot = $('#sections');
  const nav = $('#categoryNav');
  sectionsRoot.innerHTML = '';
  nav.innerHTML = '';

  // Normalize items array
  const items = shopData.items || shopData.shop || [];
  // Group by section name
  const groups = new Map();
  for (const it of items) {
    const section = (it.section && it.section.name) ? it.section.name : (it.section || 'Misc');
    const key = section || 'Misc';
    if (!groups.has(key)) groups.set(key, []);
    // poster preference: full_background then url
    const poster = (it.displayAssets && (it.displayAssets.full_background || it.displayAssets.url)) || '';
    // granted ids used for lookup
    const ids = it.grantedIds || (it.granted ? it.granted.map(g=>g.id).filter(Boolean) : []);
    groups.get(key).push({item: it, poster, ids});
  }

  // Build category chips (sorted alpha)
  const catNames = [...groups.keys()].sort(by(v=>v.toLowerCase()));
  catNames.forEach((name, i)=>{
    const chip = document.createElement('button');
    chip.className = 'category-chip' + (i===0 ? ' active' : '');
    chip.textContent = name;
    chip.addEventListener('click', ()=>{
      $$('.category-chip', nav).forEach(c=>c.classList.remove('active'));
      chip.classList.add('active');
      const anchor = $('#section-' + sanitizeId(name));
      if (anchor) anchor.scrollIntoView({behavior:'smooth', block:'start'});
    });
    nav.appendChild(chip);
  });

  // Render sections
  for (const name of catNames) {
    const sec = document.createElement('section');
    sec.id = 'section-' + sanitizeId(name);
    sec.innerHTML = `<h2 class="section-title">${name}</h2><div class="shop-grid"></div>`;
    const grid = $('.shop-grid', sec);
    for (const {item, poster, ids} of groups.get(name)) {
      const el = card({item, poster, onClick: async ()=> {
        const media = await resolveMedia({title: item.displayName, ids, poster});
        modal.open(media);
      }});
      grid.appendChild(el);
    }
    sectionsRoot.appendChild(sec);
  }
}

// Boot
getShop().then(render).catch(err=>{
  console.error(err);
});

