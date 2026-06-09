// =========================================================================
// DAN74TECH MEDIA - UNIFIED BACKEND SERVER PLATFORM (server.js)
// STATUS: V5.0.0 PRODUCTION ENTERPRISE SYSTEM INTEGRATION (COMPLETE)
// ALL SCHEMA TABLES FULLY MAP TO AUTO-GENERATED, SECURE CRUD ROUTERS
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
// ================= MODULE 2: COMMUNITY ROSTER ============================
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

// =========================================================================
// ================= MODULE 3: SPECIALIZED OPERATIONS & ORDER FLOW =========
// =========================================================================
app.post('/api/orders', async (req, res) => {
    try {
        const { user_id, customer_name, phone, service, sub_service, domain, device_model, project_details, price, status, payment_status } = req.body;
        const result = await pool.query(
            `INSERT INTO orders (
                user_id, customer_name, phone, service, sub_service, domain, device_model, project_details, price, status, payment_status
             ) VALUES (
                $1, $2, $3, $4, $5, COALESCE($6, 'N/A'), COALESCE($7, 'Web Client'), $8, COALESCE($9, 0.00), COALESCE($10, 'pending'), COALESCE($11, 'unpaid')
             ) RETURNING *`,
            [user_id || null, customer_name, phone, service, sub_service || null, domain || null, device_model || null, project_details || null, price || null, status || null, payment_status || null]
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

        const whatsappMessage = encodeURIComponent(`Hello DAN74TECH MEDIA, I have placed an order for ${service}. Project Details: ${project_details || 'N/A'}. Please advise on the next steps.`);
        const whatsappLink = `https://wa.me/254790435584?text=${whatsappMessage}`;
        
        res.json({ success: true, data: orderData, whatsapp_redirect: whatsappLink });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// ================= MODULE 4: INVOICE GENERATION PIPELINE ================
// =========================================================================
app.get('/api/invoices/:id/download', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM invoices WHERE id = $1 AND is_deleted = FALSE', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: "Invoice vector not found" });
        
        const invoice = result.rows[0];
        const doc = new PDFDocument();
        
        res.setHeader('Content-disposition', `attachment; filename="${invoice.invoice_number}.pdf"`);
        res.setHeader('Content-type', 'application/pdf');
        
        doc.text(`DAN74TECH MEDIA INVOICE`, { align: 'center', size: 20 });
        doc.moveDown();
        doc.text(`Invoice Number: ${invoice.invoice_number}`);
        doc.text(`Client Name: ${invoice.client_name}`);
        doc.text(`Client Email: ${invoice.client_email || 'N/A'}`);
        doc.text(`Amount Due: KSH ${invoice.amount}`);
        doc.text(`Status: ${invoice.status.toUpperCase()}`);
        doc.text(`Issued At: ${invoice.issued_at}`);
        doc.end();
        doc.pipe(res);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// ====== MODULE 5: SCHEMA-AWARE UNIVERSAL DYNAMIC CRUD ENGINE =============
// =========================================================================
// Explicit list of all 26 tables discovered within system metrics
const SYSTEM_WHITELIST_TABLES = [
    'users', 'clients', 'public_keys', 'services', 'sub_services', 'orders', 
    'projects', 'file_deliveries', 'project_files', 'mpesa_transactions', 
    'invoices', 'feed_posts', 'feed_interactions', 'feed_reactions', 
    'email_campaigns', 'subscribers', 'media_library', 'blog_posts', 
    'case_studies', 'client_communications', 'comments', 'consultations', 
    'messages', 'notifications', 'support_tickets', 'testimonials'
];

// Structural Middleware: Validate incoming dynamic vector requests
const verifyCrudTargetTable = (req, res, next) => {
    const targetTable = String(req.params.table).trim().toLowerCase();
    if (!SYSTEM_WHITELIST_TABLES.includes(targetTable)) {
        return res.status(400).json({ error: `Rejected: System table entry context '${targetTable}' is invalid or restricted.` });
    }
    req.cleanTable = targetTable;
    next();
};

// Introspect runtime column layout for a table
async function discoverTableColumnsLayout(tableName) {
    const schemaLookup = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = $1`, 
        [tableName]
    );
    const namesArray = schemaLookup.rows.map(r => r.column_name);
    return {
        columns: namesArray,
        hasIsDeleted: namesArray.includes('is_deleted'),
        hasUpdatedAt: namesArray.includes('updated_at')
    };
}

// 1. READ ALL (With Pagination, Dynamic Search Filters, Sorting, and Soft-Delete awareness)
app.get('/api/crud/:table', verifySystemToken, verifyCrudTargetTable, async (req, res) => {
    try {
        const { columns, hasIsDeleted } = await discoverTableColumnsLayout(req.cleanTable);
        let { page = 1, limit = 100, sort = 'id', order = 'DESC', search = '', ...filters } = req.query;
        
        let targetWhereConditions = [];
        let queryParams = [];
        let indexTracker = 1;

        if (hasIsDeleted) {
            targetWhereConditions.push(`is_deleted = FALSE`);
        }

        // Apply string search filters on VARCHAR or TEXT columns if explicitly passed
        if (search && search.trim() !== '') {
            const lookableTextColumns = columns.filter(c => c.includes('name') || c.includes('title') || c.includes('email') || c.includes('subject') || c.includes('content') || c.includes('message'));
            if (lookableTextColumns.length > 0) {
                const innerSearchBlock = lookableTextColumns.map(col => `${col} ILIKE $${indexTracker}`).join(' OR ');
                targetWhereConditions.push(`(${innerSearchBlock})`);
                queryParams.push(`%${search}%`);
                indexTracker++;
            }
        }

        // Apply strict filtering fields on explicit column keys matching request query
        for (const [filterKey, filterVal] of Object.entries(filters)) {
            if (columns.includes(filterKey) && filterVal !== undefined && filterVal !== '') {
                targetWhereConditions.push(`${filterKey} = $${indexTracker}`);
                queryParams.push(filterVal);
                indexTracker++;
            }
        }

        const buildWhereClause = targetWhereConditions.length > 0 ? `WHERE ${targetWhereConditions.join(' AND ')}` : '';
        
        const cleanSortColumn = columns.includes(sort) ? sort : 'id';
        const cleanSortingOrder = String(order).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
        
        const numericalOffset = (parseInt(page) - 1) * parseInt(limit);
        
        const aggregateDataQuery = `
            SELECT * FROM ${req.cleanTable} 
            ${buildWhereClause} 
            ORDER BY ${cleanSortColumn} ${cleanSortingOrder} 
            LIMIT ${parseInt(limit)} OFFSET ${numericalOffset}
        `;
        
        const aggregateCountQuery = `SELECT COUNT(*) FROM ${req.cleanTable} ${buildWhereClause}`;
        
        const dataSetResult = await pool.query(aggregateDataQuery, queryParams);
        const countingResult = await pool.query(aggregateCountQuery, queryParams);
        
        res.json({
            success: true,
            table: req.cleanTable,
            data: dataSetResult.rows,
            meta: {
                total_records: parseInt(countingResult.rows[0].count),
                current_page: parseInt(page),
                records_limit: parseInt(limit)
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. READ BY ID
app.get('/api/crud/:table/:id', verifySystemToken, verifyCrudTargetTable, async (req, res) => {
    try {
        const { hasIsDeleted } = await discoverTableColumnsLayout(req.cleanTable);
        let identificationQuery = `SELECT * FROM ${req.cleanTable} WHERE id = $1`;
        if (hasIsDeleted) {
            identificationQuery += ` AND is_deleted = FALSE`;
        }
        
        const elementOutput = await pool.query(identificationQuery, [req.params.id]);
        if (elementOutput.rows.length === 0) {
            return res.status(404).json({ error: `Record matching identifier token ${req.params.id} does not exist in ${req.cleanTable}` });
        }
        res.json({ success: true, data: elementOutput.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. CREATE / INSERT
app.post('/api/crud/:table', verifySystemToken, verifyCrudTargetTable, async (req, res) => {
    try {
        const { columns } = await discoverTableColumnsLayout(req.cleanTable);
        const parametersPayload = req.body;
        
        // Dynamic construction logic filtering keys that actually exist inside target table schema
        const targetInsertionColumns = Object.keys(parametersPayload).filter(key => columns.includes(key) && key !== 'id');
        
        if (targetInsertionColumns.length === 0) {
            return res.status(400).json({ error: "Malformed payload parameter mapping context: Empty body array match." });
        }
        
        // Password hashing implementation if mapping values to the users or clients context directly
        if (targetInsertionColumns.includes('password') && parametersPayload.password) {
            const salt = await bcrypt.genSalt(10);
            parametersPayload.password = await bcrypt.hash(parametersPayload.password, salt);
        }
        if (targetInsertionColumns.includes('password_hash') && parametersPayload.password_hash) {
            const salt = await bcrypt.genSalt(10);
            parametersPayload.password_hash = await bcrypt.hash(parametersPayload.password_hash, salt);
        }

        const valuePointers = targetInsertionColumns.map((_, index) => `$${index + 1}`).join(', ');
        const variableInputs = targetInsertionColumns.map(col => parametersPayload[col]);
        
        const executableInsertionQuery = `
            INSERT INTO ${req.cleanTable} (${targetInsertionColumns.join(', ')}) 
            VALUES (${valuePointers}) 
            RETURNING *
        `;
        
        const executedState = await pool.query(executableInsertionQuery, variableInputs);
        res.status(201).json({ success: true, data: executedState.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. UPDATE / PUT
app.put('/api/crud/:table/:id', verifySystemToken, verifyCrudTargetTable, async (req, res) => {
    try {
        const { columns, hasUpdatedAt } = await discoverTableColumnsLayout(req.cleanTable);
        const parametersPayload = req.body;
        
        let targetUpdatingColumns = Object.keys(parametersPayload).filter(key => columns.includes(key) && key !== 'id' && key !== 'created_at');
        
        if (targetUpdatingColumns.length === 0 && !hasUpdatedAt) {
            return res.status(400).json({ error: "No actionable column mapping parameters found inside body object request." });
        }

        // Protect or hash credentials securely if running a dynamic profile override update 
        if (targetUpdatingColumns.includes('password') && parametersPayload.password) {
            const salt = await bcrypt.genSalt(10);
            parametersPayload.password = await bcrypt.hash(parametersPayload.password, salt);
        }

        let queryValues = [];
        let assignmentStrings = [];
        let bindIndex = 1;

        for (const column of targetUpdatingColumns) {
            assignmentStrings.push(`${column} = $${bindIndex}`);
            queryValues.push(parametersPayload[column]);
            bindIndex++;
        }

        if (hasUpdatedAt) {
            assignmentStrings.push(`updated_at = CURRENT_TIMESTAMP`);
        }

        queryValues.push(req.params.id);
        const dynamicUpdateString = `
            UPDATE ${req.cleanTable} 
            SET ${assignmentStrings.join(', ')} 
            WHERE id = $${bindIndex} 
            RETURNING *
        `;
        
        const stateModificationResult = await pool.query(dynamicUpdateString, queryValues);
        if (stateModificationResult.rows.length === 0) {
            return res.status(404).json({ error: `Update process failed. Target row ID reference ${req.params.id} does not exist.` });
        }
        res.json({ success: true, data: stateModificationResult.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. DELETE (Smart Deletion Architecture: Soft Delete using 'is_deleted' flag where supported, otherwise Hard Delete fallback)
app.delete('/api/crud/:table/:id', verifyAdminAccess, verifyCrudTargetTable, async (req, res) => {
    try {
        const { hasIsDeleted, hasUpdatedAt } = await discoverTableColumnsLayout(req.cleanTable);
        let terminalDeletionQuery = '';
        
        if (hasIsDeleted) {
            terminalDeletionQuery = `
                UPDATE ${req.cleanTable} 
                SET is_deleted = TRUE ${hasUpdatedAt ? ', updated_at = CURRENT_TIMESTAMP' : ''} 
                WHERE id = $1 RETURNING id
            `;
            console.log(`♻️ Performing logical software-level execution lifecycle cleanup on table: ${req.cleanTable}`);
        } else {
            terminalDeletionQuery = `DELETE FROM ${req.cleanTable} WHERE id = $1 RETURNING id`;
            console.log(`⚠️ Performing structural physical layer deletion block cascade sequence entry on table: ${req.cleanTable}`);
        }
        
        const structuralResult = await pool.query(terminalDeletionQuery, [req.params.id]);
        if (structuralResult.rows.length === 0) {
            return res.status(404).json({ error: `Deletion target failed. No matching identifier matching sequence entry found for ID ${req.params.id}.` });
        }
        res.json({ success: true, message: `Operational data segment inside table '${req.cleanTable}' deleted completely.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// ================= MODULE 6: WEBSOCKET INTERACTION COORDINATOR ===========
// =========================================================================
io.on('connection', (socket) => {
    console.log(`⚡ WebSocket Pipeline Link established node instance: ${socket.id}`);

    socket.on('register_presence', async (data) => {
        if (data && data.userId) {
            socket.userId = data.userId;
            await pool.query('UPDATE users SET is_online = TRUE, last_seen = CURRENT_TIMESTAMP WHERE id = $1', [data.userId]);
            io.emit('presence_update', { userId: data.userId, is_online: true });
        }
    });

    socket.on('dispatch_chat_message', async (messageMetadata) => {
        try {
            const { sender_id, receiver_id, message_body, channel, message_type } = messageMetadata;
            const databaseEntry = await pool.query(
                `INSERT INTO client_communications (sender_id, receiver_id, message_body, channel, message_type, delivery_status) 
                 VALUES ($1, $2, $3, COALESCE($4, 'dashboard'), COALESCE($5, 'text'), 'delivered') RETURNING *`,
                [sender_id, receiver_id, message_body, channel, message_type]
            );
            io.emit(`receive_chat_stream_${receiver_id}`, databaseEntry.rows[0]);
            socket.emit('message_delivery_receipt', { success: true, trackingId: databaseEntry.rows[0].id });
        } catch (err) {
            socket.emit('chat_error_response', { context: err.message });
        }
    });

    socket.on('disconnect', async () => {
        console.log(`🔌 Connected endpoint closed gracefully: ${socket.id}`);
        if (socket.userId) {
            await pool.query('UPDATE users SET is_online = FALSE, last_seen = CURRENT_TIMESTAMP WHERE id = $1', [socket.userId]);
            io.emit('presence_update', { userId: socket.userId, is_online: false });
        }
    });
});

// =========================================================================
// ================= MODULE 7: BACKUP & DATA INTEGRITY MANAGEMENT ==========
// =========================================================================
cron.schedule('0 2 * * *', () => {
    console.log("⏱️ Initializing scheduled S3 backup sequence engine node...");
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.S3_BUCKET_NAME) {
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
    console.log(`=================================================================`);
    console.log(`🚀 DAN74TECH MEDIA CORE PLATFORM OPERATIONAL ON PORT: ${PORT}`);
    console.log(`🔒 ARCHITECTURAL ENVIRONMENT ROUTERS INSTANTIATED SECURELY`);
    console.log(`=================================================================`);
});
