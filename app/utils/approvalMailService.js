
// approvalMailService.js
import dotenv from "dotenv";
dotenv.config();
import nodemailer from "nodemailer";

// Email configuration
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
  tagline: "Building Trust in AI",
  logoUrl:
    process.env.LOGO_URL ||
    "https://mzain4321.github.io/TrustBridge-logo/TrustBridge-logo.png",
  supportEmail: "aitrustbridge@gmail.com",
  adminEmail: process.env.ADMIN_EMAIL || "aitrustbridge@gmail.com",
  frontendUrl: process.env.FRONTEND_URL,
  primaryColor: "#2F38C2",
  successColor: "#48bb78",
  warningColor: "#d69e2e",
  errorColor: "#c53030",
  neutralColor: "#718096",
};

// Initialize transporter
export const transporter = nodemailer.createTransport(EMAIL_CONFIG);

// Email templates
const EMAIL_TEMPLATES = {
  // Logo HTML generator
  getLogo: (size = "large") => {
    const dimensions = {
      small: { width: "200px", height: "80px", marginBottom: "10px" },
      large: { width: "300px", height: "100px", marginBottom: "15px" },
    };
    const { width, height, marginBottom } =
      dimensions[size] || dimensions.large;

    return `
      <div style="text-align: center; margin-bottom: ${
        size === "small" ? "30px" : "35px"
      };">
        <div style="
          width: ${width};
          height: ${height};
          margin: 0 auto ${marginBottom} auto;
          background-color: #ffffff;
          background-image: url('${BRAND_CONFIG.logoUrl}');
          background-size: contain;
          background-repeat: no-repeat;
          background-position: center;
          border-radius: 4px;
          -webkit-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
          user-select: none;
          pointer-events: none;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        "></div>
        ${
          size === "small"
            ? `<h2 style="color: #2d3748; margin-top: 10px; margin-bottom: 0;">${BRAND_CONFIG.name}</h2>`
            : `<h1 style="color: #2d3748; margin-top: 15px; margin-bottom: 5px;">${BRAND_CONFIG.name}</h1>
             <p style="color: ${BRAND_CONFIG.neutralColor}; font-size: 14px; margin-top: 0;">${BRAND_CONFIG.tagline}</p>`
        }
      </div>
    `;
  },

  // Common email wrapper
  getWrapper: (content, options = {}) => {
    const { backgroundColor = "#f0f4f8", borderColor } = options;
    return `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="
          background-color: ${backgroundColor};
          padding: 20px;
          border-radius: 8px;
          ${borderColor ? `border-left: 4px solid ${borderColor};` : ""}
        ">
          ${content}
        </div>
      </div>
    `;
  },

  // Common content card
  getCard: (content, options = {}) => {
    const { backgroundColor = "white", padding = "25px" } = options;
    return `
      <div style="
        background-color: ${backgroundColor};
        padding: ${padding};
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        margin: 20px 0;
      ">
        ${content}
      </div>
    `;
  },

  // Button component
  getButton: (text, link, options = {}) => {
    const {
      backgroundColor = BRAND_CONFIG.primaryColor,
      color = "white",
      padding = "14px 35px",
    } = options;

    return `
      <div style="margin: 30px 0; text-align: center;">
        <a href="${link}" style="
          background-color: ${backgroundColor};
          color: ${color};
          padding: ${padding};
          text-decoration: none;
          border-radius: 5px;
          font-weight: bold;
          display: inline-block;
          font-size: 16px;
          transition: background-color 0.3s ease;
          border: none;
          cursor: pointer;
        ">
          ${text}
        </a>
        ${
          options.showLinkCopy
            ? `
          <p style="color: ${BRAND_CONFIG.neutralColor}; font-size: 12px; margin-top: 10px;">
            Or copy this link: ${link}
          </p>
        `
            : ""
        }
      </div>
    `;
  },

  // Footer component
  getFooter: () => `
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 25px 0;">
    <div style="text-align: center; color: ${
      BRAND_CONFIG.neutralColor
    }; font-size: 12px;">
      <p>${BRAND_CONFIG.name} Team<br>
      <a href="mailto:${
        BRAND_CONFIG.supportEmail
      }" style="color: #4299e1; text-decoration: none;">${
    BRAND_CONFIG.supportEmail
  }</a></p>
      <p style="font-size: 11px; margin-top: 15px;">
        © ${new Date().getFullYear()} ${BRAND_CONFIG.name}. All rights reserved.
      </p>
    </div>
  `,

  // Info box component
  getInfoBox: (title, items, options = {}) => {
    const { backgroundColor = "#f7fafc", borderColor = "#e2e8f0" } = options;

    const itemsList = items
      .map(
        (item) => `<li style="margin-bottom: 8px; color: #4a5568;">${item}</li>`
      )
      .join("");

    return `
      <div style="
        background-color: ${backgroundColor};
        padding: 15px;
        border-radius: 6px;
        margin: 25px 0;
        border: 1px solid ${borderColor};
      ">
        <p style="color: #2d3748; font-weight: bold; margin-top: 0;">${title}</p>
        <ul style="color: #4a5568; padding-left: 20px; margin: 0;">
          ${itemsList}
        </ul>
      </div>
    `;
  },
};

