import nodemailer from 'nodemailer'
import {EMAIL_PASSWORD, EMAIL_USER} from "./env.js";

const transporter  = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASSWORD
    }
})

export const sendWelcomeEmail = async (email, name) => {
    const mailOptions = {
        from: `Shops Sphere <${EMAIL_USER}>`,
        to: email,
        subject: 'Welcome to Shopsphere 🛒🛒',
        html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <div style="text-align: center; margin-bottom: 20px;">
                      <img src="https://example.com/leaf-logo.png" alt="Shops Sphere Logo" width="80" style="margin-bottom: 10px;"/>
                      <h1 style="color: #2c3e50;">Welcome to Shops Sphere, ${name}!</h1>
                  </div>
                  <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
                      <p style="color: #2c3e50;">Thank you for joining Shops Sphere. We're excited to have you on board!</p>
                      <p style="color: #2c3e50;">Start exploring all the amazing features we have to offer.</p>
                  </div>
                  <div style="margin-top: 20px; text-align: center; color: #7f8c8d; font-size: 12px;">
                      <p>If you didn't sign up for Shops Sphere, please ignore this email.</p>
                  </div>
              </div>
          `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Welcome email sent to ${email}`);
        return { success: true };
    } catch (error) {
        console.error(`Failed to send welcome email to ${email}: ${error.message}`);
        throw new Error(`Email sending failed: ${error.message}`);
    }
};

export const sendWelcomeBackEmail = async (email, name) => {
    const mailOptions = {
        from: `Shops Sphere <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `Welcome back to Shops Sphere, ${name}!`,
        html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <div style="text-align: center; margin-bottom: 20px;">
                      <img src="https://example.com/leaf-logo.png" alt="Shops Sphere Logo" width="80" style="margin-bottom: 10px;"/>
                      <h1 style="color: #2c3e50;">Welcome back, ${name}!</h1>
                  </div>
                  <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
                      <p style="color: #2c3e50;">We're thrilled to see you again. Let's continue your journey!</p>
                  </div>
                  <div style="margin-top: 20px; text-align: center; color: #7f8c8d; font-size: 12px;">
                      <p>If you didn't log in to Shops Sphere, please ignore this email.</p>
                  </div>
              </div>
          `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Welcome back email sent to ${email}`);
        return { success: true };
    } catch (error) {
        console.error(`Failed to send welcome back email to ${email}: ${error.message}`);
        throw new Error(`Email sending failed: ${error.message}`);
    }
};

export const sendOTPEmail = async (email, otp) => {
    const mailOptions = {
        from: `Shops Sphere <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Your Password Reset OTP',
        html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <div style="text-align: center; margin-bottom: 20px;">
                      <img src="https://example.com/leaf-logo.png" alt="Shops Sphere Logo" width="80" style="margin-bottom: 10px;"/>
                      <h1 style="color: #2c3e50;">Password Reset Request</h1>
                  </div>
                  <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
                      <p style="color: #2c3e50;">Your OTP for password reset is:</p>
                      <h2 style="text-align: center; color: #2c3e50; margin: 20px 0;">${otp}</h2>
                      <p style="color: #2c3e50;">This OTP is valid for 5 minutes.</p>
                  </div>
                  <div style="margin-top: 20px; text-align: center; color: #7f8c8d; font-size: 12px;">
                      <p>If you didn't request this, please ignore this email.</p>
                  </div>
              </div>
          `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`OTP email sent to ${email}`);
        return { success: true };
    } catch (error) {
        console.error(`Failed to send OTP email to ${email}: ${error.message}`);
        throw new Error(`Email sending failed: ${error.message}`);
    }
};

export const sendManagerAlert = async ({ email, subject, message }) => {
    const mailOptions = {
        from: `Shops Sphere <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Restock Product',
         html: ` <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #d9534f;">${subject}</h2>
                ${productName && `<p><strong>Product:</strong> ${productName}</p>`}
                ${storeName && `<p><strong>Store:</strong> ${storeName}</p>`}
                ${remainingStock >= 0 && `<p><strong>Remaining Stock:</strong> ${remainingStock}</p>`}
                <p>${message}</p>
                <p style="margin-top: 20px;">
                    <a href="${process.env.STORE_DASHBOARD_URL}" 
                       style="background-color: #0275d8; color: white; padding: 10px 15px; text-decoration: none; border-radius: 4px;">
                        View Dashboard
                    </a>
                </p>
                <p style="font-size: 12px; color: #777; margin-top: 30px;">
                    This is an automated message. Please do not reply directly to this email.
                </p>
            </div>`
    }
    try {
        await transporter.sendMail(mailOptions);
        console.log(`Alert sent to ${email}: ${subject}`);
        return { success: true };
    } catch (error) {
        console.error(`Failed to send alert to ${email}: ${error.message}`);
        throw new Error(`Email sending failed: ${error.message}`);
    }
};

// Other email functions (paymentSuccessEmail, orderConfirmationEmail, passwordResetEmail) remain unchanged
export const paymentSuccessEmail = (order, paymentData) => { /* ... */ };
export const orderConfirmationEmail = (order, user) => { /* ... */ };
export const passwordResetEmail = (resetUrl) => { /* ... */ };