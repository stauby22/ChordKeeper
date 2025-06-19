import { TranspositionEngine } from './transposition.js';

// Application State
const app = {
  songs: [],
  currentSong: null,
  currentKey: 'C',
  originalKey: 'C',
  transpositionOffset: 0,
  editingId: null,
  currentView: 'grid', // 'grid' or 'song'
  currentCategory: 'all',
  searchTerm: '',
  keyFilter: ''
};

// DOM Elements Cache
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
  displayArtist: document.getElementById('display-artist'),
  displayTempo: document.getElementById('display-tempo'),
  displayCategory: document.getElementById('display-category'),
  addSongBtn: document.getElementById('add-song-btn'),
  importBtn: document.getElementById('import-btn'),
  backBtn: document.getElementById('back-to-grid'),
  toggleChordsBtn: document.getElementById('toggle-chords'),
  editSongBtn: document.getElementById('edit-song'),
  deleteSongBtn: document.getElementById('delete-song'),
  transposeUpBtn: document.getElementById('transpose-up'),
  transposeDownBtn: document.getElementById('transpose-down'),
  resetKeyBtn: document.getElementById('reset-key')
};

// Initialize Transposition Engine
const transposer = new TranspositionEngine();

// Chord Display Manager
class ChordDisplayManager {
  constructor(container) {
    this.container = container;
    this.showChords = true;
  }

  renderSongWithChords(songData) {
    if (!songData || !songData.lyrics) {
      this.container.innerHTML = '<div class="empty-state">No lyrics available</div>';
      return;
    }

    const lines = songData.lyrics.split('\n');
    const html = lines.map(line => this.processLine(line)).join('');
    this.container.innerHTML = html;
  }

  processLine(line) {
    const chordPattern = /\[([^\]]+)\]/g;
    const segments = [];
    let lastIndex = 0;
    let match;

    // Extract all chords and their positions
    const chords = [];
    while ((match = chordPattern.exec(line)) !== null) {
      chords.push({
        chord: match[1],
        position: match.index - lastIndex,
        originalIndex: match.index
      });
      lastIndex = match.index + match[0].length;
    }

    // Build the line with positioned chords
    let processedLine = '';
    let textIndex = 0;

    chords.forEach((chordInfo, index) => {
      // Add text before chord
      const textBefore = line.substring(
        textIndex + (index > 0 ? chords[index - 1].chord.length + 2 : 0),
        chordInfo.originalIndex
      );
      
      processedLine += `<span class="lyrics">${textBefore}</span>`;
      processedLine += `<span class="chord" style="left: ${processedLine.replace(/<[^>]*>/g, '').length}ch">${chordInfo.chord}</span>`;
      
      textIndex = chordInfo.originalIndex;
    });

    // Add remaining text
    const remainingStart = chords.length > 0 
      ? chords[chords.length - 1].originalIndex + chords[chords.length - 1].chord.length + 2 
      : 0;
    
    if (remainingStart < line.length) {
      processedLine += `<span class="lyrics">${line.substring(remainingStart)}</span>`;
    }

    // Handle empty lines
    if (!processedLine) {
      processedLine = '&nbsp;';
    }

    return `<div class="song-line">${processedLine}</div>`;
  }

  toggleChords() {
    this.showChords = !this.showChords;
    this.container.classList.toggle('hide-chords', !this.showChords);
  }

  transposeDisplay(semitones) {
    const chordElements = this.container.querySelectorAll('.chord');
    const preferFlats = transposer.shouldPreferFlats(app.currentKey);
    
    chordElements.forEach(element => {
      const originalChord = element.dataset.originalChord || element.textContent;
      if (!element.dataset.originalChord) {
        element.dataset.originalChord = originalChord;
      }
      
      const transposed = transposer.transposeChord(originalChord, semitones, preferFlats);
      element.textContent = transposed;
    });
  }
}

// Initialize Display Manager
const displayManager = new ChordDisplayManager(elements.songContent);

