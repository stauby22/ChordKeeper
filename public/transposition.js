const { ChordParser, EnharmonicManager } = require('./chordParser');

class TranspositionEngine {
  constructor() {
    this.chromatic = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    this.chromaticFlats = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    this.enharmonicManager = new EnharmonicManager();
    this.parser = new ChordParser();
    
    // Note to chromatic index mapping
    this.noteToIndex = {
      'C': 0, 'B#': 0,
      'C#': 1, 'Db': 1,
      'D': 2,
      'D#': 3, 'Eb': 3,
      'E': 4, 'Fb': 4,
      'E#': 5, 'F': 5,
      'F#': 6, 'Gb': 6,
      'G': 7,
      'G#': 8, 'Ab': 8,
      'A': 9,
      'A#': 10, 'Bb': 10,
      'B': 11, 'Cb': 11
    };
  }

  transposeChord(chordString, semitones, targetKey = null) {
    if (!chordString || semitones === 0) return chordString;
    
    const parsed = this.parser.parseChord(chordString);
    if (!parsed) return chordString;

    try {
      if (parsed.isSlashChord) {
        // Handle slash chords
        const transposedRoot = this.transposeNote(parsed.root, semitones);
        const transposedBass = this.transposeNote(parsed.bass, semitones);
        
        // Extract the quality from the root (e.g., "Cm7" -> "m7")
        const rootMatch = parsed.root.match(/^([A-G][b#]?)(.*)$/);
        const quality = rootMatch ? rootMatch[2] : '';
        
        let result = transposedRoot + quality + '/' + transposedBass;
        
        if (targetKey) {
          result = this.applyEnharmonicPreference(result, targetKey);
        }
        
        return result;
      } else {
        // Handle regular chords
        const transposedRoot = this.transposeNote(parsed.root, semitones);
        let result = transposedRoot + (parsed.quality || '') + (parsed.extensions || '');
        
        if (targetKey) {
          result = this.applyEnharmonicPreference(result, targetKey);
        }
        
        return result;
      }
    } catch (error) {
      console.error('Transposition error:', error);
      return chordString;
    }
  }

  transposeNote(note, semitones) {
    // Extract base note and accidentals
    const match = note.match(/^([A-G])([b#]*)$/);
    if (!match) return note;
    
    const [, baseNote, accidentals] = match;
    
    // Get the chromatic index
    let index = this.noteToIndex[baseNote];
    if (index === undefined) return note;
    
    // Adjust for accidentals
    for (const acc of accidentals) {
      if (acc === '#') index++;
      if (acc === 'b') index--;
    }
    
    // Normalize to 0-11 range
    index = ((index % 12) + 12) % 12;
    
    // Transpose
    const newIndex = ((index + semitones) % 12 + 12) % 12;
    
    // Return the note from chromatic scale
    return this.chromatic[newIndex];
  }

  applyEnharmonicPreference(chord, targetKey) {
    const preferFlats = this.shouldPreferFlats(targetKey);
    
    // Replace notes with enharmonic equivalents based on key preference
    if (preferFlats) {
      return chord
        .replace(/C#/g, 'Db')
        .replace(/D#/g, 'Eb')
        .replace(/F#/g, 'Gb')
        .replace(/G#/g, 'Ab')
        .replace(/A#/g, 'Bb');
    } else {
      return chord
        .replace(/Db/g, 'C#')
        .replace(/Eb/g, 'D#')
        .replace(/Gb/g, 'F#')
        .replace(/Ab/g, 'G#')
        .replace(/Bb/g, 'A#');
    }
  }

  shouldPreferFlats(key) {
    const flatKeys = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];
    return flatKeys.includes(key);
  }

  transposeSong(song, semitones, targetKey) {
    if (!song || !song.lyrics) return song;
    
    const chordPattern = /\[([^\]]+)\]/g;
    const transposedLyrics = song.lyrics.replace(chordPattern, (match, chord) => {
      const transposed = this.transposeChord(chord, semitones, targetKey);
      return `[${transposed}]`;
    });
    
    return transposedLyrics;
  }

  // Calculate the interval between two keys
  getInterval(fromKey, toKey) {
    const fromIndex = this.noteToIndex[fromKey];
    const toIndex = this.noteToIndex[toKey];
    
    if (fromIndex === undefined || toIndex === undefined) {
      throw new Error('Invalid key signature');
    }
    
    return ((toIndex - fromIndex) + 12) % 12;
  }

  // Get all chords from lyrics
  extractChords(lyrics) {
    const chords = new Set();
    const chordPattern = /\[([^\]]+)\]/g;
    let match;
    
    while ((match = chordPattern.exec(lyrics)) !== null) {
      chords.add(match[1]);
    }
    
    return Array.from(chords);
  }

  // Analyze key based on chord progression
  analyzeKey(lyrics) {
    const chords = this.extractChords(lyrics);
    const keyScores = {};
    
    // Common chord progressions in major keys
    const majorKeyChords = {
      'C': ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim'],
      'G': ['G', 'Am', 'Bm', 'C', 'D', 'Em', 'F#dim'],
      'D': ['D', 'Em', 'F#m', 'G', 'A', 'Bm', 'C#dim'],
      'A': ['A', 'Bm', 'C#m', 'D', 'E', 'F#m', 'G#dim'],
      'E': ['E', 'F#m', 'G#m', 'A', 'B', 'C#m', 'D#dim'],
      'B': ['B', 'C#m', 'D#m', 'E', 'F#', 'G#m', 'A#dim'],
      'F': ['F', 'Gm', 'Am', 'Bb', 'C', 'Dm', 'Edim'],
      'Bb': ['Bb', 'Cm', 'Dm', 'Eb', 'F', 'Gm', 'Adim'],
      'Eb': ['Eb', 'Fm', 'Gm', 'Ab', 'Bb', 'Cm', 'Ddim'],
      'Ab': ['Ab', 'Bbm', 'Cm', 'Db', 'Eb', 'Fm', 'Gdim'],
      'Db': ['Db', 'Ebm', 'Fm', 'Gb', 'Ab', 'Bbm', 'Cdim'],
      'Gb': ['Gb', 'Abm', 'Bbm', 'Cb', 'Db', 'Ebm', 'Fdim']
    };
    
    // Score each key based on matching chords
    Object.entries(majorKeyChords).forEach(([key, keyChords]) => {
      keyScores[key] = 0;
      chords.forEach(chord => {
        // Simple chord root extraction
        const chordRoot = chord.match(/^[A-G][b#]?/)?.[0];
        if (chordRoot && keyChords.some(kc => kc.startsWith(chordRoot))) {
          keyScores[key]++;
        }
      });
    });
    
    // Return the key with highest score
    return Object.entries(keyScores)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'C';
  }

  // Get a display-friendly version of the key
  getDisplayKey(key, preferFlats = false) {
    const keyMap = {
      'C#': preferFlats ? 'Db' : 'C#',
      'D#': preferFlats ? 'Eb' : 'D#',
      'F#': preferFlats ? 'Gb' : 'F#',
      'G#': preferFlats ? 'Ab' : 'G#',
      'A#': preferFlats ? 'Bb' : 'A#',
      'Db': preferFlats ? 'Db' : 'C#',
      'Eb': preferFlats ? 'Eb' : 'D#',
      'Gb': preferFlats ? 'Gb' : 'F#',
      'Ab': preferFlats ? 'Ab' : 'G#',
      'Bb': preferFlats ? 'Bb' : 'A#'
    };
    
    return keyMap[key] || key;
  }
}

module.exports = { TranspositionEngine };