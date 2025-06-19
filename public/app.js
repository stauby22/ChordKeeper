import { TranspositionEngine } from './transposition.js';

class ChordDisplayManager {
  constructor(container) {
    this.container = container;
    this.showChords = true;
    this.currentKey = 'C';
  }

  renderSongWithChords(songData) {
    const chordPattern = /\[([^\]]+)\]/g;
    const lines = songData.lyrics.split('\n');
    const htmlLines = lines.map(line => {
      return line.replace(chordPattern, (match, chord) => {
        return `<span class="chord" data-chord="${chord}">${chord}</span>`;
      });
    });
    this.container.innerHTML = htmlLines.map(l => `<div class="song-line">${l}</div>`).join('');
  }

  toggleChords() {
    this.showChords = !this.showChords;
    this.container.classList.toggle('show-chords', this.showChords);
    this.container.classList.toggle('hide-chords', !this.showChords);
  }

  transposeDisplay(semitones, targetKey) {
    const chords = this.container.querySelectorAll('.chord');
    const transposer = new TranspositionEngine();
    chords.forEach(el => {
      const orig = el.dataset.chord;
      const t = transposer.transposeChord(orig, semitones, targetKey);
      el.textContent = t;
      el.dataset.chord = t;
    });
  }
}

async function loadSongs() {
  const resp = await fetch('/api/songs');
  const data = await resp.json();
  const list = document.getElementById('song-list');
  list.innerHTML = data.songs.map(s => `<div class="song-item" data-id="${s.id}">${s.title}</div>`).join('');
  list.addEventListener('click', async e => {
    if (e.target.classList.contains('song-item')) {
      const id = e.target.dataset.id;
      const res = await fetch(`/api/songs/${id}`);
      const song = await res.json();
      displayManager.renderSongWithChords(song);
    }
  });
}

const displayManager = new ChordDisplayManager(document.getElementById('song-display'));
document.getElementById('toggle-chords').addEventListener('click', () => displayManager.toggleChords());
document.getElementById('transpose-up').addEventListener('click', () => displayManager.transposeDisplay(1));
document.getElementById('transpose-down').addEventListener('click', () => displayManager.transposeDisplay(-1));

loadSongs();
