class ChordParser {
  constructor() {
    this.chordRegex = /^([CDEFGAB](?:[b#])*)(maj7|min7|m7|dim7|aug7|sus[24]?|add[29]|[567]|9|11|13|M7|M9|°|ø|Δ|\+|-|alt|#5|b5|#9|b9|#11|b13)*(\([^\)]+\))?$/;
    this.slashChordRegex = /^([A-G][b#]?(?:m|maj|min|dim|aug|sus[24]?|add[29]|[567])*)\/([A-G][b#]?)$/;
  }

  parseChord(chordString) {
    const slashMatch = chordString.match(this.slashChordRegex);
    if (slashMatch) {
      return {
        root: slashMatch[1],
        bass: slashMatch[2],
        isSlashChord: true,
        fullChord: chordString
      };
    }

    const match = chordString.match(this.chordRegex);
    if (match) {
      return {
        root: match[1],
        quality: match[2] || 'major',
        extensions: match[3] || '',
        isSlashChord: false,
        fullChord: chordString
      };
    }
    return null;
  }

  extractChordsFromLyrics(lyricsWithChords) {
    const chordPattern = /\[([^\]]+)\]/g;
    const chords = [];
    let match;
    while ((match = chordPattern.exec(lyricsWithChords)) !== null) {
      const parsed = this.parseChord(match[1]);
      if (parsed) {
        chords.push({
          ...parsed,
          position: match.index,
          originalText: match[0]
        });
      }
    }
    return chords;
  }
}

class EnharmonicManager {
  constructor() {
    this.pianoNaming = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    this.keyPreferences = {
      sharps: ['G', 'D', 'A', 'E', 'B', 'F#', 'C#'],
      flats: ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb']
    };
  }

  selectEnharmonic(note, keySignature) {
    if (this.keyPreferences.sharps.includes(keySignature)) {
      return note.replace(/b/g, '#');
    } else if (this.keyPreferences.flats.includes(keySignature)) {
      return this.convertToFlat(note);
    }
    return this.pianoNaming[this.pianoNaming.indexOf(note) % 12] || note;
  }

  convertToFlat(note) {
    const enharmonicMap = { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb' };
    return enharmonicMap[note] || note;
  }
}

module.exports = { ChordParser, EnharmonicManager };
