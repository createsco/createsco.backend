const express = require("express")
const { verifyFirebaseToken } = require("../middleware/firebaseAuth")
const notificationService = require("../utils/notificationService")

const router = express.Router()

// SSE endpoint for real-time notifications
router.get("/stream", verifyFirebaseToken, (req, res) => {
  // Set headers for SSE
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Cache-Control",
  })

  const userId = req.user.id

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: "connected", message: "Connected to notifications" })}\n\n`)

  // Notification callback
  const notificationCallback = (notification) => {
    res.write(`data: ${JSON.stringify(notification)}\n\n`)
  }

  // Subscribe to notifications
  notificationService.subscribe(userId, notificationCallback)

  // Handle client disconnect
  req.on("close", () => {
    notificationService.unsubscribe(userId, notificationCallback)
  })

  // Keep connection alive
  const keepAlive = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: "ping" })}\n\n`)
  }, 30000)

  req.on("close", () => {
    clearInterval(keepAlive)
  })
})

module.exports = router
