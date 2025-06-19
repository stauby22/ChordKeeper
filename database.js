const Database = require('better-sqlite3');

class ChordKeeperDB {
  constructor(dbPath = './chordkeeper.db') {
    this.db = new Database(dbPath);
    this.setupDatabase();
  }

  setupDatabase() {
    // Performance pragmas
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('temp_store = MEMORY');
    this.db.pragma('mmap_size = 268435456');

    // Create tables if they do not exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS artists (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS songs (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL COLLATE NOCASE,
        artist_id INTEGER REFERENCES artists(id),
        key_signature TEXT,
        tempo INTEGER,
        genre TEXT,
        chord_data TEXT,
        lyrics TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);
      CREATE INDEX IF NOT EXISTS idx_songs_artist_genre ON songs(artist_id, genre);
      CREATE INDEX IF NOT EXISTS idx_songs_key ON songs(key_signature);
    `);

    this.stmts = {
      insertSong: this.db.prepare(`
        INSERT INTO songs (title, artist_id, key_signature, tempo, genre, chord_data, lyrics, notes)
        VALUES (@title, @artist_id, @key_signature, @tempo, @genre, @chord_data, @lyrics, @notes)
      `),
      getSongById: this.db.prepare(`SELECT * FROM songs WHERE id = ?`),
      getAllSongs: this.db.prepare(`SELECT * FROM songs ORDER BY title LIMIT ?`),
      searchSongs: this.db.prepare(`SELECT * FROM songs WHERE title LIKE ? ORDER BY title LIMIT ?`),
      getSongsByKey: this.db.prepare(`SELECT * FROM songs WHERE key_signature = ? ORDER BY title`)
    };
  }

  insertSong(songData) {
    const result = this.stmts.insertSong.run({
      title: songData.title,
      artist_id: songData.artist_id,
      key_signature: songData.key_signature,
      tempo: songData.tempo,
      genre: songData.genre,
      chord_data: JSON.stringify(songData.chord_data || []),
      lyrics: songData.lyrics,
      notes: songData.notes
    });
    return result.lastInsertRowid;
  }

  getSongById(id) {
    return this.stmts.getSongById.get(id);
  }

  getAllSongs(limit = 20) {
    return this.stmts.getAllSongs.all(limit);
  }

  searchSongs(query, limit = 20) {
    return this.stmts.searchSongs.all(`%${query}%`, limit);
  }

  getSongsByKey(key) {
    return this.stmts.getSongsByKey.all(key);
  }
}

module.exports = { ChordKeeperDB };
