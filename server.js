// server.js

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.json());

// Database setup
const db = new sqlite3.Database(':memory:');  // Using an in-memory database for testing

// Create Clips table
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS clips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT
        )
    `, (err) => {
        if (err) console.error('Error creating clips table:', err.message);
    });

    // Create Highlights table
    db.run(`
        CREATE TABLE IF NOT EXISTS highlights (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            clip_id INTEGER NOT NULL,
            highlight_text TEXT NOT NULL,
            FOREIGN KEY (clip_id) REFERENCES clips(id)
        )
    `, (err) => {
        if (err) console.error('Error creating highlights table:', err.message);
    });
});

// Routes

// 1. Add a new clip
app.post('/clips', (req, res) => {
    const { url, title, description } = req.body;
    const insertQuery = `INSERT INTO clips (url, title, description) VALUES (?, ?, ?)`;

    db.run(insertQuery, [url, title, description], function (err) {
        if (err) {
            res.status(500).json({ message: 'Failed to add clip', error: err.message });
        } else {
            res.json({ message: 'Clip added successfully!', data: { id: this.lastID, url, title, description } });
        }
    });
});

// 2. Retrieve all clips
app.get('/clips', (req, res) => {
    const selectQuery = `SELECT * FROM clips`;

    db.all(selectQuery, [], (err, rows) => {
        if (err) {
            res.status(500).json({ message: 'Failed to retrieve clips', error: err.message });
        } else {
            res.json({ clips: rows });
        }
    });
});

// 3. Retrieve a single clip by ID
app.get('/clips/:id', (req, res) => {
    const clipId = req.params.id;
    const selectQuery = `SELECT * FROM clips WHERE id = ?`;

    db.get(selectQuery, [clipId], (err, row) => {
        if (err) {
            res.status(500).json({ message: 'Failed to retrieve clip', error: err.message });
        } else if (row) {
            res.json({ clip: row });
        } else {
            res.status(404).json({ message: 'Clip not found' });
        }
    });
});

// 4. Delete a clip by ID
app.delete('/clips/:id', (req, res) => {
    const clipId = req.params.id;
    const deleteQuery = `DELETE FROM clips WHERE id = ?`;

    db.run(deleteQuery, [clipId], function (err) {
        if (err) {
            res.status(500).json({ message: 'Failed to delete clip', error: err.message });
        } else if (this.changes > 0) {
            res.json({ message: 'Clip deleted successfully' });
        } else {
            res.status(404).json({ message: 'Clip not found' });
        }
    });
});

// 5. Add a highlight to a clip
app.post('/clips/:id/highlight', (req, res) => {
    const clipId = req.params.id;
    const { highlight_text } = req.body;
    const insertQuery = `INSERT INTO highlights (clip_id, highlight_text) VALUES (?, ?)`;

    db.run(insertQuery, [clipId, highlight_text], function (err) {
        if (err) {
            res.status(500).json({ message: 'Failed to add highlight', error: err.message });
        } else {
            res.json({ message: 'Highlight added successfully!', data: { id: this.lastID, clip_id: clipId, highlight_text } });
        }
    });
});

// 6. Retrieve all highlights for a clip
app.get('/clips/:id/highlights', (req, res) => {
    const clipId = req.params.id;
    const selectQuery = `SELECT * FROM highlights WHERE clip_id = ?`;

    db.all(selectQuery, [clipId], (err, rows) => {
        if (err) {
            res.status(500).json({ message: 'Failed to retrieve highlights', error: err.message });
        } else {
            res.json({ highlights: rows });
        }
    });
});

// 7. Export highlights as Markdown
app.get('/clips/:id/export', (req, res) => {
    const clipId = req.params.id;

    const selectClipQuery = `SELECT title FROM clips WHERE id = ?`;
    const selectHighlightsQuery = `SELECT highlight_text FROM highlights WHERE clip_id = ?`;

    db.get(selectClipQuery, [clipId], (err, clip) => {
        if (err || !clip) {
            res.status(500).json({ message: 'Failed to retrieve clip title', error: err ? err.message : 'Clip not found' });
        } else {
            db.all(selectHighlightsQuery, [clipId], (err, highlights) => {
                if (err) {
                    res.status(500).json({ message: 'Failed to retrieve highlights', error: err.message });
                } else {
                    // Create Markdown content
                    let markdownContent = `# ${clip.title}\n\n## Highlights\n`;
                    highlights.forEach((highlight) => {
                        markdownContent += `- ${highlight.highlight_text}\n`;
                    });

                    res.setHeader('Content-Disposition', 'attachment; filename="highlights.md"');
                    res.setHeader('Content-Type', 'text/markdown');
                    res.send(markdownContent);
                }
            });
        }
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
