const Joi = require("joi")

const validateUserRegistration = (req, res, next) => {
  const schema = Joi.object({
    username:  Joi.string().email().required(),
    email: Joi.string().email().required(),
    userType: Joi.string().valid("client", "partner").required(),
    phone: Joi.object({
      countryCode: Joi.string().required(),
      number: Joi.string()
        .pattern(/^[0-9]{10}$/)
        .required(),
    }).required(),
    address: Joi.string().min(10).max(500).required(),
    firebaseUid: Joi.string().required(),
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

const validatePartnerProfile = (req, res, next) => {
  const schema = Joi.object({
    companyName: Joi.string().min(2).max(100).optional(),
    specializations: Joi.array().items(Joi.string()).optional(),
    experienceYears: Joi.number().min(0).max(50).optional(),
    partnerType: Joi.string().valid("studio", "solo", "firm", "partnership").optional(),
    servingLocations: Joi.array().items(Joi.string()).optional(),
    socialLinks: Joi.object({
      website: Joi.string().uri().optional(),
      instagram: Joi.string().optional(),
      facebook: Joi.string().optional(),
      x: Joi.string().optional(),
      pinterest: Joi.string().optional(),
      youtube: Joi.string().optional(),
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

const validateService = (req, res, next) => {
  const schema = Joi.object({
    name: Joi.string().min(2).max(100).required(),
    description: Joi.string().max(500).optional(),
    basePrice: Joi.number().min(0).required(),
    priceUnit: Joi.string().valid("per_hour", "per_day", "per_project").required(),
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

module.exports = {
  validateUserRegistration,
  validatePartnerProfile,
  validateService,
}
