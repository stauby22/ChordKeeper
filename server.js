const express = require('express');
const path = require('path');
const { ChordKeeperDB } = require('./database');
const { UltimateGuitarImporter } = require('./importers');
const { TranspositionEngine } = require('./transposition');

const app = express();
const db = new ChordKeeperDB(path.join(__dirname, 'chordkeeper.db'));
const importer = new UltimateGuitarImporter();
const transposer = new TranspositionEngine();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/songs', (req, res) => {
  const { search, key, limit = 20 } = req.query;
  try {
    let songs;
    if (search) songs = db.searchSongs(search, parseInt(limit));
    else if (key) songs = db.getSongsByKey(key);
    else songs = db.getAllSongs(parseInt(limit));
    res.json({ songs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/songs/:id', (req, res) => {
  try {
    const song = db.getSongById(req.params.id);
    if (!song) return res.status(404).json({ error: 'Not found' });
    res.json(song);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/songs', (req, res) => {
  try {
    const id = db.insertSong(req.body);
    res.status(201).json(db.getSongById(id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/import/ultimate-guitar', async (req, res) => {
  const { text } = req.body;
  try {
    const songData = await importer.importFromText(text);
    const id = db.insertSong(songData);
    res.status(201).json({ message: 'Import successful', song: db.getSongById(id) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/songs/:id/transpose', (req, res) => {
  const { semitones = 0, targetKey } = req.body;
  try {
    const song = db.getSongById(req.params.id);
    if (!song) return res.status(404).json({ error: 'Not found' });
    const transposedLyrics = transposer.transposeSong(song, semitones, targetKey);
    const chordData = JSON.parse(song.chord_data || '[]').map(section => ({
      ...section,
      chords: section.chords.map(c => ({
        ...c,
        chord: transposer.transposeChord(c.chord, semitones, targetKey)
      }))
    }));
    res.json({
      ...song,
      lyrics: transposedLyrics,
      chord_data: chordData,
      transposed_key: targetKey || song.key_signature
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ChordKeeper API running on port ${PORT}`);
});
