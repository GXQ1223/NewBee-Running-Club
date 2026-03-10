"""
Email service for sending notifications using Gmail SMTP
"""
import os
import smtplib
import logging
import traceback
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

# Configure logging
logger = logging.getLogger(__name__)


def must_have_env(env_var: str) -> str:
    """Get environment variable or raise error if not set."""
    value = os.getenv(env_var)
    if value is None:
        raise Exception(f"Environment variable '{env_var}' is not set")
    return value


# Gmail SMTP Configuration - lazy loaded to avoid crashing on import
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587

_email_config = None

def _get_email_config():
    """Lazy-load email configuration to avoid crashing on import if env vars are missing."""
    global _email_config
    if _email_config is None:
        _email_config = {
            'gmail_user': os.getenv("GMAIL_USER", ""),
            'gmail_app_password': os.getenv("GMAIL_APP_PASSWORD", ""),
            'website_url': os.getenv("WEBSITE_URL", ""),
        }
        if _email_config['gmail_app_password']:
            logger.info(f"[EMAIL] Email service configured with user: {_email_config['gmail_user']}")
        else:
            logger.warning("[EMAIL] GMAIL_APP_PASSWORD not set - emails will be disabled")
    return _email_config

# Expose WEBSITE_URL as a lazy property for imports
def _get_website_url():
    return _get_email_config()['website_url']

class _WebsiteUrlProxy:
    def __str__(self):
        return _get_website_url()
    def __add__(self, other):
        return _get_website_url() + other
    def __radd__(self, other):
        return other + _get_website_url()
    def __format__(self, spec):
        return format(_get_website_url(), spec)

WEBSITE_URL = _WebsiteUrlProxy()
GMAIL_USER = None  # Accessed via _get_email_config()
GMAIL_APP_PASSWORD = None  # Accessed via _get_email_config()


