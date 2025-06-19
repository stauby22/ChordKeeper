// Application State
const app = {
    songs: [],
    currentSong: null,
    currentKey: 'C',
    transpositionOffset: 0,
    editingId: null
};

// DOM Elements
const elements = {
    songGrid: document.getElementById('song-grid'),
    songDisplay: document.getElementById('song-display'),
    searchInput: document.getElementById('search-input'),
    categoryList: document.getElementById('category-list'),
    keyFilter: document.getElementById('key-filter'),
    songModal: document.getElementById('song-modal'),
    importModal: document.getElementById('import-modal'),
    toast: document.getElementById('toast'),
    songContent: document.getElementById('song-content'),
    currentKeyDisplay: document.getElementById('current-key'),
    displayTitle: document.getElementById('display-title'),
    displayArtist: document.getElementById('display-artist')
};

// Transposition Engine
class TranspositionEngine {
    constructor() {
        this.chromatic = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        this.enharmonicFlats = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    }

    transposeChord(chord, semitones, preferFlats = false) {
        const match = chord.match(/^([A-G][b#]?)(.*)$/);
        if (!match) return chord;
        const [, root, quality] = match;
        const transposedRoot = this.transposeNote(root, semitones, preferFlats);
        return transposedRoot + quality;
    }

    transposeNote(note, semitones, preferFlats = false) {
        let noteBase = note.charAt(0);
        let accidental = note.slice(1);
        let index = this.chromatic.findIndex(n => n.charAt(0) === noteBase);
        if (index === -1) return note;
        if (accidental === '#') index++;
        if (accidental === 'b') index--;
        index = (index + semitones + 120) % 12;
        return preferFlats ? this.enharmonicFlats[index] : this.chromatic[index];
    }

    detectPreferFlats(key) {
        const flatKeys = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'];
        return flatKeys.includes(key);
    }
}

const transposer = new TranspositionEngine();

// API Helper
async function api(endpoint, options = {}) {
    try {
        const response = await fetch(`/api${endpoint}`, {
            headers: { 'Content-Type': 'application/json', ...options.headers },
            ...options
        });
        if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
        return await response.json();
    } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
        throw err;
    }
}

// Song Management
async function loadSongs() {
    const data = await api('/songs');
    app.songs = data.songs;
    renderSongGrid();
    updateCategoryCounts();
}

async function saveSong(songData) {
    const endpoint = app.editingId ? `/songs/${app.editingId}` : '/songs';
    const method = app.editingId ? 'PUT' : 'POST';
    await api(endpoint, { method, body: JSON.stringify(songData) });
    showToast(app.editingId ? 'Song updated!' : 'Song added!', 'success');
    closeModal();
    loadSongs();
}

async function loadSong(id) {
    app.currentSong = await api(`/songs/${id}`);
    app.currentKey = app.currentSong.key_signature || 'C';
    app.transpositionOffset = 0;
    displaySong();
}

// Rendering
function renderSongGrid() {
    const filtered = filterSongs();
    if (filtered.length === 0) {
        elements.songGrid.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🎵</div>
                <div class="empty-title">No songs found</div>
                <p>Add your first song to get started!</p>
            </div>
        `;
        return;
    }

    elements.songGrid.innerHTML = filtered.map(song => `
        <div class="song-card" data-id="${song.id}">
            <h3 class="song-title">${song.title}</h3>
            <p class="song-artist">${song.artist || 'Unknown Artist'}</p>
            <div class="song-meta">
                <span class="key-badge">${song.key_signature || 'C'}</span>
                ${song.tempo ? `<span>♩ = ${song.tempo}</span>` : ''}
            </div>
        </div>
    `).join('');
}

function displaySong() {
    if (!app.currentSong) return;
    elements.displayTitle.textContent = app.currentSong.title;
    elements.displayArtist.textContent = app.currentSong.artist || 'Unknown Artist';
    elements.currentKeyDisplay.textContent = app.currentKey;
    renderChordChart(app.currentSong.lyrics);
    elements.songGrid.style.display = 'none';
    elements.songDisplay.style.display = 'block';
}

function renderChordChart(lyrics) {
    const lines = lyrics.split('\n');
    const preferFlats = transposer.detectPreferFlats(app.currentKey);
    const html = lines.map(line => {
        let processedLine = '';
        let lastIndex = 0;
        const chordRegex = /\[([^\]]+)\]/g;
        let match;
        while ((match = chordRegex.exec(line)) !== null) {
            if (match.index > lastIndex) {
                processedLine += `<span class="lyrics">${line.substring(lastIndex, match.index)}</span>`;
            }
            const originalChord = match[1];
            const transposedChord = app.transpositionOffset === 0
                ? originalChord
                : transposer.transposeChord(originalChord, app.transpositionOffset, preferFlats);
            processedLine += `<span class="chord" style="left: ${match.index - lastIndex}ch">${transposedChord}</span>`;
            lastIndex = match.index + match[0].length;
        }
        if (lastIndex < line.length) {
            processedLine += `<span class="lyrics">${line.substring(lastIndex)}</span>`;
        }
        return `<div class="song-line">${processedLine || '&nbsp;'}</div>`;
    }).join('');
    elements.songContent.innerHTML = html;
}

function filterSongs() {
    const searchTerm = elements.searchInput.value.toLowerCase();
    const selectedCategory = document.querySelector('.category-item.active')?.dataset.category || 'all';
    const selectedKey = elements.keyFilter.value;
    return app.songs.filter(song => {
        const matchesSearch = !searchTerm ||
            song.title.toLowerCase().includes(searchTerm) ||
            (song.artist && song.artist.toLowerCase().includes(searchTerm)) ||
            (song.lyrics && song.lyrics.toLowerCase().includes(searchTerm));
        const matchesCategory = selectedCategory === 'all' || song.category === selectedCategory;
        const matchesKey = !selectedKey || song.key_signature === selectedKey;
        return matchesSearch && matchesCategory && matchesKey;
    });
}

function updateCategoryCounts() {
    const counts = {
        all: app.songs.length,
        favorites: app.songs.filter(s => s.category === 'favorites').length,
        karaoke: app.songs.filter(s => s.category === 'karaoke').length,
        practice: app.songs.filter(s => s.category === 'practice').length
    };
    document.querySelectorAll('.category-item').forEach(item => {
        const category = item.dataset.category;
        const countEl = item.querySelector('.category-count');
        if (countEl) countEl.textContent = counts[category] || 0;
    });
}

function showToast(message, type = 'success') {
    elements.toast.textContent = message;
    elements.toast.className = `toast show ${type}`;
    setTimeout(() => elements.toast.classList.remove('show'), 3000);
}

function openModal() {
    elements.songModal.classList.add('active');
    document.getElementById('modal-title').textContent = app.editingId ? 'Edit Song' : 'Add New Song';
}

function closeModal() {
    elements.songModal.classList.remove('active');
    document.getElementById('song-form').reset();
    app.editingId = null;
}

// Event Listeners
document.getElementById('add-song-btn').addEventListener('click', openModal);
document.getElementById('import-btn').addEventListener('click', () => elements.importModal.classList.add('active'));
document.getElementById('close-modal').addEventListener('click', closeModal);
document.getElementById('cancel-form').addEventListener('click', closeModal);
document.getElementById('close-import-modal').addEventListener('click', () => elements.importModal.classList.remove('active'));
document.getElementById('cancel-import').addEventListener('click', () => elements.importModal.classList.remove('active'));

document.getElementById('song-form').addEventListener('submit', async e => {
    e.preventDefault();
    const formData = {
        title: document.getElementById('song-title').value,
        artist: document.getElementById('song-artist').value,
        key_signature: document.getElementById('song-key').value,
        tempo: document.getElementById('song-tempo').value || null,
        category: document.getElementById('song-category').value,
        lyrics: document.getElementById('song-lyrics').value,
        notes: document.getElementById('song-notes').value,
        artist_id: 1
    };
    await saveSong(formData);
});

document.getElementById('import-form').addEventListener('submit', async e => {
    e.preventDefault();
    const text = document.getElementById('import-text').value;
    try {
        await api('/import/ultimate-guitar', { method: 'POST', body: JSON.stringify({ text }) });
        showToast('Song imported successfully!', 'success');
        elements.importModal.classList.remove('active');
        document.getElementById('import-form').reset();
        loadSongs();
    } catch {
        showToast('Import failed. Please check the format.', 'error');
    }
});

elements.songGrid.addEventListener('click', async e => {
    const card = e.target.closest('.song-card');
    if (card) {
        const id = card.dataset.id;
        await loadSong(id);
    }
});

document.getElementById('back-to-grid').addEventListener('click', () => {
    elements.songDisplay.style.display = 'none';
    elements.songGrid.style.display = 'grid';
    app.currentSong = null;
    app.transpositionOffset = 0;
});

document.getElementById('transpose-up').addEventListener('click', () => {
    app.transpositionOffset++;
    const preferFlats = transposer.detectPreferFlats(app.currentKey);
    app.currentKey = transposer.transposeNote(app.currentKey, 1, preferFlats);
    displaySong();
});

document.getElementById('transpose-down').addEventListener('click', () => {
    app.transpositionOffset--;
    const preferFlats = transposer.detectPreferFlats(app.currentKey);
    app.currentKey = transposer.transposeNote(app.currentKey, -1, preferFlats);
    displaySong();
});

document.getElementById('toggle-chords').addEventListener('click', () => {
    elements.songContent.classList.toggle('hide-chords');
});

document.getElementById('edit-song').addEventListener('click', () => {
    if (!app.currentSong) return;
    app.editingId = app.currentSong.id;
    document.getElementById('song-title').value = app.currentSong.title;
    document.getElementById('song-artist').value = app.currentSong.artist || '';
    document.getElementById('song-key').value = app.currentSong.key_signature || 'C';
    document.getElementById('song-tempo').value = app.currentSong.tempo || '';
    document.getElementById('song-category').value = app.currentSong.category || 'uncategorized';
    document.getElementById('song-lyrics').value = app.currentSong.lyrics;
    document.getElementById('song-notes').value = app.currentSong.notes || '';
    openModal();
});

elements.categoryList.addEventListener('click', e => {
    const item = e.target.closest('.category-item');
    if (item) {
        document.querySelectorAll('.category-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        renderSongGrid();
    }
});

let searchTimeout;
elements.searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(renderSongGrid, 300);
});

elements.keyFilter.addEventListener('change', renderSongGrid);

// Initialize
loadSongs();