// Approval Email
export const sendApprovalMail = (email, userName, role) => {
  return new Promise((resolve, reject) => {
    const loginLink = `${BRAND_CONFIG.frontendUrl}/login`;

    const content = `
      ${EMAIL_TEMPLATES.getLogo("large")}
      
      <h2 style="color: #2d3748; margin-bottom: 20px; text-align: center;">Account Approved! 🎉</h2>
      
      ${EMAIL_TEMPLATES.getCard(`
        <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
          Dear <strong style="color: #2d3748;">${userName}</strong>,
        </p>
        
        <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
          Congratulations! Your <strong>${role}</strong> account has been 
          <strong style="color: ${
            BRAND_CONFIG.successColor
          };">approved</strong> by our admin team. 
          You now have full access to the ${BRAND_CONFIG.name} platform.
        </p>
        
        ${EMAIL_TEMPLATES.getButton("Access Your Dashboard", loginLink, {
          backgroundColor: BRAND_CONFIG.successColor,
          showLinkCopy: true,
        })}
        
        ${EMAIL_TEMPLATES.getInfoBox("What you can do now:", [
          "Access your personalized dashboard",
          "Start exploring",
          "Connect with other professionals",
          "Set up your profile and preferences",
        ])}
        
        <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-top: 20px;">
          We're excited to have you on board and can't wait to see what you'll accomplish!
        </p>
        
        <p style="color: #4a5568; font-size: 14px; line-height: 1.6;">
          Need help getting started? 
            contact our support team. at 
          <strong>
            <a href="mailto:${BRAND_CONFIG.supportEmail}" style="color: ${
        BRAND_CONFIG.primaryColor
      }; text-decoration: none;">
              ${BRAND_CONFIG.supportEmail} 
            </a>
          </strong>.
        </p>
      `)}
      
      ${EMAIL_TEMPLATES.getFooter()}
    `;

    const mailOptions = {
      from: `${BRAND_CONFIG.name} <${process.env.USER_EMAIL}>`,
      to: email,
      subject: `Account Approved - Welcome to ${BRAND_CONFIG.name}!`,
      html: EMAIL_TEMPLATES.getWrapper(content),
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Approval Email Error:", error);
        reject(error);
      } else {
        console.log("Approval Email sent to:", email);
        resolve(info);
      }
    });
  });
};

// Rejection Email
export const sendRejectionMail = (email, userName, role, rejectionReason) => {
  return new Promise((resolve, reject) => {
    const content = `
      ${EMAIL_TEMPLATES.getLogo("large")}
      
      <h2 style="color: ${
        BRAND_CONFIG.errorColor
      }; margin-bottom: 20px; text-align: center;">Account Application Decision</h2>
      
      ${EMAIL_TEMPLATES.getCard(`
        <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
          Dear <strong style="color: #2d3748;">${userName}</strong>,
        </p>
        
        <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
          Thank you for applying to join ${
            BRAND_CONFIG.name
          } as a <strong>${role}</strong>. 
          After careful review by our admin team, we regret to inform you that your application has been 
          <strong style="color: ${BRAND_CONFIG.errorColor};">rejected</strong>.
        </p>
        
        <div style="
          background-color: #fed7d7;
          padding: 15px;
          border-left: 4px solid ${BRAND_CONFIG.errorColor};
          margin: 20px 0;
          border-radius: 4px;
        ">
          <p style="color: #742a2a; margin: 0; font-weight: bold; font-size: 14px;">Reason for Rejection:</p>
          <p style="color: #742a2a; margin: 5px 0; font-size: 14px;">
            ${rejectionReason}
          </p>
        </div>
        
        ${EMAIL_TEMPLATES.getInfoBox("What you can do:", [
          "Address the issues mentioned above",
          "Contact support for clarification",
          "Reapply in the future with updated information",
          "Check our guidelines for application requirements",
        ])}
        
        <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
          If you believe this decision was made in error or would like to provide additional information, 
          please contact our support team at 
          <strong>
            <a href="mailto:${BRAND_CONFIG.supportEmail}" style="color: ${
        BRAND_CONFIG.primaryColor
      }; text-decoration: none;">
              ${BRAND_CONFIG.supportEmail}
            </a>
          </strong>.
        </p>
        
        <p style="color: #4a5568; font-size: 14px; line-height: 1.6; margin-top: 20px;">
          We appreciate your interest and hope you'll consider applying again in the future.
        </p>
      `)}
      
      ${EMAIL_TEMPLATES.getFooter()}
    `;

    const mailOptions = {
      from: `${BRAND_CONFIG.name} <${process.env.USER_EMAIL}>`,
      to: email,
      subject: "Application Decision - TrustBridge AI",
      html: EMAIL_TEMPLATES.getWrapper(content, { backgroundColor: "#fff5f5" }),
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Rejection Email Error:", error);
        reject(error);
      } else {
        console.log("Rejection Email sent to:", email);
        resolve(info);
      }
    });
  });
};

