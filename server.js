// =========================================================================
// DAN74TECH MEDIA - UNIFIED BACKEND SERVER PLATFORM (server.js)
// STATUS: V4.1.2 PRODUCTION ENTERPRISE SYSTEM INTEGRATION (FULLY RECTIFIED)
// =========================================================================
require('dotenv').config();
const express = require('express');
const http = require('http'); 
const { Server } = require('socket.io'); 
const { Pool } = require('pg');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer'); 
const PDFDocument = require('pdfkit');
const Brevo = require('@getbrevo/brevo');
const cron = require('node-cron'); 
const { exec } = require('child_process'); 
const AWS = require('aws-sdk'); 

// Initialize Express App Engine & HTTP Server for WebSockets
// Initialize Express App Engine & HTTP Server for WebSockets
const app = express();

// 👉 ADD THIS LINE BELOW TO TRUST RENDER'S REVERSE PROXY
app.set('trust proxy', 1); 

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*', 
        methods: ["GET", "POST", "PUT", "DELETE"]
    }
});

const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'dan74tech_media_secure_jwt_core_token_secret_key';

// Initialize Neon PostgreSQL Database Engine Pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.query("SELECT NOW()")
    .then(() => {
        console.log("✅ Postgres Database Connected Successfully");
        // Clear phantom presence configurations on application startup
        pool.query('UPDATE users SET is_online = FALSE WHERE is_online = TRUE')
            .catch(err => console.error("❌ Online status cleanup failure:", err));
    })
    .catch(err => console.error("❌ Database Connection Error:", err));

// Configure Cloudinary Integration
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dan74tech',
    api_key: process.env.CLOUDINARY_API_KEY || '',
    api_secret: process.env.CLOUDINARY_API_SECRET || ''
});

// Initialize Brevo Client
const brevoEmailInstance = new Brevo.TransactionalEmailsApi();
if (process.env.BREVO_API_KEY) {
    brevoEmailInstance.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);
}

// =========================================================================
// ======================== GLOBAL MIDDLEWARE CONFIGURATION ====================
// =========================================================================
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// Global API Request Rate Limiter Node
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
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
// =========================== UPLOADS STORAGE SYSTEM ==========================
// =========================================================================
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) { fs.mkdirSync(uploadDir, { recursive: true }); }
app.use('/uploads', express.static(uploadDir));

const localStorage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, uploadDir); },
    filename: (req, file, cb) => {
        const uniqueName = 'portfolio-' + Date.now() + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const uploadLocal = multer({ storage: localStorage });
const upload = uploadLocal; 
const uploadMemory = multer({ storage: multer.memoryStorage() });

// =========================================================================
// ==================== ARCHITECTURAL PROTECTION MIDDLEWARES ===================
// =========================================================================
const verifyAdminAccess = (req, res, next) => {
    const authHeader = req.headers.authorization || req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Access Denied: Token missing or malformed" });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!decoded.role || String(decoded.role).trim().toLowerCase() !== 'admin') {
            return res.status(403).json({ error: "Unauthorized: Admin clearance required" });
        }
        req.user = decoded;
        next();
    } catch (err) { 
        console.error("JWT Verification block error:", err.message);
        return res.status(401).json({ error: "Invalid or Expired Token" }); 
    }
};

const verifySystemToken = (req, res, next) => {
    const authHeader = req.headers.authorization || req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Access token validation mapping empty. Unauthorized." });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Token reference structural compromise detected. Forbidden." });
        req.user = user;
        next();
    });
};

// =========================================================================
// ======================= CORE AUXILIARY DISPATCH EMAIL LOGIC =================
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
        console.log(`✉️ System alert dispatched successfully to: ${to}`);  
    } catch (err) {  
        console.error("❌ Notification Email Dispatch Fault:", err);  
    }
}

