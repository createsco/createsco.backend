const express = require("express");
const Partner = require("../models/Partner");
const { sanitizeInput } = require("../middleware/security");
const Joi = require("joi");
const { ObjectId } = require("mongoose").Types;

const router = express.Router();

// Apply middleware
router.use(sanitizeInput);

// Validation schemas
const searchPartnersSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(12),
  search: Joi.string().trim().max(100).optional(),
  location: Joi.string().trim().max(100).optional(),
  specialization: Joi.string().trim().optional(),
  partnerType: Joi.string().valid("studio", "solo", "firm", "partnership").optional(),
  minRating: Joi.number().min(0).max(5).optional(),
  maxPrice: Joi.number().min(0).optional(),
  minPrice: Joi.number().min(0).optional(),
  sortBy: Joi.string()
    .valid("avgRating", "experienceYears", "totalReviews", "createdAt", "companyName")
    .default("avgRating"),
  sortOrder: Joi.string().valid("asc", "desc").default("desc"),
  servingLocation: Joi.string().trim().optional(),
});

// Get all verified partners with pagination and filters (Public API)
router.get("/partners", async (req, res) => {
  try {
    const { error, value } = searchPartnersSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        details: error.details[0].message,
      });
    }

    const {
      page,
      limit,
      search,
      location,
      specialization,
      partnerType,
      minRating,
      maxPrice,
      minPrice,
      sortBy,
      sortOrder,
      servingLocation,
    } = value;

    // Build aggregation pipeline
    const pipeline = [];

    // Match only verified and active partners
    const matchStage = {
      verified: true,
      deletedAt: null,
      onboardingStatus: "verified",
    };

    // Add filters
    if (partnerType) {
      matchStage.partnerType = partnerType;
    }

    if (minRating) {
      matchStage.avgRating = { $gte: minRating };
    }

    if (specialization) {
      matchStage.specializations = { $in: [specialization] };
    }

    if (location || servingLocation) {
      const locationFilter = location || servingLocation;
      matchStage.servingLocations = { $in: [locationFilter] };
    }

    pipeline.push({ $match: matchStage });

    // Lookup user information
    pipeline.push({
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user",
      },
    });

    pipeline.push({ $unwind: "$user" });

    // Add search functionality
    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { companyName: { $regex: search, $options: "i" } },
            { "user.username": { $regex: search, $options: "i" } },
            { specializations: { $in: [new RegExp(search, "i")] } },
            { servingLocations: { $in: [new RegExp(search, "i")] } },
          ],
        },
      });
    }

    // Add price filtering based on services
    if (minPrice || maxPrice) {
      const priceMatch = {};
      if (minPrice) priceMatch["services.basePrice"] = { $gte: minPrice };
      if (maxPrice) {
        priceMatch["services.basePrice"] = {
          ...priceMatch["services.basePrice"],
          $lte: maxPrice,
        };
      }

      pipeline.push({
        $match: {
          $or: [
            priceMatch,
            { "services.0": { $exists: false } }, // Include partners with no services listed
          ],
        },
      });
    }

    // Project only public fields
    pipeline.push({
      $project: {
        // Partner fields
        userId:1,
        companyName: 1,
        specializations: 1,
        experienceYears: 1,
        avgRating: 1,
        totalReviews: 1,
        verified: 1,
        partnerType: 1,
        servingLocations: 1,
        partnerLocations: 1,
        portfolio: 1,
        banner: 1,
        socialLinks: 1,
        projectStats: 1,
        createdAt: 1,

        // Services (excluding sensitive pricing details if needed)
        services: {
          $map: {
            input: "$services",
            as: "service",
            in: {
              serviceId: "$$service.serviceId",
              name: "$$service.name",
              description: "$$service.description",
              basePrice: "$$service.basePrice",
              priceUnit: "$$service.priceUnit",
            },
          },
        },

        // User fields (only public ones)
        user: {
          username: "$user.username",
          profilePic: "$user.profilePic",
          // Exclude sensitive fields like email, phone, address
        },

        // Computed fields
        completionRate: {
          $cond: [
            { $eq: ["$projectStats.total", 0] },
            0,
            { $multiply: [{ $divide: ["$projectStats.completed", "$projectStats.total"] }, 100] },
          ],
        },

        // Location-based pricing (if available)
        hasLocationPricing: { $gt: [{ $size: { $objectToArray: "$locationPricing" } }, 0] },
      },
    });

    // Add sorting
    const sortStage = {};
    sortStage[sortBy] = sortOrder === "desc" ? -1 : 1;
    pipeline.push({ $sort: sortStage });

    // Get total count for pagination
    const countPipeline = [...pipeline, { $count: "total" }];
    const totalResult = await Partner.aggregate(countPipeline);
    const total = totalResult[0]?.total || 0;

    // Add pagination
    pipeline.push({ $skip: (page - 1) * limit });
    pipeline.push({ $limit: limit });

    const partners = await Partner.aggregate(pipeline);

    // Get available filters for frontend
    const availableFilters = await getAvailableFilters();

    res.json({
      success: true,
      data: {
        partners,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
        filters: availableFilters,
        appliedFilters: {
          search,
          location: location || servingLocation,
          specialization,
          partnerType,
          minRating,
          minPrice,
          maxPrice,
          sortBy,
          sortOrder,
        },
      },
    });
  } catch (error) {
    console.error("Get public partners error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch partners",
    });
  }
});

