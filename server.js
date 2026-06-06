// =========================================================================
// DAN74TECH MEDIA - UNIFIED BACKEND SERVER PLATFORM (server.js)
// =========================================================================

require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const bcrypt = require('bcryptjs'); // Standardized on bcryptjs for broad compatibility
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const Brevo = require('@getbrevo/brevo');

// Initialize Express App Engine (Must be declared before attaching middleware)
const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'dan74tech_media_secure_jwt_core_token_secret_key';

// Initialize Neon PostgreSQL Database Engine Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Required for secure cloud communication with Neon PostgreSQL
});

// Configure Cloudinary Integration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Initialize Brevo Client
let defaultClient = Brevo.ApiClient.instance;
let apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;
const brevoEmailInstance = new Brevo.TransactionalEmailsApi();

// ================= MIDDLEWARE CONFIGURATION =================
app.use(helmet({ contentSecurityPolicy: false })); // Permissive CSP to prevent inline frontend blocks from breaking
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// Global API Request Rate Limiter Node
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // limit each IP to 1000 requests per windowMs
    message: { error: "Too many corporate operational requests from this endpoint, please retry later." }
});
app.use('/api/', globalLimiter);

// Auth Specific Security Rate Limiter
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: "Security threshold reached. Verification authentication requests throttled." }
});
app.use('/api/auth/', authLimiter);
    

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


// ================= EMAIL ENGINE NOTIFICATION SERVICE (BREVO SDK) =================
let defaultClient = Brevo.ApiClient.instance;
let apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;
const brevoEmailInstance = new Brevo.TransactionalEmailsApi();

async function sendSystemNotificationEmail(to, subject, text, html) {
    if (!process.env.BREVO_API_KEY || !process.env.EMAIL_USER) {
        console.warn("⚠️ Notification system idling: Credentials not deployed yet.");
        return; 
    }
    
    try {
        const sendSmtpEmail = new Brevo.SendSmtpEmail();
        sendSmtpEmail.subject = subject;
        sendSmtpEmail.htmlContent = html || `<p>${text}</p>`;
        sendSmtpEmail.sender = { name: "DAN74TECH MEDIA", email: process.env.EMAIL_USER };
        sendSmtpEmail.to = [{ email: to }];

        await brevoEmailInstance.sendTransacEmail(sendSmtpEmail);
        console.log(`✉️ System alert dispatched successfully to: ${to}`);
    } catch (err) {
        console.error("❌ Notification Email Dispatch Fault:", err);
    }
}

// ================= ARCHITECTURAL PROTECTION SECURITY MIDDLEWARE =================
const verifySystemToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ error: "Access token validation mapping empty. Unauthorized." });
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Token reference structural compromise detected. Forbidden." });
        req.user = user;
        next();
    });
};

const verifyAdminAccess = (req, res, next) => {
    verifySystemToken(req, res, () => {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ error: "Console Operation Limited to System Administrators Only." });
        }
        next();
    });
};

// ================= MODULE 1: AUTHENTICATION & SECURITY DATA ENGINE =================

