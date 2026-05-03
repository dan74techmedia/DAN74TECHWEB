const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname)); // Serves your HTML/Images

// Connection to Neon Database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, 
  ssl: { rejectUnauthorized: false }
});

// --- LOGIN ROUTE ---
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        
        if (result.rows.length === 0) {
            // USERNAME NOT FOUND
            return res.status(404).json({ message: "Not Found" });
        }

        const user = result.rows[0];
        if (user.password === password) {
            res.status(200).json({ message: "Success" });
        } else {
            res.status(401).json({ message: "Wrong Password" });
        }
    } catch (err) {
        res.status(500).json({ error: "Database Error" });
    }
});

// --- SIGNUP ROUTE ---
app.post('/api/signup', async (req, res) => {
    const { fullname, username, email, phone, password } = req.body;
    try {
        await pool.query(
            'INSERT INTO users (full_name, username, email, phone, password) VALUES ($1, $2, $3, $4, $5)',
            [fullname, username, email, phone, password]
        );
        res.status(201).json({ message: "Created" });
    } catch (err) {
        res.status(400).json({ error: "Username or Email already exists" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server live on port ${PORT}`));
