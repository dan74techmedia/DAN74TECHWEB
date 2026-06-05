// =========================================================================
// DAN74TECH MEDIA - ENHANCED ERROR HANDLING MIDDLEWARE
// Integrated into server.js for better error reporting
// =========================================================================

/**
 * USAGE IN server.js:
 * 
 * Add this near the top after requiring dotenv:
 * const { errorHandler, asyncHandler } = require('./middleware/errorHandler');
 * 
 * Add this at the END of server.js (after all routes):
 * app.use(errorHandler);
 * 
 * Wrap async route handlers with asyncHandler:
 * app.get('/api/route', asyncHandler(async (req, res) => {
 *     // your code - errors are automatically caught
 * }));
 */

// Wrapper for async route handlers to catch errors automatically
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Global error handling middleware
const errorHandler = (err, req, res, next) => {
    console.error('❌ Error:', {
        message: err.message,
        status: err.status || 500,
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
    });

    // Validation errors
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: err.message
        });
    }

    // Database errors
    if (err.code === '23505') { // Duplicate key
        return res.status(409).json({
            success: false,
            error: 'Record already exists',
            details: 'This record conflicts with existing data'
        });
    }

    if (err.code === '23503') { // Foreign key violation
        return res.status(400).json({
            success: false,
            error: 'Invalid reference',
            details: 'Referenced record does not exist'
        });
    }

    if (err.code === '23502') { // Not null violation
        return res.status(400).json({
            success: false,
            error: 'Missing required field',
            details: err.detail || 'A required field is missing'
        });
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        return res.status(403).json({
            success: false,
            error: 'Invalid token',
            details: 'Authentication token is invalid'
        });
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            success: false,
            error: 'Token expired',
            details: 'Please login again'
        });
    }

    // Default error response
    const status = err.status || 500;
    const message = err.message || 'Internal server error';

    res.status(status).json({
        success: false,
        error: message,
        status: status,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

// Request logging middleware
const requestLogger = (req, res, next) => {
    const startTime = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
    });
    
    next();
};

module.exports = {
    asyncHandler,
    errorHandler,
    requestLogger
};
