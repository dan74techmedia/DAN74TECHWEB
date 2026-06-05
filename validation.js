// =========================================================================
// DAN74TECH MEDIA - INPUT VALIDATION MIDDLEWARE
// Safe, non-breaking validation layer for all endpoints
// =========================================================================

const { body, query, param, validationResult } = require('express-validator');

// ================= ERROR HANDLER FOR VALIDATION =================
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            error: "Validation failed",
            details: errors.array().map(err => ({
                field: err.param,
                message: err.msg,
                value: err.value
            }))
        });
    }
    next();
};

// ================= AUTHENTICATION VALIDATION =================
const validateRegister = [
    body('name')
        .trim()
        .notEmpty().withMessage('Name is required')
        .isLength({ min: 2, max: 255 }).withMessage('Name must be between 2-255 characters'),
    body('email')
        .trim()
        .isEmail().withMessage('Valid email is required')
        .normalizeEmail(),
    body('password')
        .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('phone')
        .optional()
        .trim()
        .matches(/^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/)
        .withMessage('Invalid phone format'),
    body('role')
        .optional()
        .isIn(['client', 'admin']).withMessage('Role must be client or admin'),
    handleValidationErrors
];

const validateLogin = [
    body('email')
        .trim()
        .isEmail().withMessage('Valid email is required')
        .normalizeEmail(),
    body('password')
        .notEmpty().withMessage('Password is required'),
    handleValidationErrors
];

// ================= SERVICES VALIDATION =================
const validateServiceCreate = [
    body('name')
        .trim()
        .notEmpty().withMessage('Service name is required')
        .isLength({ min: 2, max: 255 }).withMessage('Name must be between 2-255 characters'),
    body('icon')
        .trim()
        .notEmpty().withMessage('Icon is required')
        .matches(/^fa-[a-z-]+$/).withMessage('Icon must be valid FontAwesome format (e.g., fa-code)'),
    body('description')
        .optional()
        .trim()
        .isLength({ max: 2000 }).withMessage('Description cannot exceed 2000 characters'),
    handleValidationErrors
];

const validateServiceUpdate = [
    param('id')
        .isInt({ min: 1 }).withMessage('Service ID must be a positive integer'),
    body('name')
        .optional()
        .trim()
        .isLength({ min: 2, max: 255 }).withMessage('Name must be between 2-255 characters'),
    body('icon')
        .optional()
        .trim()
        .matches(/^fa-[a-z-]+$/).withMessage('Icon must be valid FontAwesome format'),
    body('description')
        .optional()
        .trim()
        .isLength({ max: 2000 }).withMessage('Description cannot exceed 2000 characters'),
    handleValidationErrors
];

// ================= SUB-SERVICES VALIDATION =================
const validateSubServiceCreate = [
    body('service_id')
        .isInt({ min: 1 }).withMessage('Service ID must be a positive integer'),
    body('name')
        .trim()
        .notEmpty().withMessage('Package name is required')
        .isLength({ min: 2, max: 255 }).withMessage('Name must be between 2-255 characters'),
    body('price')
        .isFloat({ min: 0 }).withMessage('Price must be a positive number'),
    body('description')
        .optional()
        .trim()
        .isLength({ max: 2000 }).withMessage('Description cannot exceed 2000 characters'),
    handleValidationErrors
];

// ================= ORDERS VALIDATION =================
const validateOrderCreate = [
    body('customer_name')
        .trim()
        .notEmpty().withMessage('Customer name is required')
        .isLength({ min: 2, max: 255 }).withMessage('Name must be between 2-255 characters'),
    body('phone')
        .trim()
        .notEmpty().withMessage('Phone is required')
        .matches(/^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/)
        .withMessage('Invalid phone format'),
    body('service')
        .trim()
        .notEmpty().withMessage('Service is required')
        .isLength({ max: 255 }).withMessage('Service name too long'),
    body('sub_service')
        .optional()
        .trim()
        .isLength({ max: 255 }).withMessage('Sub-service name too long'),
    body('domain')
        .optional()
        .trim()
        .isLength({ max: 255 }).withMessage('Domain too long'),
    body('device_model')
        .optional()
        .trim()
        .isLength({ max: 255 }).withMessage('Device model too long'),
    body('project_details')
        .optional()
        .trim()
        .isLength({ max: 5000 }).withMessage('Project details cannot exceed 5000 characters'),
    body('price')
        .optional()
        .isFloat({ min: 0 }).withMessage('Price must be a positive number'),
    body('status')
        .optional()
        .isIn(['pending', 'in progress', 'completed', 'cancelled'])
        .withMessage('Invalid order status'),
    body('payment_status')
        .optional()
        .isIn(['unpaid', 'paid']).withMessage('Invalid payment status'),
    body('user_id')
        .optional()
        .isInt({ min: 1 }).withMessage('User ID must be a positive integer'),
    handleValidationErrors
];

