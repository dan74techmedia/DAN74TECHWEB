const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const streamifier = require('streamifier');

const app = express();
const PORT = process.env.PORT || 3000;

// --- DATABASE CONFIGURATION (Neon) --
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// --- CLOUDINARY CONFIGURATION ---
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_DB,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer Config: Store file temporarily in RAM (Render cloud execution friendly)
const upload = multer({ storage: multer.memoryStorage() });

// Middleware
app.use(express.static(__dirname));
app.use(express.json());

// --- HTML STATIC ROUTING ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// --- AUTHENTICATION ENDPOINT ---
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
        if (result.rows.length > 0) {
            res.json({ success: true, user: { username: result.rows[0].username, email: result.rows[0].email } });
        } else {
            res.status(401).json({ success: false, error: "Invalid systemic credentials." });
        }
    } catch (err) {
        res.status(500).json({ error: "Auth execution error." });
    }
});

// --- CLOUDINARY FILE UPLOAD STREAM ENGINE ---
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No image asset file provided." });
    }

    const uploadStream = cloudinary.uploader.upload_stream(
        { folder: 'dan74tech_media' },
        (error, result) => {
            if (error) return res.status(500).json({ error: "Cloudinary upload failure." });
            res.json({ success: true, url: result.secure_url });
        }
    );

    streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
});

// --- SERVICES ENDPOINTS (CRUD) ---
app.get('/api/services', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM services ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/services', async (req, res) => {
    const { title, price_range, description, image_url, pricing_link } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO services (title, price_range, description, image_url, pricing_link) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [title, price_range, description, image_url, pricing_link || 'contact.html']
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/services/:id', async (req, res) => {
    const { id } = req.params;
    const { price_range, image_url, description } = req.body;
    try {
        await pool.query(
            'UPDATE services SET price_range = $1, image_url = $2, description = $3 WHERE id = $4',
            [price_range, image_url, description, id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/services/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM services WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- PORTFOLIO ENDPOINTS (CRUD) ---
app.get('/api/portfolio', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM portfolio ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/portfolio', async (req, res) => {
    const { title, description, media_type, media_url } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO portfolio (title, description, media_type, media_url) VALUES ($1, $2, $3, $4) RETURNING *',
            [title, description, media_type, media_url]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/portfolio/:id', async (req, res) => {
    const { id } = req.params;
    const { media_url, title, description } = req.body;
    try {
        await pool.query(
            'UPDATE portfolio SET media_url = $1, title = $2, description = $3 WHERE id = $4',
            [media_url, title, description, id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/portfolio/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM portfolio WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- CONTACT INQUIRIES ROUTER ---
app.get('/api/contacts', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM contacts ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/contacts/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM contacts WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- LOGIN USERS MANAGEMENT ---
app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username, email, created_at FROM users ORDER BY id ASC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        await pool.query('INSERT INTO users (username, email, password) VALUES ($1, $2, $3)', [username, email, password]);
        res.status(201).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "User injection error (Duplicate key or configuration constraint)." });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => console.log(`🚀 System Online via Core Terminal Platform at Port ${PORT}`));
