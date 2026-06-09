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
const { exec } = require('child_process'); \nconst AWS = require('aws-sdk'); 

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

// Database Connectivity Pool Setup (Neon / PostgreSQL)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.on('connect', () => {
    console.log('✅ Connected to Neon Production PostgreSQL Engine.');
});

// Configure Cloudinary Storage Core Engine
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Security & Traffic Rate Limiting Configuration Layer
app.use(helmet({
    contentSecurityPolicy: false, 
    crossOriginEmbedderPolicy: false
}));
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const systemRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 1000, 
    message: { error: "Too many requests originating from this structural vector node. Access throttled." }
});
app.use('/api/', systemRateLimiter);

// Multer Direct Memory Allocation Pipeline Engine
const fileMemoryStorage = multer.memoryStorage();
const uploadProcessor = multer({ 
    storage: fileMemoryStorage,
    limits: { fileSize: 25 * 1024 * 1024 } 
});

// Real-Time Socket.io Connection Matrix
io.on('connection', (socket) => {
    console.log(`📡 New operational matrix link established: Client UID [${socket.id}]`);
    socket.on('disconnect', () => {
        console.log(`❌ Matrix link severed for client node: [${socket.id}]`);
    });
});

// Global Telemetry Broadcasting Subsystem Helper
function broadcastSystemTelemetry(module, action, primaryId, payload = {}) {
    io.emit('telemetry_change', {
        module,
        action,
        primaryId,
        timestamp: new Date().toISOString(),
        payload
    });
}

// Security Middleware: JWT Strategic Access Authorization Gate
function authenticateSecureToken(req, res, next) {
    const authHeaderField = req.headers['authorization'];
    const tokenPayload = authHeaderField && authHeaderField.split(' ')[1];
    
    if (!tokenPayload) {
        return res.status(401).json({ error: "Access verification token vector absent." });
    }
    
    jwt.verify(tokenPayload, JWT_SECRET, (err, decodedUser) => {
        if (err) {
            return res.status(403).json({ error: "Token signature or scope is corrupted/expired." });
        }
        req.user = decodedUser;
        next();
    });
}

// Global Slug Synthesis Engine Helper Function
function generateCleanSlug(textString) {
    return textString
        .toString()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

// =========================================================================
// MEDIA MANAGEMENT SYSTEM ROUTE PIPELINE (CLOUDINARY STREAM)
// =========================================================================
app.post('/api/media/upload', uploadProcessor.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No multi-part binary file data stream received." });
    }

    const cloudUploadStream = cloudinary.uploader.upload_stream(
        { folder: "dan74tech_media_production_hub" },
        (error, processingResult) => {
            if (error) {
                console.error("❌ Cloudinary engine streaming failure:", error);
                return res.status(500).json({ error: "Media routing allocation failure on Cloudinary server." });
            }
            res.json({
                message: "Binary visual payload securely routed to Cloudinary grid.",
                url: processingResult.secure_url,
                public_id: processingResult.public_id
            });
        }
    );

    streamifier.createReadStream(req.file.buffer).pipe(cloudUploadStream);
});

// =========================================================================
// SYSTEM AUTHENTICATION ENGINE ROUTE PORTALS
// =========================================================================
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const queryResult = await pool.query('SELECT * FROM users WHERE email = $1 AND is_deleted = false', [email]);
        if (queryResult.rows.length === 0) {
            return res.status(401).json({ error: "Authentication vector rejected: Credentials unmatched." });
        }
        
        const matchingUser = queryResult.rows[0];
        const plainPasswordMatches = await bcrypt.compare(password, matchingUser.password);
        if (!plainPasswordMatches) {
            return res.status(401).json({ error: "Authentication vector rejected: Security sequence mismatched." });
        }
        
        const systemToken = jwt.sign(
            { id: matchingUser.id, name: matchingUser.name, email: matchingUser.email, role: matchingUser.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.json({
            message: "Authentication handshake successful.",
            token: systemToken,
            user: { id: matchingUser.id, name: matchingUser.name, email: matchingUser.email, role: matchingUser.role }
        });
    } catch (err) {
        console.error("❌ Core security exception processing login:", err);
        res.status(500).json({ error: "Internal processing logic failure on server grid." });
    }
});

