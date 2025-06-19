export class TranspositionEngine {
  constructor() {
    this.chromatic = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  }

  transposeChord(chord, semitones) {
    const pattern = /^([A-G](?:b|#)?)(.*)$/;
    const m = chord.match(pattern);
    if (!m) return chord;
    const idx = this.chromatic.indexOf(m[1]);
    if (idx === -1) return chord;
    const newIndex = (idx + semitones + 12) % 12;
    return this.chromatic[newIndex] + m[2];
  }
}
