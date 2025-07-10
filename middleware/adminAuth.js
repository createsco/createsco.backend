const Admin = require("../models/Admin");

const requireAdminPermission = (permission) => {
  return async (req, res, next) => {
    try {
      if (req.user.userType !== "admin") {
        return res.status(403).json({
          success: false,
          message: "Admin access required",
        });
      }

      const admin = await Admin.findOne({ userId: req.user.id });

      if (!admin || !admin.isActive) {
        return res.status(403).json({
          success: false,
          message: "Admin account not found or inactive",
        });
      }

      if (!admin.hasPermission(permission)) {
        return res.status(403).json({
          success: false,
          message: `Permission required: ${permission}`,
        });
      }

      // Update last active time
      admin.updateLastActive().catch(console.error);

      req.admin = admin;
      next();
    } catch (error) {
      console.error("Admin permission check error:", error);
      res.status(500).json({
        success: false,
        message: "Permission check failed",
      });
    }
  };
};

const isSuperAdmin = async (req, res, next) => {
  try {
    if (req.user.userType !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    const admin = await Admin.findOne({ userId: req.user.id });

    if (!admin || admin.role !== "super_admin") {
      return res.status(403).json({
        success: false,
        message: "Super admin access required",
      });
    }

    req.admin = admin;
    next();
  } catch (error) {
    console.error("Super admin check error:", error);
    res.status(500).json({
      success: false,
      message: "Permission check failed",
    });
  }
};

module.exports = {
  requireAdminPermission,
  isSuperAdmin,
};
