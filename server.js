const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const compression = require("compression");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const slowDown = require("express-slow-down");
const mongoSanitize = require("express-mongo-sanitize");
const hpp = require("hpp");
const path = require("path");
require("dotenv").config();

// Initialize Firebase Admin
const admin = require("firebase-admin");
let serviceAccount;

// Attempt to load credentials from local file first (useful for local development)
try {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  serviceAccount = require("./config/firebase-service-account.json");
} catch (fileErr) {
  // Fallback: expect the credentials JSON to be provided as a single env variable
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (parseErr) {
      console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT env variable. Make sure it contains valid JSON.");
      console.error(parseErr);
    }
  }
}

if (!serviceAccount) {
  console.error(
    "Firebase service account credentials missing. Provide ./config/firebase-service-account.json (for local) or set FIREBASE_SERVICE_ACCOUNT env variable (for production).",
  );
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  // Prefer explicitly set project ID via env, fallback to the one in the service account JSON
  projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id,
});

// Connect to MongoDB
const connectDB = require("./config/database");
connectDB();

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const partnerRoutes = require("./routes/partners");
const partnerOnboardingRoutes = require("./routes/partnerOnboarding");
const adminRoutes = require("./routes/admin");
const adminSetupRoutes = require("./routes/adminSetup");
const leadsRoutes = require("./routes/leads");
const publicRoutes = require("./routes/public"); // Add public routes
const { errorHandler, notFound } = require("./middleware/errorHandler");
const { securityHeaders } = require("./middleware/security");
const notificationRoutes = require("./routes/notifications");

const app = express();

// Trust proxy for accurate IP addresses behind reverse proxy
app.set("trust proxy", 1);

// Security middleware with updated CSP for Firebase
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://www.gstatic.com",
          "https://apis.google.com",
          "https://securetoken.googleapis.com",
          "https://www.googleapis.com",
        ],
        connectSrc: [
          "'self'",
          "https://identitytoolkit.googleapis.com",
          "https://*.firebaseio.com",
          "https://securetoken.googleapis.com",
          "https://www.googleapis.com",
          "https://*.googleapis.com",
        ],
        frameSrc: ["'self'", "https://*.firebaseapp.com", "https://accounts.google.com"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "https:", "data:"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        childSrc: ["'self'", "https://*.firebaseapp.com"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }),
);

// CORS configuration
app.use(
  cors({
    origin: "*" || process.env.ALLOWED_ORIGINS?.split(",") || ["http://localhost:3000"],
    credentials: true,
    optionsSuccessStatus: 200,
  }),
);

// Compression
app.use(compression());

// Logging
app.use(morgan("combined"));

// Body parsing with size limits
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Data sanitization
app.use(mongoSanitize());
app.use(hpp());

// Custom security headers
app.use(securityHeaders);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, "public")));

// Rate limiting with memory store
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: "Too many requests from this IP, please try again later.",
    retryAfter: "15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 auth requests per windowMs
  message: {
    error: "Too many authentication attempts, please try again later.",
    retryAfter: "15 minutes",
  },
  skipSuccessfulRequests: true,
});

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Higher limit for public APIs
  message: {
    error: "Too many requests from this IP, please try again later.",
    retryAfter: "15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 50, // allow 50 requests per 15 minutes at full speed
  delayMs: () => 500, // slow down subsequent requests by 500ms per request (new behavior)
});

app.use(limiter);
app.use(speedLimiter);

// Routes
app.use("/api/v1/auth", authLimiter, authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/partners", partnerRoutes);
app.use("/api/v1/partner-onboarding", partnerOnboardingRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/admin-setup", adminSetupRoutes);
app.use("/api/v1/leads", leadsRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/public", publicLimiter, publicRoutes); // Add public routes with higher rate limit

// Admin setup page route
app.get("/admin-setup", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin-setup.html"));
});

// Root route – useful for Render health checks / simple status
app.get("/", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "Createsco API is running",
    timestamp: new Date().toISOString(),
  });
});

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    firebase: admin.apps.length > 0 ? "connected" : "disconnected",
  });
});

// Error handling
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Firebase project: ${process.env.FIREBASE_PROJECT_ID}`);
});

module.exports = app;
