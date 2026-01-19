
import dotenv from "dotenv";
dotenv.config();
import nodemailer from "nodemailer";

// Email configuration - Reusing env vars
const EMAIL_CONFIG = {
  service: "gmail",
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
  auth: {
    user: process.env.USER_EMAIL,
    pass: process.env.USER_PASSWORD,
  },
};

// Brand configuration
const BRAND_CONFIG = {
  name: "TrustBridge AI",
  logoUrl: process.env.LOGO_URL || "https://mzain4321.github.io/TrustBridge-logo/TrustBridge-logo.png",
  supportEmail: "aitrustbridge@gmail.com",
  adminEmail: process.env.ADMIN_EMAIL || "aitrustbridge@gmail.com",
  frontendUrl: process.env.FRONTEND_URL,
  primaryColor: "#2F38C2",
  successColor: "#48bb78",
  neutralColor: "#718096",
};

const transporter = nodemailer.createTransport(EMAIL_CONFIG);

// Helper for simple wrappers
const getWrapper = (content) => `
  <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f0f4f8;">
    <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
      ${content}
    </div>
    <div style="text-align: center; margin-top: 20px; color: #718096; font-size: 12px;">
      © ${new Date().getFullYear()} ${BRAND_CONFIG.name}
    </div>
  </div>
`;

export const sendAdminPaymentNotification = (deal, amount, investorName, transactionId) => {
  return new Promise((resolve, reject) => {
    const adminLink = `${BRAND_CONFIG.frontendUrl}/login`;

    const content = `
      <h2 style="color: #2d3748; text-align: center;">💰 New Investment Payment Received</h2>
      
      <p style="font-size: 16px; color: #4a5568;">
        A new payment has been processed and requires your attention for fund release.
      </p>

      <div style="background-color: #f7fafc; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px solid #e2e8f0;">
        <p><strong>Investor:</strong> ${investorName}</p>
        <p><strong>Amount:</strong> $${amount.toLocaleString()}</p>
        <p><strong>Startup:</strong> ${deal.entrepreneurId.startupName || 'Startup'}</p>
        <p><strong>Transaction ID:</strong> ${transactionId}</p>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${adminLink}" style="
          background-color: ${BRAND_CONFIG.primaryColor};
          color: white;
          padding: 12px 24px;
          text-decoration: none;
          border-radius: 4px;
          font-weight: bold;
        ">Review & Release Funds</a>
      </div>

      <p style="font-size: 14px; color: #718096; text-align: center;">
        Please login to the admin dashboard to release these funds to the entrepreneur.
      </p>
    `;

    const mailOptions = {
      from: `${BRAND_CONFIG.name} System <${process.env.USER_EMAIL}>`,
      to: BRAND_CONFIG.adminEmail, // Main admin email from env
      subject: `Action Required: New Payment of $${amount} - ${BRAND_CONFIG.name}`,
      html: getWrapper(content),
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Payment Email Error:", error);
        // Don't reject, just log error so flow doesn't break
        resolve(null); 
      } else {
        console.log("Payment notification sent to admin");
        resolve(info);
      }
    });
  });
};

export default { sendAdminPaymentNotification };