// API Functions
async function api(endpoint, options = {}) {
  try {
    const response = await fetch(`/api${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `API Error: ${response.statusText}`);
    }

    return data;
  } catch (error) {
    console.error('API Error:', error);
    showToast(error.message, 'error');
    throw error;
  }
}

// Song Management Functions
async function loadSongs() {
  try {
    showLoading(true);
    const data = await api('/songs');
    app.songs = data.songs || [];
    renderSongGrid();
    updateCategoryCounts();
  } catch (error) {
    console.error('Failed to load songs:', error);
    app.songs = [];
    renderSongGrid();
  } finally {
    showLoading(false);
  }
}

async function saveSong(songData) {
  const endpoint = app.editingId ? `/songs/${app.editingId}` : '/songs';
  const method = app.editingId ? 'PUT' : 'POST';
  
  try {
    const result = await api(endpoint, {
      method,
      body: JSON.stringify(songData)
    });

    showToast(app.editingId ? 'Song updated successfully!' : 'Song added successfully!', 'success');
    closeModal('song-modal');
    await loadSongs();
    
    // If we were editing the current song, reload it
    if (app.editingId && app.currentSong && app.currentSong.id === app.editingId) {
      await loadSong(app.editingId);
    }
  } catch (error) {
    showToast('Failed to save song: ' + error.message, 'error');
  }
}

async function loadSong(id) {
  try {
    showLoading(true);
    app.currentSong = await api(`/songs/${id}`);
    app.originalKey = app.currentSong.key_signature || 'C';
    app.currentKey = app.originalKey;
    app.transpositionOffset = 0;
    displaySong();
    switchView('song');
  } catch (error) {
    showToast('Failed to load song', 'error');
  } finally {
    showLoading(false);
  }
}

async function deleteSong(id) {
  if (!confirm('Are you sure you want to delete this song?')) {
    return;
  }

  try {
    await api(`/songs/${id}`, { method: 'DELETE' });
    showToast('Song deleted successfully', 'success');
    
    if (app.currentSong && app.currentSong.id === id) {
      switchView('grid');
    }
    
    await loadSongs();
  } catch (error) {
    showToast('Failed to delete song', 'error');
  }
}

// UI Functions
function renderSongGrid() {
  const filtered = filterSongs();
  
  if (filtered.length === 0) {
    elements.songGrid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎵</div>
        <div class="empty-title">No songs found</div>
        <p>${app.songs.length === 0 ? 'Add your first song to get started!' : 'Try adjusting your filters'}</p>
      </div>
    `;
    return;
  }

  elements.songGrid.innerHTML = filtered.map(song => `
    <div class="song-card" data-id="${song.id}">
      <h3 class="song-title">${escapeHtml(song.title)}</h3>
      <p class="song-artist">${escapeHtml(song.artist || 'Unknown Artist')}</p>
      <div class="song-meta">
        <span class="key-badge">${song.key_signature || 'C'}</span>
        ${song.tempo ? `<span class="tempo">♩=${song.tempo}</span>` : ''}
        ${song.category && song.category !== 'uncategorized' 
          ? `<span class="category-tag">${song.category}</span>` 
          : ''}
      </div>
    </div>
  `).join('');
}

function displaySong() {
  if (!app.currentSong) return;

  // Update header info
  elements.displayTitle.textContent = app.currentSong.title;
  elements.displayArtist.textContent = app.currentSong.artist || 'Unknown Artist';
  elements.currentKeyDisplay.textContent = app.currentKey;
  
  if (elements.displayTempo && app.currentSong.tempo) {
    elements.displayTempo.textContent = `♩ = ${app.currentSong.tempo}`;
  }
  
  if (elements.displayCategory) {
    elements.displayCategory.textContent = app.currentSong.category || 'uncategorized';
  }

  // Render chord chart
  let lyricsToRender = app.currentSong.lyrics;
  
  // If transposed, apply transposition
  if (app.transpositionOffset !== 0) {
    lyricsToRender = transposer.transposeSong(
      { lyrics: app.currentSong.lyrics }, 
      app.transpositionOffset, 
      app.currentKey
    );
  }

  displayManager.renderSongWithChords({ lyrics: lyricsToRender });
}

function filterSongs() {
  const searchTerm = app.searchTerm.toLowerCase();
  const category = app.currentCategory;
  const keyFilter = app.keyFilter;

  return app.songs.filter(song => {
    // Search filter
    const matchesSearch = !searchTerm || 
      song.title.toLowerCase().includes(searchTerm) ||
      (song.artist && song.artist.toLowerCase().includes(searchTerm)) ||
      (song.lyrics && song.lyrics.toLowerCase().includes(searchTerm));

    // Category filter
    const matchesCategory = category === 'all' || 
      (category === 'favorites' && song.is_favorite) ||
      song.category === category;

    // Key filter
    const matchesKey = !keyFilter || song.key_signature === keyFilter;

    return matchesSearch && matchesCategory && matchesKey;
  });
}

function updateCategoryCounts() {
  api('/categories').then(data => {
    const counts = data.categories || {};
    
    document.querySelectorAll('.category-item').forEach(item => {
      const category = item.dataset.category;
      const countEl = item.querySelector('.category-count');
      if (countEl) {
        countEl.textContent = counts[category] || 0;
      }
    });
  }).catch(error => {
    console.error('Failed to update category counts:', error);
  });
}

function switchView(view) {
  app.currentView = view;
  
  if (view === 'grid') {
    elements.songDisplay.style.display = 'none';
    elements.songGrid.style.display = 'grid';
    app.currentSong = null;
    app.transpositionOffset = 0;
  } else if (view === 'song') {
    elements.songGrid.style.display = 'none';
    elements.songDisplay.style.display = 'block';
  }
}

function showToast(message, type = 'success') {
  elements.toast.textContent = message;
  elements.toast.className = `toast show ${type}`;
  
  setTimeout(() => {
    elements.toast.classList.remove('show');
  }, 3000);
}

function showLoading(show) {
  // You can implement a loading spinner here
  document.body.classList.toggle('loading', show);
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
  
  // Reset form if it's the song modal
  if (modalId === 'song-modal') {
    document.getElementById('song-form').reset();
    app.editingId = null;
  }
}

// Utility Functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Event Listeners
// Header buttons
elements.addSongBtn?.addEventListener('click', () => {
  app.editingId = null;
  document.getElementById('modal-title').textContent = 'Add New Song';
  openModal('song-modal');
});

elements.importBtn?.addEventListener('click', () => {
  openModal('import-modal');
});

// Modal controls
document.getElementById('close-modal')?.addEventListener('click', () => closeModal('song-modal'));
document.getElementById('cancel-form')?.addEventListener('click', () => closeModal('song-modal'));
document.getElementById('close-import-modal')?.addEventListener('click', () => closeModal('import-modal'));
document.getElementById('cancel-import')?.addEventListener('click', () => closeModal('import-modal'));

// Click outside modal to close
document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal(modal.id);
    }
  });
});

