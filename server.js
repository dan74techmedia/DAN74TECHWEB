const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const app = express();
const path = require('path');
const fs = require('fs');

const publicPath = path.join(__dirname, 'public');

// Check if public folder exists
if (!fs.existsSync(publicPath)) {
    console.error("CRITICAL ERROR: 'public' directory not found at " + publicPath);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.use(express.json());
app.use(express.static(publicPath));

// Route to force load index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// Admin Route
app.get('/admin', (req, res) => {
    res.sendFile(path.join(publicPath, 'admin.html'));
});

// API Routes
app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username, email FROM users');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "DB Error" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running and listening on port ${PORT}`));
