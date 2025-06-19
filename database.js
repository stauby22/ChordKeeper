const Database = require('better-sqlite3');

class ChordKeeperDB {
  constructor(dbPath = './chordkeeper.db') {
    this.db = new Database(dbPath);
    this.setupDatabase();
    this.prepareStatements();
  }

  setupDatabase() {
    // Performance pragmas
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('temp_store = MEMORY');
    this.db.pragma('mmap_size = 268435456');
    this.db.pragma('cache_size = 10000');

    // Create tables
    this.db.exec(`
      -- Triggers to keep FTS in sync
      CREATE TRIGGER IF NOT EXISTS songs_ai AFTER INSERT ON songs BEGIN
        INSERT INTO songs_fts(rowid, title, artist, lyrics, notes)
        VALUES (new.id, new.title, new.artist, new.lyrics, new.notes);
      END;

      CREATE TRIGGER IF NOT EXISTS songs_ad AFTER DELETE ON songs BEGIN
        DELETE FROM songs_fts WHERE rowid = old.id;
      END;

      CREATE TRIGGER IF NOT EXISTS songs_au AFTER UPDATE ON songs BEGIN
        UPDATE songs_fts 
        SET title = new.title, artist = new.artist, lyrics = new.lyrics, notes = new.notes
        WHERE rowid = new.id;
      END;

      -- Update timestamp trigger
      CREATE TRIGGER IF NOT EXISTS update_timestamp AFTER UPDATE ON songs
      BEGIN
        UPDATE songs SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    `);

    // Insert default artist if needed
    this.db.prepare(`
      INSERT OR IGNORE INTO artists (id, name) VALUES (1, 'Unknown Artist')
    `).run();
  }

  prepareStatements() {
    this.stmts = {
      // Songs CRUD
      insertSong: this.db.prepare(`
        INSERT INTO songs (
          title, artist, artist_id, key_signature, tempo, genre, 
          category, chord_data, lyrics, notes, tags
        ) VALUES (
          @title, @artist, @artist_id, @key_signature, @tempo, @genre,
          @category, @chord_data, @lyrics, @notes, @tags
        )
      `),
      
      updateSong: this.db.prepare(`
        UPDATE songs SET
          title = @title,
          artist = @artist,
          key_signature = @key_signature,
          tempo = @tempo,
          genre = @genre,
          category = @category,
          chord_data = @chord_data,
          lyrics = @lyrics,
          notes = @notes,
          tags = @tags
        WHERE id = @id
      `),
      
      deleteSong: this.db.prepare(`DELETE FROM songs WHERE id = ?`),
      
      getSongById: this.db.prepare(`SELECT * FROM songs WHERE id = ?`),
      
      getAllSongs: this.db.prepare(`
        SELECT * FROM songs 
        ORDER BY created_at DESC 
        LIMIT ?
      `),
      
      getSongsByCategory: this.db.prepare(`
        SELECT * FROM songs 
        WHERE category = ? 
        ORDER BY title
      `),
      
      getSongsByKey: this.db.prepare(`
        SELECT * FROM songs 
        WHERE key_signature = ? 
        ORDER BY title
      `),
      
      // Full-text search
      searchSongs: this.db.prepare(`
        SELECT s.*, bm25(songs_fts) as rank
        FROM songs s
        JOIN songs_fts ON s.id = songs_fts.rowid
        WHERE songs_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `),
      
      // Simple search (fallback)
      simpleSearch: this.db.prepare(`
        SELECT * FROM songs 
        WHERE title LIKE ? OR artist LIKE ? OR lyrics LIKE ?
        ORDER BY 
          CASE 
            WHEN title LIKE ? THEN 1
            WHEN artist LIKE ? THEN 2
            ELSE 3
          END,
          title
        LIMIT ?
      `),
      
      // Categories
      getCategories: this.db.prepare(`
        SELECT 
          category,
          COUNT(*) as count
        FROM songs
        GROUP BY category
        ORDER BY category
      `),
      
      // Stats
      incrementPlayCount: this.db.prepare(`
        UPDATE songs SET play_count = play_count + 1 WHERE id = ?
      `),
      
      toggleFavorite: this.db.prepare(`
        UPDATE songs SET is_favorite = CASE WHEN is_favorite = 1 THEN 0 ELSE 1 END WHERE id = ?
      `),
      
      // Artists
      findOrCreateArtist: this.db.prepare(`
        INSERT OR IGNORE INTO artists (name) VALUES (?)
      `),
      
      getArtistByName: this.db.prepare(`
        SELECT id FROM artists WHERE name = ?
      `)
    };
  }

