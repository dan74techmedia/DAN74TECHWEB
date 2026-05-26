const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const path = require('path');

// Cloudinary & File Processing Dependencies
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const streamifier = require('streamifier');

const app = express();

// --- DATABASE CONFIGURATION (Neon) ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// --- CLOUDINARY CONFIGURATION ---
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_DB,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET // Ensure this is in Render!
});

// Multer config: Store file temporarily in RAM (Render friendly)
const upload = multer({ storage: multer.memoryStorage() });

// Middleware
app.use(express.static(__dirname));
app.use(express.json());


// --- HTML ROUTING ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));


// --- CLOUDINARY UPLOAD API ---
app.post('/api/upload', upload.any(), (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "No image file provided." });
    }

    // Pipe the image buffer directly to Cloudinary
    const stream = cloudinary.uploader.upload_stream(
        { folder: "dan74tech_media" },
        (error, result) => {
            if (error) return res.status(500).json({ error: "Cloudinary upload failed" });
            // Send URL back to admin.html so it can be saved to Neon DB
            res.json({ secure_url: result.secure_url, url: result.secure_url });
        }
    );

    streamifier.createReadStream(req.files[0].buffer).pipe(stream);
});


// --- AUTHENTICATION API ---
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


// --- SERVICES DATA API ---
app.get('/api/services', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM services ORDER BY id ASC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "DB Fetch Error" });
    }
});

app.post('/api/services', async (req, res) => {
    const { title, description, image_url, pricing_link, price_range, category } = req.body;
    try {
        await pool.query(
            'INSERT INTO services (title, description, image_url, pricing_link, price_range, category) VALUES ($1, $2, $3, $4, $5, $6)',
            [title, description, image_url, pricing_link, price_range, category]
        );
        res.status(201).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Insertion failed" });
    }
});

// Update Service
app.put('/api/services/:id', async (req, res) => {
    const { price_range, image_url, description, pricing_link } = req.body;
    try {
        await pool.query(
            'UPDATE services SET price_range = $1, image_url = $2, description = $3, pricing_link = $4 WHERE id = $5',
            [price_range, image_url, description, pricing_link, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Update failed" });
    }
});

// Delete Service
app.delete('/api/services/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM services WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Delete failed" });
    }
});


// --- PORTFOLIO API ---
app.get('/api/portfolio', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM portfolio ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "DB Fetch Error" });
    }
});

app.post('/api/portfolio', async (req, res) => {
    const { title, description, media_type, media_url } = req.body;
    try {
        await pool.query(
            'INSERT INTO portfolio (title, description, media_type, media_url) VALUES ($1, $2, $3, $4)',
            [title, description, media_type, media_url]
        );
        res.status(201).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Insertion failed" });
    }
});

app.delete('/api/portfolio/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM portfolio WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Delete failed" });
    }
});


// --- CONTACTS / INQUIRIES API ---
app.get('/api/contacts', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM contacts ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "DB Fetch Error" });
    }
});

app.delete('/api/contacts/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM contacts WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Delete failed" });
    }
});


// --- ADMIN USERS VIEW ---
app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username, email FROM users');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "DB Fetch Error" });
    }
});


// Keep-Alive Logic
setInterval(() => {
    axios.get('https://dan74techweb.onrender.com/').catch(() => {});
}, 600000);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server live on port ${PORT}`));