class EmailService:
    """Service for sending emails via Gmail SMTP"""

    @staticmethod
    def send_email(
        to_email: str,
        subject: str,
        body_html: str,
        body_text: Optional[str] = None
    ) -> bool:
        """
        Send an email using Gmail SMTP

        Args:
            to_email: Recipient email address
            subject: Email subject
            body_html: HTML email body
            body_text: Plain text email body (optional fallback)

        Returns:
            True if email sent successfully, False otherwise
        """
        config = _get_email_config()
        gmail_user = config['gmail_user']
        gmail_password = config['gmail_app_password']

        if not gmail_password:
            logger.warning(f"[EMAIL] Skipping email to {to_email} - GMAIL_APP_PASSWORD not configured")
            logger.debug(f"[EMAIL] Would have sent: subject='{subject}'")
            return False

        logger.info(f"[EMAIL] Attempting to send email to {to_email}")
        logger.debug(f"[EMAIL] Subject: {subject}")
        logger.debug(f"[EMAIL] From: {gmail_user}")
        logger.debug(f"[EMAIL] SMTP: {SMTP_SERVER}:{SMTP_PORT}")

        try:
            # Create message
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = f"NewBee Running Club <{gmail_user}>"
            msg['To'] = to_email

            # Attach plain text and HTML versions
            if body_text:
                part1 = MIMEText(body_text, 'plain')
                msg.attach(part1)
                logger.debug("[EMAIL] Attached plain text body")

            part2 = MIMEText(body_html, 'html')
            msg.attach(part2)
            logger.debug("[EMAIL] Attached HTML body")

            # Send email
            logger.debug(f"[EMAIL] Connecting to SMTP server {SMTP_SERVER}:{SMTP_PORT}...")
            with smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=30) as server:
                logger.debug("[EMAIL] Starting TLS...")
                server.starttls()
                logger.debug(f"[EMAIL] Logging in as {gmail_user}...")
                server.login(gmail_user, gmail_password)
                logger.debug("[EMAIL] Sending message...")
                server.send_message(msg)

            logger.info(f"[EMAIL] Successfully sent email to {to_email}")
            return True

        except smtplib.SMTPAuthenticationError as e:
            logger.error(f"[EMAIL] Authentication failed for {gmail_user}")
            logger.error(f"[EMAIL] Check GMAIL_APP_PASSWORD is correct (should be 16-char app password)")
            logger.error(f"[EMAIL] Error: {str(e)}")
            logger.debug(f"[EMAIL] Traceback:\n{traceback.format_exc()}")
            return False

        except smtplib.SMTPException as e:
            logger.error(f"[EMAIL] SMTP error sending to {to_email}: {str(e)}")
            logger.debug(f"[EMAIL] Traceback:\n{traceback.format_exc()}")
            return False

        except Exception as e:
            logger.error(f"[EMAIL] Unexpected error sending to {to_email}: {str(e)}")
            logger.debug(f"[EMAIL] Traceback:\n{traceback.format_exc()}")
            return False

    @staticmethod
    def send_join_confirmation(applicant_email: str, applicant_name: str) -> bool:
        """
        Send confirmation email to applicant after join form submission

        Args:
            applicant_email: Applicant's email address
            applicant_name: Applicant's name

        Returns:
            True if email sent successfully
        """
        subject = "Welcome to NewBee Running Club! 欢迎加入新蜂跑团！"

        body_html = f"""
        <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #FFA500;">Thank you for your application! 感谢您的申请！</h2>

                    <p>Dear {applicant_name},</p>
                    <p style="color: #666;">亲爱的 {applicant_name}，</p>

                    <p>Thank you for your interest in joining NewBee Running Club! We have received your application and our committee will review it shortly.</p>
                    <p style="color: #666;">感谢您对加入新蜂跑团的关注！我们已经收到您的申请，委员会将很快进行审核。</p>

                    <p>You will receive a notification once your application has been reviewed. This typically takes 1-3 business days.</p>
                    <p style="color: #666;">您的申请审核完成后将收到通知。通常需要1-3个工作日。</p>

                    <p>In the meantime, feel free to explore our website to learn more about our running community!</p>
                    <p style="color: #666;">在此期间，欢迎浏览我们的网站，了解更多关于我们跑步社区的信息！</p>

                    <p style="margin-top: 30px;">
                        <strong>NewBee Running Club</strong><br>
                        <a href="{WEBSITE_URL}" style="color: #FFA500;">newbeerunning.org</a>
                    </p>
                </div>
            </body>
        </html>
        """

        body_text = f"""
        Thank you for your application! 感谢您的申请！

        Dear {applicant_name},
        亲爱的 {applicant_name}，

        Thank you for your interest in joining NewBee Running Club! We have received your application and our committee will review it shortly.
        感谢您对加入新蜂跑团的关注！我们已经收到您的申请，委员会将很快进行审核。

        You will receive a notification once your application has been reviewed. This typically takes 1-3 business days.
        您的申请审核完成后将收到通知。通常需要1-3个工作日。

        NewBee Running Club
        newbeerunning.org
        """

        logger.info(f"[EMAIL] Sending join confirmation to {applicant_email} ({applicant_name})")
        return EmailService.send_email(applicant_email, subject, body_html, body_text)

    @staticmethod
    def send_committee_notification(
        applicant_name: str,
        applicant_email: str,
        nyrr_id: Optional[str],
        form_data: dict
    ) -> bool:
        """
        Send notification email to committee about new application

        Args:
            applicant_name: Applicant's name
            applicant_email: Applicant's email
            nyrr_id: NYRR Runner ID if provided
            form_data: Dictionary containing all form data

        Returns:
            True if email sent successfully
        """
        subject = f"New Member Application: {applicant_name}"

        # Build form data HTML
        form_fields_html = ""
        for field, value in form_data.items():
            if value:
                form_fields_html += f"<tr><td style='padding: 8px; border: 1px solid #ddd; font-weight: bold;'>{field}</td><td style='padding: 8px; border: 1px solid #ddd;'>{value}</td></tr>"

        body_html = f"""
        <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 800px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #FFA500;">New Member Application Received</h2>

                    <p><strong>Applicant Details:</strong></p>
                    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                        <tr>
                            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Name</td>
                            <td style="padding: 8px; border: 1px solid #ddd;">{applicant_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Email</td>
                            <td style="padding: 8px; border: 1px solid #ddd;"><a href="mailto:{applicant_email}">{applicant_email}</a></td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">NYRR Runner ID</td>
                            <td style="padding: 8px; border: 1px solid #ddd;">{nyrr_id or 'Not provided'}</td>
                        </tr>
                        {form_fields_html}
                    </table>

                    <p style="margin-top: 30px;">
                        Please review this application in the admin panel:<br>
                        <a href="{WEBSITE_URL}/admin" style="color: #FFA500; text-decoration: none; background-color: #FFA500; color: white; padding: 10px 20px; display: inline-block; margin-top: 10px; border-radius: 5px;">Go to Admin Panel</a>
                    </p>
                </div>
            </body>
        </html>
        """

        body_text = f"""
        New Member Application Received

        Applicant Details:
        Name: {applicant_name}
        Email: {applicant_email}
        NYRR Runner ID: {nyrr_id or 'Not provided'}

        {chr(10).join([f'{k}: {v}' for k, v in form_data.items() if v])}

        Please review this application in the admin panel at {WEBSITE_URL}/admin
        """

        logger.info(f"[EMAIL] Sending committee notification for applicant: {applicant_name} ({applicant_email})")
        return EmailService.send_email(_get_email_config()['gmail_user'], subject, body_html, body_text)

    @staticmethod
    def send_approval_notification(member_email: str, member_name: str) -> bool:
        """
        Send approval notification to member

        Args:
            member_email: Member's email address
            member_name: Member's name

        Returns:
            True if email sent successfully
        """
        subject = "Welcome to NewBee Running Club! Your Application is Approved! 您的申请已获批准！"

        body_html = f"""
        <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #FFA500;">Congratulations! 恭喜！</h2>

                    <p>Dear {member_name},</p>
                    <p style="color: #666;">亲爱的 {member_name}，</p>

                    <p>Great news! Your application to join NewBee Running Club has been approved!</p>
                    <p style="color: #666;">好消息！您加入新蜂跑团的申请已获批准！</p>

                    <p>You now have full access to all club activities and features. Please log in to your account to:</p>
                    <p style="color: #666;">您现在可以完全访问所有俱乐部活动和功能。请登录您的账户以：</p>

                    <ul>
                        <li>View upcoming events and races 查看即将举行的活动和比赛</li>
                        <li>Update your profile and add your NYRR Runner ID 更新您的个人资料并添加您的NYRR跑者ID</li>
                        <li>Connect with other club members 与其他俱乐部成员联系</li>
                        <li>Track your race results and achievements 追踪您的比赛成绩和成就</li>
                    </ul>

                    <p>We're excited to have you as part of our running community!</p>
                    <p style="color: #666;">我们很高兴您成为我们跑步社区的一员！</p>

                    <p style="margin-top: 30px;">
                        <a href="{WEBSITE_URL}" style="color: #FFA500; text-decoration: none; background-color: #FFA500; color: white; padding: 10px 20px; display: inline-block; border-radius: 5px;">Visit Website</a>
                    </p>

                    <p style="margin-top: 30px;">
                        <strong>NewBee Running Club</strong><br>
                        <a href="{WEBSITE_URL}" style="color: #FFA500;">newbeerunning.org</a>
                    </p>
                </div>
            </body>
        </html>
        """

        body_text = f"""
        Congratulations! 恭喜！

        Dear {member_name},
        亲爱的 {member_name}，

        Great news! Your application to join NewBee Running Club has been approved!
        好消息！您加入新蜂跑团的申请已获批准！

        You now have full access to all club activities and features.
        您现在可以完全访问所有俱乐部活动和功能。

        We're excited to have you as part of our running community!
        我们很高兴您成为我们跑步社区的一员！

        NewBee Running Club
        newbeerunning.org
        """

        logger.info(f"[EMAIL] Sending approval notification to {member_email} ({member_name})")
        return EmailService.send_email(member_email, subject, body_html, body_text)

    @staticmethod
    def send_rejection_notification(member_email: str, member_name: str, rejection_reason: str) -> bool:
        """
        Send rejection notification to applicant

        Args:
            member_email: Applicant's email address
            member_name: Applicant's name
            rejection_reason: Reason for rejection

        Returns:
            True if email sent successfully
        """
        subject = "NewBee Running Club - Application Update 申请状态更新"

        body_html = f"""
        <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #FFA500;">Application Update 申请状态更新</h2>

                    <p>Dear {member_name},</p>
                    <p style="color: #666;">亲爱的 {member_name}，</p>

                    <p>Thank you for your interest in joining NewBee Running Club.</p>
                    <p style="color: #666;">感谢您对加入新蜂跑团的关注。</p>

                    <p>After reviewing your application, we regret to inform you that we are unable to approve your membership at this time.</p>
                    <p style="color: #666;">经过审核，我们很遗憾地通知您，我们目前无法批准您的会员申请。</p>

                    <div style="background-color: #f8f9fa; border-left: 4px solid #FFA500; padding: 15px; margin: 20px 0;">
                        <p style="margin: 0;"><strong>Reason 原因:</strong></p>
                        <p style="margin: 10px 0 0 0;">{rejection_reason}</p>
                    </div>

                    <p>If you believe this was in error or have questions, please feel free to contact us at <a href="mailto:newbeerunningclub@gmail.com" style="color: #FFA500;">newbeerunningclub@gmail.com</a>.</p>
                    <p style="color: #666;">如果您认为这是一个错误或有任何疑问，请随时通过 <a href="mailto:newbeerunningclub@gmail.com" style="color: #FFA500;">newbeerunningclub@gmail.com</a> 联系我们。</p>

                    <p style="margin-top: 30px;">
                        <strong>NewBee Running Club</strong><br>
                        <a href="{WEBSITE_URL}" style="color: #FFA500;">newbeerunning.org</a>
                    </p>
                </div>
            </body>
        </html>
        """

        body_text = f"""
        Application Update 申请状态更新

        Dear {member_name},
        亲爱的 {member_name}，

        Thank you for your interest in joining NewBee Running Club.
        感谢您对加入新蜂跑团的关注。

        After reviewing your application, we regret to inform you that we are unable to approve your membership at this time.
        经过审核，我们很遗憾地通知您，我们目前无法批准您的会员申请。

        Reason 原因: {rejection_reason}

        If you believe this was in error or have questions, please contact us at newbeerunningclub@gmail.com.
        如果您认为这是一个错误或有任何疑问，请通过 newbeerunningclub@gmail.com 联系我们。

        NewBee Running Club
        newbeerunning.org
        """

        logger.info(f"[EMAIL] Sending rejection notification to {member_email} ({member_name})")
        return EmailService.send_email(member_email, subject, body_html, body_text)

    @staticmethod
    def send_existing_member_account_notification(member_name: str, member_email: str) -> bool:
        """
        Send notification to committee that an existing club member has created a website account
        and is requesting approval.

        Args:
            member_name: Member's name
            member_email: Member's email

        Returns:
            True if email sent successfully
        """
        subject = f"Existing Member Account Request: {member_name}"

        body_html = f"""
        <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #FFA500;">Existing Member Account Request</h2>
                    <h3 style="color: #666;">现有成员账号申请</h3>

                    <p>An existing club member has created a website account and is requesting approval:</p>
                    <p style="color: #666;">一位现有俱乐部成员已创建网站账号并请求审批：</p>

                    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                        <tr>
                            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Name 姓名</td>
                            <td style="padding: 8px; border: 1px solid #ddd;">{member_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Email 邮箱</td>
                            <td style="padding: 8px; border: 1px solid #ddd;"><a href="mailto:{member_email}">{member_email}</a></td>
                        </tr>
                    </table>

                    <div style="background-color: #fff3e0; border-left: 4px solid #FFA500; padding: 15px; margin: 20px 0;">
                        <p style="margin: 0; font-weight: bold;">Action Required 需要操作:</p>
                        <p style="margin: 10px 0 0 0;">Please verify this person is an existing member and approve or reject their account in the admin panel.</p>
                        <p style="margin: 5px 0 0 0; color: #666;">请确认此人是否为现有成员，并在管理面板中批准或拒绝其账号。</p>
                    </div>

                    <p style="margin-top: 30px;">
                        <a href="{WEBSITE_URL}/admin" style="color: white; text-decoration: none; background-color: #FFA500; padding: 10px 20px; display: inline-block; margin-top: 10px; border-radius: 5px;">Go to Admin Panel 前往管理面板</a>
                    </p>
                </div>
            </body>
        </html>
        """

        body_text = f"""
        Existing Member Account Request
        现有成员账号申请

        An existing club member has created a website account and is requesting approval:
        一位现有俱乐部成员已创建网站账号并请求审批：

        Name: {member_name}
        Email: {member_email}

        Please verify this person is an existing member and approve or reject their account in the admin panel at {WEBSITE_URL}/admin
        """

        logger.info(f"[EMAIL] Sending existing member account notification for: {member_name} ({member_email})")
        return EmailService.send_email(_get_email_config()['gmail_user'], subject, body_html, body_text)
