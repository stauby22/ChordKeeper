const express = require('express');
const path = require('path');
const { ChordKeeperDB } = require('./database');
const { UltimateGuitarImporter } = require('./importers');
const { TranspositionEngine } = require('./transposition.js');

const app = express();
const db = new ChordKeeperDB(path.join(__dirname, 'chordkeeper.db'));
const importer = new UltimateGuitarImporter();
const transposer = new TranspositionEngine();

// Middleware
app.use(express.json({ limit: '10mb' })); // Increased limit for import
app.use(express.static(path.join(__dirname, 'public')));

// CORS headers for development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  next();
});

// Routes
app.get('/api/songs', (req, res) => {
  const { search, key, category, limit = 50 } = req.query;
  
  try {
    let songs;
    
    if (search) {
      songs = db.searchSongs(search, parseInt(limit));
    } else if (key) {
      songs = db.getSongsByKey(key);
    } else if (category && category !== 'all') {
      songs = db.getSongsByCategory(category);
    } else {
      songs = db.getAllSongs(parseInt(limit));
    }
    
    res.json({ songs, count: songs.length });
  } catch (err) {
    console.error('Error fetching songs:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/songs/:id', (req, res) => {
  try {
    const song = db.getSongById(req.params.id);
    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }
    
    // Parse chord_data if it's a string
    if (song.chord_data && typeof song.chord_data === 'string') {
      try {
        song.chord_data = JSON.parse(song.chord_data);
      } catch (e) {
        song.chord_data = [];
      }
    }
    
    res.json(song);
  } catch (err) {
    console.error('Error fetching song:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/songs', (req, res) => {
  try {
    // Validate required fields
    const { title, lyrics } = req.body;
    if (!title || !lyrics) {
      return res.status(400).json({ error: 'Title and lyrics are required' });
    }
    
    const id = db.insertSong(req.body);
    const song = db.getSongById(id);
    res.status(201).json(song);
  } catch (err) {
    console.error('Error creating song:', err);
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/songs/:id', (req, res) => {
  try {
    const { id } = req.params;
    const song = db.getSongById(id);
    
    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }
    
    // Update song
    const updated = db.updateSong(id, req.body);
    res.json(updated);
  } catch (err) {
    console.error('Error updating song:', err);
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/songs/:id', (req, res) => {
  try {
    const { id } = req.params;
    const song = db.getSongById(id);
    
    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }
    
    db.deleteSong(id);
    res.json({ message: 'Song deleted successfully' });
  } catch (err) {
    console.error('Error deleting song:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/import/ultimate-guitar', async (req, res) => {
  const { text } = req.body;
  
  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: 'No text provided' });
  }
  
  try {
    const songData = await importer.importFromText(text);
    
    // Ensure we have required fields
    if (!songData.title || !songData.lyrics) {
      return res.status(400).json({ 
        error: 'Could not parse song data. Please check the format.' 
      });
    }
    
    const id = db.insertSong(songData);
    const song = db.getSongById(id);
    
    res.status(201).json({ 
      message: 'Import successful', 
      song 
    });
  } catch (err) {
    console.error('Import error:', err);
    res.status(400).json({ 
      error: 'Import failed: ' + err.message 
    });
  }
});

app.post('/api/songs/:id/transpose', (req, res) => {
  const { semitones = 0, targetKey } = req.body;
  
  try {
    const song = db.getSongById(req.params.id);
    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    // Transpose lyrics
    const transposedLyrics = transposer.transposeSong(song, semitones, targetKey);
    
    // Parse and transpose chord data
    let chordData = [];
    try {
      chordData = JSON.parse(song.chord_data || '[]');
    } catch (e) {
      console.error('Error parsing chord data:', e);
    }
    
    const transposedChordData = chordData.map(section => ({
      ...section,
      chords: section.chords.map(c => ({
        ...c,
        chord: transposer.transposeChord(c.chord, semitones, targetKey)
      }))
    }));

    res.json({
      ...song,
      lyrics: transposedLyrics,
      chord_data: transposedChordData,
      transposed_key: targetKey || song.key_signature,
      transposition_offset: semitones
    });
  } catch (err) {
    console.error('Transposition error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Categories endpoint
app.get('/api/categories', (req, res) => {
  try {
    const categories = db.getCategories();
    res.json({ categories });
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({ error: err.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🎵 ChordKeeper is running on http://localhost:${PORT}`);
  console.log(`📱 Access from other devices: http://${getLocalIP()}:${PORT}`);
});

// Helper function to get local IP
function getLocalIP() {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}