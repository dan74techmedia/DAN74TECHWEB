const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const cors = require('cors');
const multer = require('multer'); // Restored for picture uploads
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

// ================= MIDDLEWARE =================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// Ensure uploads directory exists for picture uploads
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}
// Serve uploaded pictures statically
app.use('/uploads', express.static(uploadDir));

// Configure Multer for local picture storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, 'portfolio-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// ================= DATABASE CONNECTION =================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for platforms like Render/Heroku
});

pool.query("SELECT NOW()", (err, res) => {
    if (err) console.error("❌ Database Connection Error:", err);
    else console.log("✅ Postgres Database Connected Successfully");
});

// ================= SERVICES ENDPOINTS =================
app.get('/api/services', async (req, res) => {
    try {
        const data = await pool.query('SELECT * FROM services ORDER BY id DESC');
        res.json(data.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/services', async (req, res) => {
    try {
        const { name, description } = req.body;
        const result = await pool.query(
            `INSERT INTO services (name, description) VALUES ($1, $2) RETURNING *`,
            [name, description]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/services/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description } = req.body;
        const result = await pool.query(
            `UPDATE services SET name = $1, description = $2 WHERE id = $3 RETURNING *`,
            [name, description, id]
        );
        res.json({ success: true, data: result.rows[0] });
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

// ================= SUB SERVICES (PACKAGES) =================
app.get('/api/sub-services', async (req, res) => {
    try {
        const queryText = `
            SELECT sub_services.*, services.name AS category_name 
            FROM sub_services 
            JOIN services ON sub_services.service_id = services.id 
            ORDER BY sub_services.id DESC`;
        const data = await pool.query(queryText);
        res.json(data.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/sub-services', async (req, res) => {
    try {
        const { service_id, title, description, price } = req.body;
        const result = await pool.query(
            `INSERT INTO sub_services (service_id, title, description, price) 
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [service_id, title, description, price]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/sub-services/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { service_id, title, description, price } = req.body;
        const result = await pool.query(
            `UPDATE sub_services SET service_id = $1, title = $2, description = $3, price = $4 
             WHERE id = $5 RETURNING *`,
            [service_id, title, description, price, id]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/sub-services/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM sub_services WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= PORTFOLIO (PICTURE UPLOADS INTACT) =================
app.get('/api/portfolio', async (req, res) => {
    try {
        const data = await pool.query('SELECT * FROM portfolio ORDER BY id DESC');
        res.json(data.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// The crucial upload route: handles FormData + File Uploads via Multer
app.post('/api/portfolio', upload.single('image'), async (req, res) => {
    try {
        const { title, category, description } = req.body;
        let link = req.body.link || ''; 
        
        // If a file was uploaded, save the generated path to the DB
        if (req.file) {
            link = `/uploads/${req.file.filename}`;
        }

        const result = await pool.query(
            `INSERT INTO portfolio (title, category, description, link) 
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [title, category, description, link]
        );
        res.json({ success: true, data: result.rows[0] });
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

app.listen(PORT, () => {
    console.log(`🚀 Server fully operational on port ${PORT}`);
});

app.get('/api/sub-services/:serviceName', async (req, res) => {
    try {

        const formattedName = req.params.serviceName
            .replace(/-/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());

        const query = `
            SELECT ss.*
            FROM sub_services ss
            JOIN services s ON ss.service_id = s.id
            WHERE LOWER(s.name) = LOWER($1)
            ORDER BY ss.id ASC
        `;

        const result = await pool.query(query, [formattedName]);

        res.json(result.rows);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});
