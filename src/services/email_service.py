from email.mime.text import MIMEText
from email.header import Header
from loguru import logger

from src.core.settings import system_setting
from src.core.handler.email_handler import SMTPHandler
from src.utils.upgrade_auth.app_error import AppError


class EmailService:
    """
    Provides methods for sending different types of emails.
    """

    def __init__(self, smtp_handler: SMTPHandler):
        self._smtp_handler = smtp_handler

    async def _send_email(
        self, to_email: str, subject: str, html_content: str
    ) -> bool:
        """
        Private method to construct and send an email.
        """
        if not system_setting.smtp_configured:
            logger.info(
                "SMTP not configured (EMAIL_* still at their placeholder defaults) — "
                "skipping email send to {} instead of failing.",
                to_email,
            )
            return False

        msg = MIMEText(html_content, "html", "utf-8")
        msg["From"] = Header(system_setting.EMAIL_FROM, "utf-8")
        msg["To"] = Header(to_email, "utf-8")
        msg["Subject"] = Header(subject, "utf-8")

        try:
            await self._smtp_handler.send_message(msg)
            logger.success("Email sent successfully to {}", to_email)
            return True
        except AppError:
            # Re-raise AppError directly, as it's already handled
            raise
        except Exception as e:
            logger.exception("General Error sending email to {}: {}", to_email, e)
            raise AppError(
                f"An unexpected error occurred while sending email: {e}", 500
            )

    async def send_signup_email(self, to_email: str, url: str) -> bool:
        """
        Sends a signup verification email.
        """
        subject = "Welcome to Fagoon! Please verify your email."
        html_content = f"""
        <h1>Welcome to Fagoon AI!</h1>
        <p>Thank you for signing up. Please verify your email by clicking the
        link below:</p>
        <p><a href="{url}">Verify Your Email</a></p>
        <p>If you did not sign up for this service, please ignore this email.</p>
        """
        logger.info("Preparing signup email for {}", to_email)
        return await self._send_email(to_email, subject, html_content)

    async def send_forgot_password_email(self, to_email: str, url: str) -> bool:
        """
        Sends a forgot password email.
        """
        subject = "Fagoon's AI Password Reset Request"
        html_content = f"""
        <h1>Password Reset</h1>
        <p>You have requested a password reset. Please click the link below to
        reset your password:</p>
        <p><a href="{url}">Reset Your Password</a></p>
        <p>This link is valid for 10 minutes.</p>
        <p>If you did not request a password reset, please ignore this email.</p>
        """
        logger.info("Preparing forgot password email for {}", to_email)
        return await self._send_email(to_email, subject, html_content)