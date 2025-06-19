const { ChordParser, EnharmonicManager } = require('./chordParser');

class TranspositionEngine {
  constructor() {
    this.chromatic = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    this.enharmonicManager = new EnharmonicManager();
  }

  transposeChord(chordString, semitones, targetKey = null) {
    const parser = new ChordParser();
    const parsed = parser.parseChord(chordString);
    if (!parsed) return chordString;

    const transposedRoot = this.transposeNote(parsed.root, semitones);
    let result = transposedRoot + (parsed.quality || '');

    if (parsed.isSlashChord) {
      const transposedBass = this.transposeNote(parsed.bass, semitones);
      result = transposedRoot + (parsed.quality || '') + '/' + transposedBass;
    }

    if (targetKey) {
      result = this.enharmonicManager.selectEnharmonic(result, targetKey);
    }
    return result;
  }

  transposeNote(note, semitones) {
    const base = note.replace(/[b#]+/, '');
    const accidentals = note.replace(/[CDEFGAB]/, '');
    let idx = this.chromatic.indexOf(base);
    if (accidentals.includes('#')) idx += accidentals.length;
    if (accidentals.includes('b')) idx -= accidentals.length;
    const newIndex = (idx + semitones + 12) % 12;
    return this.chromatic[newIndex];
  }

  transposeSong(song, semitones, targetKey) {
    const chordPattern = /\[([^\]]+)\]/g;
    return song.lyrics.replace(chordPattern, (match, chord) => {
      const transposed = this.transposeChord(chord, semitones, targetKey);
      return `[${transposed}]`;
    });
  }
}

module.exports = { TranspositionEngine };