const validateOrderUpdate = [
    param('id')
        .isInt({ min: 1 }).withMessage('Order ID must be a positive integer'),
    body('status')
        .optional()
        .isIn(['pending', 'in progress', 'completed', 'cancelled'])
        .withMessage('Invalid order status'),
    body('payment_status')
        .optional()
        .isIn(['unpaid', 'paid']).withMessage('Invalid payment status'),
    body('price')
        .optional()
        .isFloat({ min: 0 }).withMessage('Price must be a positive number'),
    handleValidationErrors
];

// ================= PORTFOLIO VALIDATION =================
const validatePortfolioCreate = [
    body('title')
        .trim()
        .notEmpty().withMessage('Portfolio title is required')
        .isLength({ min: 2, max: 255 }).withMessage('Title must be between 2-255 characters'),
    body('category')
        .trim()
        .notEmpty().withMessage('Category is required')
        .isLength({ min: 2, max: 255 }).withMessage('Category must be between 2-255 characters'),
    body('description')
        .optional()
        .trim()
        .isLength({ max: 5000 }).withMessage('Description cannot exceed 5000 characters'),
    body('link')
        .optional()
        .trim()
        .isURL().withMessage('Link must be a valid URL'),
    body('progress')
        .optional()
        .isInt({ min: 0, max: 100 }).withMessage('Progress must be between 0-100'),
    body('status')
        .optional()
        .isIn(['In Progress', 'Completed', 'On Hold'])
        .withMessage('Invalid portfolio status'),
    body('order_id')
        .optional()
        .isInt({ min: 1 }).withMessage('Order ID must be a positive integer'),
    handleValidationErrors
];

const validatePortfolioUpdate = [
    param('id')
        .isInt({ min: 1 }).withMessage('Portfolio ID must be a positive integer'),
    body('progress')
        .optional()
        .isInt({ min: 0, max: 100 }).withMessage('Progress must be between 0-100'),
    body('status')
        .optional()
        .isIn(['In Progress', 'Completed', 'On Hold'])
        .withMessage('Invalid portfolio status'),
    body('title')
        .optional()
        .trim()
        .isLength({ min: 2, max: 255 }).withMessage('Title must be between 2-255 characters'),
    body('description')
        .optional()
        .trim()
        .isLength({ max: 5000 }).withMessage('Description cannot exceed 5000 characters'),
    handleValidationErrors
];

// ================= BLOG VALIDATION =================
const validateBlogCreate = [
    body('title')
        .trim()
        .notEmpty().withMessage('Title is required')
        .isLength({ min: 2, max: 255 }).withMessage('Title must be between 2-255 characters'),
    body('category')
        .trim()
        .notEmpty().withMessage('Category is required')
        .isLength({ min: 2, max: 255 }).withMessage('Category must be between 2-255 characters'),
    body('slug')
        .trim()
        .notEmpty().withMessage('Slug is required')
        .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).withMessage('Slug must contain only lowercase letters, numbers, and hyphens'),
    body('content')
        .trim()
        .notEmpty().withMessage('Content is required')
        .isLength({ min: 10 }).withMessage('Content must be at least 10 characters'),
    body('summary')
        .optional()
        .trim()
        .isLength({ max: 500 }).withMessage('Summary cannot exceed 500 characters'),
    body('image_url')
        .optional()
        .trim()
        .isURL().withMessage('Image URL must be valid'),
    body('seo_title')
        .optional()
        .trim()
        .isLength({ max: 255 }).withMessage('SEO title cannot exceed 255 characters'),
    body('seo_description')
        .optional()
        .trim()
        .isLength({ max: 500 }).withMessage('SEO description cannot exceed 500 characters'),
    handleValidationErrors
];

