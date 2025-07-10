const xss = require("xss");
const UAParser = require("ua-parser-js");
const geoip = require("geoip-lite");

const securityHeaders = (req, res, next) => {
  // Remove server header
  res.removeHeader("X-Powered-By");

  // Add security headers
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");

  next();
};

const sanitizeInput = (req, res, next) => {
  if (req.body) {
    for (const key in req.body) {
      if (typeof req.body[key] === "string") {
        req.body[key] = xss(req.body[key]);
      }
    }
  }
  next();
};

const deviceFingerprinting = (req, res, next) => {
  const userAgent = req.get("User-Agent");
  const ip = req.ip || req.connection.remoteAddress;

  if (userAgent) {
    const parser = new UAParser(userAgent);
    req.deviceInfo = {
      browser: parser.getBrowser(),
      os: parser.getOS(),
      device: parser.getDevice(),
      ip: ip,
      location: geoip.lookup(ip),
    };
  }

  next();
};

module.exports = {
  securityHeaders,
  sanitizeInput,
  deviceFingerprinting,
};
