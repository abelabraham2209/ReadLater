// server.js

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.json());

// Database setup
const db = new sqlite3.Database(':memory:');  // Using an in-memory database for testing

// Middleware to protect routes
const authenticate = (req, res, next) => {
    const token = req.headers['authorization'];

    if (!token) {
        return res.status(401).json({ message: 'Token is required' });
    }

    // Verify the token
    jwt.verify(token, 'your-secret-key', (err, decoded) => {
        if (err) {
            return res.status(401).json({ message: 'Invalid token', error: err.message });
        }

        // Add the user ID to the request object
        req.userId = decoded.userId;
        next();
    });
};

// User Signup
app.post('/signup', (req, res) => {
    const { username, password } = req.body;

    // Check if username and password are provided
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
    }

    // Hash the password
    bcrypt.hash(password, 10, (err, hashedPassword) => {
        if (err) {
            return res.status(500).json({ message: 'Error hashing password', error: err.message });
        }

        // Insert the user into the database
        const insertQuery = `INSERT INTO users (username, password) VALUES (?, ?)`;

        db.run(insertQuery, [username, hashedPassword], function (err) {
            if (err) {
                return res.status(500).json({ message: 'Failed to sign up', error: err.message });
            }

            res.json({ message: 'User signed up successfully!', userId: this.lastID });
        });
    });
});

// User Login
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    // Check if username and password are provided
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
    }

    // Find the user by username
    const selectQuery = `SELECT * FROM users WHERE username = ?`;

    db.get(selectQuery, [username], (err, user) => {
        if (err) {
            return res.status(500).json({ message: 'Failed to find user', error: err.message });
        }

        if (!user) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        // Compare the password with the stored hash
        bcrypt.compare(password, user.password, (err, isMatch) => {
            if (err) {
                return res.status(500).json({ message: 'Error comparing password', error: err.message });
            }

            if (!isMatch) {
                return res.status(401).json({ message: 'Invalid username or password' });
            }

            // Generate a JWT token
            const token = jwt.sign({ userId: user.id }, 'your-secret-key', { expiresIn: '1h' });

            res.json({ message: 'Login successful', token });
        });
    });
});

// Create Clips table
db.serialize(() => {
    // Create Clips table
    db.run(`
        CREATE TABLE IF NOT EXISTS clips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            user_id INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
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

    // Create user table
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL
        )
    `, (err) => {
        if (err) console.error('Error creating users table:', err.message);
    });
});

// Routes

// Protected Route to Add Clip
app.post('/clips', authenticate, (req, res) => {
    const { url, title, description } = req.body;
    const userId = req.userId; // Get the user ID from the decoded token

    const insertQuery = `INSERT INTO clips (url, title, description, user_id) VALUES (?, ?, ?, ?)`;

    db.run(insertQuery, [url, title, description, userId], function (err) {
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