// Song display controls
elements.backBtn?.addEventListener('click', () => switchView('grid'));
elements.toggleChordsBtn?.addEventListener('click', () => displayManager.toggleChords());

elements.editSongBtn?.addEventListener('click', () => {
  if (!app.currentSong) return;
  
  app.editingId = app.currentSong.id;
  document.getElementById('modal-title').textContent = 'Edit Song';
  
  // Populate form
  document.getElementById('song-title').value = app.currentSong.title;
  document.getElementById('song-artist').value = app.currentSong.artist || '';
  document.getElementById('song-key').value = app.currentSong.key_signature || 'C';
  document.getElementById('song-tempo').value = app.currentSong.tempo || '';
  document.getElementById('song-category').value = app.currentSong.category || 'uncategorized';
  document.getElementById('song-lyrics').value = app.currentSong.lyrics;
  document.getElementById('song-notes').value = app.currentSong.notes || '';
  
  openModal('song-modal');
});

elements.deleteSongBtn?.addEventListener('click', () => {
  if (app.currentSong) {
    deleteSong(app.currentSong.id);
  }
});

// Transpose controls
elements.transposeUpBtn?.addEventListener('click', () => {
  app.transpositionOffset++;
  app.currentKey = transposer.transposeNote(app.currentKey, 1);
  displaySong();
});