// Admin Notification for New User
export const sendAdminNewUserNotification = (userEmail, userName, role) => {
  return new Promise((resolve, reject) => {
    const approvalLink = `${BRAND_CONFIG.frontendUrl}/login`;

    const content = `
      ${EMAIL_TEMPLATES.getLogo("small")}
      
      <h3 style="color: #2d3748; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid #e2e8f0;">
        New User Registration Requires Review
      </h3>
      
      ${EMAIL_TEMPLATES.getCard(`
        <p style="color: #2d3748; font-size: 16px; margin-bottom: 20px;">
          A new user has registered and requires your approval:
        </p>
        
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 10px 0; color: #4a5568; width: 100px;"><strong>Name:</strong></td>
            <td style="padding: 10px 0; color: #2d3748; font-weight: bold;">${userName}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #4a5568;"><strong>Email:</strong></td>
            <td style="padding: 10px 0; color: #2d3748;">${userEmail}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #4a5568;"><strong>Role:</strong></td>
            <td style="padding: 10px 0; color: #2d3748;">
              <span style="
                background-color: #e6fffa; 
                color: #234e52; 
                padding: 4px 12px; 
                border-radius: 4px; 
                font-size: 13px;
                font-weight: bold;
              ">
                ${role}
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #4a5568;"><strong>Registration Time:</strong></td>
            <td style="padding: 10px 0; color: #2d3748;">${new Date().toLocaleString()}</td>
          </tr>
        </table>
        
        ${EMAIL_TEMPLATES.getButton("Review Pending Approvals", approvalLink, {
          backgroundColor: BRAND_CONFIG.primaryColor,
          padding: "12px 30px",
        })}
        
        <p style="color: ${
          BRAND_CONFIG.neutralColor
        }; font-size: 13px; text-align: center; margin-top: 20px;">
          This is an automated notification. Please log in to the admin dashboard to review and take action.
        </p>
      `)}
      
      <div style="text-align: center; color: ${
        BRAND_CONFIG.neutralColor
      }; font-size: 12px; margin-top: 25px;">
        <p>${BRAND_CONFIG.name} Admin System<br>
        <a href="mailto:admin@trustbridge.ai" style="color: #4299e1; text-decoration: none;">admin@trustbridge.ai</a></p>
      </div>
    `;

    const mailOptions = {
      from: `${BRAND_CONFIG.name} Admin <${process.env.USER_EMAIL}>`,
      to: BRAND_CONFIG.adminEmail,
      subject: `Action Required: New ${role} Registration - ${BRAND_CONFIG.name}`,
      html: EMAIL_TEMPLATES.getWrapper(content, {
        backgroundColor: "#f8fafc",
        borderColor: BRAND_CONFIG.primaryColor,
      }),
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Admin Notification Error:", error);
        reject(error);
      } else {
        console.log("Admin notification sent for user:", userEmail);
        resolve(info);
      }
    });
  });
};

