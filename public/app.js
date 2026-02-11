const API_BASE = '/api'; 

const HOME_SECTIONS = [
    { title: "Sedang Hangat 🔥", mode: "latest" },
    { title: "Isekai & Fantasy 🌀", queries: ["isekai", "reincarnation", "world", "maou"] },
    { title: "Action Hits ⚔️", queries: ["kimetsu", "jujutsu", "piece", "bleach", "hunter", "shingeki"] },
    { title: "Romance & Drama ❤️", queries: ["love", "kanojo", "romance", "heroine", "uso"] },
    { title: "School Life 🏫", queries: ["school", "gakuen", "classroom", "high school"] },
    { title: "Magic & Adventure ✨", queries: ["magic", "adventure", "dragon", "dungeon"] },
    { title: "Comedy & Chill 😂", queries: ["comedy", "slice of life", "bocchi", "spy"] }
];

const show = (id) => document.getElementById(id).classList.remove('hidden');
const hide = (id) => document.getElementById(id).classList.add('hidden');
const loader = (state) => state ? show('loading') : hide('loading');

async function loadLatest() {
    loader(true);
    hide('detail-view');
    hide('watch-view');
    show('home-view');
    
    const homeContainer = document.getElementById('home-view');
    homeContainer.innerHTML = ''; 

    try {
        for (const section of HOME_SECTIONS) {
            let combinedData = [];

            if (section.mode === 'latest') {
                try {
                    const res = await fetch(`${API_BASE}/latest`);
                    combinedData = await res.json();
                } catch (e) { console.error("Gagal load latest", e); }
            } else {
                const promises = section.queries.map(q => 
                    fetch(`${API_BASE}/search?q=${encodeURIComponent(q)}`)
                        .then(res => res.json())
                        .catch(() => [])
                );

                const results = await Promise.all(promises);
                
                results.forEach(list => {
                    if(Array.isArray(list)) combinedData = [...combinedData, ...list];
                });

                combinedData = removeDuplicates(combinedData, 'url');
            }

            if (combinedData && combinedData.length > 0) {
                if (combinedData.length < 6) {
                    combinedData = [...combinedData, ...combinedData, ...combinedData]; 
                }
                renderSection(section.title, combinedData.slice(0, 15), homeContainer);
            }
        }
    } catch (err) {
        console.error(err);
    } finally {
        loader(false);
    }
}

function removeDuplicates(array, key) {
    return [ ...new Map(array.map(item => [item[key], item])).values() ];
}

function renderSection(title, data, container) {
    const sectionDiv = document.createElement('div');
    sectionDiv.className = 'category-section';

    const searchKeyword = title.split(' ')[0];

    const headerHtml = `
        <div class="header-flex">
            <div class="section-header">
                <div class="bar-accent"></div>
                <h2>${title}</h2>
            </div>
            <a href="#" class="more-link" onclick="handleSearch('${searchKeyword}')">Lainnya</a>
        </div>
    `;

    const cardsHtml = data.map(anime => {
        const eps = anime.episode || anime.score || '?'; 
        const displayTitle = anime.title.length > 35 ? anime.title.substring(0, 35) + '...' : anime.title;
        
        return `
        <div class="scroll-card" onclick="loadDetail('${anime.url}')">
            <div class="scroll-card-img">
                <img src="${anime.image}" alt="${anime.title}" loading="lazy">
                <div class="ep-badge">Ep ${eps}</div>
            </div>
            <div class="scroll-card-title">${displayTitle}</div>
        </div>
        `;
    }).join('');

    sectionDiv.innerHTML = headerHtml + `<div class="horizontal-scroll">${cardsHtml}</div>`;
    container.appendChild(sectionDiv);
}

async function handleSearch(manualQuery = null) {
    const searchInput = document.getElementById('searchInput');
    const query = manualQuery || searchInput.value;
    
    if (!query) return loadLatest();
    
    if(manualQuery) searchInput.value = manualQuery;

    loader(true);
    try {
        const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        
        hide('detail-view');
        hide('watch-view');
        show('home-view');

        const homeContainer = document.getElementById('home-view');
        homeContainer.innerHTML = ''; 

        const resultSection = document.createElement('div');
        resultSection.className = 'search-results-container';
        
        resultSection.innerHTML = `
            <div class="section-header mt-large">
                <div class="bar-accent"></div>
                <h2>Hasil Pencarian: "${query}"</h2>
            </div>
            <div class="anime-grid">
                ${data.map(anime => `
                    <div class="scroll-card" onclick="loadDetail('${anime.url}')" style="min-width: auto; max-width: none;">
                        <div class="scroll-card-img">
                            <img src="${anime.image}" alt="${anime.title}" loading="lazy">
                            <div class="ep-badge">Ep ${anime.score || '?'}</div>
                        </div>
                        <h3 class="scroll-card-title">${anime.title}</h3>
                    </div>
                `).join('')}
            </div>
        `;
        
        homeContainer.appendChild(resultSection);

    } catch (err) {
        console.error(err);
    } finally {
        loader(false);
    }
}

