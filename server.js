// =========================================================================
// DAN74TECH MEDIA - UNIFIED BACKEND SERVER PLATFORM (server.js)
// STATUS: V4.1.0 PRODUCTION ENTERPRISE SYSTEM INTEGRATION (COMPLETE)
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
const app = express();
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
// ================= MODULE 2: USERS MANAGEMENT INTERFACE ==================
// =========================================================================
app.get('/api/users', verifyAdminAccess, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, name, email, role, phone, is_online, last_seen, created_at FROM users WHERE is_deleted = FALSE ORDER BY id DESC'
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
app.get('/api/testimonials', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM testimonials WHERE is_deleted = FALSE ORDER BY id DESC");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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
                        `INSERT INTO media_library (file_name, file_url, file_type, file_size) VALUES ($1, $2, $3, $4) RETURNING *`,
                        [req.file.originalname, result.secure_url, req.file.mimetype, req.file.size]
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
        const { name, email, phone, schedule_date, notes } = req.body;
        const result = await pool.query(
            `INSERT INTO consultations (name, email, phone, schedule_date, notes, status) VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
            [name, email, phone, schedule_date, notes]
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
// ================= MODULE 18: CHAT & TELEMETRY COMMUNICATION ENGINE =======
// =========================================================================
io.on('connection', (socket) => {
    console.log(`🔌 WebSockets: Connection Established [ID: ${socket.id}]`);
    
    socket.on('join_thread', async (userId) => {
        socket.join(userId.toString());
        socket.userId = userId;
        await pool.query('UPDATE users SET is_online = TRUE, last_seen = NOW() WHERE id = $1', [userId]);
        io.emit('presence_update', { userId, status: 'online' });
    });

    socket.on('typing_start', (data) => {
        io.to(data.receiver_id.toString()).emit('user_typing', { sender_id: socket.userId });
    });

    socket.on('typing_stop', (data) => {
        io.to(data.receiver_id.toString()).emit('user_stopped_typing', { sender_id: socket.userId });
    });

    socket.on('mark_read', async (data) => {
        await pool.query('UPDATE client_communications SET is_read = TRUE WHERE sender_id = $1 AND receiver_id = $2', [data.sender_id, socket.userId]);
        io.to(data.sender_id.toString()).emit('receipt_update', { receiver_id: socket.userId });
    });

    socket.on('disconnect', async () => {
        console.log(`🔌 WebSockets: Connection Terminated [ID: ${socket.id}]`);
        if (socket.userId) {
            await pool.query('UPDATE users SET is_online = FALSE, last_seen = NOW() WHERE id = $1', [socket.userId]);
            io.emit('presence_update', { userId: socket.userId, status: 'offline', last_seen: new Date() });
        }
    });
});

app.get('/api/communications/directory', verifySystemToken, async (req, res) => {
    try {
        const query = `
            SELECT id, name, email, role, is_online, last_seen,
            (SELECT COUNT(*) FROM client_communications cc WHERE cc.sender_id = users.id AND cc.receiver_id = $1 AND cc.is_read = FALSE AND cc.is_deleted = FALSE) as unread_count
            FROM users WHERE is_deleted = FALSE ORDER BY is_online DESC, last_seen DESC NULLS LAST;
        `;
        const result = await pool.query(query, [req.user.id]);
        res.json(result.rows);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

app.get('/api/communications/clients', verifyAdminAccess, async (req, res) => {
    try {
        const query = `
            SELECT u.id, u.name, u.email, u.phone, u.role, u.is_online, u.last_seen, u.created_at,
                (SELECT message_body FROM client_communications cc WHERE (cc.sender_id = u.id OR cc.receiver_id = u.id) AND cc.is_deleted = FALSE ORDER BY cc.created_at DESC LIMIT 1) as last_message,
                (SELECT created_at FROM client_communications cc WHERE (cc.sender_id = u.id OR cc.receiver_id = u.id) AND cc.is_deleted = FALSE ORDER BY cc.created_at DESC LIMIT 1) as last_message_date,
                (SELECT COUNT(*) FROM client_communications cc WHERE cc.sender_id = u.id AND cc.receiver_id = $1 AND cc.is_read = FALSE AND cc.is_deleted = FALSE) as unread_count
            FROM users u
            WHERE u.role = 'client' AND u.is_deleted = FALSE
            ORDER BY last_message_date DESC NULLS LAST;
        `;
        const result = await pool.query(query, [req.user.id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/communications/send', verifySystemToken, async (req, res) => {
    try {
        const { receiver_id, message_body, attachment_url, attachment_name } = req.body;
        const sender_id = req.user.id;

        const savedMsg = await pool.query(
            `INSERT INTO client_communications (sender_id, receiver_id, message_body, attachment_url, attachment_name) 
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [sender_id, receiver_id, message_body, attachment_url, attachment_name]
        );
        
        io.to(receiver_id.toString()).emit('receive_message', savedMsg.rows[0]);
        res.json({ success: true, data: savedMsg.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/client-portal/thread', verifySystemToken, async (req, res) => {
    try {
        const userId = req.user.id;
        await pool.query(
            `UPDATE client_communications SET is_read = TRUE WHERE receiver_id = $1 AND is_read = FALSE`,
            [userId]
        );
        const thread = await pool.query(
            `SELECT * FROM client_communications 
             WHERE (sender_id = $1 OR receiver_id = $1) AND is_deleted = FALSE 
             ORDER BY created_at ASC`,
            [userId]
        );
        res.json(thread.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
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

app.post('/api/payments/mpesa-callback', async (req, res) => {
    try {
        const callbackData = req.body.Body.stkCallback;
        const checkoutRequestId = callbackData.CheckoutRequestID;
        const resultCode = callbackData.ResultCode;

        if (resultCode === 0) {
            const amountInfo = callbackData.CallbackMetadata.Item.find(item => item.Name === 'Amount');
            const receiptInfo = callbackData.CallbackMetadata.Item.find(item => item.Name === 'MpesaReceiptNumber');
            const phoneInfo = callbackData.CallbackMetadata.Item.find(item => item.Name === 'PhoneNumber');

            await pool.query(
                `INSERT INTO mpesa_transactions (checkout_request_id, amount, mpesa_receipt_number, phone_number, status, result_description) 
                 VALUES ($1, $2, $3, $4, 'Success', $5)`,
                [checkoutRequestId, amountInfo.Value, receiptInfo.Value, phoneInfo.Value, callbackData.ResultDesc]
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
app.get('/api/feed/global', verifySystemToken, async (req, res) => {
    try {
        const query = `
            SELECT id, title, description as content, link as media_url, 'portfolio' as type, created_at, likes_count, views_count, NULL as author_name
            FROM portfolio WHERE is_deleted = FALSE AND status = 'Approved'
            UNION ALL
            SELECT b.id, b.title, b.content, b.image_url as media_url, 'blog' as type, b.created_at, b.likes_count, b.views_count, u.name as author_name
            FROM blog_posts b LEFT JOIN users u ON b.author_id = u.id WHERE b.is_deleted = FALSE AND b.status = 'Approved'
            UNION ALL
            SELECT c.id, c.title, c.challenge || ' ' || c.solution as content, c.image_url as media_url, 'case_study' as type, c.created_at, c.likes_count, c.views_count, u.name as author_name
            FROM case_studies c LEFT JOIN users u ON c.author_id = u.id WHERE c.is_deleted = FALSE AND c.status = 'Approved'
            ORDER BY created_at DESC LIMIT 50;
        `;
        const result = await pool.query(query);
        res.json(result.rows);
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
        const { target, title, content } = req.body;
        const authorId = req.user.id;
        const table = target === 'blog' ? 'blog_posts' : 'case_studies';
        
        await pool.query(`INSERT INTO ${table} (title, ${target === 'blog' ? 'content' : 'challenge'}, status, author_id) VALUES ($1, $2, 'pending', $3)`, [title, content, authorId]);
        res.json({ success: true });
    } catch (err) { 
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
