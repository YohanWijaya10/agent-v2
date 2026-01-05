import nodemailer from 'nodemailer';

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
}

class EmailService {
  private enabled: boolean;

  constructor() {
    this.enabled = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.EMAIL_FROM);
  }

  isEnabled() {
    return this.enabled;
  }

  async sendEmail({ to, subject, html, text }: SendEmailOptions) {
    if (!this.enabled) {
      console.warn('Email disabled: missing SMTP/EMAIL env vars');
      return { accepted: [], rejected: [], messageId: 'email-disabled' };
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Boolean(process.env.SMTP_SECURE === '1' || Number(process.env.SMTP_PORT) === 465),
      auth: {
        user: process.env.SMTP_USER as string,
        pass: process.env.SMTP_PASS as string
      }
    });

    const recipients = Array.isArray(to) ? to.join(',') : to;

    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM as string,
      to: recipients,
      subject,
      text,
      html
    });

    return info;
  }
}

export default new EmailService();