// --- DETAIL ANIME (Disesuaikan dengan Layout Baru) ---
async function loadDetail(url) {
    loader(true);
    try {
        const res = await fetch(`${API_BASE}/detail?url=${encodeURIComponent(url)}`);
        const data = await res.json();
        
        hide('home-view');
        hide('watch-view');
        show('detail-view');

        const info = data.info || {};
        const status = info.status || 'Ongoing';
        const score = info.skor || info.score || '0';
        const type = info.tipe || info.type || 'TV';
        const studio = info.studio || '-';
        const totalEps = info.total_episode || info.episode || '?';
        const duration = info.durasi || info.duration || '0 Menit';
        
        const musim = info.musim || info.season || '';
        const rilis = info.dirilis || info.released || '';
        const seasonInfo = `${musim} ${rilis}`.trim() || 'Unknown Date';

        const genreText = info.genre || info.genres || '';
        const genres = genreText ? genreText.split(',').map(g => g.trim()) : ['Anime'];

        const isEpsExist = data.episodes && data.episodes.length > 0;
        const newestEpUrl = isEpsExist ? data.episodes[0].url : '';
        const oldestEpUrl = isEpsExist ? data.episodes[data.episodes.length - 1].url : '';
        
        // Ambil jumlah episode asli dari panjang array atau judul episode terbaru
        let newestEpNum = '?';
        let totalEpCount = isEpsExist ? data.episodes.length : 0;
        
        if (isEpsExist) {
            const match = data.episodes[0].title.match(/\d+(\.\d+)?/);
            newestEpNum = match ? match[0] : totalEpCount;
        }

        const playIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;

        document.getElementById('anime-info').innerHTML = `
            <div class="detail-breadcrumb">Beranda / ${data.title}</div>
            <h1 class="detail-title">${data.title}</h1>
            <div class="detail-subtitle">${info.japanese || data.title}</div>

            <div class="detail-main-layout">
                <div class="detail-poster">
                    <img src="${data.image}" alt="${data.title}">
                </div>
                
                <div class="detail-info-col">
                    <div class="detail-badges">
                        <span class="badge status">${status.replace(' ', '_')}</span>
                        <span class="badge score">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="#fbbf24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> 
                            ${score}
                        </span>
                        <span class="badge type">${type}</span>
                    </div>

                    <div class="detail-genres">
                        ${genres.map(g => `<span class="genre-tag">${g}</span>`).join('')}
                    </div>

                    <div class="detail-season">${seasonInfo.toUpperCase()}</div>

                    <p class="detail-synopsis">${data.description || 'Tidak ada deskripsi tersedia untuk anime ini.'}</p>

                    <div class="detail-actions">
                        <button class="btn-action" onclick="${oldestEpUrl ? `loadVideo('${oldestEpUrl}')` : `alert('Belum ada episode')`}">
                            ${playIcon} Nonton
                        </button>
                        <button class="btn-action" onclick="${newestEpUrl ? `loadVideo('${newestEpUrl}')` : `alert('Belum ada episode')`}">
                            ${playIcon} Terbaru (${newestEpNum})
                        </button>
                    </div>
                </div>
            </div>

            <div class="metadata-grid">
                <div class="meta-item">
                    <span class="meta-label">STUDIO</span>
                    <span class="meta-pill">${studio.toUpperCase()}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">TOTAL EPS</span>
                    <span class="meta-value">${totalEps}</span>
                </div>
                <div class="meta-item" style="grid-column: span 2;">
                    <span class="meta-label">DURASI</span>
                    <span class="meta-value">${duration}</span>
                </div>
            </div>
        `;

        document.getElementById('episode-header-container').innerHTML = `
            <div class="ep-header-wrapper">
                <h2 class="ep-header-title">Daftar Episode</h2>
                ${isEpsExist ? `<div class="ep-range-badge">1 - ${totalEpCount}</div>` : ''}
            </div>
        `;

        const epGrid = document.getElementById('episode-grid');
        epGrid.innerHTML = data.episodes.map(ep => {
            let epNumMatch = ep.title.match(/(?:Episode|Ep)\s*(\d+(\.\d+)?)/i);
            let displayTitle = epNumMatch ? epNumMatch[1] : ep.title.replace(/Episode/i, '').trim();
            if(displayTitle.length > 6) displayTitle = 'Ep'; 

            return `<div class="ep-box" onclick="loadVideo('${ep.url}')">${displayTitle}</div>`;
        }).join('');

    } catch (err) {
        console.error(err);
    } finally {
        loader(false);
    }
}

async function loadVideo(url) {
    loader(true);
    try {
        const res = await fetch(`${API_BASE}/watch?url=${encodeURIComponent(url)}`);
        const data = await res.json();

        hide('detail-view');
        show('watch-view');

        document.getElementById('video-title').innerText = data.title;
        
        const player = document.getElementById('video-player');
        const serverContainer = document.getElementById('server-options');

        if (data.streams.length > 0) {
            player.src = data.streams[0].url;
            
            serverContainer.innerHTML = data.streams.map((stream, index) => `
                <button class="server-tag ${index === 0 ? 'active' : ''}" 
                     onclick="changeServer('${stream.url}', this)">
                     ${stream.server}
                </button>
            `).join('');
        } else {
            alert('Maaf, stream belum tersedia untuk episode ini.');
        }

    } catch (err) {
        console.error(err);
    } finally {
        loader(false);
    }
}

function changeServer(url, btn) {
    document.getElementById('video-player').src = url;
    document.querySelectorAll('.server-tag').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function goHome() { loadLatest(); }
function backToDetail() {
    hide('watch-view');
    show('detail-view');
    document.getElementById('video-player').src = ''; 
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
}

document.addEventListener('DOMContentLoaded', loadLatest);
document.getElementById('searchInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSearch();
});