// ================= CASE STUDIES VALIDATION =================
const validateCaseStudyCreate = [
    body('title')
        .trim()
        .notEmpty().withMessage('Title is required')
        .isLength({ min: 2, max: 255 }).withMessage('Title must be between 2-255 characters'),
    body('category')
        .trim()
        .notEmpty().withMessage('Category is required')
        .isLength({ min: 2, max: 255 }).withMessage('Category must be between 2-255 characters'),
    body('challenge')
        .trim()
        .notEmpty().withMessage('Challenge is required')
        .isLength({ min: 10 }).withMessage('Challenge must be at least 10 characters'),
    body('solution')
        .trim()
        .notEmpty().withMessage('Solution is required')
        .isLength({ min: 10 }).withMessage('Solution must be at least 10 characters'),
    body('result')
        .trim()
        .notEmpty().withMessage('Result is required')
        .isLength({ min: 10 }).withMessage('Result must be at least 10 characters'),
    body('image_url')
        .optional()
        .trim()
        .isURL().withMessage('Image URL must be valid'),
    handleValidationErrors
];

// ================= TESTIMONIALS VALIDATION =================
const validateTestimonialCreate = [
    body('client_name')
        .trim()
        .notEmpty().withMessage('Client name is required')
        .isLength({ min: 2, max: 255 }).withMessage('Name must be between 2-255 characters'),
    body('company')
        .optional()
        .trim()
        .isLength({ max: 255 }).withMessage('Company name cannot exceed 255 characters'),
    body('rating')
        .isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1-5'),
    body('review')
        .trim()
        .notEmpty().withMessage('Review is required')
        .isLength({ min: 10, max: 2000 }).withMessage('Review must be between 10-2000 characters'),
    body('client_designation')
        .optional()
        .trim()
        .isLength({ max: 255 }).withMessage('Designation cannot exceed 255 characters'),
    body('client_avatar_url')
        .optional()
        .trim()
        .isURL().withMessage('Avatar URL must be valid'),
    handleValidationErrors
];

// ================= INVOICES VALIDATION =================
const validateInvoiceCreate = [
    body('invoice_number')
        .trim()
        .notEmpty().withMessage('Invoice number is required')
        .isLength({ min: 2, max: 100 }).withMessage('Invoice number must be between 2-100 characters'),
    body('client_name')
        .trim()
        .notEmpty().withMessage('Client name is required')
        .isLength({ min: 2, max: 255 }).withMessage('Name must be between 2-255 characters'),
    body('client_email')
        .optional()
        .trim()
        .isEmail().withMessage('Valid email is required'),
    body('amount')
        .isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
    body('status')
        .optional()
        .isIn(['unpaid', 'paid']).withMessage('Invalid invoice status'),
    body('order_id')
        .optional()
        .isInt({ min: 1 }).withMessage('Order ID must be a positive integer'),
    handleValidationErrors
];

// ================= MESSAGES VALIDATION =================
const validateMessageCreate = [
    body('name')
        .trim()
        .notEmpty().withMessage('Name is required')
        .isLength({ min: 2, max: 255 }).withMessage('Name must be between 2-255 characters'),
    body('email')
        .trim()
        .isEmail().withMessage('Valid email is required')
        .normalizeEmail(),
    body('subject')
        .optional()
        .trim()
        .isLength({ max: 255 }).withMessage('Subject cannot exceed 255 characters'),
    body('message')
        .trim()
        .notEmpty().withMessage('Message is required')
        .isLength({ min: 5, max: 5000 }).withMessage('Message must be between 5-5000 characters'),
    handleValidationErrors
];

// ================= SUPPORT TICKETS VALIDATION =================
const validateTicketCreate = [
    body('subject')
        .trim()
        .notEmpty().withMessage('Subject is required')
        .isLength({ min: 2, max: 255 }).withMessage('Subject must be between 2-255 characters'),
    body('description')
        .trim()
        .notEmpty().withMessage('Description is required')
        .isLength({ min: 10, max: 5000 }).withMessage('Description must be between 10-5000 characters'),
    body('priority')
        .optional()
        .isIn(['low', 'medium', 'high']).withMessage('Invalid priority level'),
    body('user_id')
        .optional()
        .isInt({ min: 1 }).withMessage('User ID must be a positive integer'),
    handleValidationErrors
];

