const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const app = express();
const path = require('path');

// Connection to Neon Database
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Use absolute path to ensure 'public' folder is found correctly
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// --- ROUTES ---
// Serve index.html explicitly
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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

app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username, email FROM users');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch users" });
    }
});

// Keep-Alive
setInterval(() => {
    axios.get('https://dan74techweb.onrender.com/').catch(() => {});
}, 600000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server live on port ${PORT}`));
