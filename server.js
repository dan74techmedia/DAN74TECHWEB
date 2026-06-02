const express = require('express');
const { Pool } = require('pg');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const streamifier = require('streamifier');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

// ==========================================
// 1. CORE SYSTEM MIDDLEWARE
// ==========================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// Home route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ==========================================
// 2. POSTGRESQL (NEON) CONNECTION POOL
// ==========================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ==========================================
// AUTO DATABASE INITIALIZATION
// ==========================================
async function initializeDatabaseSchema() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS services (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                price VARCHAR(100),
                category VARCHAR(100),
                page_route VARCHAR(100) DEFAULT 'web',
                icon VARCHAR(50) DEFAULT '🔧'
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS portfolio (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                media_url TEXT NOT NULL,
                media_type VARCHAR(50) DEFAULT 'image',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("🚀 Database schema ready (services + portfolio)");
    } catch (err) {
        console.error("❌ DB schema error:", err);
    }
}
initializeDatabaseSchema();

// ==========================================
// 3. CLOUDINARY CONFIG
// ==========================================
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_DB,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const upload = multer({ storage: multer.memoryStorage() });

const uploadToCloudinary = (fileBuffer) => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder: "dan74tech_media_assets" },
            (error, result) => {
                if (result) resolve(result.secure_url);
                else reject(error);
            }
        );
        streamifier.createReadStream(fileBuffer).pipe(stream);
    });
};

// ==========================================
// 4. UTIL FUNCTION
// ==========================================
const generateSlug = (str) => {
    return str ? str.toLowerCase().trim().replace(/\s+/g, '-') : 'general';
};

// ==========================================
// 5. SERVICES API (CORE FOR YOUR FRONTEND)
// ==========================================

// GET ALL SERVICES
app.get('/api/services', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM services ORDER BY id DESC');

        const cleaned = result.rows.map(r => {
            if (!r.page_route) {
                r.page_route = generateSlug(r.category || r.title);
            }
            return r;
        });

        res.json(cleaned);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch services" });
    }
});

// CREATE SERVICE (ADMIN)
app.post('/api/services', async (req, res) => {
    const { title, description, price, category, page_route, icon } = req.body;

    try {
        await pool.query(
            `INSERT INTO services (title, description, price, category, page_route, icon)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [
                title,
                description,
                price || '0',
                category,
                page_route || generateSlug(category || title),
                icon || '🔧'
            ]
        );

        res.status(201).json({ success: true, message: "Service created" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Insert failed" });
    }
});

// UPDATE SERVICE
app.put('/api/services/:id', async (req, res) => {
    const { id } = req.params;
    const { title, description, price, category, page_route, icon } = req.body;

    try {
        const result = await pool.query(
            `UPDATE services
             SET title=$1, description=$2, price=$3, category=$4, page_route=$5, icon=$6
             WHERE id=$7`,
            [
                title,
                description,
                price || '0',
                category,
                page_route || generateSlug(category || title),
                icon || '🔧',
                id
            ]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Service not found" });
        }

        res.json({ success: true, message: "Updated successfully" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Update failed" });
    }
});

// DELETE SERVICE
app.delete('/api/services/:id', async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM services WHERE id=$1', [req.params.id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Not found" });
        }

        res.json({ success: true, message: "Deleted successfully" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Delete failed" });
    }
});

// ==========================================
// 6. PORTFOLIO API
// ==========================================

// GET PORTFOLIO
app.get('/api/portfolio', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM portfolio ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Portfolio fetch failed" });
    }
});

// CREATE PORTFOLIO ITEM
app.post('/api/portfolio', upload.single('mediaFile'), async (req, res) => {
    try {
        const { title, description, media_type, youtubeUrl } = req.body;

        let media_url = youtubeUrl || '';

        if (req.file) {
            media_url = await uploadToCloudinary(req.file.buffer);
        }

        if (!media_url) {
            return res.status(400).json({ error: "Media required" });
        }

        await pool.query(
            `INSERT INTO portfolio (title, description, media_url, media_type)
             VALUES ($1,$2,$3,$4)`,
            [title, description, media_url, media_type || 'image']
        );

        res.status(201).json({ success: true, message: "Portfolio added" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Upload failed" });
    }
});

// DELETE PORTFOLIO
app.delete('/api/portfolio/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM portfolio WHERE id=$1', [req.params.id]);
        res.json({ success: true, message: "Deleted" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Delete failed" });
    }
});

// ==========================================
// 7. START SERVER
// ==========================================
app.listen(PORT, () => {
    console.log(`📡 Server running on port ${PORT}`);
});
