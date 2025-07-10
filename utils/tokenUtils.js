const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const redisClient = require("../config/redis");

const generateTokens = (userId, userType, rememberMe = false) => {
  const accessTokenExpiry = rememberMe ? "7d" : "15m";
  const refreshTokenExpiry = rememberMe ? "30d" : "7d";

  const accessToken = jwt.sign({ userId, userType, type: "access" }, process.env.JWT_SECRET, {
    expiresIn: accessTokenExpiry,
  });

  const refreshToken = jwt.sign({ userId, userType, type: "refresh" }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: refreshTokenExpiry,
  });

  return { accessToken, refreshToken };
};

const generateVerificationToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

const generatePasswordResetToken = () => {
  const token = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
  return { token, hashedToken };
};

const blacklistToken = async (token) => {
  try {
    const decoded = jwt.decode(token);
    const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);

    if (expiresIn > 0) {
      await redisClient.setex(`blacklist_${token}`, expiresIn, "true");
    }
  } catch (error) {
    console.error("Error blacklisting token:", error);
  }
};

const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch (error) {
    throw new Error("Invalid refresh token");
  }
};

module.exports = {
  generateTokens,
  generateVerificationToken,
  generatePasswordResetToken,
  blacklistToken,
  verifyRefreshToken,
};