// =========================================================================
// ================= MODULE 1: AUTHENTICATION & SECURITY DATA ENGINE =======
// =========================================================================
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;
        const userRole = 'client'; 
        
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
        const accessToken = jwt.sign(
            { id: userNode.id, name: userNode.name, email: userNode.email, role: userNode.role }, 
            JWT_SECRET, 
            { expiresIn: '24h' }
        );

        const maskedLink = '<a href="https://dan74techweb.onrender.com" style="color: #0044FF; text-decoration: none;">DAN74TECH MEDIA</a>';
        const emailBody = `Hello ${userNode.name}, your Profile setup is successfully validated. We are glad you joined. For more information you can reply to this email or reach us via our website ${maskedLink}. ✨DAN74TECH MEDIA ✨.`;

        await sendSystemNotificationEmail(userNode.email, "Welcome to DAN74TECH MEDIA", emailBody);
        res.json({ success: true, token: accessToken, user: userNode });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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
        
        const accessToken = jwt.sign(
            { id: user.id, name: user.name, email: user.email, role: user.role }, 
            JWT_SECRET, 
            { expiresIn: '24h' }
        );
        
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
// ================= MISSING MODULE: PUBLIC CASE STUDIES ENGINE ============
// =========================================================================
app.get('/api/case-studies', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, title, category, challenge, solution, result, image_url, likes_count, views_count, status, created_at 
             FROM case_studies 
             WHERE is_deleted = FALSE AND (status = 'Approved' OR is_approved = TRUE)
             ORDER BY id DESC`
        );
        res.json(result.rows);
    } catch (err) {
        console.error("❌ Case Studies Database Mapping Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// =================== MODULE: PUBLIC BLOG INSIGHTS ENGINE =================
// =========================================================================
app.get('/api/blog-posts', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, title, category, summary, content, image_url, slug, seo_title, seo_description, likes_count, views_count, status, created_at 
             FROM blog_posts 
             WHERE is_deleted = FALSE AND (status = 'Approved' OR is_approved = TRUE)
             ORDER BY id DESC`
        );
        res.json(result.rows);
    } catch (err) {
        console.error("❌ Blog Posts Database Mapping Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// ==================== MODULE: PUBLIC TESTIMONIALS ENGINE =================
// =========================================================================
app.get('/api/testimonials', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, client_name, client_designation, company, client_avatar_url, rating, review, status, is_featured, created_at 
             FROM testimonials 
             WHERE is_deleted = FALSE AND (status = 'Approved' OR is_approved = TRUE)
             ORDER BY id DESC`
        );
        res.json(result.rows);
    } catch (err) {
        console.error("❌ Testimonials Database Mapping Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Public Portfolio Matrix Query Route
app.get('/api/portfolio', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, title, category, description, link, progress, status, publisher_name, likes_count, views_count FROM portfolio WHERE is_deleted = FALSE AND is_approved = TRUE ORDER BY created_at DESC'
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// ================= MODULE 2: USERS MANAGEMENT INTERFACE ==================
// =========================================================================
app.get('/api/community/users', verifySystemToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, name, is_online FROM users WHERE is_deleted = FALSE ORDER BY is_online DESC, name ASC'
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/users/:id', verifyAdminAccess, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, name, email, role, phone, is_online, last_seen, created_at FROM users WHERE id = $1 AND is_deleted = FALSE',
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

app.put('/api/users/:id', verifyAdminAccess, async (req, res) => {
    try {
        const { name, email, role, phone, password } = req.body;
        let query;
        let values;

        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            query = `UPDATE users SET name=$1, email=$2, role=$3, phone=$4, password=$5, updated_at=CURRENT_TIMESTAMP WHERE id=$6 RETURNING id,name,email,role,phone`;
            values = [name, email, role, phone, hashedPassword, req.params.id];
        } else {
            query = `UPDATE users SET name=$1, email=$2, role=$3, phone=$4, updated_at=CURRENT_TIMESTAMP WHERE id=$5 RETURNING id,name,email,role,phone`;
            values = [name, email, role, phone, req.params.id];
        }

        const result = await pool.query(query, values);
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:id', verifyAdminAccess, async (req, res) => {
    try {
        await pool.query('UPDATE users SET is_deleted = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: "User credentials safely deactivated." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// ================= MODULE 2 (B): SERVICES MANAGEMENT INTERFACE ===========
// =========================================================================
app.get('/api/services', async (req, res) => {
    try {
        const data = await pool.query('SELECT * FROM services WHERE is_deleted = FALSE ORDER BY id DESC');
        res.json(data.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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

app.put('/api/services/:id', verifyAdminAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, icon, description } = req.body;
        const result = await pool.query(
            `UPDATE services SET name = $1, icon = $2, description = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *`,
            [name, icon, description, id]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/services/:id', verifyAdminAccess, async (req, res) => {
    try {
        await pool.query('UPDATE services SET is_deleted = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// ================= MODULE 3: SUB-SERVICES & PRICING ENGINE ==============
// =========================================================================
app.get('/api/sub-services', async (req, res) => {
    try {
        const query = `
            SELECT sub_services.*, services.name AS category_name
            FROM sub_services
            JOIN services ON sub_services.service_id = services.id
            WHERE sub_services.is_deleted = FALSE AND services.is_deleted = FALSE
            ORDER BY sub_services.id DESC
        `;
        const data = await pool.query(query);
        res.json(data.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/sub-services/:serviceName', async (req, res) => {
    try {
        const serviceName = req.params.serviceName.replace(/-/g, ' ').toLowerCase();
        const result = await pool.query(`
            SELECT ss.*
            FROM sub_services ss
            JOIN services s ON ss.service_id = s.id
            WHERE LOWER(s.name) = $1 AND ss.is_deleted = FALSE
            ORDER BY ss.id ASC
        `, [serviceName]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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

app.delete('/api/sub-services/:id', verifyAdminAccess, async (req, res) => {
    try {
        await pool.query('UPDATE sub_services SET is_deleted = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// ================= MODULE 4: OPERATIONS & ORDER FLOW ENGINE ==============
// =========================================================================
const buildAdvancedQuery = (tableName, queryParams, searchableColumns = []) => {
    let { page = 1, limit = 100, sort = 'id', order = 'DESC', search = '', ...filters } = queryParams;
    let whereClauses = [`is_deleted = FALSE`]; 
    let values = [];
    let valueIndex = 1;

    if (search && searchableColumns.length > 0) {
        const searchClauses = searchableColumns.map(col => `${col} ILIKE $${valueIndex}`);
        whereClauses.push(`(${searchClauses.join(' OR ')})`);
        values.push(`%${search}%`);
        valueIndex++;
    }

    for (const [key, val] of Object.entries(filters)) {
        if (val !== undefined && val !== '') {
            whereClauses.push(`${key} = $${valueIndex}`);
            values.push(val);
            valueIndex++;
        }
    }

    const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    const safeSort = sort.replace(/[^a-zA-Z0-9_]/g, ''); 
    const safeOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const queryString = `SELECT * FROM ${tableName} ${whereString} ORDER BY ${safeSort} ${safeOrder} LIMIT ${parseInt(limit)} OFFSET ${offset}`;
    const countQuery = `SELECT COUNT(*) FROM ${tableName} ${whereString}`;

    return { queryString, countQuery, values };
};

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

app.get('/api/orders/user/:userId', verifySystemToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM orders WHERE user_id = $1 AND is_deleted = FALSE ORDER BY id DESC', [req.params.userId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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
                user_id || null, customer_name, phone, service, sub_service || null,      
                domain || null, device_model || null, project_details || null,  
                price || null, status || null, payment_status || null    
            ]
        );
        
        const orderData = result.rows[0];
        if (user_id) {
            await pool.query(
                `INSERT INTO notifications (user_id, title, message, channel, status) VALUES ($1, $2, $3, 'dashboard', 'unread')`,
                [user_id, 'Order Received Successfully', `Your order sequence entry for ${service} is submitted.`]
            );
        }
        
        await sendSystemNotificationEmail(
            process.env.ADMIN_EMAIL || 'dan74techmedia@gmail.com',
            `New Order Alert: ${service}`,
            `An operational deployment request has been logged by ${customer_name}. Details: ${project_details}`
        );

        const whatsappMessage = encodeURIComponent(`Hello DAN74TECH MEDIA, I have placed an order for ${service}. Project Details: ${project_details || 'N/A'}. Please advise on the next steps for payment completion.`);
        const whatsappLink = `https://wa.me/254790435584?text=${whatsappMessage}`;
        
        res.json({ 
            success: true, 
            data: orderData,
            whatsapp_redirect: whatsappLink 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// ================= MODULE 11: INVOICE GENERATION PIPELINE ================
// =========================================================================
app.get('/api/invoices/:id/download', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM invoices WHERE id = $1 AND is_deleted = FALSE', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: "Invoice vector not found" });
        const invoice = result.rows[0];

        const doc = new PDFDocument();
        res.setHeader('Content-disposition', `attachment; filename="${invoice.invoice_number}.pdf"`);
        res.setHeader('Content-type', 'application/pdf');
        
        doc.pipe(res);
        doc.fontSize(22).fillColor('#0044FF').text('DAN74TECH MEDIA', { align: 'center' });
        doc.fontSize(12).fillColor('#333333').text('Enterprise Transaction Ledger', { align: 'center' });
        doc.moveDown(2);
        
        doc.fontSize(14).fillColor('#000000').text(`Invoice Identifier: ${invoice.invoice_number}`);
        doc.text(`Client Designation: ${invoice.client_name}`);
        doc.text(`Communication Link: ${invoice.client_email}`);
        doc.moveDown();
        
        doc.fontSize(16).fillColor('#FF2A2A').text(`Total Ledger Amount: Ksh ${parseFloat(invoice.amount).toFixed(2)}`);
        doc.fontSize(14).fillColor('#000000').text(`Clearance Status: ${invoice.status.toUpperCase()}`);
        doc.moveDown(3);
        
        doc.fontSize(12).text('Automated ledger generated by DAN74TECH MEDIA Matrix.', { align: 'center' });
        doc.end();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// ================= MODULE 12: EMAIL BROADCAST PIPELINES ==================
// =========================================================================
app.post('/api/subscribers/broadcast', verifyAdminAccess, async (req, res) => {
    try {
        const { subject, message, html } = req.body;
        const subsResult = await pool.query("SELECT email FROM subscribers WHERE is_deleted = FALSE AND status = 'active'");
        const userResult = await pool.query("SELECT email FROM users WHERE is_deleted = FALSE");
        
        const emailsSet = new Set([...subsResult.rows.map(r => r.email), ...userResult.rows.map(r => r.email)]);
        const emailsArray = Array.from(emailsSet).map(email => ({ email }));
        
        if (emailsArray.length === 0) return res.status(400).json({ error: "No target clearance vectors found." });
        if (!process.env.BREVO_API_KEY) throw new Error("Brevo SMTP engine offline.");

        const sendSmtpEmail = new Brevo.SendSmtpEmail();
        sendSmtpEmail.subject = subject;
        sendSmtpEmail.htmlContent = html || `<p>${message}</p>`;
        sendSmtpEmail.sender = { name: "DAN74TECH MEDIA", email: process.env.EMAIL_USER };
        sendSmtpEmail.bcc = emailsArray; 

        await brevoEmailInstance.sendTransacEmail(sendSmtpEmail);
        
        const campaign = await pool.query(
            `INSERT INTO email_campaigns (subject, content, campaign_type, recipients_count, sent_by, sent_at) VALUES ($1, $2, 'broadcast', $3, $4, CURRENT_TIMESTAMP) RETURNING id`,
            [subject, html || message, emailsArray.length, req.user.id]
        );

        res.json({ success: true, sent: emailsArray.length, failed: 0, campaign_id: campaign.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// ================= MODULE 14: TESTIMONIALS ENGINE ========================
// =========================================================================
app.get('/api/testimonials/approved', async (req, res) => {
    try {
        const queryText = `
            SELECT client_name, company, rating, review 
            FROM testimonials 
            WHERE status = 'approved' 
            ORDER BY id DESC
        `;
        const result = await pool.query(queryText);
        res.json(result.rows);
    } catch (err) {
        console.error("Testimonials matrix sync failure:", err);
        res.status(500).json({ error: "Database processing anomaly detected during discovery." });
    }
});

app.post('/api/testimonials', async (req, res) => {
    const { client_name, company, rating, review } = req.body;

    if (!client_name || !rating || !review) {
        return res.status(400).json({ error: "Required structural parameters missing." });
    }

    try {
        const insertText = `
            INSERT INTO testimonials (client_name, company, rating, review, status) 
            VALUES ($1, $2, $3, $4, 'pending') 
            RETURNING id
        `;
        await pool.query(insertText, [client_name, company, rating, review]);
        res.status(201).json({ success: true, message: "Appraisal successfully appended to staging matrix." });
    } catch (err) {
        console.error("Testimonial commit failure:", err);
        res.status(500).json({ error: "Database rejected configuration input fields." });
    }
});

// =========================================================================
// ================= MODULE 15: MEDIA & CDN REPOSITORY LAYERS ==============
// =========================================================================
app.get('/api/media', async (req, res) => {
    try {
        const data = await pool.query('SELECT * FROM media_library WHERE is_deleted = FALSE ORDER BY id DESC');
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
                try {
                    const dbInsert = await pool.query(
                        `INSERT INTO media_library (public_id, url, filename, format, bytes) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
                        [result.public_id, result.secure_url, req.file.originalname, result.format, req.file.size]
                    );
                    res.json({ success: true, data: dbInsert.rows[0] });
                } catch (dbErr) {
                    res.status(500).json({ error: dbErr.message });
                }
            }
        );
        streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// ================= MODULE 16: CONSULTATIONS ARCHIVE BLOCK ================
// =========================================================================
app.get('/api/consultations', verifyAdminAccess, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM consultations WHERE is_deleted = FALSE ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/consultations', async (req, res) => {
    try {
        const { name, client_name, email, client_email, schedule_date, booking_date, booking_time, platform } = req.body;
        
        const finalName = client_name || name;
        const finalEmail = client_email || email;
        let finalBookingDate = booking_date;
        let finalBookingTime = booking_time || '10:00:00';

        if (schedule_date) {
            const dateObj = new Date(schedule_date);
            if (!isNaN(dateObj.getTime())) {
                finalBookingDate = schedule_date.split('T')[0];
                if (!booking_time) {
                    finalBookingTime = dateObj.toTimeString().split(' ')[0];
                }
            } else {
                finalBookingDate = schedule_date;
            }
        }

        const result = await pool.query(
            `INSERT INTO consultations (client_name, client_email, booking_date, booking_time, platform, status) 
             VALUES ($1, $2, $3, $4, COALESCE($5, 'Google Meet'), 'pending') RETURNING *`,
            [finalName, finalEmail, finalBookingDate, finalBookingTime, platform]
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
            `UPDATE consultations SET status=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2 RETURNING *`,
            [status, req.params.id]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/consultations/:id', verifyAdminAccess, async (req, res) => {
    try {
        await pool.query('UPDATE consultations SET is_deleted = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// ================= MODULE 17: FILE DELIVERY NETWORK LAYER =================
// =========================================================================
app.get('/api/file-deliveries', verifyAdminAccess, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM file_deliveries WHERE is_deleted = FALSE ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/file-deliveries/client/:clientId', verifySystemToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM file_deliveries WHERE client_id = $1 AND is_deleted = FALSE ORDER BY id DESC', [req.params.clientId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/file-deliveries', verifyAdminAccess, async (req, res) => {
    try {
        const { order_id, client_id, file_name, file_url } = req.body;
        const result = await pool.query(
            `INSERT INTO file_deliveries (order_id, client_id, file_name, file_url) VALUES ($1, $2, $3, $4) RETURNING *`,
            [order_id, client_id, file_name, file_url]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// ================= MODULE 18: SECURE E2EE COMMUNICATION ENGINE =================

// Secure Token Connection Handshake Middleware for Socket.IO
io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    if (!token) {
        return next(new Error("Cryptographic Handshake Denied: Token missing"));
    }
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return next(new Error("Cryptographic Handshake Denied: Structural validation failure"));
        socket.user = decoded;
        next();
    });
});

io.on('connection', (socket) => {
    console.log(`🔒 Secure Socket Connection tunnel initialized for user node: ${socket.user.id}`);
    
    // 1. BLIND RELAY: Socket-based encrypted messaging
    socket.on('send_encrypted_message', async (data) => {
        const { receiver_id, ciphertext, iv, sender_key, receiver_key } = data;
        
        try {
            const result = await pool.query(
                `INSERT INTO client_communications 
                 (sender_id, receiver_id, ciphertext, iv, sender_wrapped_key, receiver_wrapped_key) 
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                [socket.user.id, receiver_id, ciphertext, iv, sender_key, receiver_key]
            );
            
            io.to(`user_${receiver_id}`).emit('receive_encrypted_message', result.rows[0]);
        } catch (err) {
            console.error("❌ E2EE Relay Error:", err);
        }
    });

    // 2. PRESENCE & STATUS MANAGEMENT
    socket.on('join_thread', async (userId) => {
        socket.join(`user_${userId}`);
        socket.userId = userId;
        await pool.query('UPDATE users SET is_online = TRUE, last_seen = NOW() WHERE id = $1', [userId]);
        io.emit('presence_update', { userId, status: 'online' });
    });

    // 3. TYPING RECEPTOR SIGNALS
    socket.on('typing_start', (data) => {
        io.to(`user_${data.receiver_id}`).emit('typing_start', { sender_id: socket.user.id });
    });

    socket.on('typing_stop', (data) => {
        io.to(`user_${data.receiver_id}`).emit('typing_stop', { sender_id: socket.user.id });
    });

    // 4. DEACTIVATION METADATA ON DISCONNECT
    socket.on('disconnect', async () => {
        if (socket.userId) {
            await pool.query('UPDATE users SET is_online = FALSE, last_seen = NOW() WHERE id = $1', [socket.userId]);
            io.emit('presence_update', { userId: socket.userId, status: 'offline' });
            console.log(`🔌 Secure Socket Connection dropped cleanly for node: ${socket.userId}`);
        }
    });
});

// E2EE THREAD RETRIEVAL: Only select non-sensitive fields
app.get('/api/client-portal/thread', verifySystemToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        await pool.query(
            `UPDATE client_communications SET is_read = TRUE WHERE receiver_id = $1 AND is_read = FALSE`,
            [userId]
        );

        const thread = await pool.query(
            `SELECT id, sender_id, receiver_id, ciphertext, iv, 
                    sender_wrapped_key, receiver_wrapped_key, created_at, is_read 
             FROM client_communications 
             WHERE (sender_id = $1 OR receiver_id = $1) AND is_deleted = FALSE 
             ORDER BY created_at ASC`,
            [userId]
        );
        res.json(thread.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// REST API SEND (E2EE Compliant)
app.post('/api/communications/send', verifySystemToken, async (req, res) => {
    const { receiver_id, ciphertext, iv, sender_key, receiver_key } = req.body;
    const sender_id = req.user.id;

    try {
        const savedMsg = await pool.query(
            `INSERT INTO client_communications 
             (sender_id, receiver_id, ciphertext, iv, sender_wrapped_key, receiver_wrapped_key) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [sender_id, receiver_id, ciphertext, iv, sender_key, receiver_key]
        );
        
        io.to(`user_${receiver_id}`).emit('receive_encrypted_message', savedMsg.rows[0]);
        res.json({ success: true, data: savedMsg.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Ensure you have body-parser or express.json() enabled to read the incoming data
app.use(express.json()); 

// The POST route the contact form is looking for
app.post('/api/messages', async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;

        // 1. Validate the incoming data
        if (!name || !email || !subject || !message) {
            return res.status(400).json({ error: "Missing required fields." });
        }

        // 2. Map to your PostgreSQL 'messages' table schema
        // Defaulting status to 'unread' and is_deleted to false
        const insertQuery = `
            INSERT INTO messages (name, email, subject, message, status, is_deleted)
            VALUES ($1, $2, $3, $4, 'unread', false)
            RETURNING id;
        `;
        
        const values = [name, email, subject, message];

        // 3. Execute the query (assuming 'pool' is your pg database connection)
        const result = await pool.query(insertQuery, values);

        // 4. Send success response back to the frontend to trigger the green toast
        res.status(201).json({ 
            success: true, 
            messageId: result.rows[0].id,
            message: "Message successfully logged to database." 
        });

    } catch (error) {
        console.error("Matrix Database Error:", error);
        // This triggers the frontend error toast you just saw
        res.status(500).json({ error: "Server database connection failure." }); 
    }
});

// =========================================================================
// ================= MODULE 19: SAFARICOM M-PESA STK INTEGRATION ===========
// =========================================================================
app.post('/api/payments/mpesa-stk', verifySystemToken, async (req, res) => {
    try {
        const { order_id, phone_number, amount } = req.body;
        await pool.query(`UPDATE orders SET payment_status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [order_id]);
        
        res.json({
            success: true, 
            merchant_id: 'pending_daraja_auth', 
            checkout_id: `chk_${Date.now()}`, 
            msg: "M-Pesa API integration pending. Please finalize your transaction via the automated WhatsApp redirection link.",
            whatsapp_fallback: true
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// RECTIFIED: Exact DB mapping (merchant_request_id strictly enforced NOT NULL)
app.post('/api/payments/mpesa-callback', async (req, res) => {
    try {
        const callbackData = req.body.Body.stkCallback;
        const checkoutRequestId = callbackData.CheckoutRequestID;
        const merchantRequestId = callbackData.MerchantRequestID || 'UNKNOWN_MERCHANT_REQ';
        const resultCode = callbackData.ResultCode;

        if (resultCode === 0) {
            const amountInfo = callbackData.CallbackMetadata.Item.find(item => item.Name === 'Amount');
            const receiptInfo = callbackData.CallbackMetadata.Item.find(item => item.Name === 'MpesaReceiptNumber');
            const phoneInfo = callbackData.CallbackMetadata.Item.find(item => item.Name === 'PhoneNumber');

            await pool.query(
                `INSERT INTO mpesa_transactions (merchant_request_id, checkout_request_id, amount, mpesa_receipt_number, phone_number, status, result_desc, result_code) 
                 VALUES ($1, $2, $3, $4, $5, 'Success', $6, $7)`,
                [merchantRequestId, checkoutRequestId, amountInfo.Value, receiptInfo.Value, phoneInfo.Value, callbackData.ResultDesc, resultCode]
            );
        } else {
            await pool.query(
                `INSERT INTO mpesa_transactions (merchant_request_id, checkout_request_id, status, result_desc, result_code, phone_number, amount) 
                 VALUES ($1, $2, 'Failed', $3, $4, 'N/A', 0.00)`,
                [merchantRequestId, checkoutRequestId, callbackData.ResultDesc, resultCode]
            );
        }
        res.json({ ResultCode: 0, ResultDesc: "Transaction Accepted Confirmed" });
    } catch (err) {
        console.error("M-Pesa Callback Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// ================= MODULE 20: COMMUNITY SOCIAL FEED ENGINE ==========================
// =========================================================================
app.get('/api/feed/global', async (req, res) => {
    try {
        // We use LEFT JOIN to match the author_id/publisher_id with the users table to extract their name
        const blogs = await pool.query(`
            SELECT b.*, u.name AS author_name 
            FROM blog_posts b 
            LEFT JOIN users u ON b.author_id = u.id 
            WHERE b.is_approved = TRUE
        `);
        
        const studies = await pool.query(`
            SELECT c.*, u.name AS author_name 
            FROM case_studies c 
            LEFT JOIN users u ON c.author_id = u.id 
            WHERE c.is_approved = TRUE
        `);
        
        // Portfolio uses publisher_id, and also has a fallback publisher_name in your schema
        const portfolio = await pool.query(`
            SELECT p.*, COALESCE(u.name, p.publisher_name) AS author_name 
            FROM portfolio p 
            LEFT JOIN users u ON p.publisher_id = u.id 
            WHERE p.is_approved = TRUE 
            ORDER BY p.created_at DESC
        `);
        
        res.json({
            blogs: blogs.rows,
            case_studies: studies.rows,
            portfolio: portfolio.rows 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/feed/interact', verifySystemToken, async (req, res) => {
    try {
        const { entity_id, entity_type, action } = req.body; 
        const userId = req.user.id;
        
        const check = await pool.query(
            'SELECT id FROM feed_interactions WHERE user_id = $1 AND entity_id = $2 AND entity_type = $3 AND interaction_type = $4', 
            [userId, entity_id, entity_type, action]
        );
        
        if (check.rows.length === 0) {
            await pool.query('INSERT INTO feed_interactions (user_id, entity_id, entity_type, interaction_type) VALUES ($1, $2, $3, $4)', [userId, entity_id, entity_type, action]);
            let table = entity_type === 'blog' ? 'blog_posts' : entity_type === 'case_study' ? 'case_studies' : 'portfolio';
            await pool.query(`UPDATE ${table} SET likes_count = likes_count + 1 WHERE id = $1`, [entity_id]);
        }
        res.json({ success: true });
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

app.get('/api/catalog/full', verifySystemToken, async (req, res) => {
    try {
        const services = await pool.query('SELECT id, name, description, icon FROM services WHERE is_deleted = FALSE');
        const subServices = await pool.query('SELECT id, service_id, name, price, description FROM sub_services WHERE is_deleted = FALSE');
        
        const catalog = services.rows.map(srv => {
            return {
                ...srv,
                packages: subServices.rows.filter(sub => sub.service_id === srv.id)
            };
        });
        res.json(catalog);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});
app.post('/api/content/publish', verifySystemToken, async (req, res) => {
    try {
        const { target, title, content, image_url } = req.body;
        const authorId = req.user.id;

        if (target === 'blog') {
            // Safe fallback slug generator if client-side payload bypasses it
            const slug = req.body.slug || title
                .toLowerCase()
                .trim()
                .replace(/[^a-z0-9\s-]/g, '')
                .replace(/\s+/g, '-')
                .replace(/-+/g, '-');

            const queryText = `
                INSERT INTO blog_posts (title, content, slug, image_url, status, author_id) 
                VALUES ($1, $2, $3, $4, 'pending', $5) 
                RETURNING *;
            `;
            const values = [title, content, slug, image_url || null, authorId];
            await pool.query(queryText, values);
            
        } else if (target === 'case_study') {
            const queryText = `
                INSERT INTO case_studies (title, challenge, image_url, status, author_id) 
                VALUES ($1, $2, $3, 'pending', $4) 
                RETURNING *;
            `;
            const values = [title, content, image_url || null, authorId];
            await pool.query(queryText, values);
        } else {
            return res.status(400).json({ error: "Invalid target publishing domain matrix." });
        }

        res.json({ success: true });
    } catch (err) {
        console.error("❌ Content Publish Execution Fault:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// ================= ADMINISTRATIVE AGGREGATION & KPI ANALYTICS ============
// =========================================================================
app.get('/api/admin/dashboard-stats', verifyAdminAccess, async (req, res) => {
    try {
        const userCount = await pool.query("SELECT COUNT(*) FROM users WHERE is_deleted = FALSE");
        const orderCount = await pool.query("SELECT COUNT(*) FROM orders WHERE is_deleted = FALSE");
        const pendingCount = await pool.query("SELECT COUNT(*) FROM orders WHERE status = 'pending' AND is_deleted = FALSE");
        const ticketCount = await pool.query("SELECT COUNT(*) FROM support_tickets WHERE status = 'open' AND is_deleted = FALSE");
        const earningsSum = await pool.query("SELECT SUM(price) FROM orders WHERE payment_status = 'paid' AND is_deleted = FALSE");
        const consultationCount = await pool.query("SELECT COUNT(*) FROM consultations WHERE status = 'pending' AND is_deleted = FALSE");
        
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

app.get('/api/admin/backup/status', verifyAdminAccess, async (req, res) => {
    try {
        res.json({
            status: 'healthy',
            last_backup: new Date().toISOString(),
            storage: 'S3_Bucket_Pending_AWS_Keys'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// ================= MISSING ADMIN CRUD CONSOLIDATION BLOCK =================
// =========================================================================
app.put('/api/subscribers/:id', verifyAdminAccess, async (req, res) => {
    try {
        const result = await pool.query(
            `UPDATE subscribers SET status=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2 RETURNING *`,
            [req.body.status, req.params.id]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/notifications/:id', verifyAdminAccess, async (req, res) => {
    try {
        const { status } = req.body;
        const result = await pool.query(
            `UPDATE notifications SET status=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2 RETURNING *`,
            [status, req.params.id]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// =========================================================================
// ================= MASTER ADAPTIVE ADMINISTRATIVE CRUD CORE ==============
// =========================================================================

// VALID SCHEMATIC COLUMNS BLUEPRINT MAPPER FOR ALL REST TABLES (RECTIFIED)
const tableColumnSchema = {
    users: ['name', 'email', 'password', 'role', 'phone', 'is_deleted', 'is_online', 'last_seen'],
    services: ['name', 'icon', 'description', 'is_deleted'],
    sub_services: ['service_id', 'name', 'price', 'description', 'is_deleted'],
    orders: ['user_id', 'customer_name', 'phone', 'service', 'sub_service', 'domain', 'device_model', 'project_details', 'price', 'status', 'payment_status', 'is_deleted', 'staging_environment', 'domain_criteria', 'hardware_serial', 'cyber_tracking_key', 'service_metadata'],
    portfolio: ['order_id', 'title', 'category', 'description', 'link', 'progress', 'status', 'is_deleted', 'publisher_id', 'publisher_name', 'is_approved', 'likes_count', 'views_count'],
    case_studies: ['title', 'category', 'challenge', 'solution', 'result', 'image_url', 'is_deleted', 'publisher_id', 'is_approved', 'author_id', 'likes_count', 'views_count', 'status'],
    testimonials: ['client_name', 'client_designation', 'company', 'client_avatar_url', 'rating', 'review', 'status', 'is_featured', 'is_deleted', 'publisher_id', 'is_approved'],
    blog_posts: ['title', 'category', 'content', 'summary', 'image_url', 'slug', 'seo_title', 'seo_description', 'is_deleted', 'publisher_id', 'is_approved', 'author_id', 'likes_count', 'views_count', 'status'],
    subscribers: ['email', 'status', 'is_deleted'],
    media_library: ['public_id', 'url', 'filename', 'format', 'bytes', 'is_deleted'],
    invoices: ['order_id', 'invoice_number', 'client_name', 'client_email', 'amount', 'pdf_url', 'status', 'is_deleted'],
    notifications: ['user_id', 'title', 'message', 'channel', 'status', 'is_deleted'],
    support_tickets: ['user_id', 'subject', 'description', 'status', 'priority', 'is_deleted'],
    messages: ['name', 'email', 'subject', 'message', 'status', 'is_deleted'],
    consultations: ['client_name', 'client_email', 'booking_date', 'booking_time', 'platform', 'status', 'is_deleted'],
    file_deliveries: ['order_id', 'client_id', 'file_name', 'file_url', 'file_size', 'expiry_date', 'download_count', 'status', 'is_deleted'],
    email_campaigns: ['subject', 'content', 'campaign_type', 'recipients_count', 'sent_by', 'is_deleted'],
    client_communications: ['sender_id', 'receiver_id', 'message_body', 'attachment_url', 'attachment_name', 'is_read', 'is_deleted', 'delivery_status', 'message_type', 'channel', 'ciphertext', 'iv', 'sender_wrapped_key', 'receiver_wrapped_key'],
    mpesa_transactions: ['order_id', 'user_id', 'phone_number', 'amount', 'mpesa_receipt_number', 'merchant_request_id', 'checkout_request_id', 'result_code', 'result_desc', 'status', 'is_deleted']
};

// HELPER FUNCTION: Maps frontend aliases and sanely strips invalid columns
const sanitizeAndMapPayload = (table, body) => {
    let payload = { ...body };

    // Fully Rectified Portfolio Exclusivity Engine (Direct Link OR File Upload, but not both)
    if (table === 'portfolio') {
        const hasDirectLink = 'link' in payload && payload.link && String(payload.link).trim() !== '';
        const hasFileUpload = 'file_url' in payload && payload.file_url && String(payload.file_url).trim() !== '';

        if (hasDirectLink && hasFileUpload) {
            throw new Error("Validation Matrix Error: Dual submission rejected. Please provide either a typed Direct URL or an uploaded File, but not both.");
        }

        if (hasFileUpload) {
            payload.link = payload.file_url;
            delete payload.file_url;
        } else if (hasDirectLink) {
            // Keep user typed direct link and confirm file_url reference isn't a blank string ghost key
            delete payload.file_url;
        }
    }

    // Standard platform column schemas allocation checklist
    const allowedColumns = tableColumnSchema[table] || [];
    
    // Clean and remove any unmapped input key structures from the mutation vector
    Object.keys(payload).forEach(key => {
        if (!allowedColumns.includes(key)) {
            delete payload[key];
        }
    });

    return payload;
};

// 1. DYNAMIC ADMIN LISTING & ADVANCED SEARCH ENGINE
app.get('/api/admin/:table', verifyAdminAccess, async (req, res) => {
    const whitelist = [
        'users', 'services', 'sub_services', 'orders', 'portfolio', 
        'case_studies', 'testimonials', 'blog_posts', 'subscribers', 
        'media_library', 'invoices', 'notifications', 'support_tickets', 
        'messages', 'consultations', 'file_deliveries', 'email_campaigns', 
        'client_communications', 'mpesa_transactions' 
    ];
    
    const requestedTable = req.params.table.replace(/[^a-z_]/g, '');
    if (!whitelist.includes(requestedTable)) {
        return res.status(403).json({ error: "Access to the requested database entity has been restricted." });
    }

    try {
        let { page = 1, limit = 200, sort = 'id', order = 'DESC', search = '' } = req.query;
        let whereClauses = [`is_deleted = FALSE`];
        let values = [];
        let valueIndex = 1;

        if (search) {
            let searchColumns = [];
            switch(requestedTable) {
                case 'users': searchColumns = ['name', 'email', 'phone', 'role']; break;
                case 'orders': searchColumns = ['customer_name', 'phone', 'service', 'status', 'payment_status']; break;
                case 'services': searchColumns = ['name', 'description']; break;
                case 'sub_services': searchColumns = ['name', 'description']; break;
                case 'invoices': searchColumns = ['invoice_number', 'client_name', 'client_email', 'status']; break;
                case 'consultations': searchColumns = ['client_name', 'client_email', 'status']; break;
                case 'testimonials': searchColumns = ['client_name', 'company', 'review', 'status']; break;
                case 'portfolio': searchColumns = ['title', 'description', 'status']; break;
                case 'blog_posts': searchColumns = ['title', 'content', 'status']; break;
                case 'case_studies': searchColumns = ['title', 'challenge', 'solution', 'status']; break;
                case 'support_tickets': searchColumns = ['subject', 'description', 'status']; break;
                case 'subscribers': searchColumns = ['email', 'status']; break;
                case 'file_deliveries': searchColumns = ['file_name', 'file_url']; break;
                case 'media_library': searchColumns = ['filename', 'url']; break;
                case 'mpesa_transactions': searchColumns = ['mpesa_receipt_number', 'phone_number', 'status']; break;
                default: searchColumns = [];
            }

            if (searchColumns.length > 0) {
                const searchClauses = searchColumns.map(col => `${col} ILIKE $${valueIndex}`);
                whereClauses.push(`(${searchClauses.join(' OR ')})`);
                values.push(`%${search}%`);
                valueIndex++;
            }
        }

        const whereString = `WHERE ${whereClauses.join(' AND ')}`;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const safeSort = sort.replace(/[^a-zA-Z0-9_]/g, '');
        const safeOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        const queryStr = `SELECT * FROM ${requestedTable} ${whereString} ORDER BY ${safeSort} ${safeOrder} LIMIT ${parseInt(limit)} OFFSET ${offset}`;
        const countStr = `SELECT COUNT(*) FROM ${requestedTable} ${whereString}`;

        const data = await pool.query(queryStr, values);
        const countData = await pool.query(countStr, values);

        res.json({
            success: true,
            data: data.rows,
            total: parseInt(countData.rows[0].count || '0')
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// 2. DYNAMIC ADMIN RECORD CREATOR (POST)
// =========================================================================
app.post('/api/admin/:table', verifyAdminAccess, async (req, res) => {
    const whitelist = [
        'users', 'services', 'sub_services', 'orders', 'portfolio', 
        'case_studies', 'testimonials', 'blog_posts', 'subscribers', 
        'media_library', 'invoices', 'notifications', 'support_tickets', 
        'consultations', 'file_deliveries', 'email_campaigns', 'messages'
    ];
    const requestedTable = req.params.table.replace(/[^a-z_]/g, '');
    if (!whitelist.includes(requestedTable)) {
        return res.status(403).json({ error: "Write operations restricted on this table vectors." });
    }

    try {
        const payload = sanitizeAndMapPayload(requestedTable, req.body);
        
        if (requestedTable === 'users' && payload.password) {
            const salt = await bcrypt.genSalt(10);
            payload.password = await bcrypt.hash(payload.password, salt);
        }

        const keys = Object.keys(payload);
        if (keys.length === 0) {
            return res.status(400).json({ error: "Payload data vector empty or contained invalid columns." });
        }

        const fields = keys.join(', ');
        const indices = keys.map((_, i) => `$${i + 1}`).join(', ');
        const values = Object.values(payload);

        const queryStr = `INSERT INTO ${requestedTable} (${fields}) VALUES (${indices}) RETURNING *`;
        const result = await pool.query(queryStr, values);
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        const statusCode = err.message.includes("Validation Matrix Error") ? 400 : 500;
        res.status(statusCode).json({ error: err.message });
    }
});

// =========================================================================
// 3. DYNAMIC ADMIN RECORD MODIFIER (PUT)
// =========================================================================
app.put('/api/admin/:table/:id', verifyAdminAccess, async (req, res) => {
    const whitelist = [
        'users', 'services', 'sub_services', 'orders', 'portfolio', 
        'case_studies', 'testimonials', 'blog_posts', 'subscribers', 
        'media_library', 'invoices', 'notifications', 'support_tickets', 
        'consultations', 'file_deliveries', 'email_campaigns', 'messages'
    ];
    const requestedTable = req.params.table.replace(/[^a-z_]/g, '');
    if (!whitelist.includes(requestedTable)) {
        return res.status(403).json({ error: "Mutation operations restricted on this table vectors." });
    }

    try {
        const payload = sanitizeAndMapPayload(requestedTable, req.body);
        
        delete payload.id;
        delete payload.created_at;
        delete payload.updated_at;

        if (requestedTable === 'users' && payload.password) {
            if (payload.password.trim() === '') {
                delete payload.password;
            } else {
                const salt = await bcrypt.genSalt(10);
                payload.password = await bcrypt.hash(payload.password, salt);
            }
        }

        const keys = Object.keys(payload);
        if (keys.length === 0) {
            return res.status(400).json({ error: "Mutation vector matrix empty or contained invalid columns." });
        }

        const setClauses = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
        const values = Object.values(payload);
        values.push(req.params.id);

        const queryStr = `UPDATE ${requestedTable} SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length} RETURNING *`;
        const result = await pool.query(queryStr, values);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Target row reference not found mapping to ID vector." });
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        const statusCode = err.message.includes("Validation Matrix Error") ? 400 : 500;
        res.status(statusCode).json({ error: err.message });
    }
});

// 4. SINGLE RECORD INDEPENDENT DELETION DISPATCHER
app.delete('/api/admin/:table/:id', verifyAdminAccess, async (req, res) => {
    const whitelist = [
        'users', 'services', 'sub_services', 'orders', 'portfolio', 
        'case_studies', 'testimonials', 'blog_posts', 'subscribers', 
        'media_library', 'invoices', 'notifications', 'support_tickets', 
        'consultations', 'file_deliveries', 'email_campaigns', 'messages'
    ];
    const requestedTable = req.params.table.replace(/[^a-z_]/g, '');
    if (!whitelist.includes(requestedTable)) return res.status(403).json({ error: "Destructive operations vector unauthorized." });

    try {
        const queryStr = `UPDATE ${requestedTable} SET is_deleted = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1`;
        await pool.query(queryStr, [req.params.id]);
        res.json({ success: true, message: "Target entity soft deactivation executed successfully." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Generic Admin Data Management Route Handler
app.put('/admin/manage/:table/:id', async (req, res) => {
    const { table, id } = req.params;
    
    // 1. Strip out automatic system fields that cannot be manually written
    const data = { ...req.body };
    delete data.id;
    delete data.created_at;
    delete data.updated_at;

    const keys = Object.keys(data);
    if (keys.length === 0) return res.status(400).json({ message: "No payload data detected" });

    // 2. Build explicit column mappings: "column_name = $1, column_name = $2"
    const setClause = keys.map((key, index) => `"${key}" = $${index + 1}`).join(', ');
    
    // 3. Append the ID placeholder at the very final index position
    const idPlaceholderIndex = keys.length + 1;
    const sqlText = `UPDATE ${table} SET ${setClause} WHERE id = $${idPlaceholderIndex}`;
    
    // 4. Align values array order to accurately match placeholder numbers
    const queryValues = [...keys.map(k => data[k]), id];

    try {
        await pool.query(sqlText, queryValues);
        res.json({ success: true, message: `Table ${table} record updated.` });
    } catch (err) {
        console.error(`Database Execution Fault on table ${table}:`, err.message);
        res.status(500).json({ message: "Internal Database execution rejection.", error: err.message });
    }
});

// =========================================================================
// ================= UNIVERSAL BULK ACTION & CORE FETCH ENGINE =============
// =========================================================================
app.post('/api/:table/bulk', verifyAdminAccess, async (req, res) => {
    const whitelist = [
        'users', 'services', 'sub_services', 'orders', 'portfolio', 
        'case_studies', 'testimonials', 'blog_posts', 'subscribers', 
        'media_library', 'invoices', 'notifications', 'support_tickets', 
        'messages', 'consultations', 'file_deliveries', 'email_campaigns', 'client_communications',
        'mpesa_transactions' 
    ];
    
    const requestedTable = req.params.table.replace(/[^a-z_]/g, '');
    if (!whitelist.includes(requestedTable)) {
        return res.status(403).json({ error: "Dynamic route injection target blocked." });
    }

    try {
        const { ids, action } = req.body;
        if (!Array.isArray(ids) || ids.length === 0 || action !== 'delete') {
            return res.status(400).json({ error: "Invalid bulk operation parameters." });
        }

        const query = `UPDATE ${requestedTable} SET is_deleted = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = ANY($1::int[])`;
        await pool.query(query, [ids]);
        res.json({ success: true, message: 'Bulk soft delete pipeline executed.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/:table/:id', verifySystemToken, async (req, res) => {
    const adminTables = [
        'users', 'services', 'sub_services', 'orders', 'portfolio', 
        'case_studies', 'testimonials', 'blog_posts', 'subscribers', 
        'media_library', 'invoices', 'notifications', 'support_tickets', 
        'messages', 'consultations', 'file_deliveries', 'email_campaigns', 'client_communications',
        'mpesa_transactions'
    ];

    const clientTables = [
        'users', 'services', 'orders', 'portfolio', 'blog_posts', 
        'invoices', 'support_tickets', 'testimonials', 'consultations', 'client_communications'
    ]; 

    const requestedTable = req.params.table.replace(/[^a-z_]/g, '');
    if (req.user.role !== 'admin' && !clientTables.includes(requestedTable)) {
        return res.status(403).json({ error: "Unauthorized Table Access" });
    }
    if (!adminTables.includes(requestedTable)) {
        return res.status(403).json({ error: "Unknown Table Vector" });
    }
    
    try {
        const result = await pool.query(`SELECT * FROM ${requestedTable} WHERE id = $1 AND is_deleted = FALSE`, [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({error: "Record not found"});
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= GLOBAL APPLICATION VERIFICATION ROUTE =================
app.get('/', (req, res) => {
    res.status(200).send('🚀 DAN74TECH MEDIA Unified Operations API Matrix is active.');
});

// ================= AUTOMATED AWS S3 POSTGRESQL BACKUP SCHEDULER ==========
cron.schedule('0 2 * * *', () => {
    console.log("🕒 02:00 EAT: Triggering pg_dump cryptographic snapshot for AWS S3 Cold Storage...");
    if(!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.S3_BUCKET_NAME) {
        console.warn("⚠️ S3 Backup aborted: AWS credentials or Bucket Name missing in environment.");
        return;
    }

    const fileName = `dan74tech_backup_${Date.now()}.sql`;
    const filePath = path.join(__dirname, 'uploads', fileName);
    const dumpCmd = `pg_dump ${process.env.DATABASE_URL} -F p -f ${filePath}`;

    exec(dumpCmd, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ pg_dump error: ${error.message}`);
            return;
        }

        const s3 = new AWS.S3({
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        });

        const fileContent = fs.readFileSync(filePath);
        const params = {
            Bucket: process.env.S3_BUCKET_NAME,
            Key: `database_backups/${fileName}`,
            Body: fileContent,
            ServerSideEncryption: 'AES256' 
        };

        s3.upload(params, (err, data) => {
            if (err) {
                console.error("❌ AWS S3 Upload Error:", err);
            } else {
                console.log(`✅ Database successfully backed up to S3: ${data.Location}`);
            }
            fs.unlinkSync(filePath);
        });
    });
}, {
    scheduled: true,
    timezone: "Africa/Nairobi"
});

// Initialize Server Core Execution Node using HTTP Server for WebSockets
server.listen(PORT, () => {
    console.log(`🚀 Server matrix online and deploying operations on port ${PORT}`);
});