// Register User (Ensures role is explicitly parsed with fallback verification and secure hashing)
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, role, phone } = req.body;
        const userRole = role || 'client';
        
        // Check structural existence and account state constraints
        const checkUser = await pool.query('SELECT id FROM users WHERE email = $1 AND is_deleted = FALSE', [email]);
        if (checkUser.rows.length > 0) {
            return res.status(400).json({ error: "User registration email conflict detected." });
        }
        
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        const result = await pool.query(
            `INSERT INTO users (name, email, password, role, phone, is_deleted) 
             VALUES ($1, $2, $3, $4, $5, FALSE) 
             RETURNING id, name, email, role, phone`,
            [name, email, hashedPassword, userRole, phone]
        );
        
        const userNode = result.rows[0];
        const accessToken = jwt.sign({ id: userNode.id, email: userNode.email, role: userNode.role }, JWT_SECRET, { expiresIn: '24h' });
        
        // Optional tracking greeting pipeline
        await sendSystemNotificationEmail(
            userNode.email, 
            "Welcome to DAN74TECH MEDIA", 
            `Hello ${userNode.name}, your workspace engine profile setup is successfully validated.`
        );

        res.json({ success: true, token: accessToken, user: userNode });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// User Session Authentication Entry Point (Dual compatibility fallback for legacy vs hashed passwords)
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Enforce alignment with PostgreSQL soft delete column constraint
        const result = await pool.query('SELECT * FROM users WHERE email = $1 AND is_deleted = FALSE', [email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, message: "Invalid configuration options submitted" });
        }
        
        const user = result.rows[0];
        let isMatch = false;
        
        // Backward-compatible verification interface layer
        if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
            isMatch = await bcrypt.compare(password, user.password);
        } else {
            isMatch = (user.password === password);
        }
        
        if (!isMatch) {
            return res.status(401).json({ success: false, message: "Invalid configuration options submitted" });
        }
        
        const accessToken = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        
        res.json({
            success: true,
            token: accessToken,
            user: { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Fetch all active registered profile nodes (Excluding deleted records)
app.get('/api/users', verifyAdminAccess, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, name, email, role, phone, created_at FROM users WHERE is_deleted = FALSE ORDER BY id DESC'
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin endpoint to implement structural soft-deletion to match database engine layout
app.delete('/api/users/:id', verifyAdminAccess, async (req, res) => {
    try {
        // Aligned with your system's dynamic trigger configuration setup
        await pool.query('UPDATE users SET is_deleted = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: "User node access credentials safely deprecated." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ================= MODULE 2: USERS MANAGEMENT INTERFACE =================


// Get single user
app.get('/api/users/:id', verifyAdminAccess, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, name, email, role, phone, created_at FROM users WHERE id = $1',
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update user
app.put('/api/users/:id', verifyAdminAccess, async (req, res) => {
    try {
        const { name, email, role, phone, password } = req.body;

        let query;
        let values;

        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);

            query = `
                UPDATE users
                SET name=$1,email=$2,role=$3,phone=$4,password=$5
                WHERE id=$6
                RETURNING id,name,email,role,phone
            `;

            values = [name, email, role, phone, hashedPassword, req.params.id];
        } else {
            query = `
                UPDATE users
                SET name=$1,email=$2,role=$3,phone=$4
                WHERE id=$5
                RETURNING id,name,email,role,phone
            `;

            values = [name, email, role, phone, req.params.id];
        }

        const result = await pool.query(query, values);

        res.json({
            success: true,
            data: result.rows[0]
        });

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
app.post('/api/services', verifyAdminAccess, async (req, res) => {
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
app.put('/api/services/:id', verifyAdminAccess, async (req, res) => {
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
app.delete('/api/services/:id', verifyAdminAccess, async (req, res) => {
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
app.post('/api/sub-services', verifyAdminAccess, async (req, res) => {
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

// Remove dynamic system subservice package tier
app.delete('/api/sub-services/:id', verifyAdminAccess, async (req, res) => {
    try {
        await pool.query('DELETE FROM sub_services WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= MODULE 4: OPERATIONS & ORDER FLOW ENGINE =================

// Fetch standard ledger records for the administration console
app.get('/api/orders', verifyAdminAccess, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM orders ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Isolate historical records for individual client views
app.get('/api/orders/user/:userId', verifySystemToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM orders WHERE user_id = $1 ORDER BY id DESC', [req.params.userId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Commit transaction records utilizing schema baseline defaults & Email routing notification trigger hooks
app.post('/api/orders', async (req, res) => {
    try {
        const {
            user_id, customer_name, phone, service, sub_service,
            domain, device_model, project_details, price, status, payment_status
        } = req.body;

        // Executing query with a perfectly matched 11-parameter array mapping
        const result = await pool.query(
            `INSERT INTO orders (
                user_id, customer_name, phone, service, sub_service, domain, 
                device_model, project_details, price, status, payment_status
            ) VALUES (
                $1, $2, $3, $4, $5, 
                COALESCE($6, 'N/A'), 
                COALESCE($7, 'Web Client'), 
                $8, 
                COALESCE($9, 0.00), 
                COALESCE($10, 'pending'), 
                COALESCE($11, 'unpaid')
            ) RETURNING *`,
            [
                user_id || null,          // $1
                customer_name,            // $2
                phone,                    // $3
                service,                  // $4
                sub_service || null,      // $5
                domain || null,           // $6 -> Falls back to 'N/A' via COALESCE if missing
                device_model || null,     // $7 -> Falls back to 'Web Client' via COALESCE if missing
                project_details || null,  // $8
                price || null,            // $9 -> Falls back to 0.00 via COALESCE if missing
                status || null,           // $10 -> Falls back to 'pending' via COALESCE if missing
                payment_status || null    // $11 -> Falls back to 'unpaid' via COALESCE if missing
            ]
        );
        
        const orderData = result.rows[0];
        
        // Auto-inject tracking log line records into notifications pipeline matrix
        if (user_id) {
            await pool.query(
                `INSERT INTO notifications (user_id, title, message, channel, status) VALUES ($1, $2, $3, 'dashboard', 'unread')`,
                [user_id, 'Order Received Successfully', `Your order sequence entry for ${service} is submitted.`]
            );
        }
        
        // Fire transaction notification emails to management team routing rules
        await sendSystemNotificationEmail(
            process.env.ADMIN_EMAIL || 'dan74techmedia@gmail.com',
            `🚨 NEW SERVICE ORDER: ${service}`,
            `A new deployment sequence has been raised by ${customer_name}. Phone: ${phone}. Package details: ${sub_service}.`,
            `<h3>New Production Order Raised</h3><p><strong>Client:</strong> ${customer_name}</p><p><strong>Module:</strong> ${service} (${sub_service})</p><p><strong>Scope:</strong> ${project_details || 'None specified'}</p>`
        );

        res.json({ success: true, data: orderData });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update pipeline operational matrices securely
app.put('/api/orders/:id', verifyAdminAccess, async (req, res) => {
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
app.delete('/api/orders/:id', verifyAdminAccess, async (req, res) => {
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
app.post('/api/portfolio', verifyAdminAccess, uploadLocal.single('image'), async (req, res) => {
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
app.put('/api/portfolio/:id', verifyAdminAccess, async (req, res) => {
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
app.delete('/api/portfolio/:id', verifyAdminAccess, async (req, res) => {
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

// Get single case study
app.get('/api/case-studies/:id', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM case_studies WHERE id = $1',
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Case study not found' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update case study
app.put('/api/case-studies/:id', verifyAdminAccess, async (req, res) => {
    try {

        const {
            title,
            category,
            challenge,
            solution,
            result,
            image_url
        } = req.body;

        const updated = await pool.query(
            `UPDATE case_studies
             SET
                title=$1,
                category=$2,
                challenge=$3,
                solution=$4,
                result=$5,
                image_url=$6
             WHERE id=$7
             RETURNING *`,
            [
                title,
                category,
                challenge,
                solution,
                result,
                image_url,
                req.params.id
            ]
        );

        res.json({
            success: true,
            data: updated.rows[0]
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/case-studies', verifyAdminAccess, async (req, res) => {
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

// Admin deletion hook for case-studies system modules
app.delete('/api/case-studies/:id', verifyAdminAccess, async (req, res) => {
    try {
        await pool.query('DELETE FROM case_studies WHERE id = $1', [req.params.id]);
        res.json({ success: true });
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
app.get('/api/testimonials', verifyAdminAccess, async (req, res) => {
    try {
        const { status } = req.query;
        let queryStr = 'SELECT * FROM testimonials ORDER BY id DESC';
        let params = [];
        
        if (status === 'approved') {
            queryStr = "SELECT * FROM testimonials WHERE status = 'approved' ORDER BY id DESC";
        }
        
        const data = await pool.query(queryStr, params);
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
app.put('/api/testimonials/:id/approve', verifyAdminAccess, async (req, res) => {
    try {
        const result = await pool.query(`UPDATE testimonials SET status = 'approved' WHERE id = $1 RETURNING *`, [req.params.id]);
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Erase review rows
app.delete('/api/testimonials/:id', verifyAdminAccess, async (req, res) => {
    try {
        await pool.query('DELETE FROM testimonials WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= MODULE 8: BLOG CONSOLE & SEARCH ENGINE DATA ROUTING =================

// Standard listing interaction layers (Dual route support to eradicate 404 indexing errors on layout updates)
const getBlogPosts = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM blog_posts ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
app.get('/api/blog', getBlogPosts);
app.get('/api/blogs', getBlogPosts);

// Get blog by id
app.get('/api/blog/id/:id', async (req, res) => {
    try {

        const result = await pool.query(
            'SELECT * FROM blog_posts WHERE id = $1',
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Blog post not found' });
        }

        res.json(result.rows[0]);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update blog
const updateBlogPost = async (req, res) => {
    try {

        const {
            title,
            category,
            content,
            summary,
            image_url,
            slug,
            seo_title,
            seo_description
        } = req.body;

        const result = await pool.query(
            `UPDATE blog_posts
             SET
                title=$1,
                category=$2,
                content=$3,
                summary=$4,
                image_url=$5,
                slug=$6,
                seo_title=$7,
                seo_description=$8
             WHERE id=$9
             RETURNING *`,
            [
                title,
                category,
                content,
                summary,
                image_url,
                slug,
                seo_title,
                seo_description,
                req.params.id
            ]
        );

        res.json({
            success: true,
            data: result.rows[0]
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

app.put('/api/blog/:id', verifyAdminAccess, updateBlogPost);
app.put('/api/blogs/:id', verifyAdminAccess, updateBlogPost);

// Dynamic query text evaluation engine
app.get('/api/blog/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) {
            const result = await pool.query('SELECT * FROM blog_posts ORDER BY id DESC');
            return res.json(result.rows);
        }
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

// Post management rich markup strings ingestion handler (Plural safe-guards)
const createBlogPost = async (req, res) => {
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
};
app.post('/api/blog', verifyAdminAccess, createBlogPost);
app.post('/api/blogs', verifyAdminAccess, createBlogPost);

// Erase standard article layouts
app.delete('/api/blog/:id', verifyAdminAccess, async (req, res) => {
    try {
        await pool.query('DELETE FROM blog_posts WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ================= MODULE 9: NEWSLETTER AUDIENCE SUBSCRIPTION REGISTER =================

// Subscribe
app.post('/api/subscribers', async (req, res) => {
    try {
        const { email } = req.body;

        const result = await pool.query(
            `INSERT INTO subscribers (email, status)
             VALUES ($1, 'active')
             ON CONFLICT (email)
             DO UPDATE SET status = 'active'
             RETURNING *`,
            [email]
        );

        res.json({
            success: true,
            data: result.rows[0]
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all subscribers
app.get('/api/subscribers', verifyAdminAccess, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM subscribers ORDER BY id DESC'
        );

        res.json(result.rows);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Broadcast email to all active subscribers
app.post('/api/subscribers/broadcast', verifyAdminAccess, async (req, res) => {
    try {

        const { subject, message, html } = req.body;

        if (!subject || !message) {
            return res.status(400).json({
                error: 'Subject and message are required'
            });
        }

        const subscribers = await pool.query(
            "SELECT email FROM subscribers WHERE status = 'active'"
        );

        let sent = 0;
        let failed = 0;

        for (const subscriber of subscribers.rows) {
            try {

                await transporter.sendMail({
                    from: process.env.EMAIL_USER,
                    to: subscriber.email,
                    subject,
                    text: message,
                    html: html || `<div>${message}</div>`
                });

                sent++;

            } catch (emailError) {

                failed++;

                console.error(
                    `Failed to send to ${subscriber.email}:`,
                    emailError.message
                );
            }
        }

        res.json({
            success: true,
            totalSubscribers: subscribers.rows.length,
            sent,
            failed
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete subscriber
app.delete('/api/subscribers/:id', verifyAdminAccess, async (req, res) => {
    try {

        await pool.query(
            'DELETE FROM subscribers WHERE id = $1',
            [req.params.id]
        );

        res.json({
            success: true
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
 
// ================= MODULE 10: MEDIA REPOSITORY PIPELINE =================

app.get('/api/media', verifyAdminAccess, async (req, res) => {
    try {
        const data = await pool.query('SELECT * FROM media_library ORDER BY id DESC');
        res.json(data.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/media/upload', verifyAdminAccess, uploadMemory.single('file'), async (req, res) => {
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

app.delete('/api/media/:id', verifyAdminAccess, async (req, res) => {
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

app.get('/api/invoices', verifyAdminAccess, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM invoices ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/invoices', verifyAdminAccess, async (req, res) => {
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

// Progressive Roadmap Update: Dynamic Binary Stream Streaming Generation Engine for Commercial Documents
app.get('/api/invoices/:id/download', async (req, res) => {
    try {
        const target = await pool.query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
        if (target.rows.length === 0) return res.status(404).json({ error: "Invoice sequence mismatch." });
        const inv = target.rows[0];
        
        const doc = new PDFDocument({ margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Invoice-${inv.invoice_number}.pdf`);
        doc.pipe(res);
        
        // Build corporate design canvas using blue accents branding
        doc.fillColor('#0044ff').fontSize(24).text('DAN74TECH MEDIA', { underline: true });
        doc.fillColor('#1a1a1a').fontSize(10).text('Professional Portal & Technology Hub', { align: 'left' }).moveDown(2);
        
        doc.fontSize(14).text(`INVOICE STATEMENT: #${inv.invoice_number}`, { stroke: false });
        doc.text(`Issued To: ${inv.client_name}`);
        doc.text(`Contact Point: ${inv.client_email || 'N/A'}`).moveDown(1);
        
        doc.rect(50, doc.y, 500, 2).fill('#ff2a2a').moveDown(1);
        
        doc.fillColor('#1a1a1a').fontSize(12).text(`Billed Total: $${inv.amount}`, { bold: true });
        doc.text(`Status Manifest: ${inv.status.toUpperCase()}`).moveDown(2);
        
        doc.fontSize(10).fillColor('#666666').text('Thank you for partnering with DAN74TECH MEDIA. For queries, contact support via WhatsApp routing loops.', { italic: true });
        doc.end();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Wipe financial ledger log entry lines
app.delete('/api/invoices/:id', verifyAdminAccess, async (req, res) => {
    try {
        await pool.query('DELETE FROM invoices WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= MODULE 12: REAL-TIME NOTIFICATION DISPATCH ENGINE =================

app.get('/api/notifications/user/:userId', verifySystemToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY id DESC', [req.params.userId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/notifications', verifyAdminAccess, async (req, res) => {
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

app.get('/api/tickets', verifyAdminAccess, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM support_tickets ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tickets', verifySystemToken, async (req, res) => {
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

// Update pipeline operational matrices for tickets
app.put('/api/tickets/:id', verifyAdminAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, priority } = req.body;
        const result = await pool.query(
            `UPDATE support_tickets SET status = COALESCE($1, status), priority = COALESCE($2, priority) WHERE id = $3 RETURNING *`,
            [status, priority, id]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Wipe operational tickets entirely
app.delete('/api/tickets/:id', verifyAdminAccess, async (req, res) => {
    try {
        await pool.query('DELETE FROM support_tickets WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= MODULE 14: MESSAGES HUB (CONTACT FORM LOGISTICS) =================

app.get('/api/messages', verifyAdminAccess, async (req, res) => {
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

app.delete('/api/messages/:id', verifyAdminAccess, async (req, res) => {
    try {
        await pool.query('DELETE FROM messages WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= MODULE 15: APPOINTMENTS & CONSULTATION OPERATIONS =================

app.get('/api/consultations', verifyAdminAccess, async (req, res) => {
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

app.put('/api/consultations/:id', verifyAdminAccess, async (req, res) => {
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

// Remove calendar mapping indices completely
app.delete('/api/consultations/:id', verifyAdminAccess, async (req, res) => {
    try {
        await pool.query('DELETE FROM consultations WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= PROGRESSIVE UPDATE MODULE 16: FILE DELIVERY NETWORK LAYER =================

app.get('/api/file-deliveries', verifyAdminAccess, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM file_deliveries ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/file-deliveries/client/:clientId', verifySystemToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM file_deliveries WHERE client_id = $1 ORDER BY id DESC', [req.params.clientId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/file-deliveries', verifyAdminAccess, uploadLocal.single('attachment'), async (req, res) => {
    try {
        const { order_id, client_id, file_name, file_url, expiry_date, status } = req.body;
        let finalUrl = file_url || '';
        let finalName = file_name || 'Delivery Asset File';
        
        if (req.file) {
            finalUrl = `/uploads/${req.file.filename}`;
            finalName = req.file.originalname;
        }
        
        const result = await pool.query(
            `INSERT INTO file_deliveries (order_id, client_id, file_name, file_url, expiry_date, status)
             VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'available')) RETURNING *`,
            [order_id || null, client_id || null, finalName, finalUrl, expiry_date || null, status]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/file-deliveries/:id', verifyAdminAccess, async (req, res) => {
    try {
        await pool.query('DELETE FROM file_deliveries WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= PROGRESSIVE UPDATE MODULE 17: ADMINISTRATIVE STATISTICS METRICS DASHBOARD ENGINE =================

app.get('/api/admin/stats', verifyAdminAccess, async (req, res) => {
    try {
        const userCount = await pool.query('SELECT COUNT(*) FROM users');
        const orderCount = await pool.query('SELECT COUNT(*) FROM orders');
        const pendingCount = await pool.query("SELECT COUNT(*) FROM orders WHERE status = 'pending'");
        const ticketCount = await pool.query("SELECT COUNT(*) FROM support_tickets WHERE status = 'open'");
        const earningsSum = await pool.query("SELECT SUM(price) FROM orders WHERE payment_status = 'paid'");
        const consultationCount = await pool.query("SELECT COUNT(*) FROM consultations WHERE status = 'pending'");
        
        res.json({
            users: parseInt(userCount.rows[0].count || '0'),
            orders: parseInt(orderCount.rows[0].count || '0'),
            pending_orders: parseInt(pendingCount.rows[0].count || '0'),
            open_tickets: parseInt(ticketCount.rows[0].count || '0'),
            total_earnings: parseFloat(earningsSum.rows[0].sum || '0.00'),
            pending_consultations: parseInt(consultationCount.rows[0].count || '0')
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= ADVANCED QUERY ENGINE =================
const buildAdvancedQuery = (tableName, queryParams, searchableColumns = []) => {
    let { page = 1, limit = 100, sort = 'id', order = 'DESC', search = '', ...filters } = queryParams;
    
    let whereClauses = [`is_deleted = FALSE`]; // Default to hiding soft-deleted records
    let values = [];
    let valueIndex = 1;

    // 1. Handle Search (Full-Text/ILIKE)
    if (search && searchableColumns.length > 0) {
        const searchClauses = searchableColumns.map(col => `${col} ILIKE $${valueIndex}`);
        whereClauses.push(`(${searchClauses.join(' OR ')})`);
        values.push(`%${search}%`);
        valueIndex++;
    }

    // 2. Handle Exact Filters (e.g., status='pending')
    for (const [key, val] of Object.entries(filters)) {
        if (val !== undefined && val !== '') {
            whereClauses.push(`${key} = $${valueIndex}`);
            values.push(val);
            valueIndex++;
        }
    }

    // 3. Construct Final Query
    const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // Safety check for sort/order to prevent SQL injection
    const safeSort = sort.replace(/[^a-zA-Z0-9_]/g, ''); 
    const safeOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const queryString = `SELECT * FROM ${tableName} ${whereString} ORDER BY ${safeSort} ${safeOrder} LIMIT ${parseInt(limit)} OFFSET ${offset}`;
    const countQuery = `SELECT COUNT(*) FROM ${tableName} ${whereString}`;

    return { queryString, countQuery, values };
};
// Upgraded Orders Ledger
app.get('/api/orders', verifyAdminAccess, async (req, res) => {
    try {
        const searchableFields = ['customer_name', 'email', 'phone', 'service', 'invoice_number'];
        const { queryString, countQuery, values } = buildAdvancedQuery('orders', req.query, searchableFields);
        
        const data = await pool.query(queryString, values);
        const countData = await pool.query(countQuery, values);
        
        res.json({
            data: data.rows,
            meta: {
                total: parseInt(countData.rows[0].count),
                page: parseInt(req.query.page || 1),
                limit: parseInt(req.query.limit || 100)
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Universal Soft Delete / Restore
app.put('/api/:table/:id/status', verifyAdminAccess, async (req, res) => {
    const { is_deleted } = req.body;
    try {
        // Simple sanitization for table names
        const table = req.params.table.replace(/[^a-z_]/g, '');
        const result = await pool.query(
            `UPDATE ${table} SET is_deleted = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
            [is_deleted, req.params.id]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Universal Bulk Action Engine
app.post('/api/:table/bulk', verifyAdminAccess, async (req, res) => {
    const { action, ids } = req.body; // action: 'delete', 'restore', 'status_update'
    const table = req.params.table.replace(/[^a-z_]/g, '');
    
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "No IDs provided" });

    try {
        if (action === 'delete') {
            // Soft delete bulk
            await pool.query(`UPDATE ${table} SET is_deleted = TRUE WHERE id = ANY($1::int[])`, [ids]);
        } else if (action === 'hard_delete') {
            await pool.query(`DELETE FROM ${table} WHERE id = ANY($1::int[])`, [ids]);
        }
        res.json({ success: true, message: `Bulk ${action} executed on ${ids.length} records.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// Single Record Fetch Pattern (Apply to all tables)
app.get('/api/:table/:id', verifySystemToken, async (req, res) => {
    const allowedTables = ['users', 'services', 'orders', 'portfolio', 'blog_posts', 'invoices', 'support_tickets']; // Safety whitelist
    if (!allowedTables.includes(req.params.table)) return res.status(403).json({error: "Table access forbidden."});
    
    try {
        const result = await pool.query(`SELECT * FROM ${req.params.table} WHERE id = $1 AND is_deleted = FALSE`, [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({error: "Record not found"});
        res.json(result.rows[0]);
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


















// =========================================================================
// DAN74TECH MEDIA - UNIFIED BACKEND SERVER PLATFORM (server.js)
// =========================================================================

require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const bcrypt = require('bcryptjs'); // Standardized on bcryptjs for broad host compatibility
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const PDFDocument = require('pdfkit');
const Brevo = require('@getbrevo/brevo');

// Initialize Express App Engine (Must be declared before attaching middleware modules)
const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'dan74tech_media_secure_jwt_core_token_secret_key';

// Initialize Neon PostgreSQL Database Engine Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Required for secure cloud communication with Neon
});

// Configure Cloudinary Integration 
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Initialize Brevo Transactional Email Client Framework Engine
let defaultClient = Brevo.ApiClient.instance;
let apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;
const brevoEmailInstance = new Brevo.TransactionalEmailsApi();

// =========================================================================
// MIDDLEWARE CONFIGURATION CORRIDOR
// =========================================================================
app.use(helmet({ contentSecurityPolicy: false })); // Permissive CSP to prevent inline dashboard scripts from breaking
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// Global API Request Rate Limiter Node
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, 
    message: { error: "Too many corporate operational requests from this endpoint, please retry later." }
});
app.use('/api/', globalLimiter);

// Auth Specific Security Rate Limiter
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: "Security threshold reached. Verification authentication requests throttled." }
});
app.use('/api/auth/', authLimiter);

// =========================================================================
// CORE SECURITY MIDDLEWARE FUNCTIONS (Hoisted up to prevent reference loops)
// =========================================================================
const verifySystemToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ error: "Access token validation mapping empty. Unauthorized." });
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Token reference structural compromise detected. Forbidden." });
        req.user = user;
        next();
    });
};

const verifyAdminAccess = (req, res, next) => {
    verifySystemToken(req, res, () => {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ error: "Console Operation Limited to System Administrators Only." });
        }
        next();
    });
};

// =========================================================================
// CORE AUXILIARY DISPATCH EMAIL LOGIC
// =========================================================================
async function sendSystemNotificationEmail(to, subject, text, html) {
    if (!process.env.BREVO_API_KEY || !process.env.EMAIL_USER) {
        console.warn("⚠️ Notification system idling: Credentials missing or empty.");
        return; 
    }
    try {
        const sendSmtpEmail = new Brevo.SendSmtpEmail();
        sendSmtpEmail.subject = subject;
        sendSmtpEmail.htmlContent = html || `<p>${text}</p>`;
        sendSmtpEmail.sender = { name: "DAN74TECH MEDIA", email: process.env.EMAIL_USER };
        sendSmtpEmail.to = [{ email: to }];

        await brevoEmailInstance.sendTransacEmail(sendSmtpEmail);
        console.log(`✉️ System operational update notification dispatched to: ${to}`);
    } catch (err) {
        console.error("❌ Notification Email Dispatch Fault:", err);
    }
}

// =========================================================================
// AUTHENTICATION INFRASTRUCTURE MODULE
// =========================================================================

// User Registration Route Engine
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, role, phone } = req.body;
        const userRole = role || 'client';
        
        const checkUser = await pool.query('SELECT id FROM users WHERE email = $1 AND is_deleted = FALSE', [email]);
        if (checkUser.rows.length > 0) {
            return res.status(400).json({ error: "User registration email conflict detected." });
        }
        
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        const result = await pool.query(
            `INSERT INTO users (name, email, password, role, phone, is_deleted) 
             VALUES ($1, $2, $3, $4, $5, FALSE) 
             RETURNING id, name, email, role, phone`,
            [name, email, hashedPassword, userRole, phone]
        );
        
        const userNode = result.rows[0];
        const accessToken = jwt.sign({ id: userNode.id, email: userNode.email, role: userNode.role }, JWT_SECRET, { expiresIn: '24h' });
        
        await sendSystemNotificationEmail(userNode.email, "Welcome to DAN74TECH MEDIA", `Hello ${userNode.name}, your workspace engine profile setup is successfully validated.`);

        res.json({ success: true, token: accessToken, user: userNode });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// User Login Controller Node (Supports raw legacy check & salt/hash fallback matching frontend schema)
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const result = await pool.query('SELECT * FROM users WHERE email = $1 AND is_deleted = FALSE', [email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, message: "Invalid configuration options submitted" });
        }
        
        const user = result.rows[0];
        let isMatch = false;
        
        if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
            isMatch = await bcrypt.compare(password, user.password);
        } else {
            isMatch = (user.password === password);
        }
        
        if (!isMatch) {
            return res.status(401).json({ success: false, message: "Invalid configuration options submitted" });
        }
        
        const accessToken = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        
        res.json({
            success: true,
            token: accessToken,
            user: { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// DATA CORRIDORS FOR DATA FETCH OPERATIONS (Clean from Soft Deleted rows)
// =========================================================================

app.get('/api/users', verifyAdminAccess, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, name, email, role, phone, created_at FROM users WHERE is_deleted = FALSE ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/orders', verifyAdminAccess, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM orders WHERE is_deleted = FALSE ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/blogs', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM blog_posts WHERE is_deleted = FALSE ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/subscribers', verifyAdminAccess, async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM subscribers WHERE is_deleted = FALSE ORDER BY created_at DESC");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/testimonials', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM testimonials WHERE is_deleted = FALSE ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/consultations', verifyAdminAccess, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM consultations WHERE is_deleted = FALSE ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// ADMIN STATUS AND OPERATIONS CONTROL SYSTEM 
// =========================================================================

// Update Testimonial Approval Status
app.put('/api/testimonials/:id', verifyAdminAccess, async (req, res) => {
    try {
        const { status, is_featured } = req.body;
        const result = await pool.query(
            `UPDATE testimonials 
             SET status = COALESCE($1, status), is_featured = COALESCE($2, is_featured), updated_at = CURRENT_TIMESTAMP 
             WHERE id = $3 RETURNING *`,
            [status, is_featured, req.params.id]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update Consultation Pipelines
app.put('/api/consultations/:id', verifyAdminAccess, async (req, res) => {
    try {
        const { status } = req.body;
        const result = await pool.query(
            `UPDATE consultations SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
            [status, req.params.id]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Dynamic Table Record Soft Deletion Endpoint (Handles Admin table actions clean)
app.delete('/api/users/:id', verifyAdminAccess, async (req, res) => {
    try {
        await pool.query('UPDATE users SET is_deleted = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: "User credentials safely deactivated." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// PRIVATE SEGMENTED MASS EMAIL PIPELINE BROADCASTER (BREVO FOR DISPATCH)
// =========================================================================
app.post('/api/subscribers/broadcast', verifyAdminAccess, async (req, res) => {
  const { subject, message, html } = req.body;

  if (!subject || (!message && !html)) {
    return res.status(400).json({ error: 'Missing subject or content data body parameters.' });
  }

  try {
    // 🔍 SCHEMA ALIGNMENT FIX: Maps exactly to database tracking columns 'status' and 'is_deleted'
    const dbResult = await pool.query("SELECT email FROM subscribers WHERE status = 'active' AND is_deleted = FALSE");
    const subscribers = dbResult.rows.map(row => row.email);

    if (subscribers.length === 0) {
      return res.status(200).json({ sent: 0, failed: 0, message: 'No active subscription lines detected.' });
    }

    const formattedRecipients = subscribers.map(email => ({ email: email }));
    const sendSmtpEmail = new Brevo.SendSmtpEmail();
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = html || `<div style="font-family:sans-serif; line-height:1.6;"><p>${message}</p></div>`;
    
    // Privacy Shield Strategy - Deliver via Blind Carbon Copy (BCC)
    sendSmtpEmail.sender = { name: "DAN74TECH MEDIA", email: process.env.EMAIL_USER };
    sendSmtpEmail.to = [{ email: process.env.EMAIL_USER }]; 
    sendSmtpEmail.bcc = formattedRecipients;               

    const data = await brevoEmailInstance.sendTransacEmail(sendSmtpEmail);
    console.log(`Pipeline broadcast executed. Assigned MessageID Token: ${data.messageId}`);
    
    return res.status(200).json({ sent: subscribers.length, failed: 0 });
  } catch (error) {
    console.error('❌ Broadcast Corridor Fatal Failure:', error);
    return res.status(500).json({ error: 'Transmission deployment crashed.', message: error.message, sent: 0, failed: 1 });
  }
});

// =========================================================================
// BULK OPERATIONS SYSTEM & CATCH-ALL ROUTING PIPES
// =========================================================================

// Bulk operations executor
app.post('/api/:table/bulk', verifyAdminAccess, async (req, res) => {
    const { table } = req.params;
    const { ids, action } = req.body;
    try {
        if (action === 'soft_delete') {
            await pool.query(`UPDATE ${table} SET is_deleted = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = ANY($1::int[])`, [ids]);
        } else if (action === 'hard_delete') {
            await pool.query(`DELETE FROM ${table} WHERE id = ANY($1::int[])`, [ids]);
        }
        res.json({ success: true, message: `Bulk ${action} executed on ${ids.length} records.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Single Record Generic Core Endpoint (Fallback tool for table audits)
app.get('/api/:table/:id', verifySystemToken, async (req, res) => {
    const allowedTables = ['users', 'services', 'orders', 'portfolio', 'blog_posts', 'invoices', 'support_tickets', 'testimonials', 'consultations'];
    if (!allowedTables.includes(req.params.table)) return res.status(403).json({ error: "Table configuration block restricted." });
    
    try {
        const result = await pool.query(`SELECT * FROM ${req.params.table} WHERE id = $1 AND is_deleted = FALSE`, [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: "Record missing from active tracking nodes." });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Baseline health validation index routing check
app.get('/', (req, res) => {
    res.status(200).send('🚀 DAN74TECH MEDIA Production Server Platform Node Is Fully Operational.');
});

// Start Server Engine
app.listen(PORT, () => {
    console.log(`🌐 System Core Online. Framework operational on port parameter: ${PORT}`);
});
      
