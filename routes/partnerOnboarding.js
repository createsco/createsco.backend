const express = require("express");
const Partner = require("../models/Partner");
const { verifyFirebaseToken, authorize, requireEmailVerification } = require("../middleware/firebaseAuth");
const { sanitizeInput } = require("../middleware/security");
const {
  validatePartnerBasicInfo,
  validatePartnerService,
  validatePartnerLocation,
} = require("../middleware/partnerValidation");
const notificationService = require("../utils/notificationService");

const router = express.Router();

// File uploads handled client-side and provided as Firebase Storage URLs

// Apply middleware
router.use(sanitizeInput);
router.use(verifyFirebaseToken);
router.use(authorize("partner"));

// Get partner onboarding status
router.get("/status", async (req, res) => {
  try {
    const partner = await Partner.findOne({ userId: req.user.id }).populate("userId", "username email emailVerified");

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner profile not found",
      });
    }

    res.json({
      success: true,
      data: {
        onboardingStatus: partner.onboardingStatus,
        onboardingStep: partner.onboardingStep,
        onboardingProgress: partner.onboardingProgress,
        verified: partner.verified,
        profile: partner,
      },
    });
  } catch (error) {
    console.error("Get onboarding status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch onboarding status",
    });
  }
});

// Step 1: Basic Information
router.post("/basic-info", validatePartnerBasicInfo, async (req, res) => {
  try {
    const { companyName, partnerType, experienceYears, specializations, socialLinks } = req.body;

    const partner = await Partner.findOneAndUpdate(
      { userId: req.user.id },
      {
        companyName,
        partnerType,
        experienceYears,
        specializations,
        socialLinks,
        onboardingStep: Math.max(2, req.body.onboardingStep || 2),
      },
      { new: true, runValidators: true },
    );

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner profile not found",
      });
    }

    await partner.updateOnboardingStatus();

    res.json({
      success: true,
      message: "Basic information updated successfully",
      data: {
        partner,
        onboardingProgress: partner.onboardingProgress,
      },
    });
  } catch (error) {
    console.error("Update basic info error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update basic information",
    });
  }
});

// Step 2: Services Management
router.post("/services", validatePartnerService, requireEmailVerification, async (req, res) => {
  try {
    const partner = await Partner.findOne({ userId: req.user.id });

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner profile not found",
      });
    }

    await partner.addService(req.body);
    partner.onboardingStep = Math.max(3, partner.onboardingStep);
    await partner.save();
    await partner.updateOnboardingStatus();

    res.status(201).json({
      success: true,
      message: "Service added successfully",
      data: {
        partner,
        onboardingProgress: partner.onboardingProgress,
      },
    });
  } catch (error) {
    console.error("Add service error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add service",
    });
  }
});

// Update specific service
router.patch("/services/:serviceId", validatePartnerService, requireEmailVerification, async (req, res) => {
  try {
    const partner = await Partner.findOne({ userId: req.user.id });

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner profile not found",
      });
    }

    const service = partner.services.id(req.params.serviceId);
    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    Object.assign(service, req.body);
    await partner.save();

    res.json({
      success: true,
      message: "Service updated successfully",
      data: { partner },
    });
  } catch (error) {
    console.error("Update service error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update service",
    });
  }
});

// Delete service
router.delete("/services/:serviceId", requireEmailVerification, async (req, res) => {
  try {
    const partner = await Partner.findOne({ userId: req.user.id });

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner profile not found",
      });
    }

    await partner.removeService(req.params.serviceId);

    res.json({
      success: true,
      message: "Service deleted successfully",
      data: { partner },
    });
  } catch (error) {
    console.error("Delete service error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete service",
    });
  }
});

// Step 3: Location & Pricing Setup
router.post("/locations", validatePartnerLocation, async (req, res) => {
  try {
    const { partnerLocations, servingLocations, locationPricing } = req.body;

    const partner = await Partner.findOneAndUpdate(
      { userId: req.user.id },
      {
        partnerLocations,
        servingLocations,
        locationPricing: new Map(Object.entries(locationPricing || {})),
        onboardingStep: Math.max(4, req.body.onboardingStep || 4),
      },
      { new: true, runValidators: true },
    );

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner profile not found",
      });
    }

    await partner.updateOnboardingStatus();

    res.json({
      success: true,
      message: "Location information updated successfully",
      data: {
        partner,
        onboardingProgress: partner.onboardingProgress,
      },
    });
  } catch (error) {
    console.error("Update location error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update location information",
    });
  }
});