// Get single partner profile (Public API)
router.get("/partners/:partnerId", async (req, res) => {
  try {
    
    const { partnerId } = req.params;

    const partner = await Partner.aggregate([
      {
        $match: {
          _id: new ObjectId(partnerId),
          verified: true,
          deletedAt: null,
          onboardingStatus: "verified",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $project: {
          // Partner information
          userId:1,
          companyName: 1,
          specializations: 1,
          experienceYears: 1,
          avgRating: 1,
          totalReviews: 1,
          verified: 1,
          partnerType: 1,
          servingLocations: 1,
          partnerLocations: 1,
          portfolio: 1,
          banner: 1,
          socialLinks: 1,
          projectStats: 1,
          createdAt: 1,

          // Services with full details
          services: 1,

          // Location pricing (public information)
          locationPricing: 1,

          // User information (public only)
          user: {
            username: "$user.username",
            profilePic: "$user.profilePic",
            createdAt: "$user.createdAt",
          },

          // Computed fields
          completionRate: {
            $cond: [
              { $eq: ["$projectStats.total", 0] },
              0,
              { $multiply: [{ $divide: ["$projectStats.completed", "$projectStats.total"] }, 100] },
            ],
          },

          // Years in business
          yearsInBusiness: {
            $divide: [{ $subtract: [new Date(), "$user.createdAt"] }, 365 * 24 * 60 * 60 * 1000],
          },

          // Exclude sensitive fields
          // documents: 0,
          // dashboardData: 0,
          // userId: 0,
        },
      },
    ]);

    if (!partner || partner.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Partner not found or not available",
      });
    }

    // Get similar partners (same specializations or location)
    const similarPartners = await Partner.aggregate([
      {
        $match: {
          _id: { $ne: partnerId },
          verified: true,
          deletedAt: null,
          onboardingStatus: "verified",
          $or: [
            { specializations: { $in: partner[0].specializations } },
            { servingLocations: { $in: partner[0].servingLocations } },
          ],
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $project: {
          companyName: 1,
          specializations: 1,
          avgRating: 1,
          totalReviews: 1,
          partnerType: 1,
          portfolio: { $slice: ["$portfolio", 3] }, // Only first 3 images
          user: {
            username: "$user.username",
            profilePic: "$user.profilePic",
          },
        },
      },
      { $sort: { avgRating: -1 } },
      { $limit: 6 },
    ]);

    res.json({
      success: true,
      data: {
        partner: partner[0],
        similarPartners,
      },
    });
  } catch (error) {
    console.error("Get partner profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch partner profile",
    });
  }
});

