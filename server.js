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
// MIDDLEWARE
// ==========================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

function generateSlug(text = '') {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-');
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ==========================================
// DATABASE CONNECTION
// ==========================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ==========================================
// DATABASE INITIALIZATION
// ==========================================
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS services (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                price VARCHAR(50),
                category TEXT,
                page_route TEXT DEFAULT 'web',
                icon TEXT DEFAULT '🔧'
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS sub_services (
                id SERIAL PRIMARY KEY,
                service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                description TEXT,
                price INTEGER NOT NULL
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                customer_name TEXT NOT NULL,
                service_type TEXT NOT NULL,
                amount_paid INTEGER NOT NULL,
                instructions TEXT,
                status TEXT DEFAULT 'Pending',
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS portfolio (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                media_url TEXT NOT NULL,
                media_type TEXT DEFAULT 'image',
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);

        console.log("✅ Database ready");
    } catch (err) {
        console.error("DB error:", err);
    }
}
initDB();

// ==========================================
// CLOUDINARY
// ==========================================
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_DB,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const upload = multer({ storage: multer.memoryStorage() });

function uploadToCloudinary(buffer) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder: "dan74tech" },
            (err, result) => {
                if (err) reject(err);
                else resolve(result.secure_url);
            }
        );
        streamifier.createReadStream(buffer).pipe(stream);
    });
}

// ==========================================
// SERVICES
// ==========================================
app.get('/api/services', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM services ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Failed services" });
    }
});

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

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Insert failed" });
    }
});

app.put('/api/services/:id', async (req, res) => {
    const { id } = req.params;
    const { title, description, price, category, page_route, icon } = req.body;

    try {
        const result = await pool.query(
            `UPDATE services SET title=$1, description=$2, price=$3, category=$4, page_route=$5, icon=$6
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

        if (result.rowCount === 0)
            return res.status(404).json({ error: "Not found" });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Update failed" });
    }
});

app.delete('/api/services/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM services WHERE id=$1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Delete failed" });
    }
});

// ==========================================
// SUB SERVICES (FIXED SINGLE ROUTE)
// ==========================================
app.get('/api/sub-services/:route', async (req, res) => {
    const { route } = req.params;

    try {
        const service = await pool.query(
            `SELECT id FROM services WHERE page_route=$1`,
            [route]
        );

        if (!service.rows.length) return res.json([]);

        const serviceId = service.rows[0].id;

        const subs = await pool.query(
            `SELECT id, title, description, price
             FROM sub_services
             WHERE service_id=$1
             ORDER BY price ASC`,
            [serviceId]
        );

        res.json(subs.rows);
    } catch (err) {
        res.status(500).json({ error: "Sub services error" });
    }
});

// ==========================================
// ORDERS
// ==========================================
app.post('/api/orders', async (req, res) => {
    const { customerName, serviceType, amountPaid, instructions } = req.body;

    if (!customerName || !serviceType || !amountPaid) {
        return res.status(400).json({ error: "Missing fields" });
    }

    try {
        await pool.query(
            `INSERT INTO orders (customer_name, service_type, amount_paid, instructions)
             VALUES ($1,$2,$3,$4)`,
            [customerName, serviceType, amountPaid, instructions]
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Order failed" });
    }
});

// ==========================================
// PORTFOLIO
// ==========================================
app.get('/api/portfolio', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM portfolio ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Portfolio error" });
    }
});

app.post('/api/portfolio', upload.single('mediaFile'), async (req, res) => {
    try {
        const { title, description, media_type, youtubeUrl } = req.body;

        let url = youtubeUrl || '';

        if (req.file) {
            url = await uploadToCloudinary(req.file.buffer);
        }

        if (!url) return res.status(400).json({ error: "Missing media" });

        await pool.query(
            `INSERT INTO portfolio (title, description, media_url, media_type)
             VALUES ($1,$2,$3,$4)`,
            [title, description, url, media_type || 'image']
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Upload failed" });
    }
});

app.delete('/api/portfolio/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM portfolio WHERE id=$1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Delete failed" });
    }
});

// ==========================================
// START SERVER
// ==========================================
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
