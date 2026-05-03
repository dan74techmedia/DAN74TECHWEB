const express = require('express');
const { Pool } = require('pg');
const app = express();

app.use(express.json());
app.use(express.static(__dirname)); 

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

// --- SIGNUP ROUTE (FIXED) ---
app.post('/api/signup', async (req, res) => {
    const { full_name, username, email, phone, password } = req.body;
    try {
        await pool.query(
            'INSERT INTO users (full_name, username, email, phone, password) VALUES ($1, $2, $3, $4, $5)',
            [full_name, username, email, phone, password]
        );
        res.status(201).json({ message: "Created" });
    } catch (err) {
        console.error("Signup Error:", err.message);
        res.status(400).json({ error: "Check if username/email exists" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server live on port ${PORT}`));

// Keep-Alive Logic: Pings the server every 10 minutes to prevent Render sleep
const axios = require('axios'); // You'll need to add "axios" to your package.json

setInterval(() => {
  axios.get('https://dan74techweb.onrender.com/')
    .then(() => console.log('Keep-alive ping successful'))
    .catch((err) => console.error('Keep-alive ping failed:', err.message));
}, 600000); // 600,000ms = 10 minutes
