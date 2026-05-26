const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const path = require('path');

const app = express();

// Connection to Neon Database
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Verify DB Connection Instantly
pool.connect((err, client, release) => {
    if (err) {
        return console.error('Error acquiring client', err.stack);
    }
    console.log('Successfully connected to Neon Database Engine.');
    release();
});

// Middleware
app.use(express.static(__dirname));
app.use(express.json());

// --- HTML STATIC ROUTING ---

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve admin.html
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});


// --- CORE API CONTROLLERS ---

// API: Login Validation Flow
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) return res.status(404).json({ error: "Not Found" });
        
        if (result.rows[0].password === password) {
            res.status(200).json({ success: true });
        } else {
            res.status(401).json({ error: "Unauthorized" });
        }
    } catch (err) {
        res.status(500).json({ error: "DB Error" });
    }
});

// API: Signup Submission Flow
app.post('/api/signup', async (req, res) => {
    const { full_name, username, email, phone, password } = req.body;
    try {
        await pool.query(
            'INSERT INTO users (full_name, username, email, phone, password) VALUES ($1, $2, $3, $4, $5)',
            [full_name, username, email, phone, password]
        );
        res.status(201).json({ message: "Created" });
    } catch (err) {
        res.status(400).json({ error: "Signup failed" });
    }
});

// API: Fetch Active Users Profile Lists
app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username, email FROM users');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch users" });
    }
});

// API: Fetch Dynamic Services (Pulled inside index.html script execution)
app.get('/api/services', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM services ORDER BY id ASC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch services data matrix" });
    }
});

// API: Fetch Portfolio Items (Pulled inside index.html script execution)
app.get('/api/portfolio', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM portfolio ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch portfolio dataset" });
    }
});

// API: Admin POST Endpoint to add new service dynamically via dashboard
app.post('/api/services', async (req, res) => {
    const { title, description, image_url, pricing_link } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO services (title, description, image_url, pricing_link) VALUES ($1, $2, $3, $4) RETURNING *',
            [title, description, image_url, pricing_link]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: "Admin insertion operation failed" });
    }
});

// API: Admin POST Endpoint to add new portfolio record items via dashboard
app.post('/api/portfolio', async (req, res) => {
    const { title, description, media_type, media_url } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO portfolio (title, description, media_type, media_url) VALUES ($1, $2, $3, $4) RETURNING *',
            [title, description, media_type, media_url]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: "Admin portfolio insertion failed" });
    }
});


// Production Self-Ping Engine System (Keeps Render Free-Tier Container Awake)
setInterval(() => {
    axios.get('https://dan74techweb.onrender.com/').catch(() => {});
}, 600000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server live on port ${PORT}`));
