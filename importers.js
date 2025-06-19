const ChordSheetJS = require('chordsheetjs');
const { ChordParser } = require('./chordParser');

class UltimateGuitarImporter {
  constructor() {
    this.parser = new ChordSheetJS.UltimateGuitarParser();
    this.chordParser = new ChordParser();
  }

  async importFromText(text) {
    const song = this.parser.parse(text);
    const metadata = this.extractMetadata(song);
    const chordData = this.processChordData(song);
    return {
      title: metadata.title || 'Untitled',
      artist_id: null,
      key_signature: this.detectKey(chordData),
      tempo: metadata.tempo,
      genre: metadata.genre,
      chord_data: chordData,
      lyrics: this.extractLyrics(song),
      notes: metadata.comments || ''
    };
  }

  extractMetadata(song) {
    return {
      title: song.title,
      artist: song.artist,
      tempo: song.tempo,
      genre: song.meta && song.meta.genre,
      comments: song.meta && song.meta.comment
    };
  }

  extractLyrics(song) {
    return song.toString();
  }

  processChordData(song) {
    const sections = [];
    song.paragraphs.forEach((paragraph, index) => {
      const chords = [];
      paragraph.lines.forEach(line => {
        line.items.forEach(item => {
          if (item.chords && item.chords.length > 0) {
            item.chords.forEach(chord => {
              const parsed = this.chordParser.parseChord(chord.name);
              if (parsed) {
                chords.push({
                  chord: chord.name,
                  position: item.lyrics ? item.lyrics.length : 0,
                  parsed
                });
              }
            });
          }
        });
      });
      if (chords.length > 0) {
        sections.push({
          name: `section_${index}`,
          chords,
          type: 'verse'
        });
      }
    });
    return sections;
  }

  detectKey(chordData) {
    const counts = {};
    chordData.forEach(section => {
      section.chords.forEach(c => {
        const root = c.parsed ? c.parsed.root : c.chord.charAt(0);
        counts[root] = (counts[root] || 0) + 1;
      });
    });
    return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b, 'C');
  }
}

module.exports = { UltimateGuitarImporter };