// User Registration Notification
export const sendUserRegistrationNotification = (email, userName, role) => {
  return new Promise((resolve, reject) => {
    const content = `
      ${EMAIL_TEMPLATES.getLogo("small")}
      
      <h2 style="color: #2c5282; margin-bottom: 20px; text-align: center;">Registration Successful! 🚀</h2>
      
      ${EMAIL_TEMPLATES.getCard(`
        <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
          Dear <strong style="color: #2d3748;">${userName}</strong>,
        </p>
        
        <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
          Thank you for registering with ${
            BRAND_CONFIG.name
          } as <strong>${role}</strong>. 
          We have received your application and are excited about your interest in joining our platform.
        </p>
        
        <div style="
          background-color: #ebf8ff;
          padding: 15px;
          border-radius: 6px;
          margin: 20px 0;
          border-left: 4px solid ${BRAND_CONFIG.warningColor};
        ">
          <p style="color: #2c5282; margin: 0; font-weight: bold; font-size: 15px;">
            Status: <span style="color: ${
              BRAND_CONFIG.warningColor
            };">Under Review</span>
          </p>
          <p style="color: #4a5568; font-size: 14px; margin-top: 5px;">
            Our admin team reviews all new accounts to ensure the quality and security of our platform. 
            This process typically takes <strong>24-48 hours</strong>.
          </p>
        </div>
        
        ${EMAIL_TEMPLATES.getInfoBox("Next Steps:", [
          "You'll receive an email once your account is approved",
          "Check your spam folder if you don't see our emails",
          "Prepare any additional documents that might be required for your role",
          "Review our community guidelines and terms of service",
        ])}
        <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-top: 20px;">
          We appreciate your patience during this review process and look forward to welcoming you to the ${
            BRAND_CONFIG.name
          } community!
        </p>
      `)}
      
      <p style="color: ${
        BRAND_CONFIG.neutralColor
      }; font-size: 13px; text-align: center; margin: 20px 0;">
        If you have any questions, please contact 
        <a href="mailto:${
          BRAND_CONFIG.supportEmail
        }" style="color: #4299e1; text-decoration: none;">
          ${BRAND_CONFIG.supportEmail}
        </a>.
      </p>
      
      ${EMAIL_TEMPLATES.getFooter()}
    `;

    const mailOptions = {
      from: `${BRAND_CONFIG.name} <${process.env.USER_EMAIL}>`,
      to: email,
      subject: `Registration Successful - Account Under Review`,
      html: EMAIL_TEMPLATES.getWrapper(content, {
        backgroundColor: "#f0f9ff",
        borderColor: "#3182ce",
      }),
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Registration Notification Error:", error);
        reject(error);
      } else {
        console.log("Registration notification sent to:", email);
        resolve(info);
      }
    });
  });
};

// Utility function to test email configuration
export const testEmailConnection = () => {
  return new Promise((resolve, reject) => {
    transporter.verify((error, success) => {
      if (error) {
        console.error("Email connection test failed:", error);
        reject(error);
      } else {
        console.log("Email server is ready to send messages");
        resolve(success);
      }
    });
  });
};
// Send OTP email (for registration, etc)
export const sendOtpMail = (email, otp) => {
  return new Promise((resolve, reject) => {
    const content = `
      ${EMAIL_TEMPLATES.getLogo("large")}
      <h2 style="color: #2d3748; margin-bottom: 20px; text-align: center;">Your Verification Code</h2>
      ${EMAIL_TEMPLATES.getCard(`
        <p style=\"color: #4a5568; font-size: 16px; line-height: 1.6;\">
          Please use the following code to verify your email address:
        </p>
        <div style=\"font-size: 2.5em; letter-spacing: 0.2em; color: #2F38C2; text-align: center; margin: 20px 0;\">${otp}</div>
        <p style=\"color: #718096; font-size: 14px;\">This code will expire in 10 minutes.</p>
      `)}
      ${EMAIL_TEMPLATES.getFooter()}
    `;
    const mailOptions = {
      from: `${BRAND_CONFIG.name} <${process.env.USER_EMAIL}>`,
      to: email,
      subject: `Your TrustBridge Verification Code`,
      html: EMAIL_TEMPLATES.getWrapper(content, { backgroundColor: "#f0f9ff", borderColor: "#3182ce" }),
    };
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("OTP Email Error:", error);
        reject(error);
      } else {
        console.log("OTP Email sent to:", email);
        resolve(info);
      }
    });
  });
};

// Export email service utilities
export default {
  sendApprovalMail,
  sendRejectionMail,
  sendAdminNewUserNotification,
  sendUserRegistrationNotification,
  testEmailConnection,
  sendOtpMail,
  BRAND_CONFIG,
};
