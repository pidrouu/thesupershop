import express from 'express';
import compression from 'compression';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(compression());
app.use(express.static('public', { maxAge: '1h', extensions: ['html'] }));

// Simple JSON helper
const jsonResponse = async (fetchResp) => {
  const body = await fetchResp.text();
  return new Response(body, {
    status: fetchResp.status,
    headers: { 'Content-Type': 'application/json' }
  });
};

// Proxy endpoints (keep your key server-side)
app.get('/api/shop', async (req, res) => {
  try {
    const r = await fetch('https://fortniteapi.io/v2/shop?lang=en', {
      headers: { Authorization: process.env.FORTNITE_API_KEY || '' }
    });
    const text = await r.text();
    res.status(r.status).set('Content-Type','application/json').send(text);
  } catch (e) {
    res.status(500).json({ error: 'Proxy failed', details: String(e) });
  }
});

app.get('/api/item', async (req, res) => {
  const { id, lang = 'en' } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing id' });
  try {
    const url = `https://fortniteapi.io/v2/items/get?id=${encodeURIComponent(id)}&lang=${encodeURIComponent(lang)}`;
    const r = await fetch(url, {
      headers: { Authorization: process.env.FORTNITE_API_KEY || '' }
    });
    const text = await r.text();
    res.status(r.status).set('Content-Type','application/json').send(text);
  } catch (e) {
    res.status(500).json({ error: 'Proxy failed', details: String(e) });
  }
});

app.listen(PORT, () => {
  console.log('FortShop running on port', PORT);
});
