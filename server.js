// =========================================================================
// DAN74TECH MEDIA - UNIFIED BACKEND SERVER PLATFORM (server.js)
// =========================================================================

const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

const app = express();
const PORT = process.env.PORT || 10000;

// ================= MIDDLEWARE CONFIGURATION =================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// ================= CLOUDINARY MEDIA MANAGEMENT SETUP =================
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dan74tech',
    api_key: process.env.CLOUDINARY_API_KEY || '',
    api_secret: process.env.CLOUDINARY_API_SECRET || ''
});

// ================= UPLOADS LOCAL FALLBACK STORAGE SYSTEM =================
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

// Local Storage configurations
const localStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = 'portfolio-' + Date.now() + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});
const uploadLocal = multer({ storage: localStorage });

// Memory Storage optimized for direct pipeline binary data streams
const memoryStorage = multer.memoryStorage();
const uploadMemory = multer({ storage: memoryStorage });

// ================= NEON POSTGRESQL DATABASE POOL CONNECTION =================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.query("SELECT NOW()")
    .then(() => console.log("✅ Postgres Database Connected Successfully"))
    .catch(err => console.error("❌ Database Connection Error:", err));

// ================= MODULE 1: AUTHENTICATION & SECURITY DATA ENGINE =================

// Register User (Ensures role is explicitly parsed with fallback verification)
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, role, phone } = req.body;
        const userRole = role || 'client';
        const result = await pool.query(
            `INSERT INTO users (name, email, password, role, phone) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role`,
            [name, email, password, userRole, phone]
        );
        res.json({ success: true, user: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// User Session Authentication Entry Point
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0 || result.rows[0].password !== password) {
            return res.status(401).json({ success: false, message: "Invalid configuration options submitted" });
        }
        const user = result.rows[0];
        res.json({
            success: true,
            user: { id: user.id, name: user.name, email: user.email, role: user.role }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Fetch all registered profile nodes
app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, name, email, role, phone, created_at FROM users ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= MODULE 2: SERVICES MANAGEMENT INTERFACE =================

// Publicly display core structural service offerings
app.get('/api/services', async (req, res) => {
    try {
        const data = await pool.query('SELECT * FROM services ORDER BY id DESC');
        res.json(data.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add dynamic service nodes
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

// Modify existing structural nodes
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

// Wipe service catalog nodes completely
app.delete('/api/services/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM services WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= MODULE 3: SUB-SERVICES & PRICING ENGINE =================

// Fetch unified package structures
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

// Retrieve packages matching specific structural category rules
app.get('/api/sub-services/:serviceName', async (req, res) => {
    try {
        const serviceName = req.params.serviceName.replace(/-/g, ' ').toLowerCase();
        const result = await pool.query(`
            SELECT ss.*
            FROM sub_services ss
            JOIN services s ON ss.service_id = s.id
            WHERE LOWER(s.name) = $1
            ORDER BY ss.id ASC
        `, [serviceName]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Commit dynamic pricing package variables to specified parent modules
app.post('/api/sub-services', async (req, res) => {
    try {
        const { service_id, name, price, description } = req.body;
        const result = await pool.query(
            `INSERT INTO sub_services (service_id, name, price, description) VALUES ($1, $2, COALESCE($3, 0.00), $4) RETURNING *`,
            [service_id, name, price, description]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= MODULE 4: OPERATIONS & ORDER FLOW ENGINE =================

// Fetch standard ledger records for the administration console
app.get('/api/orders', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM orders ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Isolate historical records for individual client views
app.get('/api/orders/user/:userId', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM orders WHERE user_id = $1 ORDER BY id DESC', [req.params.userId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Commit transaction records utilizing schema baseline defaults
app.post('/api/orders', async (req, res) => {
    try {
        const {
            user_id, customer_name, phone, service, sub_service,
            domain, device_model, project_details, price, status, payment_status
        } = req.body;

        const result = await pool.query(
            `INSERT INTO orders (
                user_id, customer_name, phone, service, sub_service, domain, 
                device_model, project_details, price, status, payment_status
            ) VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'N/A'), COALESCE($7, 'Web Client'), $8, COALESCE($9, 0.00), COALESCE($10, 'pending'), COALESCE($11, 'unpaid')) RETURNING *`,
            [user_id || null, customer_name, phone, service, sub_service, domain, device_model, project_details, price]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update pipeline operational matrices securely
app.put('/api/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, payment_status, price } = req.body;
        const result = await pool.query(
            `UPDATE orders SET status = COALESCE($1, status), payment_status = COALESCE($2, payment_status), price = COALESCE($3, price) WHERE id = $4 RETURNING *`,
            [status, payment_status, price, id]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Wipe operational project transaction entries entirely
app.delete('/api/orders/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM orders WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= MODULE 5: PORTFOLIO & WORKFLOW STATUS BAR ENGINE =================

// Publicly retrieve active showcase assets
app.get('/api/portfolio', async (req, res) => {
    try {
        const data = await pool.query('SELECT * FROM portfolio ORDER BY id DESC');
        res.json(data.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Save explicit data points matching structural metrics definitions
app.post('/api/portfolio', uploadLocal.single('image'), async (req, res) => {
    try {
        const { title, category, description, order_id, progress, status } = req.body;
        let link = req.body.link || '';
        if (req.file) {
            link = `/uploads/${req.file.filename}`;
        }
        const result = await pool.query(
            `INSERT INTO portfolio (title, category, description, link, order_id, progress, status)
             VALUES ($1, $2, $3, $4, $5, COALESCE($6, 0), COALESCE($7, 'In Progress')) RETURNING *`,
            [title, category, description, link, order_id || null, progress, status]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update numerical metrics (Real-Time Visual Progress Controls)
app.put('/api/portfolio/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { progress, status, title, description } = req.body;
        const result = await pool.query(
            `UPDATE portfolio SET progress = COALESCE($1, progress), status = COALESCE($2, status), title = COALESCE($3, title), description = COALESCE($4, description) WHERE id = $5 RETURNING *`,
            [progress, status, title, description, id]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Wipe display tracking metrics rows
app.delete('/api/portfolio/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM portfolio WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= MODULE 6: CASE STUDIES HUB =================

app.get('/api/case-studies', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM case_studies ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/case-studies', async (req, res) => {
    try {
        const { title, category, challenge, solution, result, image_url } = req.body;
        const out = await pool.query(
            `INSERT INTO case_studies (title, category, challenge, solution, result, image_url) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [title, category, challenge, solution, result, image_url]
        );
        res.json({ success: true, data: out.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= MODULE 7: REPUTATION & TESTIMONIAL AUDITING MATRIX =================

// Public interface display queries
app.get('/api/testimonials/approved', async (req, res) => {
    try {
        const data = await pool.query("SELECT * FROM testimonials WHERE status = 'approved' ORDER BY id DESC");
        res.json(data.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Management panel auditing evaluation query logs
app.get('/api/testimonials', async (req, res) => {
    try {
        const data = await pool.query('SELECT * FROM testimonials ORDER BY id DESC');
        res.json(data.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Submit user feedback logs defaulting safely to pending
app.post('/api/testimonials', async (req, res) => {
    try {
        const { client_name, company, rating, review } = req.body;
        const result = await pool.query(
            `INSERT INTO testimonials (client_name, company, rating, review, status) VALUES ($1, $2, $3, $4, 'pending') RETURNING *`,
            [client_name, company, rating, review]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Approve target review data structures
app.put('/api/testimonials/:id/approve', async (req, res) => {
    try {
        const result = await pool.query(`UPDATE testimonials SET status = 'approved' WHERE id = $1 RETURNING *`, [req.params.id]);
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Erase review rows
app.delete('/api/testimonials/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM testimonials WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= MODULE 8: BLOG CONSOLE & SEARCH ENGINE DATA ROUTING =================

// Standard listing interaction layers
app.get('/api/blog', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM blog_posts ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Dynamic query text evaluation engine
app.get('/api/blog/search', async (req, res) => {
    try {
        const { q } = req.query;
        const result = await pool.query(
            `SELECT * FROM blog_posts WHERE LOWER(title) LIKE $1 OR LOWER(content) LIKE $1 ORDER BY id DESC`,
            [`%${q.toLowerCase()}%`]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Match dynamic text keys using slug configurations
app.get('/api/blog/:slug', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM blog_posts WHERE slug = $1', [req.params.slug]);
        if (result.rows.length === 0) return res.status(404).json({ error: "Article node reference absent" });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Post management rich markup strings ingestion handler
app.post('/api/blog', async (req, res) => {
    try {
        const { title, category, content, summary, image_url, slug, seo_title, seo_description } = req.body;
        const result = await pool.query(
            `INSERT INTO blog_posts (title, category, content, summary, image_url, slug, seo_title, seo_description)
             VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, $1), COALESCE($8, $4)) RETURNING *`,
            [title, category, content, summary, image_url, slug, seo_title, seo_description]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Erase standard article layouts
app.delete('/api/blog/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM blog_posts WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= MODULE 9: NEWSLETTER AUDIENCE SUBSCRIPTION REGISTER =================

app.post('/api/subscribers', async (req, res) => {
    try {
        const { email } = req.body;
        const result = await pool.query(
            `INSERT INTO subscribers (email, status) VALUES ($1, 'active') ON CONFLICT (email) DO UPDATE SET status = 'active' RETURNING *`,
            [email]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/subscribers', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM subscribers ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/subscribers/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM subscribers WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= MODULE 10: MEDIA REPOSITORY PIPELINE =================

app.get('/api/media', async (req, res) => {
    try {
        const data = await pool.query('SELECT * FROM media_library ORDER BY id DESC');
        res.json(data.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/media/upload', uploadMemory.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "Required file node absent" });

        const uploadStream = cloudinary.uploader.upload_stream(
            { folder: "dan74tech_media_library" },
            async (error, result) => {
                if (error) return res.status(500).json({ error: error.message });

                const savedAsset = await pool.query(
                    `INSERT INTO media_library (public_id, url, filename, format, bytes) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
                    [result.public_id, result.secure_url, req.file.originalname, result.format, result.bytes]
                );
                res.json({ success: true, data: savedAsset.rows[0] });
            }
        );
        streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/media/:id', async (req, res) => {
    try {
        const target = await pool.query('SELECT * FROM media_library WHERE id = $1', [req.params.id]);
        if (target.rows.length === 0) return res.status(404).json({ error: "Target data row reference absent" });

        const asset = target.rows[0];
        await cloudinary.uploader.destroy(asset.public_id);
        await pool.query('DELETE FROM media_library WHERE id = $1', [req.params.id]);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= MODULE 11: FINANCIAL LOGISTICS & INVOICING =================

app.get('/api/invoices', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM invoices ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/invoices', async (req, res) => {
    try {
        const { order_id, invoice_number, client_name, client_email, amount, pdf_url, status } = req.body;
        const result = await pool.query(
            `INSERT INTO invoices (order_id, invoice_number, client_name, client_email, amount, pdf_url, status)
             VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'unpaid')) RETURNING *`,
            [order_id, invoice_number, client_name, client_email, amount, pdf_url, status]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= MODULE 12: REAL-TIME NOTIFICATION DISPATCH ENGINE =================

app.get('/api/notifications/user/:userId', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY id DESC', [req.params.userId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/notifications', async (req, res) => {
    try {
        const { user_id, title, message, channel } = req.body;
        const result = await pool.query(
            `INSERT INTO notifications (user_id, title, message, channel, status) VALUES ($1, $2, $3, COALESCE($4, 'dashboard'), 'unread') RETURNING *`,
            [user_id, title, message, channel]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= MODULE 13: SUPPORT TICKETING ROUTER =================

app.get('/api/tickets', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM support_tickets ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tickets', async (req, res) => {
    try {
        const { user_id, subject, description, priority } = req.body;
        const result = await pool.query(
            `INSERT INTO support_tickets (user_id, subject, description, priority, status) VALUES ($1, $2, $3, COALESCE($4, 'medium'), 'open') RETURNING *`,
            [user_id, subject, description, priority]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= MODULE 14: MESSAGES HUB (CONTACT FORM LOGISTICS) =================

app.get('/api/messages', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM messages ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/messages', async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;
        const result = await pool.query(
            `INSERT INTO messages (name, email, subject, message, status) VALUES ($1, $2, COALESCE($3, 'General Inquiry'), $4, 'unread') RETURNING *`,
            [name, email, subject, message]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/messages/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM messages WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= MODULE 15: APPOINTMENTS & CONSULTATION OPERATIONS =================

app.get('/api/consultations', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM consultations ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/consultations', async (req, res) => {
    try {
        const { client_name, client_email, booking_date, booking_time, platform } = req.body;
        const result = await pool.query(
            `INSERT INTO consultations (client_name, client_email, booking_date, booking_time, platform, status)
             VALUES ($1, $2, $3, $4, COALESCE($5, 'Google Meet'), 'pending') RETURNING *`,
            [client_name, client_email, booking_date, booking_time, platform]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/consultations/:id', async (req, res) => {
    try {
        const { status } = req.body;
        const result = await pool.query(
            `UPDATE consultations SET status = $1 WHERE id = $2 RETURNING *`,
            [status, req.params.id]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= GLOBAL APPLICATION VERIFICATION ROUTE =================
app.get('/', (req, res) => {
    res.send('🚀 DAN74TECH MEDIA Unified Operations API Matrix is active.');
});

// ================= INITIALIZE SERVICE EXECUTABLE RUNTIME =================
app.listen(PORT, () => {
    console.log(`🚀 System fully operational on port ${PORT}`);
});
