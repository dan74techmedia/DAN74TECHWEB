const express = require('express');
const { Pool } = require('pg');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const streamifier = require('streamifier');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

// ================= MIDDLEWARE =================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// ================= DATABASE =================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ================= INIT DB =================
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS services (
                id SERIAL PRIMARY KEY,
                title TEXT,
                description TEXT,
                price TEXT,
                category TEXT,
                page_route TEXT,
                icon TEXT
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS portfolio (
                id SERIAL PRIMARY KEY,
                title TEXT,
                description TEXT,
                media_url TEXT,
                media_type TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("✅ DB READY");
    } catch (err) {
        console.error("DB ERROR:", err);
    }
}
initDB();

// ================= CLOUDINARY =================
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_DB,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const upload = multer({ storage: multer.memoryStorage() });

const uploadToCloudinary = (buffer) =>
    new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder: "assets" },
            (err, result) => {
                if (result) resolve(result.secure_url);
                else reject(err);
            }
        );
        streamifier.createReadStream(buffer).pipe(stream);
    });

// ================= UTIL =================
const slug = (t) => t ? t.toLowerCase().trim().replace(/\s+/g, '-') : 'general';

// ================= ROUTES =================

// Root endpoint serves your UI safely without overriding content headers across asset files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ROUTE INTERCEPTOR FOR API ENDPOINTS - Sets JSON selectively for clean processing
app.use('/api', (req, res, next) => {
    res.setHeader('Content-Type', 'application/json');
    next();
});

// ================= SERVICES ENDPOINTS =================

// GET
app.get('/api/services', async (req, res) => {
    try {
        const data = await pool.query('SELECT * FROM services ORDER BY id DESC');
        // Aligned perfectly: Returns raw arrays expected by both UI data iterations
        res.json(data.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CREATE
app.post('/api/services', async (req, res) => {
    try {
        const { title, description, price, category, icon } = req.body;

        const result = await pool.query(
            `INSERT INTO services (title, description, price, category, page_route, icon)
             VALUES ($1,$2,$3,$4,$5,$6)
             RETURNING *`,
            [
                title,
                description,
                price || '0',
                category,
                slug(category || title),
                icon || '🔧'
            ]
        );

        // Standardized to directly return the object, resolving raw array unpack exceptions in frontend
        res.json(result.rows[0]);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// UPDATE
app.put('/api/services/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, price, category, icon } = req.body;

        const result = await pool.query(
            `UPDATE services SET
                title=$1,
                description=$2,
                price=$3,
                category=$4,
                page_route=$5,
                icon=$6
             WHERE id=$7
             RETURNING *`,
            [
                title,
                description,
                price || '0',
                category,
                slug(category || title),
                icon || '🔧',
                id
            ]
        );

        if (!result.rows.length) {
            return res.status(404).json({ error: "Not found" });
        }

        res.json(result.rows[0]);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE
app.delete('/api/services/:id', async (req, res) => {
    try {
        const result = await pool.query(
            'DELETE FROM services WHERE id=$1 RETURNING *',
            [req.params.id]
        );

        if (!result.rows.length) {
            return res.status(404).json({ error: "Not found" });
        }

        res.json({ success: true });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= PORTFOLIO ENDPOINTS =================
app.get('/api/portfolio', async (req, res) => {
    try {
        const data = await pool.query('SELECT * FROM portfolio ORDER BY id DESC');
        res.json(data.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/portfolio', upload.single('mediaFile'), async (req, res) => {
    try {
        const { title, description, media_type, youtubeUrl } = req.body;

        let media_url = youtubeUrl || '';

        if (req.file) {
            media_url = await uploadToCloudinary(req.file.buffer);
        }

        if (!media_url) {
            return res.status(400).json({ error: "No media source provided" });
        }

        const result = await pool.query(
            `INSERT INTO portfolio (title, description, media_url, media_type)
             VALUES ($1,$2,$3,$4)
             RETURNING *`,
            [title, description, media_url, media_type || 'image']
        );

        res.json(result.rows[0]);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/portfolio/:id', async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM portfolio WHERE id=$1 RETURNING *', [req.params.id]);
        if (!result.rows.length) {
            return res.status(404).json({ error: "Portfolio item not found" });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= START SERVER =================
app.listen(PORT, () => {
    console.log(`🚀 Server running perfectly on port ${PORT}`);
});