// Get partner portfolio images (Public API)
router.get("/partners/:partnerId/portfolio", async (req, res) => {
  try {
    const { partnerId } = req.params;
    const { page = 1, limit = 12 } = req.query;

    const partner = await Partner.findOne({
      _id: partnerId,
      verified: true,
      deletedAt: null,
    }).select("portfolio companyName");

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner not found",
      });
    }

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + Number.parseInt(limit);
    const portfolioImages = partner.portfolio.slice(startIndex, endIndex);
    const total = partner.portfolio.length;

    res.json({
      success: true,
      data: {
        images: portfolioImages,
        companyName: partner.companyName,
        pagination: {
          page: Number.parseInt(page),
          limit: Number.parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
          hasNext: endIndex < total,
          hasPrev: page > 1,
        },
      },
    });
  } catch (error) {
    console.error("Get partner portfolio error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch portfolio",
    });
  }
});

// Get available filter options (Public API)
router.get("/partners/filters/options", async (req, res) => {
  try {
    const filters = await getAvailableFilters();

    res.json({
      success: true,
      data: { filters },
    });
  } catch (error) {
    console.error("Get filter options error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch filter options",
    });
  }
});

// Search suggestions (Public API)
router.get("/partners/search/suggestions", async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.json({
        success: true,
        data: { suggestions: [] },
      });
    }

    const suggestions = await Partner.aggregate([
      {
        $match: {
          verified: true,
          deletedAt: null,
          $or: [
            { companyName: { $regex: q, $options: "i" } },
            { specializations: { $in: [new RegExp(q, "i")] } },
            { servingLocations: { $in: [new RegExp(q, "i")] } },
          ],
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $project: {
          _id: 1,
          companyName: 1,
          specializations: 1,
          servingLocations: 1,
          avgRating: 1,
          user: {
            username: "$user.username",
            profilePic: "$user.profilePic",
          },
        },
      },
      { $limit: 10 },
    ]);

    // Also get location and specialization suggestions
    const locationSuggestions = await Partner.distinct("servingLocations", {
      verified: true,
      deletedAt: null,
      servingLocations: { $regex: q, $options: "i" },
    });

    const specializationSuggestions = await Partner.distinct("specializations", {
      verified: true,
      deletedAt: null,
      specializations: { $regex: q, $options: "i" },
    });

    res.json({
      success: true,
      data: {
        suggestions: {
          partners: suggestions,
          locations: locationSuggestions.slice(0, 5),
          specializations: specializationSuggestions.slice(0, 5),
        },
      },
    });
  } catch (error) {
    console.error("Get search suggestions error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch suggestions",
    });
  }
});

// Get featured/top partners (Public API)
router.get("/partners/featured", async (req, res) => {
  try {
    const { limit = 8 } = req.query;

    const featuredPartners = await Partner.aggregate([
      {
        $match: {
          verified: true,
          deletedAt: null,
          avgRating: { $gte: 4.0 }, // Only high-rated partners
          totalReviews: { $gte: 5 }, // With sufficient reviews
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $project: {
          companyName: 1,
          specializations: 1,
          avgRating: 1,
          totalReviews: 1,
          partnerType: 1,
          servingLocations: 1,
          portfolio: { $slice: ["$portfolio", 4] }, // First 4 images
          banner: 1,
          user: {
            username: "$user.username",
            profilePic: "$user.profilePic",
          },
          completionRate: {
            $cond: [
              { $eq: ["$projectStats.total", 0] },
              0,
              { $multiply: [{ $divide: ["$projectStats.completed", "$projectStats.total"] }, 100] },
            ],
          },
        },
      },
      {
        $sort: {
          avgRating: -1,
          totalReviews: -1,
        },
      },
      { $limit: Number.parseInt(limit) },
    ]);

    res.json({
      success: true,
      data: { partners: featuredPartners },
    });
  } catch (error) {
    console.error("Get featured partners error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch featured partners",
    });
  }
});