const validateTicketUpdate = [
    param('id')
        .isInt({ min: 1 }).withMessage('Ticket ID must be a positive integer'),
    body('status')
        .optional()
        .isIn(['open', 'pending', 'closed']).withMessage('Invalid ticket status'),
    body('priority')
        .optional()
        .isIn(['low', 'medium', 'high']).withMessage('Invalid priority level'),
    handleValidationErrors
];

// ================= CONSULTATIONS VALIDATION =================
const validateConsultationCreate = [
    body('client_name')
        .trim()
        .notEmpty().withMessage('Client name is required')
        .isLength({ min: 2, max: 255 }).withMessage('Name must be between 2-255 characters'),
    body('client_email')
        .trim()
        .isEmail().withMessage('Valid email is required')
        .normalizeEmail(),
    body('booking_date')
        .isISO8601().withMessage('Valid date is required'),
    body('booking_time')
        .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid time is required (HH:MM format)'),
    body('platform')
        .optional()
        .trim()
        .isLength({ max: 100 }).withMessage('Platform cannot exceed 100 characters'),
    handleValidationErrors
];

const validateConsultationUpdate = [
    param('id')
        .isInt({ min: 1 }).withMessage('Consultation ID must be a positive integer'),
    body('status')
        .optional()
        .isIn(['pending', 'approved', 'completed']).withMessage('Invalid consultation status'),
    handleValidationErrors
];

// ================= SUBSCRIBERS VALIDATION =================
const validateSubscriberCreate = [
    body('email')
        .trim()
        .isEmail().withMessage('Valid email is required')
        .normalizeEmail(),
    handleValidationErrors
];

// ================= FILE DELIVERY VALIDATION =================
const validateFileDeliveryCreate = [
    body('file_name')
        .optional()
        .trim()
        .isLength({ max: 255 }).withMessage('File name cannot exceed 255 characters'),
    body('file_url')
        .optional()
        .trim()
        .isURL().withMessage('File URL must be valid'),
    body('expiry_date')
        .optional()
        .isISO8601().withMessage('Valid expiry date is required'),
    body('order_id')
        .optional()
        .isInt({ min: 1 }).withMessage('Order ID must be a positive integer'),
    body('client_id')
        .optional()
        .isInt({ min: 1 }).withMessage('Client ID must be a positive integer'),
    handleValidationErrors
];

// ================= PAGINATION QUERY VALIDATION =================
const validatePaginationQuery = [
    query('page')
        .optional()
        .isInt({ min: 1 }).withMessage('Page must be a positive integer')
        .toInt(),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1-100')
        .toInt(),
    query('sort')
        .optional()
        .matches(/^[a-zA-Z_]+:(asc|desc)$/).withMessage('Sort format must be field:asc or field:desc'),
    query('search')
        .optional()
        .trim()
        .isLength({ max: 255 }).withMessage('Search cannot exceed 255 characters'),
    handleValidationErrors
];

// ================= ID VALIDATION =================
const validateIdParam = [
    param('id')
        .isInt({ min: 1 }).withMessage('ID must be a positive integer'),
    handleValidationErrors
];

module.exports = {
    // Auth
    validateRegister,
    validateLogin,
    
    // Services
    validateServiceCreate,
    validateServiceUpdate,
    
    // Sub-services
    validateSubServiceCreate,
    
    // Orders
    validateOrderCreate,
    validateOrderUpdate,
    
    // Portfolio
    validatePortfolioCreate,
    validatePortfolioUpdate,
    
    // Blog
    validateBlogCreate,
    
    // Case Studies
    validateCaseStudyCreate,
    
    // Testimonials
    validateTestimonialCreate,
    
    // Invoices
    validateInvoiceCreate,
    
    // Messages
    validateMessageCreate,
    
    // Support Tickets
    validateTicketCreate,
    validateTicketUpdate,
    
    // Consultations
    validateConsultationCreate,
    validateConsultationUpdate,
    
    // Subscribers
    validateSubscriberCreate,
    
    // File Deliveries
    validateFileDeliveryCreate,
    
    // Query validation
    validatePaginationQuery,
    validateIdParam,
    
    // Handler
    handleValidationErrors
};
  
