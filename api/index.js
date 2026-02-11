const express = require('express');
const cors = require('cors');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const app = express();
app.use(cors());

// Konfigurasi Browser untuk Vercel (PENTING!)
async function getBrowser() {
  // Cek apakah jalan di local atau server Vercel
  const isLocal = process.env.vercel_env === undefined;
  
  return await puppeteer.launch({
    args: isLocal ? puppeteer.defaultArgs() : chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: isLocal 
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' // GANTI INI kalau test di laptop (sesuaikan path chrome kamu)
      : await chromium.executablePath(),
    headless: chromium.headless,
    ignoreHTTPSErrors: true,
  });
}

const BASE_URL = 'https://samehadaku.how';

// --- FUNGSI UTAMA (Scraping pakai Browser) ---

async function scrapePage(url) {
  let browser = null;
  try {
    browser = await getBrowser();
    const page = await browser.newPage();
    
    // Set User Agent biar dikira PC beneran
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
    
    // Buka halaman & tunggu sampai konten muncul
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Ambil HTML-nya
    const content = await page.content();
    return cheerio.load(content);
  } catch (error) {
    console.error("Browser Error:", error);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

// --- ROUTES ---

app.get('/api/latest', async (req, res) => {
  try {
    const page = req.query.page || 1;
    const $ = await scrapePage(`${BASE_URL}/anime-terbaru/page/${page}/`);
    
    const data = [];
    $('.post-show ul li').each((_, e) => {
      const a = $(e).find('.dtla h2 a');
      data.push({
        title: a.text().trim(),
        url: a.attr('href')?.replace(BASE_URL, ''),
        image: $(e).find('.thumb img').attr('src'),
        episode: $(e).find('.dtla span:contains("Episode")').text().replace('Episode', '').trim(),
      });
    });
    
    // Cek kalau kosong, berarti masih keblokir atau selector ganti
    if (data.length === 0) {
        return res.status(503).json({ error: "Data kosong. Kemungkinan Cloudflare Challenge belum tembus.", debug: $('body').text().substring(0, 200) });
    }

    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/search', async (req, res) => {
  try {
    const $ = await scrapePage(`${BASE_URL}/?s=${encodeURIComponent(req.query.q)}`);
    const data = [];
    $('.animpost').each((_, e) => {
      data.push({
        title: $(e).find('.data .title h2').text().trim(),
        image: $(e).find('.content-thumb img').attr('src'),
        type: $(e).find('.type').text().trim(),
        score: $(e).find('.score').text().trim(),
        url: $(e).find('a').attr('href')?.replace(BASE_URL, '')
      });
    });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/detail', async (req, res) => {
  try {
    const targetUrl = req.query.url.startsWith('http') ? req.query.url : `${BASE_URL}${req.query.url}`;
    const $ = await scrapePage(targetUrl);

    const episodes = [];
    $('.lstepsiode ul li').each((_, e) => {
      episodes.push({
        title: $(e).find('.epsleft .lchx a').text().trim(),
        url: $(e).find('.epsleft .lchx a').attr('href')?.replace(BASE_URL, ''),
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

    res.json({
      title: $('h1.entry-title').text().replace('Nonton Anime', '').trim(),
      image: $('.thumb img').attr('src'),
      description: $('.entry-content').text().trim(),
      episodes,
      info
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// STREAMING: Ini paling susah, kita ambil iframe langsung
app.get('/api/watch', async (req, res) => {
  try {
    const targetUrl = req.query.url.startsWith('http') ? req.query.url : `${BASE_URL}${req.query.url}`;
    const browser = await getBrowser();
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
    
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    // Teknik ambil data dari Server List Samehadaku
    // Kita inject script ke halaman untuk klik server dan ambil iframe
    const streams = await page.evaluate(async () => {
        const results = [];
        const servers = document.querySelectorAll('div#server > ul > li');
        
        // Cuma ambil 3 server pertama biar gak timeout (Vercel limit 10 detik)
        for (let i = 0; i < Math.min(servers.length, 3); i++) {
            const li = servers[i];
            const name = li.querySelector('span').innerText;
            const div = li.querySelector('div');
            
            // Simulasi klik
            div.click();
            // Tunggu sebentar ajax load
            await new Promise(r => setTimeout(r, 1000));
            
            const iframe = document.querySelector('#player_embed iframe');
            if (iframe) {
                results.push({ server: name, url: iframe.src });
            }
        }
        return results;
    });

    await browser.close();
    res.json({ streams });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/', (req, res) => res.send('API Running with Puppeteer'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