  // CRUD Operations
  insertSong(songData) {
    // Handle artist
    let artistId = songData.artist_id || 1;
    if (songData.artist && !songData.artist_id) {
      this.stmts.findOrCreateArtist.run(songData.artist);
      const artist = this.stmts.getArtistByName.get(songData.artist);
      if (artist) artistId = artist.id;
    }

    const result = this.stmts.insertSong.run({
      title: songData.title,
      artist: songData.artist || 'Unknown Artist',
      artist_id: artistId,
      key_signature: songData.key_signature || 'C',
      tempo: songData.tempo || null,
      genre: songData.genre || null,
      category: songData.category || 'uncategorized',
      chord_data: typeof songData.chord_data === 'object' 
        ? JSON.stringify(songData.chord_data) 
        : songData.chord_data || '[]',
      lyrics: songData.lyrics,
      notes: songData.notes || null,
      tags: songData.tags ? JSON.stringify(songData.tags) : null
    });
    
    return result.lastInsertRowid;
  }

  updateSong(id, songData) {
    const current = this.getSongById(id);
    if (!current) throw new Error('Song not found');

    this.stmts.updateSong.run({
      id,
      title: songData.title || current.title,
      artist: songData.artist || current.artist,
      key_signature: songData.key_signature || current.key_signature,
      tempo: songData.tempo !== undefined ? songData.tempo : current.tempo,
      genre: songData.genre !== undefined ? songData.genre : current.genre,
      category: songData.category || current.category,
      chord_data: songData.chord_data !== undefined 
        ? (typeof songData.chord_data === 'object' 
          ? JSON.stringify(songData.chord_data) 
          : songData.chord_data)
        : current.chord_data,
      lyrics: songData.lyrics || current.lyrics,
      notes: songData.notes !== undefined ? songData.notes : current.notes,
      tags: songData.tags !== undefined 
        ? JSON.stringify(songData.tags) 
        : current.tags
    });

    return this.getSongById(id);
  }

  deleteSong(id) {
    return this.stmts.deleteSong.run(id);
  }

  getSongById(id) {
    const song = this.stmts.getSongById.get(id);
    if (song) {
      // Parse JSON fields
      try {
        if (song.chord_data) song.chord_data = JSON.parse(song.chord_data);
      } catch (e) {
        song.chord_data = [];
      }
      try {
        if (song.tags) song.tags = JSON.parse(song.tags);
      } catch (e) {
        song.tags = [];
      }
    }
    return song;
  }

  getAllSongs(limit = 50) {
    return this.stmts.getAllSongs.all(limit);
  }

  getSongsByCategory(category) {
    return this.stmts.getSongsByCategory.all(category);
  }

  getSongsByKey(key) {
    return this.stmts.getSongsByKey.all(key);
  }

  searchSongs(query, limit = 50) {
    try {
      // Try FTS5 search first
      const ftsQuery = query.split(' ').map(term => `${term}*`).join(' ');
      return this.stmts.searchSongs.all(ftsQuery, limit);
    } catch (e) {
      // Fallback to simple LIKE search
      console.warn('FTS search failed, using simple search:', e.message);
      const likeQuery = `%${query}%`;
      return this.stmts.simpleSearch.all(
        likeQuery, likeQuery, likeQuery,
        likeQuery, likeQuery,
        limit
      );
    }
  }

  getCategories() {
    const results = this.stmts.getCategories.all();
    // Add default categories with 0 count if they don't exist
    const categories = {
      all: this.stmts.getAllSongs.all(9999).length,
      uncategorized: 0,
      favorites: 0,
      karaoke: 0,
      practice: 0
    };
    
    results.forEach(row => {
      categories[row.category] = row.count;
    });
    
    return categories;
  }

  // Utility methods
  incrementPlayCount(id) {
    return this.stmts.incrementPlayCount.run(id);
  }

  toggleFavorite(id) {
    return this.stmts.toggleFavorite.run(id);
  }

  // Backup database
  backup(filepath) {
    return this.db.backup(filepath);
  }

  // Close database connection
  close() {
    this.db.close();
  }
}

module.exports = { ChordKeeperDB };