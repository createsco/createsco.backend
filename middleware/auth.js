const jwt = require("jsonwebtoken")
const pool = require("../config/database")
const redisClient = require("../config/redis")

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"]
    const token = authHeader && authHeader.split(" ")[1]

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access token required",
      })
    }

    // Check if token is blacklisted
    const isBlacklisted = await redisClient.get(`blacklist_${token}`)
    if (isBlacklisted) {
      return res.status(401).json({
        success: false,
        message: "Token has been invalidated",
      })
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    // Check if user still exists and is active
    const userQuery = "SELECT id, email, user_type, deleted_at FROM users WHERE id = $1"
    const userResult = await pool.query(userQuery, [decoded.userId])

    if (userResult.rows.length === 0 || userResult.rows[0].deleted_at) {
      return res.status(401).json({
        success: false,
        message: "User no longer exists",
      })
    }

    req.user = {
      id: decoded.userId,
      email: userResult.rows[0].email,
      userType: userResult.rows[0].user_type,
    }

    next()
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token has expired",
      })
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      })
    }

    return res.status(500).json({
      success: false,
      message: "Authentication error",
    })
  }
}

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      })
    }

    if (!roles.includes(req.user.userType)) {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions",
      })
    }

    next()
  }
}

module.exports = {
  authenticateToken,
  authorize,
}
