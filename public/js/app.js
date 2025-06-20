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
    // References updated to match home.html
    songGrid: document.getElementById('song-list'),
    songDisplay: document.getElementById('song-display'),
    searchInput: document.getElementById('search-input'),
    categoryFilter: document.getElementById('category-filter'),
    tagFilter: document.getElementById('tag-filter'),
    sortDropdown: document.getElementById('sort-dropdown'),
    modalBackdrop: document.getElementById('modal-backdrop'),
    songModal: document.getElementById('song-modal'),
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
    const selectedCategory = elements.categoryFilter.value;
    const selectedTag = elements.tagFilter.value;
    const sortOption = elements.sortDropdown.value;

    let result = app.songs.filter(song => {
        const matchesSearch = !searchTerm ||
            song.title.toLowerCase().includes(searchTerm) ||
            (song.artist && song.artist.toLowerCase().includes(searchTerm)) ||
            (song.lyrics && song.lyrics.toLowerCase().includes(searchTerm));
        const matchesCategory = !selectedCategory || song.category === selectedCategory;
        const matchesTag = !selectedTag || (song.tags && song.tags.includes(selectedTag));
        return matchesSearch && matchesCategory && matchesTag;
    });

    if (sortOption === 'title') {
        result.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortOption === 'artist') {
        result.sort((a, b) => (a.artist || '').localeCompare(b.artist || ''));
    } else if (sortOption === 'key') {
        result.sort((a, b) => (a.key_signature || '').localeCompare(b.key_signature || ''));
    }

    return result;
}


function showToast(message, type = 'success') {
    if (!elements.toast) {
        console[type === 'error' ? 'error' : 'log'](message);
        return;
    }
    elements.toast.textContent = message;
    elements.toast.className = `toast show ${type}`;
    setTimeout(() => elements.toast.classList.remove('show'), 3000);
}

function openModal() {
    elements.modalBackdrop.classList.add('active');
    document.getElementById('modal-title').textContent = app.editingId ? 'Edit Song' : 'Add New Song';
}

function closeModal() {
    elements.modalBackdrop.classList.remove('active');
    if (typeof elements.songModal.reset === 'function') {
        elements.songModal.reset();
    }
    app.editingId = null;
}

// Event Listeners
document.getElementById('add-song-btn').addEventListener('click', openModal);
document.getElementById('cancel-modal-btn').addEventListener('click', closeModal);
elements.modalBackdrop.addEventListener('mousedown', e => {
    if (e.target === elements.modalBackdrop) closeModal();
});

elements.songModal.addEventListener('submit', async e => {
    e.preventDefault();
    const formData = Object.fromEntries(new FormData(elements.songModal));
    await saveSong(formData);
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
    const f = elements.songModal;
    f.elements.title.value = app.currentSong.title;
    f.elements.artist.value = app.currentSong.artist || '';
    f.elements.original_key.value = app.currentSong.key_signature || 'C';
    f.elements.tempo.value = app.currentSong.tempo || '';
    f.elements.genre.value = app.currentSong.genre || '';
    f.elements.category.value = app.currentSong.category || '';
    f.elements.tags.value = app.currentSong.tags || '';
    f.elements.notes.value = app.currentSong.notes || '';
    f.elements.content.value = app.currentSong.lyrics;
    openModal();
});

elements.categoryFilter.addEventListener('change', renderSongGrid);
elements.tagFilter.addEventListener('change', renderSongGrid);
elements.sortDropdown.addEventListener('change', renderSongGrid);

let searchTimeout;
elements.searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(renderSongGrid, 300);
});


// Initialize
loadSongs();