elements.transposeDownBtn?.addEventListener('click', () => {
  app.transpositionOffset--;
  app.currentKey = transposer.transposeNote(app.currentKey, -1);
  displaySong();
});

elements.resetKeyBtn?.addEventListener('click', () => {
  app.transpositionOffset = 0;
  app.currentKey = app.originalKey;
  displaySong();
});

// Form submissions
document.getElementById('song-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const formData = {
    title: document.getElementById('song-title').value.trim(),
    artist: document.getElementById('song-artist').value.trim(),
    key_signature: document.getElementById('song-key').value,
    tempo: parseInt(document.getElementById('song-tempo').value) || null,
    category: document.getElementById('song-category').value,
    lyrics: document.getElementById('song-lyrics').value,
    notes: document.getElementById('song-notes').value.trim()
  };

  if (!formData.title || !formData.lyrics) {
    showToast('Title and lyrics are required', 'error');
    return;
  }

  await saveSong(formData);
});

document.getElementById('import-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const text = document.getElementById('import-text').value;
  
  if (!text.trim()) {
    showToast('Please paste content to import', 'error');
    return;
  }
  
  try {
    showLoading(true);
    const result = await api('/import/ultimate-guitar', {
      method: 'POST',
      body: JSON.stringify({ text })
    });
    
    showToast('Song imported successfully!', 'success');
    closeModal('import-modal');
    document.getElementById('import-form').reset();
    await loadSongs();
  } catch (error) {
    showToast('Import failed: ' + error.message, 'error');
  } finally {
    showLoading(false);
  }
});

// Song grid click handler
elements.songGrid?.addEventListener('click', async (e) => {
  const card = e.target.closest('.song-card');
  if (card) {
    const id = parseInt(card.dataset.id);
    await loadSong(id);
  }
});

// Category selection
elements.categoryList?.addEventListener('click', (e) => {
  const item = e.target.closest('.category-item');
  if (item) {
    document.querySelectorAll('.category-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    app.currentCategory = item.dataset.category;
    renderSongGrid();
  }
});

// Search input
const debouncedSearch = debounce(() => {
  app.searchTerm = elements.searchInput.value;
  renderSongGrid();
}, 300);

elements.searchInput?.addEventListener('input', debouncedSearch);

// Key filter
elements.keyFilter?.addEventListener('change', (e) => {
  app.keyFilter = e.target.value;
  renderSongGrid();
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // ESC to close modals
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal.active').forEach(modal => {
      closeModal(modal.id);
    });
  }
  
  // Cmd/Ctrl + N for new song
  if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
    e.preventDefault();
    elements.addSongBtn?.click();
  }
  
  // Cmd/Ctrl + F for search
  if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
    e.preventDefault();
    elements.searchInput?.focus();
  }
  
  // Transpose shortcuts when viewing a song
  if (app.currentView === 'song' && app.currentSong) {
    if (e.key === 'ArrowUp' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      elements.transposeUpBtn?.click();
    } else if (e.key === 'ArrowDown' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      elements.transposeDownBtn?.click();
    }
  }
});

// Initialize the app
async function init() {
  try {
    await loadSongs();
    
    // Check for song ID in URL hash
    const hash = window.location.hash;
    if (hash && hash.startsWith('#song-')) {
      const songId = parseInt(hash.replace('#song-', ''));
      if (songId) {
        await loadSong(songId);
      }
    }
  } catch (error) {
    console.error('Failed to initialize app:', error);
    showToast('Failed to load songs', 'error');
  }
}

// Start the app
init();

// Export for debugging
window.app = app;
window.displayManager = displayManager;
window.transposer = transposer;