// Get partners by location (Public API)
router.get("/partners/by-location/:location", async (req, res) => {
  try {
    const { location } = req.params;
    const { page = 1, limit = 12, sortBy = "avgRating", sortOrder = "desc" } = req.query;

    const partners = await Partner.aggregate([
      {
        $match: {
          verified: true,
          deletedAt: null,
          servingLocations: { $in: [location] },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $project: {
          companyName: 1,
          specializations: 1,
          avgRating: 1,
          totalReviews: 1,
          partnerType: 1,
          experienceYears: 1,
          portfolio: { $slice: ["$portfolio", 3] },
          user: {
            username: "$user.username",
            profilePic: "$user.profilePic",
          },
        },
      },
      { $sort: { [sortBy]: sortOrder === "desc" ? -1 : 1 } },
      { $skip: (page - 1) * limit },
      { $limit: Number.parseInt(limit) },
    ]);

    const total = await Partner.countDocuments({
      verified: true,
      deletedAt: null,
      servingLocations: { $in: [location] },
    });

    res.json({
      success: true,
      data: {
        partners,
        location,
        pagination: {
          page: Number.parseInt(page),
          limit: Number.parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Get partners by location error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch partners by location",
    });
  }
});

// Get partners statistics (Public API)
router.get("/stats", async (req, res) => {
  try {
    const stats = await Promise.all([
      Partner.countDocuments({ verified: true, deletedAt: null }),
      Partner.aggregate([
        { $match: { verified: true, deletedAt: null } },
        { $group: { _id: null, avgRating: { $avg: "$avgRating" } } },
      ]),
      Partner.distinct("servingLocations", { verified: true, deletedAt: null }),
      Partner.distinct("specializations", { verified: true, deletedAt: null }),
      Partner.aggregate([
        { $match: { verified: true, deletedAt: null } },
        { $group: { _id: null, totalProjects: { $sum: "$projectStats.total" } } },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        totalPartners: stats[0],
        averageRating: Math.round((stats[1][0]?.avgRating || 0) * 10) / 10,
        locationsServed: stats[2].length,
        specializations: stats[3].length,
        totalProjects: stats[4][0]?.totalProjects || 0,
      },
    });
  } catch (error) {
    console.error("Get public stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch statistics",
    });
  }
});

// Helper function to get available filters
async function getAvailableFilters() {
  try {
    const [locations, specializations, partnerTypes, ratingRanges, priceRanges] = await Promise.all([
      // Get all serving locations
      Partner.distinct("servingLocations", { verified: true, deletedAt: null }),

      // Get all specializations
      Partner.distinct("specializations", { verified: true, deletedAt: null }),

      // Get partner types
      Partner.distinct("partnerType", { verified: true, deletedAt: null }),

      // Get rating distribution
      Partner.aggregate([
        { $match: { verified: true, deletedAt: null } },
        {
          $group: {
            _id: {
              $switch: {
                branches: [
                  { case: { $gte: ["$avgRating", 4.5] }, then: "4.5+" },
                  { case: { $gte: ["$avgRating", 4.0] }, then: "4.0+" },
                  { case: { $gte: ["$avgRating", 3.5] }, then: "3.5+" },
                  { case: { $gte: ["$avgRating", 3.0] }, then: "3.0+" },
                ],
                default: "Below 3.0",
              },
            },
            count: { $sum: 1 },
          },
        },
      ]),

      // Get price ranges from services
      Partner.aggregate([
        { $match: { verified: true, deletedAt: null, "services.0": { $exists: true } } },
        { $unwind: "$services" },
        {
          $group: {
            _id: {
              $switch: {
                branches: [
                  { case: { $lt: ["$services.basePrice", 10000] }, then: "Under ₹10,000" },
                  { case: { $lt: ["$services.basePrice", 25000] }, then: "₹10,000 - ₹25,000" },
                  { case: { $lt: ["$services.basePrice", 50000] }, then: "₹25,000 - ₹50,000" },
                  { case: { $lt: ["$services.basePrice", 100000] }, then: "₹50,000 - ₹1,00,000" },
                ],
                default: "₹1,00,000+",
              },
            },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    return {
      locations: locations.filter(Boolean).sort(),
      specializations: specializations.filter(Boolean).sort(),
      partnerTypes: partnerTypes.filter(Boolean),
      ratingRanges: ratingRanges.sort((a, b) => b._id.localeCompare(a._id)),
      priceRanges: priceRanges,
    };
  } catch (error) {
    console.error("Error getting available filters:", error);
    return {
      locations: [],
      specializations: [],
      partnerTypes: [],
      ratingRanges: [],
      priceRanges: [],
    };
  }
}

module.exports = router;