// Step 4: Portfolio Upload
router.post("/portfolio", requireEmailVerification, async (req, res) => {
  try {
    const { portfolioUrls } = req.body;

    if (!portfolioUrls || !Array.isArray(portfolioUrls) || portfolioUrls.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No portfolio image URLs provided",
      });
    }

    const partner = await Partner.findOne({ userId: req.user.id });

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner profile not found",
      });
    }

    // Add the Firebase Storage URLs to the partner's portfolio
    partner.portfolio.push(...portfolioUrls);
    partner.onboardingStep = Math.max(4, partner.onboardingStep);
    await partner.save();
    await partner.updateOnboardingStatus();

    res.json({
      success: true,
      message: "Portfolio images added successfully",
      data: {
        uploadedImages: portfolioUrls,
        partner,
        onboardingProgress: partner.onboardingProgress,
      },
    });
  } catch (error) {
    console.error("Add portfolio error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add portfolio images",
    });
  }
});

// Remove portfolio image
router.delete("/portfolio", async (req, res) => {
  try {
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        message: "Image URL is required",
      });
    }

    const partner = await Partner.findOne({ userId: req.user.id });

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner profile not found",
      });
    }

    partner.portfolio = partner.portfolio.filter((url) => url !== imageUrl);
    await partner.save();

    res.json({
      success: true,
      message: "Portfolio image removed successfully",
      data: { partner },
    });
  } catch (error) {
    console.error("Remove portfolio image error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to remove portfolio image",
    });
  }
});

// Step 5: Document Upload for Verification
router.post("/documents", requireEmailVerification, async (req, res) => {
  try {
    const { documents } = req.body;

    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No document information provided",
      });
    }

    // Validate document structure
    for (const doc of documents) {
      if (!doc.docName || !doc.fileUrl) {
        return res.status(400).json({
          success: false,
          message: "Each document must have docName and fileUrl",
        });
      }
    }

    const partner = await Partner.findOne({ userId: req.user.id });

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner profile not found",
      });
    }

    // Add status and uploadedAt to each document
    const formattedDocuments = documents.map((doc) => ({
      ...doc,
      status: "pending",
      uploadedAt: new Date(),
    }));

    partner.documents.push(...formattedDocuments);
    partner.onboardingStep = 5;
    await partner.save();
    await partner.updateOnboardingStatus();

    res.json({
      success: true,
      message: "Documents uploaded successfully. Verification pending.",
      data: {
        documents: formattedDocuments,
        partner,
        onboardingProgress: partner.onboardingProgress,
      },
    });
  } catch (error) {
    console.error("Upload documents error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to upload documents",
    });
  }
});

// Get document status
router.get("/documents", async (req, res) => {
  try {
    const partner = await Partner.findOne({ userId: req.user.id }).select("documents onboardingStatus");

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner profile not found",
      });
    }

    res.json({
      success: true,
      data: {
        documents: partner.documents,
        onboardingStatus: partner.onboardingStatus,
      },
    });
  } catch (error) {
    console.error("Get documents error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch documents",
    });
  }
});

// Update payment methods
router.patch("/payment-methods", async (req, res) => {
  try {
    const { paymentMethods } = req.body;

    if (!paymentMethods || typeof paymentMethods !== "object") {
      return res.status(400).json({
        success: false,
        message: "Valid payment methods object is required",
      });
    }

    const partner = await Partner.findOneAndUpdate(
      { userId: req.user.id },
      { paymentMethods },
      { new: true, runValidators: true },
    );

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner profile not found",
      });
    }

    res.json({
      success: true,
      message: "Payment methods updated successfully",
      data: { partner },
    });
  } catch (error) {
    console.error("Update payment methods error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update payment methods",
    });
  }
});

// Complete onboarding (final step)
router.post("/complete", requireEmailVerification, async (req, res) => {
  try {
    const partner = await Partner.findOne({ userId: req.user.id });

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner profile not found",
      });
    }

    if (partner.onboardingProgress < 100) {
      return res.status(400).json({
        success: false,
        message: "Please complete all onboarding steps before submitting",
        data: {
          currentProgress: partner.onboardingProgress,
          missingSteps: getMissingSteps(partner),
        },
      });
    }

    if (partner.documents.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please upload verification documents before completing onboarding",
      });
    }

    partner.onboardingStatus = "pending_verification";
    partner.onboardingStep = 5;
    await partner.save();

    // Trigger notification to admins
    await notificationService.partnerSubmittedForVerification(partner._id);

    res.json({
      success: true,
      message: "Onboarding completed successfully! Your profile is now under review.",
      data: {
        partner,
        onboardingStatus: partner.onboardingStatus,
      },
    });
  } catch (error) {
    console.error("Complete onboarding error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to complete onboarding",
    });
  }
});

// Helper function to get missing steps
function getMissingSteps(partner) {
  const missing = [];

  if (!partner.companyName || !partner.partnerType) {
    missing.push("Basic Information");
  }

  if (!partner.specializations || partner.specializations.length === 0) {
    missing.push("Specializations");
  }

  if (!partner.services || partner.services.length === 0) {
    missing.push("Services");
  }

  if (!partner.partnerLocations || partner.partnerLocations.length === 0) {
    missing.push("Location Information");
  }

  return missing;
}

module.exports = router;
