const express = require('express');
const { Pool } = require('pg');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const streamifier = require('streamifier');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

// --- CORE SYSTEM MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// --- NEON POSTGRESQL CONNECTIVITY POOL ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// --- CLOUDINARY MEDIA GATEWAY CONFIGURATION ---
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_DB,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer memory-buffer routing strategy optimized for serverless/ephemeral environments like Render
const upload = multer({ storage: multer.memoryStorage() });

// --- REUSABLE STREAMING UPLOAD HANDLING PIPE TO CLOUDINARY ---
const uploadToCloudinary = (fileBuffer) => {
    return new Promise((resolve, reject) => {
        let stream = cloudinary.uploader.upload_stream(
            { folder: "dan74tech_media_assets" },
            (error, result) => {
                if (result) resolve(result.secure_url);
                else reject(error);
            }
        );
        streamifier.createReadStream(fileBuffer).pipe(stream);
    });
};

// --- HTML STATIC FILES ROUTE REDIRECTS ---
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// --- ADMINISTRATIVE ACCESS CONTROL POINT ---
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            // Simple robust check matching database seeding parameters
            if (user.password === password) {
                return res.json({ success: true, user: { id: user.id, username: user.username, email: user.email } });
            }
        }
        res.status(401).json({ success: false, error: "Invalid administrative credentials." });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- CLOUDINARY DIRECT BINARY INTERCEPT ROUTE ---
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No asset file structural stream found." });
        const secureUrl = await uploadToCloudinary(req.file.buffer);
        res.json({ success: true, url: secureUrl });
    } catch (err) {
        res.status(500).json({ error: "Cloudinary compilation transaction collapsed: " + err.message });
    }
});

// --- MASTER SERVICES PERSISTENT WEB CRUD ENDPOINTS ---
app.get('/api/services', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM services ORDER BY category ASC, id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/services', async (req, res) => {
    const { title, category, price_range, description, image_url, pricing_link } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO services (title, category, price_range, description, image_url, pricing_link) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [title, category, price_range, description, image_url, pricing_link || 'contact.html']
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/services/:id', async (req, res) => {
    const { id } = req.params;
    const { title, category, price_range, description, image_url, pricing_link } = req.body;
    try {
        await pool.query(
            `UPDATE services SET title=$1, category=$2, price_range=$3, description=$4, image_url=$5, pricing_link=$6 
             WHERE id=$7`,
            [title, category, price_range, description, image_url, pricing_link, id]
        );
        res.json({ success: true, message: "Service metrics adjusted successfully." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/services/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM services WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: "Service purged from live storage arrays." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- FULL TASKS PORTFOLIO CRUD SYSTEM ENDPOINTS ---
app.get('/api/portfolio', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM portfolio ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/portfolio', async (req, res) => {
    const { title, category, media_type, media_url, description } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO portfolio (title, category, media_type, media_url, description) 
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [title, category, media_type, media_url, description]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/portfolio/:id', async (req, res) => {
    const { id } = req.params;
    const { title, category, media_type, media_url, description } = req.body;
    try {
        await pool.query(
            `UPDATE portfolio SET title=$1, category=$2, media_type=$3, media_url=$4, description=$5 WHERE id=$6`,
            [title, category, media_type, media_url, description, id]
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

// --- SUB-SERVICES ENDPOINTS ---
app.get('/api/sub-services/:service_id', async (req, res) => {
    const { service_id } = req.params;
    try {
        const result = await pool.query('SELECT * FROM sub_services WHERE service_id=$1', [service_id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/sub-services', async (req, res) => {
    const { service_id, title, price, description, image_url, payment_link, payment_method } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO sub_services (service_id, title, price, description, image_url, payment_link, payment_method)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [service_id, title, price, description, image_url, payment_link || 'contact.html', payment_method || 'mpesa']
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/sub-services/:id', async (req, res) => {
    const { id } = req.params;
    const { title, price, description, image_url, payment_link, payment_method } = req.body;
    try {
        await pool.query(
            `UPDATE sub_services SET title=$1, price=$2, description=$3, image_url=$4, payment_link=$5, payment_method=$6 WHERE id=$7`,
            [title, price, description, image_url, payment_link, payment_method, id]
        );
        res.json({ success: true });
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

// --- PUBLIC INTAKE CAPTURE OPERATION FOR OTHER WEB PAGES ---
app.post('/api/public/inquire', async (req, res) => {
    const { client_name, contact_info, service_type, project_scope } = req.body;
    try {
        await pool.query(
            `INSERT INTO contacts (client_name, contact_info, service_type, project_scope) VALUES ($1, $2, $3, $4)`,
            [client_name, contact_info, service_type, project_scope]
        );
        res.json({ success: true, message: "Inquiry logged into backend dashboard system." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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

app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username, email, created_at FROM users');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Initial startup execution interface mapping
app.listen(PORT, () => console.log(`DAN74TECH MEDIA Engine initialized live on port ${PORT}`));
             
