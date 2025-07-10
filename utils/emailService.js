const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendWelcomeEmail = async (email, username, userType) => {
  const mailOptions = {
    from: `"Pixisphere" <${process.env.FROM_EMAIL}>`,
    to: email,
    subject: "Welcome to Pixisphere!",
    html: `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <h2 style="color: #333;">Welcome to Pixisphere, ${username}!</h2>
        <p>Thank you for joining Pixisphere as a ${userType}. We're excited to have you on board!</p>
        ${
  userType === "partner"
    ? `
        <p>As a partner, you can now:</p>
        <ul>
          <li>Create your professional profile</li>
          <li>Upload your portfolio</li>
          <li>Set your services and pricing</li>
          <li>Connect with potential clients</li>
        </ul>
        `
    : `
        <p>As a client, you can now:</p>
        <ul>
          <li>Browse professional photographers and videographers</li>
          <li>View portfolios and reviews</li>
          <li>Book services for your events</li>
          <li>Manage your bookings</li>
        </ul>
        `
}
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/dashboard" 
             style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Get Started
          </a>
        </div>
        <p style="color: #666; font-size: 14px;">
          If you have any questions, feel free to contact our support team.
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

const sendLoginNotification = async (email, username, deviceInfo) => {
  const location = deviceInfo.location
    ? `${deviceInfo.location.city}, ${deviceInfo.location.country}`
    : "Unknown location";

  const mailOptions = {
    from: `"Pixisphere Security" <${process.env.FROM_EMAIL}>`,
    to: email,
    subject: "New Login to Your Account",
    html: `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <h2 style="color: #333;">New Login Detected</h2>
        <p>Hello ${username},</p>
        <p>We detected a new login to your Pixisphere account:</p>
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
          <p><strong>Device:</strong> ${deviceInfo.browser?.name || "Unknown"} on ${deviceInfo.os?.name || "Unknown"}</p>
          <p><strong>Location:</strong> ${location}</p>
          <p><strong>IP Address:</strong> ${deviceInfo.ip}</p>
        </div>
        <p>If this was you, you can ignore this email. If you don't recognize this activity, please secure your account immediately.</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

const sendPartnerVerificationEmail = async (email, username, verificationData) => {
  const { companyName, verificationDate, notes } = verificationData;

  const mailOptions = {
    from: `"Pixisphere Team" <${process.env.FROM_EMAIL}>`,
    to: email,
    subject: "🎉 Your Partner Account Has Been Verified!",
    html: `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #28a745; margin: 0;">Congratulations!</h1>
          <h2 style="color: #333; margin: 10px 0;">Your Partner Account is Now Verified</h2>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p>Hello ${username},</p>
          <p>Great news! Your partner account for <strong>${companyName}</strong> has been successfully verified and approved.</p>
          
          <div style="background-color: white; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <h3 style="color: #333; margin-top: 0;">Verification Details:</h3>
            <p><strong>Company:</strong> ${companyName}</p>
            <p><strong>Verification Date:</strong> ${new Date(verificationDate).toLocaleDateString()}</p>
            ${notes ? `<p><strong>Admin Notes:</strong> ${notes}</p>` : ""}
          </div>
          
          <h3 style="color: #333;">What's Next?</h3>
          <ul style="color: #666;">
            <li>Your profile is now visible to potential clients</li>
            <li>You can start receiving booking requests</li>
            <li>Access your full partner dashboard</li>
            <li>Manage your services and pricing</li>
            <li>View analytics and performance metrics</li>
          </ul>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/partner/dashboard" 
             style="background-color: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
            Access Partner Dashboard
          </a>
        </div>
        
        <div style="background-color: #e9ecef; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h4 style="color: #333; margin-top: 0;">Tips for Success:</h4>
          <ul style="color: #666; margin: 0;">
            <li>Keep your portfolio updated with your latest work</li>
            <li>Respond promptly to client inquiries</li>
            <li>Maintain competitive and transparent pricing</li>
            <li>Provide excellent customer service</li>
          </ul>
        </div>
        
        <p style="color: #666; font-size: 14px; text-align: center;">
          Welcome to the Pixisphere partner community! If you have any questions, 
          feel free to contact our support team.
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

const sendPartnerRejectionEmail = async (email, username, rejectionData) => {
  const { companyName, reason, notes, rejectionDate } = rejectionData;

  const mailOptions = {
    from: `"Pixisphere Team" <${process.env.FROM_EMAIL}>`,
    to: email,
    subject: "Partner Application Update Required",
    html: `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #dc3545; margin: 0;">Application Update Required</h1>
          <h2 style="color: #333; margin: 10px 0;">Partner Verification Status</h2>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p>Hello ${username},</p>
          <p>Thank you for your interest in becoming a verified partner with Pixisphere. After reviewing your application for <strong>${companyName}</strong>, we need you to address some items before we can approve your account.</p>
          
          <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <h3 style="color: #856404; margin-top: 0;">Review Details:</h3>
            <p><strong>Review Date:</strong> ${new Date(rejectionDate).toLocaleDateString()}</p>
            <p><strong>Reason:</strong> ${reason}</p>
            ${notes ? `<p><strong>Additional Notes:</strong> ${notes}</p>` : ""}
          </div>
          
          <h3 style="color: #333;">What You Need to Do:</h3>
          <ol style="color: #666;">
            <li>Review the feedback provided above</li>
            <li>Update your profile information as needed</li>
            <li>Re-upload any required documents</li>
            <li>Resubmit your application for review</li>
          </ol>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/partner/onboarding" 
             style="background-color: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
            Update Application
          </a>
        </div>
        
        <div style="background-color: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h4 style="color: #0c5460; margin-top: 0;">Need Help?</h4>
          <p style="color: #0c5460; margin: 0;">
            If you have questions about the feedback or need assistance updating your application, 
            please don't hesitate to contact our support team. We're here to help you succeed!
          </p>
        </div>
        
        <p style="color: #666; font-size: 14px; text-align: center;">
          We appreciate your patience and look forward to welcoming you to the Pixisphere partner community.
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

const sendDocumentStatusEmail = async (email, username, documentData) => {
  const { documentName, status, reason, notes } = documentData;

  const isApproved = status === "approved";
  const statusColor = isApproved ? "#28a745" : "#dc3545";
  const statusText = isApproved ? "Approved" : "Requires Update";

  const mailOptions = {
    from: `"Pixisphere Team" <${process.env.FROM_EMAIL}>`,
    to: email,
    subject: `Document ${statusText}: ${documentName}`,
    html: `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: ${statusColor}; margin: 0;">Document ${statusText}</h1>
          <h2 style="color: #333; margin: 10px 0;">${documentName}</h2>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p>Hello ${username},</p>
          <p>We have reviewed your document: <strong>${documentName}</strong></p>
          
          <div style="background-color: ${isApproved ? "#d4edda" : "#f8d7da"}; border: 1px solid ${isApproved ? "#c3e6cb" : "#f5c6cb"}; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <h3 style="color: ${isApproved ? "#155724" : "#721c24"}; margin-top: 0;">Status: ${statusText}</h3>
            ${!isApproved && reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ""}
            ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ""}
          </div>
          
          ${
  !isApproved
    ? `
          <h3 style="color: #333;">Next Steps:</h3>
          <ul style="color: #666;">
            <li>Review the feedback provided</li>
            <li>Update or replace the document as needed</li>
            <li>Re-upload the corrected document</li>
          </ul>
          `
    : `
          <p style="color: #28a745; font-weight: bold;">✓ This document has been approved and no further action is needed.</p>
          `
}
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/partner/onboarding" 
             style="background-color: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
            ${isApproved ? "View Dashboard" : "Update Document"}
          </a>
        </div>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

module.exports = {
  sendWelcomeEmail,
  sendLoginNotification,
  sendPartnerVerificationEmail,
  sendPartnerRejectionEmail,
  sendDocumentStatusEmail,
};
