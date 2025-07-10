const Partner = require("../models/Partner")
const { sendDocumentStatusEmail } = require("./emailService")

class NotificationService {
  constructor() {
    this.subscribers = new Map() // In production, use Redis or WebSocket server
  }

  // Subscribe to notifications
  subscribe(userId, callback) {
    if (!this.subscribers.has(userId)) {
      this.subscribers.set(userId, [])
    }
    this.subscribers.get(userId).push(callback)
  }

  // Unsubscribe from notifications
  unsubscribe(userId, callback) {
    if (this.subscribers.has(userId)) {
      const callbacks = this.subscribers.get(userId)
      const index = callbacks.indexOf(callback)
      if (index > -1) {
        callbacks.splice(index, 1)
      }
    }
  }

  // Send notification to specific user
  notify(userId, notification) {
    if (this.subscribers.has(userId)) {
      const callbacks = this.subscribers.get(userId)
      callbacks.forEach((callback) => {
        try {
          callback(notification)
        } catch (error) {
          console.error("Notification callback error:", error)
        }
      })
    }
  }

  // Send notification to all admins
  notifyAdmins(notification) {
    // In production, query admin users from database
    // For now, we'll use a simple approach
    this.subscribers.forEach((callbacks, userId) => {
      // Check if user is admin (you'd query this from database)
      callbacks.forEach((callback) => {
        try {
          callback(notification)
        } catch (error) {
          console.error("Admin notification callback error:", error)
        }
      })
    })
  }

  // Partner submitted for verification
  async partnerSubmittedForVerification(partnerId) {
    try {
      const partner = await Partner.findById(partnerId).populate("userId", "username email")

      const notification = {
        type: "partner_verification_pending",
        title: "New Partner Verification Request",
        message: `${partner.userId.username} (${partner.companyName}) has submitted their profile for verification`,
        data: {
          partnerId: partner._id,
          partnerName: partner.userId.username,
          companyName: partner.companyName,
          submittedAt: new Date(),
        },
        priority: "high",
      }

      this.notifyAdmins(notification)
    } catch (error) {
      console.error("Partner verification notification error:", error)
    }
  }

  // Document status updated
  async documentStatusUpdated(partnerId, documentId, status, reviewData = {}) {
    try {
      const partner = await Partner.findById(partnerId).populate("userId", "username email")
      const document = partner.documents.id(documentId)

      if (!document) return

      // Notify partner
      const partnerNotification = {
        type: "document_status_updated",
        title: `Document ${status}`,
        message: `Your document "${document.docName}" has been ${status}`,
        data: {
          documentId: document._id,
          documentName: document.docName,
          status: status,
          ...reviewData,
        },
        priority: status === "rejected" ? "high" : "medium",
      }

      this.notify(partner.userId._id.toString(), partnerNotification)

      // Send email notification
      await sendDocumentStatusEmail(partner.userId.email, partner.userId.username, {
        documentName: document.docName,
        status: status,
        reason: reviewData.reason,
        notes: reviewData.notes,
      })
    } catch (error) {
      console.error("Document status notification error:", error)
    }
  }

  // Partner verification status updated
  async partnerVerificationStatusUpdated(partnerId, status, data = {}) {
    try {
      const partner = await Partner.findById(partnerId).populate("userId", "username email")

      const notification = {
        type: "partner_verification_status",
        title: status === "verified" ? "Account Verified!" : "Account Update Required",
        message:
          status === "verified"
            ? "Congratulations! Your partner account has been verified"
            : "Your partner application requires updates",
        data: {
          partnerId: partner._id,
          status: status,
          ...data,
        },
        priority: "high",
      }

      this.notify(partner.userId._id.toString(), notification)

      // Notify admins about verification completion
      if (status === "verified") {
        const adminNotification = {
          type: "partner_verified",
          title: "Partner Verified",
          message: `${partner.userId.username} (${partner.companyName}) has been verified`,
          data: {
            partnerId: partner._id,
            partnerName: partner.userId.username,
            companyName: partner.companyName,
            verifiedAt: new Date(),
          },
          priority: "low",
        }

        this.notifyAdmins(adminNotification)
      }
    } catch (error) {
      console.error("Partner verification status notification error:", error)
    }
  }
}

// Create singleton instance
const notificationService = new NotificationService()

module.exports = notificationService
