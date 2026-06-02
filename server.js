const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

// ================= MIDDLEWARE =================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// ================= UPLOADS SETUP =================
const uploadDir = path.join(__dirname, 'uploads');

// Ensure uploads folder exists
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Serve uploaded files
app.use('/uploads', express.static(uploadDir));

// Multer configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = 'portfolio-' + Date.now() + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({ storage });

// ================= DATABASE =================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// DB connection test (safe)
pool.query("SELECT NOW()")
    .then(() => console.log("✅ Postgres Database Connected Successfully"))
    .catch(err => console.error("❌ Database Connection Error:", err));

// ================= SERVICES =================

// Get all services
app.get('/api/services', async (req, res) => {
    try {
        const data = await pool.query('SELECT * FROM services ORDER BY id DESC');
        res.json(data.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add service (Rectified to accept icon column metadata)
app.post('/api/services', async (req, res) => {
    try {
        const { name, icon, description } = req.body;

        const result = await pool.query(
            `INSERT INTO services (name, icon, description) VALUES ($1, $2, $3) RETURNING *`,
            [name, icon, description]
        );

        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update service (Rectified to retain updated icon strings/emojis)
app.put('/api/services/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, icon, description } = req.body;

        const result = await pool.query(
            `UPDATE services SET name = $1, icon = $2, description = $3 WHERE id = $4 RETURNING *`,
            [name, icon, description, id]
        );

        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete service
app.delete('/api/services/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM services WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= PORTFOLIO =================

// Get portfolio
app.get('/api/portfolio', async (req, res) => {
    try {
        const data = await pool.query('SELECT * FROM portfolio ORDER BY id DESC');
        res.json(data.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add portfolio item (with upload)
app.post('/api/portfolio', upload.single('image'), async (req, res) => {
    try {
        const { title, category, description } = req.body;

        let link = req.body.link || '';

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

// Delete portfolio item
app.delete('/api/portfolio/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM portfolio WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= SUB SERVICES =================

// Get all sub services
app.get('/api/sub-services', async (req, res) => {
    try {
        const query = `
            SELECT sub_services.*, services.name AS category_name
            FROM sub_services
            JOIN services ON sub_services.service_id = services.id
            ORDER BY sub_services.id DESC
        `;

        const data = await pool.query(query);
        res.json(data.rows);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get sub services by service name
app.get('/api/sub-services/:serviceName', async (req, res) => {
    try {
        const serviceName = req.params.serviceName
            .replace(/-/g, ' ')
            .toLowerCase();

        const result = await pool.query(`
            SELECT ss.*
            FROM sub_services ss
            JOIN services s ON ss.service_id = s.id
            WHERE LOWER(s.name) = $1
            ORDER BY ss.id ASC
        `, [serviceName]);

        res.json(result.rows);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ================= ORDERS MANAGEMENT =================

// Fetch all orders for the admin console
app.get('/api/orders', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM orders ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create/Save a new order (called right before WhatsApp forwarding)
app.post('/api/orders', async (req, res) => {
    try {
        const {
            customer_name,
            phone,
            service,
            sub_service,
            domain,
            device_model,
            project_details,
            price,
            status,
            payment_status
        } = req.body;

        const result = await pool.query(
            `INSERT INTO orders (
                customer_name, phone, service, sub_service, domain, 
                device_model, project_details, price, status, payment_status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [
                customer_name, 
                phone, 
                service, 
                sub_service, 
                domain || 'N/A', 
                device_model || 'Web Client', 
                project_details, 
                price, 
                status || 'pending', 
                payment_status || 'unpaid'
            ]
        );

        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update order status or payment status (for admin modifications)
app.put('/api/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, payment_status } = req.body;
        const result = await pool.query(
            `UPDATE orders SET status = $1, payment_status = $2 WHERE id = $3 RETURNING *`,
            [status, payment_status, id]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete an order from admin console view
app.delete('/api/orders/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM orders WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= MESSAGES (CONTACT FORM) =================

// Fetch all messages for the admin console
app.get('/api/messages', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM messages ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Save a message (submitted from your Contact Us form)
app.post('/api/messages', async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;

        const result = await pool.query(
            `INSERT INTO messages (name, email, subject, message, status) 
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [name, email, subject || 'General Inquiry', message, 'unread']
        );

        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a contact form message log
app.delete('/api/messages/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM messages WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= ROOT TEST ROUTE =================
app.get('/', (req, res) => {
    res.send('🚀 DAN74TECH MEDIA API is running...');
});

// ================= START SERVER (CRITICAL) =================
app.listen(PORT, () => {
    console.log(`🚀 Server fully operational on port ${PORT}`);
});
            
