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
// 1. CORE SYSTEM MIDDLEWARE & ROUTING
// ==========================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// Helper function for dynamic route data-sanitization slug creation
function generateSlug(text) {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')       // Replace spaces with -
        .replace(/[^\w\-]+/g, '')   // Remove all non-word chars
        .replace(/\-\-+/g, '-');    // Replace multiple - with single -
}

// Serve static HTML wrappers smoothly
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ==========================================
// 2. NEON POSTGRESQL CONNECTIVITY POOL
// ==========================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Auto-Initialization Routine to secure table layers across system modules
async function initializeDatabaseSchema() {
    try {
        // Services parent table initialization supporting dynamic routes mapping
        await pool.query(`
            CREATE TABLE IF NOT EXISTS services (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                price VARCHAR(100),
                category VARCHAR(100),
                page_route VARCHAR(100) DEFAULT 'web',
                icon VARCHAR(50) DEFAULT '🔧'
            );
        `);

        // Sub-services detailed structural tables mappings
        await pool.query(`
            CREATE TABLE IF NOT EXISTS sub_services (
                id SERIAL PRIMARY KEY,
                service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                price VARCHAR(100) NOT NULL
            );
        `);

        // Orders Tracking Registry table initialization matching form submissions
        await pool.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                customer_name VARCHAR(255) NOT NULL,
                service_type TEXT NOT NULL,
                amount_paid INTEGER NOT NULL,
                instructions TEXT,
                status VARCHAR(100) DEFAULT 'Pending Verification',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        // Portfolio showcase table initialization
        await pool.query(`
            CREATE TABLE IF NOT EXISTS portfolio (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                media_url TEXT NOT NULL,
                media_type VARCHAR(50) DEFAULT 'image',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("🚀 Neon Database Schema verified and completely initialized.");
    } catch (err) {
        console.error("❌ Database schema initialization failure:", err);
    }
}
initializeDatabaseSchema();

// ==========================================
// 3. CLOUDINARY MEDIA GATEWAY CONFIGURATION
// ==========================================
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_DB,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Memory storage for serverless runtime stability
const upload = multer({ storage: multer.memoryStorage() });

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

// ==========================================
// 4. API ENDPOINTS: SERVICES & SUB-SERVICES
// ==========================================

// CLEAN SUB SERVICES API (FIXED VERSION)
app.get('/api/sub-services/:route', async (req, res) => {
    const { route } = req.params;

    try {
        // Step 1: Get service ID from route parameters safely
        const service = await pool.query(
            `SELECT id FROM services WHERE page_route = $1`,
            [route]
        );

        if (service.rows.length === 0) {
            return res.json([]);
        }

        const serviceId = service.rows[0].id;

        // Step 2: Get child sub-services sorted analytically by price values
        const subServices = await pool.query(
            `SELECT 
                id,
                title,
                description,
                price
             FROM sub_services
             WHERE service_id = $1
             ORDER BY CAST(price AS INTEGER) ASC`,
            [serviceId]
        );

        // Step 3: Clean output payload return directly to front facing views
        res.json(subServices.rows);

    } catch (err) {
        console.error("Sub-services payload generation error:", err);
        res.status(500).json({
            error: "Failed to load sub services assets array mapping cleanly."
        });
    }
});

// GET all items - Feeds package pipeline to frontend forms and layouts
app.get('/api/services', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM services ORDER BY id DESC');
        
        // Data sanitization fallback: Map page_route cleanly using regex hyphenation if missing
        const sanitizedData = result.rows.map(row => {
            if (!row.page_route && row.category) {
                row.page_route = generateSlug(row.category);
            }
            return row;
        });
        
        res.json(sanitizedData);
    } catch (err) {
        console.error("Fetch services error:", err);
        res.status(500).json({ error: "Failed to pull package dataset streams." });
    }
});

// POST a new category/package - Published from admin operations portal
app.post('/api/services', async (req, res) => {
    const { title, description, price, category, page_route, icon } = req.body;
    
    // Strict match to admin schema logic mapping profiles
    const finalRoute = page_route || generateSlug(category || title);

    try {
        await pool.query(
            'INSERT INTO services (title, description, price, category, page_route, icon) VALUES ($1, $2, $3, $4, $5, $6)',
            [title, description, price || '0', category, finalRoute, icon || '🔧']
        );
        res.status(201).json({ success: true, message: "New custom tier published live." });
    } catch (err) {
        console.error("Insert service error:", err);
        res.status(500).json({ error: "Insertion schema validation fault." });
    }
});

// PUT (Update) an existing service category/package
app.put('/api/services/:id', async (req, res) => {
    const { id } = req.params;
    const { title, description, price, category, page_route, icon } = req.body;
    
    const finalRoute = page_route || generateSlug(category || title);

    try {
        const updateResult = await pool.query(
            'UPDATE services SET title = $1, description = $2, price = $3, category = $4, page_route = $5, icon = $6 WHERE id = $7',
            [title, description, price || '0', category, finalRoute, icon || '🔧', id]
        );
        
        if (updateResult.rowCount === 0) {
            return res.status(404).json({ error: "Target data node not located." });
        }
        res.json({ success: true, message: "Package data modifications compiled successfully." });
    } catch (err) {
        console.error("Update service error:", err);
        res.status(500).json({ error: "Data manipulation update block exception." });
    }
});

// DELETE a service package
app.delete('/api/services/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const deleteResult = await pool.query('DELETE FROM services WHERE id = $1', [id]);
        if (deleteResult.rowCount === 0) {
            return res.status(404).json({ error: "Target data record absent." });
        }
        res.json({ success: true, message: "Data package dropped permanently." });
    } catch (err) {
        console.error("Delete service error:", err);
        res.status(500).json({ error: "Purge process interrupted." });
    }
});

// ==========================================
// 5. API ENDPOINTS: ORDERS INTERCEPTOR
// ==========================================

// POST incoming checkout configurations directly to tracking database
app.post('/api/orders', async (req, res) => {
    const { customerName, serviceType, amountPaid, instructions, status } = req.body;

    try {
        await pool.query(
            `INSERT INTO orders (customer_name, service_type, amount_paid, instructions, status) 
             VALUES ($1, $2, $3, $4, $5)`,
            [customerName, serviceType, amountPaid, instructions, status || 'Pending Verification']
        );
        res.status(201).json({ success: true, message: "Order records processed and recorded flawlessly." });
    } catch (err) {
        console.error("Order insertion pipeline transaction error:", err);
        res.status(500).json({ error: "Internal ledger processing data exception." });
    }
});

// ==========================================
// 6. API ENDPOINTS: PORTFOLIO SHOWCASE
// ==========================================

// GET all showcase work items
app.get('/api/portfolio', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM portfolio ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        console.error("Fetch portfolio error:", err);
        res.status(500).json({ error: "Unable to retrieve production work data feeds." });
    }
});

// POST new work item using Multer buffer pipe straight to Cloudinary hosting
app.post('/api/portfolio', upload.single('mediaFile'), async (req, res) => {
    try {
        const { title, description, media_type, youtubeUrl } = req.body;
        let finalMediaUrl = youtubeUrl || '';

        // If a physical file layout upload is captured, route it to Cloudinary cloud vaults
        if (req.file) {
            finalMediaUrl = await uploadToCloudinary(req.file.buffer);
        }

        if (!finalMediaUrl) {
            return res.status(400).json({ error: "Missing required asset source reference url or stream file." });
        }

        await pool.query(
            'INSERT INTO portfolio (title, description, media_url, media_type) VALUES ($1, $2, $3, $4)',
            [title, description, finalMediaUrl, media_type || 'image']
        );

        res.status(201).json({ success: true, message: "Production milestone entry broadcasted." });
    } catch (err) {
        console.error("Portfolio publish error:", err);
        res.status(500).json({ error: "Showcase module streaming connection fault." });
    }
});

// DELETE a showcase portfolio record
app.delete('/api/portfolio/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM portfolio WHERE id = $1', [id]);
        res.json({ success: true, message: "Portfolio item entry dropped." });
    } catch (err) {
        console.error("Delete portfolio item error:", err);
        res.status(500).json({ error: "Showcase element drop routine failed." });
    }
});

// ==========================================
// 7. SYSTEM INSTANTIATION INITIALIZER
// ==========================================
app.listen(PORT, () => {
    console.log(`📡 Core Application Online Layer Active. Listening on port: ${PORT}`);
});
