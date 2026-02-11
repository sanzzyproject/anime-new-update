const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());

// Gunakan User-Agent seperti browser asli agar tidak diblokir
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache'
};

const BASE_URL = 'https://samehadaku.how'; // Pastikan domain ini yang aktif

// --- FUNGSI SCRAPER (SUDAH DIBERSIHKAN DARI PROXY) ---

async function animeterbaru(page = 1) {
  try {
    const url = `${BASE_URL}/anime-terbaru/page/${page}/`;
    const res = await axios.get(url, { headers });
    const $ = cheerio.load(res.data);
    const data = [];
    
    $('.post-show ul li').each((_, e) => {
      const a = $(e).find('.dtla h2 a');
      data.push({
        title: a.text().trim(),
        url: a.attr('href').replace(BASE_URL, ''), // Simpan path relatif saja
        image: $(e).find('.thumb img').attr('src'),
        episode: $(e).find('.dtla span:contains("Episode")').text().replace('Episode', '').trim(),
      });
    });
    return data;
  } catch (err) {
    console.error(`Error in animeterbaru: ${err.message}`);
    throw err;
  }
}

async function search(query) {
  try {
    const url = `${BASE_URL}/?s=${encodeURIComponent(query)}`;
    const res = await axios.get(url, { headers });
    const $ = cheerio.load(res.data);
    const data = [];

    $('.animpost').each((_, e) => {
      data.push({
        title: $(e).find('.data .title h2').text().trim(),
        image: $(e).find('.content-thumb img').attr('src'),
        type: $(e).find('.type').text().trim(),
        score: $(e).find('.score').text().trim(),
        url: $(e).find('a').attr('href').replace(BASE_URL, '')
      });
    });
    return data;
  } catch (err) {
    console.error(`Error in search: ${err.message}`);
    throw err;
  }
}

async function detail(link) {
  try {
    // Tangani jika link masuk sudah full URL atau path
    const targetUrl = link.startsWith('http') ? link : `${BASE_URL}${link}`;
    const res = await axios.get(targetUrl, { headers });
    const $ = cheerio.load(res.data);

    const episodes = [];
    $('.lstepsiode ul li').each((_, e) => {
      episodes.push({
        title: $(e).find('.epsleft .lchx a').text().trim(),
        url: $(e).find('.epsleft .lchx a').attr('href').replace(BASE_URL, ''),
        date: $(e).find('.epsleft .date').text().trim()
      });
    });

    const info = {};
    $('.anim-senct .right-senc .spe span').each((_, e) => {
      const t = $(e).text();
      if (t.includes(':')) {
        const [k, v] = t.split(':');
        info[k.trim().toLowerCase().replace(/\s+/g, '_')] = v.trim();
      }
    });

    // Ambil genres
    const genres = [];
    $('.genre-info a').each((_, e) => genres.push($(e).text().trim()));

    return {
      title: $('h1.entry-title').text().replace('Nonton Anime', '').trim() || $('title').text().replace(' - Samehadaku', '').trim(),
      image: $('.thumb img').attr('src') || $('meta[property="og:image"]').attr('content'),
      description: $('.entry-content').text().trim() || $('meta[name="description"]').attr('content'),
      genres,
      episodes,
      info
    };
  } catch (err) {
    console.error(`Error in detail: ${err.message}`);
    throw err;
  }
}

async function download(link) {
  try {
    const targetUrl = link.startsWith('http') ? link : `${BASE_URL}${link}`;
    const res = await axios.get(targetUrl, { headers });
    
    // Ambil cookies untuk request selanjutnya (penting untuk bypass proteksi sederhana)
    const cookies = res.headers['set-cookie']?.map(v => v.split(';')[0]).join('; ') || '';
    
    const $ = cheerio.load(res.data);
    const data = [];
    const serverPromises = [];

    // Loop server dan kumpulkan Promise
    $('div#server > ul > li').each((_, li) => {
      const div = $(li).find('div');
      const post = div.attr('data-post');
      const nume = div.attr('data-nume');
      const type = div.attr('data-type');
      const name = $(li).find('span').text().trim();

      if (post && nume && type) {
        const body = new URLSearchParams({ action: 'player_ajax', post, nume, type }).toString();
        
        // Push request ke array promise agar bisa jalan paralel (lebih cepat)
        const req = axios.post(`${BASE_URL}/wp-admin/admin-ajax.php`, body, {
          headers: {
            ...headers,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': cookies,
            'Referer': targetUrl,
            'Origin': BASE_URL,
            'X-Requested-With': 'XMLHttpRequest'
          }
        }).then(r => {
            const $$ = cheerio.load(r.data);
            const iframe = $$('iframe').attr('src');
            if (iframe) data.push({ server: name, url: iframe });
        }).catch(e => console.log(`Skipping server ${name}: ${e.message}`));

        serverPromises.push(req);
      }
    });

    // Tunggu semua request server selesai
    await Promise.all(serverPromises);

    return {
      title: $('h1.entry-title').text().trim(),
      streams: data
    };
  } catch (err) {
    console.error(`Error in download: ${err.message}`);
    throw err;
  }
}

// --- ROUTES API ---

app.get('/api/latest', async (req, res) => {
  try {
    const data = await animeterbaru(req.query.page || 1);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/search', async (req, res) => {
  try {
    const data = await search(req.query.q);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/detail', async (req, res) => {
  try {
    if (!req.query.url) return res.status(400).json({ error: 'URL parameter is required' });
    const data = await detail(req.query.url);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/watch', async (req, res) => {
  try {
    if (!req.query.url) return res.status(400).json({ error: 'URL parameter is required' });
    const data = await download(req.query.url);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/', (req, res) => {
    res.send('API is running. Created without external proxies.');
});

// Untuk Local Development
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;
