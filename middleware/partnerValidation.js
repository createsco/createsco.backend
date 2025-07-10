const Joi = require("joi")

const validatePartnerBasicInfo = (req, res, next) => {
  const schema = Joi.object({
    companyName: Joi.string().min(2).max(100).required(),
    partnerType: Joi.string().valid("studio", "solo", "firm", "partnership").required(),
    experienceYears: Joi.number().min(0).max(50).required(),
    specializations: Joi.array()
      .items(
        Joi.string().valid(
          "wedding_photography",
          "portrait_photography",
          "event_photography",
          "commercial_photography",
          "fashion_photography",
          "product_photography",
          "wedding_videography",
          "event_videography",
          "commercial_videography",
          "documentary_videography",
          "music_video",
          "corporate_video",
        ),
      )
      .min(1)
      .required(),
    socialLinks: Joi.object({
      website: Joi.string().uri().optional().allow(""),
      instagram: Joi.string().optional().allow(""),
      facebook: Joi.string().optional().allow(""),
      x: Joi.string().optional().allow(""),
      pinterest: Joi.string().optional().allow(""),
      youtube: Joi.string().optional().allow(""),
    }).optional(),
  })

  const { error } = schema.validate(req.body)
  if (error) {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      details: error.details[0].message,
    })
  }

  next()
}

const validatePartnerService = (req, res, next) => {
  const schema = Joi.object({
    name: Joi.string().min(2).max(100).required(),
    description: Joi.string().max(500).optional().allow(""),
    basePrice: Joi.number().min(0).required(),
    priceUnit: Joi.string().valid("per_hour", "per_day", "per_project").required(),
    isActive: Joi.boolean().optional(),
  })

  const { error } = schema.validate(req.body)
  if (error) {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      details: error.details[0].message,
    })
  }

  next()
}

const validatePartnerLocation = (req, res, next) => {
  const schema = Joi.object({
    partnerLocations: Joi.array()
      .items(
        Joi.object({
          city: Joi.string().required(),
          state: Joi.string().required(),
          coordinates: Joi.object({
            lat: Joi.number().min(-90).max(90).required(),
            lng: Joi.number().min(-180).max(180).required(),
          }).optional(),
          pinCodesServed: Joi.array().items(Joi.string()).optional(),
        }),
      )
      .min(1)
      .required(),
    servingLocations: Joi.array().items(Joi.string()).min(1).required(),
    locationPricing: Joi.object().pattern(Joi.string(), Joi.number().min(0)).optional(),
  })

  const { error } = schema.validate(req.body)
  if (error) {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      details: error.details[0].message,
    })
  }

  next()
}

const validatePartnerDocuments = (req, res, next) => {
  if (req.files && req.files.length > 1 && req.body.docNames) {
    if (req.body.docNames.length !== req.files.length) {
      return res.status(400).json({
        success: false,
        message: "Document names must be provided for each uploaded file",
      })
    }
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"]
  for (const file of req.files || []) {
    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: "Only JPEG, PNG, WebP images and PDF files are allowed for documents",
      })
    }
  }

  next()
}

module.exports = {
  validatePartnerBasicInfo,
  validatePartnerService,
  validatePartnerLocation,
  validatePartnerDocuments,
}