app.get('/api/auth/me', authenticateSecureToken, async (req, res) => {
    try {
        const userQuery = await pool.query('SELECT id, name, email, role, phone, created_at FROM users WHERE id = $1 AND is_deleted = false', [req.user.id]);
        if (userQuery.rows.length === 0) {
            return res.status(404).json({ error: "Account structure vector not found on live ecosystem grid." });
        }
        res.json(userQuery.rows[0]);
    } catch (err) {
        res.status(500).json({ error: "System query processing vector disrupted." });
    }
});

// =========================================================================
// 1. SERVICES MANAGEMENT STRUCTURAL ROUTING (CRUD)
// =========================================================================
app.get('/api/services', async (req, res) => {
    try {
        const fetchResult = await pool.query('SELECT * FROM services WHERE is_deleted = false ORDER BY id DESC');
        res.json(fetchResult.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/services', async (req, res) => {
    const { name, description, price, status } = req.body;
    try {
        const writeOp = await pool.query(
            `INSERT INTO services (name, description, price, status, created_at, updated_at) 
             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING *`,
            [name, description, price, status || 'active']
        );
        broadcastSystemTelemetry('services', 'INSERT', writeOp.rows[0].id, writeOp.rows[0]);
        res.status(201).json(writeOp.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/services/:id', async (req, res) => {
    const { id } = req.params;
    const { name, description, price, status } = req.body;
    try {
        const updateOp = await pool.query(
            `UPDATE services SET name = $1, description = $2, price = $3, status = $4, updated_at = CURRENT_TIMESTAMP 
             WHERE id = $5 AND is_deleted = false RETURNING *`,
            [name, description, price, status, id]
        );
        if (updateOp.rows.length === 0) return res.status(404).json({ error: "Record array vector unlocated." });
        broadcastSystemTelemetry('services', 'UPDATE', id, updateOp.rows[0]);
        res.json(updateOp.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/services/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const softDeleteOp = await pool.query(
            'UPDATE services SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *', [id]
        );
        if (softDeleteOp.rows.length === 0) return res.status(404).json({ error: "Record array vector unlocated." });
        broadcastSystemTelemetry('services', 'DELETE', id);
        res.json({ message: "Vector flag status flipped successfully to is_deleted." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// 2. INVOICES PRODUCTION MANAGEMENT ARCHITECTURE ROUTING (CRUD + PDF GENERATION)
// =========================================================================
app.get('/api/invoices', async (req, res) => {
    try {
        const fetchResult = await pool.query('SELECT * FROM invoices WHERE is_deleted = false ORDER BY id DESC');
        res.json(fetchResult.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/invoices', async (req, res) => {
    const { invoice_number, client_name, client_email, amount, status, issue_date, due_date, items } = req.body;
    try {
        const writeOp = await pool.query(
            `INSERT INTO invoices (invoice_number, client_name, client_email, amount, status, issue_date, due_date, items, created_at, updated_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING *`,
            [invoice_number, client_name, client_email, amount, status || 'pending', issue_date, due_date, typeof items === 'string' ? items : JSON.stringify(items)]
        );
        broadcastSystemTelemetry('invoices', 'INSERT', writeOp.rows[0].id, writeOp.rows[0]);
        res.status(201).json(writeOp.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/invoices/:id', async (req, res) => {
    const { id } = req.params;
    const { invoice_number, client_name, client_email, amount, status, issue_date, due_date, items } = req.body;
    try {
        const updateOp = await pool.query(
            `UPDATE invoices SET invoice_number = $1, client_name = $2, client_email = $3, amount = $4, status = $5, 
             issue_date = $6, due_date = $7, items = $8, updated_at = CURRENT_TIMESTAMP 
             WHERE id = $9 AND is_deleted = false RETURNING *`,
            [invoice_number, client_name, client_email, amount, status, issue_date, due_date, typeof items === 'string' ? items : JSON.stringify(items), id]
        );
        if (updateOp.rows.length === 0) return res.status(404).json({ error: "Target array element not discovered." });
        broadcastSystemTelemetry('invoices', 'UPDATE', id, updateOp.rows[0]);
        res.json(updateOp.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/invoices/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const softDeleteOp = await pool.query('UPDATE invoices SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *', [id]);
        if (softDeleteOp.rows.length === 0) return res.status(404).json({ error: "Target array element not discovered." });
        broadcastSystemTelemetry('invoices', 'DELETE', id);
        res.json({ message: "Invoice storage block deactivated safely." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// High-Fidelity Dynamically Generated PDF Generation Output Stream Pipeline
app.get('/api/invoices/:id/download', async (req, res) => {
    const { id } = req.params;
    try {
        const queryLookup = await pool.query('SELECT * FROM invoices WHERE id = $1 AND is_deleted = false', [id]);
        if (queryLookup.rows.length === 0) {
            return res.status(404).json({ error: "Requested invoice binary source missing mapping target." });
        }
        
        const invoiceData = queryLookup.rows[0];
        const pdfBinaryStream = new PDFDocument({ size: 'A4', margin: 50 });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=DAN74TECH_INVOICE_${invoiceData.invoice_number}.pdf`);
        pdfBinaryStream.pipe(res);
        
        // Brand Identity Architectural Top Frame Layout
        pdfBinaryStream.fillColor('#0f172a').font('Helvetica-Bold').fontSize(26).text('DAN74TECH MEDIA', 50, 50);
        pdfBinaryStream.fontSize(10).font('Helvetica').fillColor('#64748b').text('Enterprise Digital Systems Architecture Engine Node', 50, 80);
        
        pdfBinaryStream.fillColor('#0f172a').font('Helvetica-Bold').fontSize(16).text('INVOICE OF ACCOUNT', 400, 50, { align: 'right' });
        pdfBinaryStream.fontSize(10).font('Helvetica').fillColor('#64748b').text(`REF: #${invoiceData.invoice_number}`, 400, 75, { align: 'right' });
        
        pdfBinaryStream.moveTo(50, 110).lineTo(545, 110).strokeColor('#e2e8f0').lineWidth(1).stroke();
        
        // Context Vectors Metadata Framework Layout Block
        pdfBinaryStream.fillColor('#0f172a').font('Helvetica-Bold').fontSize(12).text('BILL TO:', 50, 130);
        pdfBinaryStream.font('Helvetica').fontSize(11).fillColor('#334155').text(`Client Name: ${invoiceData.client_name}`, 50, 150);
        pdfBinaryStream.text(`Target Vector Destination: ${invoiceData.client_email}`, 50, 168);
        
        pdfBinaryStream.fillColor('#0f172a').font('Helvetica-Bold').fontSize(12).text('TIMELINE CHRONOLOGY:', 350, 130);
        pdfBinaryStream.font('Helvetica').fontSize(11).fillColor('#334155').text(`Generation Timestamp: ${new Date(invoiceData.issue_date).toLocaleDateString()}`, 350, 150);
        pdfBinaryStream.text(`Maturity Deadline Target: ${new Date(invoiceData.due_date).toLocaleDateString()}`, 350, 168);
        
        pdfBinaryStream.moveTo(50, 200).lineTo(545, 200).strokeColor('#e2e8f0').lineWidth(1).stroke();
        
        // Dynamic Allocation Content Block Processing
        pdfBinaryStream.fillColor('#0f172a').font('Helvetica-Bold').fontSize(12).text('ALLOCATED STATEMENT SERVICE SPECIFICATION ROWS', 50, 220);
        
        let verticalYMatrixCursor = 250;
        pdfBinaryStream.fillColor('#f8fafc').rect(50, verticalYMatrixCursor, 495, 22).fill();
        pdfBinaryStream.fillColor('#475569').font('Helvetica-Bold').fontSize(10).text('Line Description Structural Vector Block', 60, verticalYMatrixCursor + 6);
        pdfBinaryStream.text('Aggregate Allocation', 440, verticalYMatrixCursor + 6, { align: 'right', width: 90 });
        
        verticalYMatrixCursor += 22;
        
        let inventoryArray = [];
        try {
            inventoryArray = typeof invoiceData.items === 'string' ? JSON.parse(invoiceData.items) : invoiceData.items;
            if(!Array.isArray(inventoryArray)) inventoryArray = [];
        } catch(e) { 
            inventoryArray = [{ description: "Enterprise Technical Services Render Engine Allocation", amount: invoiceData.amount }];
        }
        
        pdfBinaryStream.font('Helvetica').fontSize(10).fillColor('#0f172a');
        if(inventoryArray.length === 0) {
            pdfBinaryStream.rect(50, verticalYMatrixCursor, 495, 24).strokeColor('#e2e8f0').stroke();
            pdfBinaryStream.text("General Systems Consulting & Production Integration Matrix", 60, verticalYMatrixCursor + 7);
            pdfBinaryStream.text(`$${parseFloat(invoiceData.amount).toFixed(2)}`, 440, verticalYMatrixCursor + 7, { align: 'right', width: 90 });
            verticalYMatrixCursor += 24;
        } else {
            inventoryArray.forEach((item) => {
                pdfBinaryStream.rect(50, verticalYMatrixCursor, 495, 24).strokeColor('#e2e8f0').stroke();
                pdfBinaryStream.text(item.description || "Service Allocation Structural Specification Line Row", 60, verticalYMatrixCursor + 7);
                pdfBinaryStream.text(`$${parseFloat(item.amount || 0).toFixed(2)}`, 440, verticalYMatrixCursor + 7, { align: 'right', width: 90 });
                verticalYMatrixCursor += 24;
            });
        }
        
        verticalYMatrixCursor += 15;
        pdfBinaryStream.moveTo(350, verticalYMatrixCursor).lineTo(545, verticalYMatrixCursor).strokeColor('#0f172a').lineWidth(1.5).stroke();
        
        verticalYMatrixCursor += 10;
        pdfBinaryStream.fillColor('#0f172a').font('Helvetica-Bold').fontSize(13).text('TOTAL COMPUTE BALANCE:', 220, verticalYMatrixCursor, { align: 'right', width: 200 });
        pdfBinaryStream.text(`$${parseFloat(invoiceData.amount).toFixed(2)}`, 440, verticalYMatrixCursor, { align: 'right', width: 90 });
        
        verticalYMatrixCursor += 25;
        pdfBinaryStream.fillColor(invoiceData.status === 'paid' ? '#16a34a' : '#d97706').rect(420, verticalYMatrixCursor, 125, 20).fill();
        pdfBinaryStream.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9).text(`STATUS: ${invoiceData.status.toUpperCase()}`, 420, verticalYMatrixCursor + 6, { align: 'center', width: 125 });
        
        // Operational Footnote Authentication Matrix Row
        pdfBinaryStream.fillColor('#94a3b8').font('Helvetica-Oblique').fontSize(9).text('This is a cryptographic auto-compiled structural artifact ledger generated by the DAN74TECH MEDIA framework platform.', 50, 740, { align: 'center', width: 495 });
        
        pdfBinaryStream.end();
    } catch (err) {
        console.error("❌ PDF Stream compilation error:", err);
        if(!res.headersSent) res.status(500).json({ error: "PDF Stream compilation runtime catastrophic event." });
    }
});

// =========================================================================
// 3. USERS ACCESS MATRIX MANAGEMENT CORE CONTROL PORTAL (CRUD)
// =========================================================================
app.get('/api/users', async (req, res) => {
    try {
        const fetchResult = await pool.query('SELECT id, name, email, role, phone, created_at, updated_at FROM users WHERE is_deleted = false ORDER BY id DESC');
        res.json(fetchResult.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', async (req, res) => {
    const { name, email, password, role, phone } = req.body;
    try {
        const securePasswordHash = await bcrypt.hash(password || 'FallbackSecNodePass74#', 10);
        const writeOp = await pool.query(
            `INSERT INTO users (name, email, password, role, phone, created_at, updated_at) 
             VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id, name, email, role, phone, created_at`,
            [name, email, securePasswordHash, role || 'client', phone]
        );
        broadcastSystemTelemetry('users', 'INSERT', writeOp.rows[0].id, writeOp.rows[0]);
        res.status(201).json(writeOp.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    const { name, email, role, phone, password } = req.body;
    try {
        let updateOp;
        if (password && password.trim() !== '') {
            const securePasswordHash = await bcrypt.hash(password, 10);
            updateOp = await pool.query(
                `UPDATE users SET name = $1, email = $2, role = $3, phone = $4, password = $5, updated_at = CURRENT_TIMESTAMP 
                 WHERE id = $6 AND is_deleted = false RETURNING id, name, email, role, phone, updated_at`,
                [name, email, role, phone, securePasswordHash, id]
            );
        } else {
            updateOp = await pool.query(
                `UPDATE users SET name = $1, email = $2, role = $3, phone = $4, updated_at = CURRENT_TIMESTAMP 
                 WHERE id = $5 AND is_deleted = false RETURNING id, name, email, role, phone, updated_at`,
                [name, email, role, phone, id]
            );
        }
        if (updateOp.rows.length === 0) return res.status(404).json({ error: "Identity core vector frame unallocated." });
        broadcastSystemTelemetry('users', 'UPDATE', id, updateOp.rows[0]);
        res.json(updateOp.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const softDeleteOp = await pool.query('UPDATE users SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *', [id]);
        if (softDeleteOp.rows.length === 0) return res.status(404).json({ error: "Identity core vector frame unallocated." });
        broadcastSystemTelemetry('users', 'DELETE', id);
        res.json({ message: "Identity credentials frame detached and marked soft deleted." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// 4. BLOG POSTS ARCHITECTURE CONTENT MATRIX CONTROL PORTAL (CRUD)
// =========================================================================
app.get('/api/blog_posts', async (req, res) => {
    try {
        const fetchResult = await pool.query('SELECT * FROM blog_posts WHERE is_deleted = false ORDER BY id DESC');
        res.json(fetchResult.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/blog_posts', async (req, res) => {
    const { title, category, content, summary, image_url, seo_title, seo_description, publisher_id, is_approved, author_id } = req.body;
    const dynamicSlug = generateCleanSlug(title || 'untitled-post');
    try {
        const writeOp = await pool.query(
            `INSERT INTO blog_posts (title, category, content, summary, image_url, slug, seo_title, seo_description, publisher_id, is_approved, author_id, likes_count, views_count, created_at, updated_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING *`,
            [title, category, content, summary, image_url, dynamicSlug, seo_title, seo_description, publisher_id, is_approved || false, author_id]
        );
        broadcastSystemTelemetry('blog_posts', 'INSERT', writeOp.rows[0].id, writeOp.rows[0]);
        res.status(201).json(writeOp.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/blog_posts/:id', async (req, res) => {
    const { id } = req.params;
    const { title, category, content, summary, image_url, seo_title, seo_description, publisher_id, is_approved, author_id, likes_count, views_count } = req.body;
    const dynamicSlug = generateCleanSlug(title || 'updated-post');
    try {
        const updateOp = await pool.query(
            `UPDATE blog_posts SET title = $1, category = $2, content = $3, summary = $4, image_url = $5, slug = $6, 
             seo_title = $7, seo_description = $8, publisher_id = $9, is_approved = $10, author_id = $11, 
             likes_count = $12, views_count = $13, updated_at = CURRENT_TIMESTAMP 
             WHERE id = $14 AND is_deleted = false RETURNING *`,
            [title, category, content, summary, image_url, dynamicSlug, seo_title, seo_description, publisher_id, is_approved, author_id, likes_count || 0, views_count || 0, id]
        );
        if (updateOp.rows.length === 0) return res.status(404).json({ error: "Content node payload matrix block not found." });
        broadcastSystemTelemetry('blog_posts', 'UPDATE', id, updateOp.rows[0]);
        res.json(updateOp.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/blog_posts/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const softDeleteOp = await pool.query('UPDATE blog_posts SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *', [id]);
        if (softDeleteOp.rows.length === 0) return res.status(404).json({ error: "Content node payload matrix block not found." });
        broadcastSystemTelemetry('blog_posts', 'DELETE', id);
        res.json({ message: "Content node structure flipped to hidden state allocation mode." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// 5. CASE STUDIES PRODUCTION PIPELINE SYSTEM CONTROL INTERFACE (CRUD)
// =========================================================================
app.get('/api/case_studies', async (req, res) => {
    try {
        const fetchResult = await pool.query('SELECT * FROM case_studies WHERE is_deleted = false ORDER BY id DESC');
        res.json(fetchResult.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/case_studies', async (req, res) => {
    const { title, category, challenge, solution, result, image_url } = req.body;
    try {
        const writeOp = await pool.query(
            `INSERT INTO case_studies (title, category, challenge, solution, result, image_url, created_at, updated_at) 
             VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING *`,
            [title, category, challenge, solution, result, image_url]
        );
        broadcastSystemTelemetry('case_studies', 'INSERT', writeOp.rows[0].id, writeOp.rows[0]);
        res.status(201).json(writeOp.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/case_studies/:id', async (req, res) => {
    const { id } = req.params;
    const { title, category, challenge, solution, result, image_url } = req.body;
    try {
        const updateOp = await pool.query(
            `UPDATE case_studies SET title = $1, category = $2, challenge = $3, solution = $4, result = $5, 
             image_url = $6, updated_at = CURRENT_TIMESTAMP 
             WHERE id = $7 AND is_deleted = false RETURNING *`,
            [title, category, challenge, solution, result, image_url, id]
        );
        if (updateOp.rows.length === 0) return res.status(404).json({ error: "Case deployment matrix structural node absent." });
        broadcastSystemTelemetry('case_studies', 'UPDATE', id, updateOp.rows[0]);
        res.json(updateOp.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/case_studies/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const softDeleteOp = await pool.query('UPDATE case_studies SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *', [id]);
        if (softDeleteOp.rows.length === 0) return res.status(404).json({ error: "Case deployment matrix structural node absent." });
        broadcastSystemTelemetry('case_studies', 'DELETE', id);
        res.json({ message: "Case architecture blueprint flagged as deleted." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// 6. TESTIMONIALS REPUTATION ENGINE INTERACTION PORTAL (CRUD)
// =========================================================================
app.get('/api/testimonials', async (req, res) => {
    try {
        const fetchResult = await pool.query('SELECT * FROM testimonials WHERE is_deleted = false ORDER BY id DESC');
        res.json(fetchResult.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/testimonials', async (req, res) => {
    const { client_name, client_designation, company, client_avatar_url, rating, review, status, is_featured, publisher_id, is_approved } = req.body;
    try {
        const writeOp = await pool.query(
            `INSERT INTO testimonials (client_name, client_designation, company, client_avatar_url, rating, review, status, is_featured, publisher_id, is_approved, created_at, updated_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING *`,
            [client_name, client_designation, company, client_avatar_url, rating, review, status || 'pending', is_featured || false, publisher_id, is_approved || false]
        );
        broadcastSystemTelemetry('testimonials', 'INSERT', writeOp.rows[0].id, writeOp.rows[0]);
        res.status(201).json(writeOp.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/testimonials/:id', async (req, res) => {
    const { id } = req.params;
    const { client_name, client_designation, company, client_avatar_url, rating, review, status, is_featured, publisher_id, is_approved } = req.body;
    try {
        const updateOp = await pool.query(
            `UPDATE testimonials SET client_name = $1, client_designation = $2, company = $3, client_avatar_url = $4, 
             rating = $5, review = $6, status = $7, is_featured = $8, publisher_id = $9, is_approved = $10, updated_at = CURRENT_TIMESTAMP 
             WHERE id = $11 AND is_deleted = false RETURNING *`,
            [client_name, client_designation, company, client_avatar_url, rating, review, status, is_featured, publisher_id, is_approved, id]
        );
        if (updateOp.rows.length === 0) return res.status(404).json({ error: "Reputation feedback ledger matrix block absent." });
        broadcastSystemTelemetry('testimonials', 'UPDATE', id, updateOp.rows[0]);
        res.json(updateOp.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/testimonials/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const softDeleteOp = await pool.query('UPDATE testimonials SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *', [id]);
        if (softDeleteOp.rows.length === 0) return res.status(404).json({ error: "Reputation feedback ledger matrix block absent." });
        broadcastSystemTelemetry('testimonials', 'DELETE', id);
        res.json({ message: "Reputation metric node successfully decommissioned from stream view." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// 7. SUPPORT TICKETS SERVICE PLATFORM ECOSYSTEM PIPELINE (CRUD)
// =========================================================================
app.get('/api/support_tickets', async (req, res) => {
    try {
        const fetchResult = await pool.query('SELECT * FROM support_tickets WHERE is_deleted = false ORDER BY id DESC');
        res.json(fetchResult.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/support_tickets', async (req, res) => {
    const { ticket_number, customer_name, email, subject, message, status, priority } = req.body;
    try {
        const calculatedTicketNum = ticket_number || `TKT-${Math.floor(100000 + Math.random() * 900000)}`;
        const writeOp = await pool.query(
            `INSERT INTO support_tickets (ticket_number, customer_name, email, subject, message, status, priority, created_at, updated_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING *`,
            [calculatedTicketNum, customer_name, email, subject, message, status || 'open', priority || 'medium']
        );
        broadcastSystemTelemetry('support_tickets', 'INSERT', writeOp.rows[0].id, writeOp.rows[0]);
        res.status(201).json(writeOp.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/support_tickets/:id', async (req, res) => {
    const { id } = req.params;
    const { ticket_number, customer_name, email, subject, message, status, priority } = req.body;
    try {
        const updateOp = await pool.query(
            `UPDATE support_tickets SET ticket_number = $1, customer_name = $2, email = $3, subject = $4, 
             message = $5, status = $6, priority = $7, updated_at = CURRENT_TIMESTAMP 
             WHERE id = $8 AND is_deleted = false RETURNING *`,
            [ticket_number, customer_name, email, subject, message, status, priority, id]
        );
        if (updateOp.rows.length === 0) return res.status(404).json({ error: "Support operation ledger ticket not discovered." });
        broadcastSystemTelemetry('support_tickets', 'UPDATE', id, updateOp.rows[0]);
        res.json(updateOp.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/support_tickets/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const softDeleteOp = await pool.query('UPDATE support_tickets SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *', [id]);
        if (softDeleteOp.rows.length === 0) return res.status(404).json({ error: "Support operation ledger ticket not discovered." });
        broadcastSystemTelemetry('support_tickets', 'DELETE', id);
        res.json({ message: "Support event record marked as processed and archived." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// AUTOMATED CRON CHRONOLOGICAL DATABASE BACKUP WORKER MATRIX ENGINE
// SCHEDULED: EVERY 24 HOURS AT 00:00 NAIROBI TIME (EAT)
// =========================================================================
cron.schedule('0 0 * * *', () => {
    console.log("⏱️ Initializing automated database backup cycle to AWS S3 storage structure...");
    
    if (!process.env.DATABASE_URL) {
        console.error("❌ S3 Backup terminated: DATABASE_URL missing from environment variables.");
        return;
    }
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.S3_BUCKET_NAME) {
        console.warn("⚠️ S3 Backup aborted: AWS credentials or Bucket Name missing in environment.");
        return;
    }

    const fileName = `dan74tech_backup_${Date.now()}.sql`;
    const filePath = path.join(__dirname, 'uploads', fileName);
    
    // Ensure temporal output folder exists safely
    if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
        fs.mkdirSync(path.join(__dirname, 'uploads'));
    }

    const dumpCmd = `pg_dump ${process.env.DATABASE_URL} -F p -f ${filePath}`;

    exec(dumpCmd, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ pg_dump error executing runtime capture binary: ${error.message}`);
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
                console.error("❌ AWS S3 Secure Matrix Object Upload Error:", err);
            } else {
                console.log(`✅ Database successfully backed up to S3 secure data cluster: ${data.Location}`);
            }
            
            // Purge temporal local binary trace
            try {
                fs.unlinkSync(filePath);
            } catch (unlinkErr) {
                console.error("⚠️ Failed to purge temporary backup file from disk array:", unlinkErr.message);
            }
        });
    });
}, {
    scheduled: true,
    timezone: "Africa/Nairobi"
});

// =========================================================================
// SERVER CORE INITIALIZATION EXECUTION NODE BIND
// =========================================================================
server.listen(PORT, () => {
    console.log(`=========================================================================`);
    console.log(`🚀 DAN74TECH MEDIA UNIFIED SYSTEM IS FULLY COMPILED AND OPERATIONAL`);
    console.log(`📡 CORE SYSTEM ACCESS PORTAL BOUND AT NETWORK PORT: ${PORT}`);
    console.log(`🎯 TARGET ENVIRONMENT DATABASE TARGET NODE STATUS: READY`);
    console.log(`=========================================================================`);
});
