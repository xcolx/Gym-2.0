import express from 'express';
import nodemailer from 'nodemailer';
import 'dotenv/config';

// Logs one JSON object per line, so the logs can be searched and filtered by field
function log(level, message, fields = {}) {
    const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...fields });
    if (level === 'error') {
        console.error(line);
    } else {
        console.log(line);
    }
}

// The fields of a (nodemailer) error worth logging. Email addresses in the message, e.g. in an SMTP response
// like "550 <name@example.com> user unknown", are removed.
function describeError(error) {
    return {
        error_code: error.code,
        smtp_command: error.command,
        smtp_response_code: error.responseCode,
        error_message: String(error.message).replace(/[^\s<>@"']+@[^\s<>@"']+/g, '[email]')
    };
}

// Without credentials no email can be sent, so the server doesn't start at all instead of failing every request
const missingEnv = ['EMAIL_USER', 'EMAIL_PASS'].filter((name) => !process.env[name]);
if (missingEnv.length > 0) {
    log('error', 'Missing required environment variables, exiting', { missing: missingEnv });
    process.exit(1);
}

const app = express();
const PORT = process.env.MAILSERVER_PORT || 5003;

app.use(express.json());

// The user id and token are appended as ?user_id=...&token=...
const VERIFY_URL = process.env.VERIFY_URL || 'http://localhost:5000/v1/auth/verify-email';

// The token is appended as ?token=...
const RESET_URL = process.env.RESET_URL || 'http://localhost:5000/v1/auth/reset-password';

// Every step of sending (connecting, the server's greeting, each SMTP command) gives up after this long,
// see MAILSERVER_TIMEOUT_SECONDS in the backend's mail_service.py
const SMTP_TIMEOUT_MS = 15 * 1000;

// The Stalwart mail server of the homeserver, see mail-vm in homeserver-infra. 465 is SMTP over TLS from the start,
// any other port upgrades with STARTTLS. In production SMTP_HOST is the mail server's internal address: nodemailer
// resolves host names with its own DNS queries, which skip /etc/hosts, so it can't be pointed there by name.
// SMTP_SERVERNAME is the name the certificate is checked against, which an IP address can't provide.
const SMTP_HOST = process.env.SMTP_HOST || 'mail.colinrueegg.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SERVERNAME = process.env.SMTP_SERVERNAME || 'mail.colinrueegg.com';

const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    requireTLS: true,
    servername: SMTP_SERVERNAME,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS
});

const FROM = `Gym 2.0 <${process.env.EMAIL_USER}>`;

// How often the SMTP login is checked for /api/health: rarely while it works, more often after a failure
const SMTP_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const SMTP_RETRY_INTERVAL_MS = 5 * 60 * 1000;

let smtpHealthy = null; // null until the first check finished
let smtpCheck = null;
let smtpCheckTimer = null;
let shuttingDown = false;

function setSmtpHealth(healthy, error) {
    if (healthy !== smtpHealthy) {
        if (healthy) {
            log('info', 'SMTP server reachable');
        } else {
            log('error', 'SMTP server check failed', describeError(error));
        }
    }
    smtpHealthy = healthy;
}

// Logs in to the SMTP server and schedules the next check. Runs only once at a time.
function checkSmtp() {
    if (!smtpCheck) {
        clearTimeout(smtpCheckTimer);
        // Wrapped, because a transport without verify support returns false instead of a promise
        smtpCheck = Promise.resolve()
            .then(() => transporter.verify())
            .then(() => setSmtpHealth(true), (error) => setSmtpHealth(false, error))
            .finally(() => {
                smtpCheck = null;
                if (!shuttingDown) {
                    smtpCheckTimer = setTimeout(checkSmtp, smtpHealthy ? SMTP_CHECK_INTERVAL_MS : SMTP_RETRY_INTERVAL_MS);
                }
            });
    }
    return smtpCheck;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value) {
    const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(value).replace(/[&<>"']/g, (character) => entities[character]);
}

// "45 minutes", "1 hour", "24 hours". Rounds down, so the email never promises more time than the link has.
function formatValidity(minutes) {
    if (minutes < 120 && minutes % 60 !== 0) {
        return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
    }
    const hours = Math.floor(minutes / 60);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

// The plain text and HTML version of an email, with a button that opens the link if there is one
function renderEmail({ heading, paragraphs, buttonLabel, link, footer }) {
    const text = [...paragraphs, ...(link ? [link] : []), footer].join('\n\n');
    const button = link ? `
    <p style="margin: 30px 0;">
        <a href="${escapeHtml(link)}" style="background: #667eea; color: white; padding: 12px 24px; border-radius: 10px; text-decoration: none;">${escapeHtml(buttonLabel)}</a>
    </p>
    <p style="color: #888; font-size: 12px;">Or copy this link into your browser:<br>${escapeHtml(link)}</p>` : '';
    const html = `
<div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px;">
    <h2 style="color: #667eea;">${escapeHtml(heading)}</h2>
    ${paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('\n    ')}${button}
    <p style="color: #888; font-size: 12px;">${escapeHtml(footer)}</p>
</div>`.trim();
    return { text, html };
}

function verificationEmail({ reason, link, validity }) {
    if (reason === 'email_change') {
        return {
            subject: 'Confirm your new Gym 2.0 email address',
            ...renderEmail({
                heading: 'Confirm your new email address',
                paragraphs: [
                    'You asked to change the email address of your Gym 2.0 account to this address. ' +
                    'Please confirm it by opening the link below. Until you do, your account keeps its current email ' +
                    'address and you log in with that one.',
                    `The link is valid for ${validity}.`
                ],
                buttonLabel: 'Confirm email',
                link,
                footer: 'If you did not change the email address of a Gym 2.0 account, someone may have entered yours ' +
                    'by mistake. You can safely ignore this email.'
            })
        };
    }

    return {
        subject: 'Verify your Gym 2.0 account',
        ...renderEmail({
            heading: 'Welcome to Gym 2.0!',
            paragraphs: [
                'Please verify your email address by opening the link below.',
                `The link is valid for ${validity}.`
            ],
            buttonLabel: 'Verify email',
            link,
            footer: 'If you did not sign up for Gym 2.0, you can safely ignore this email.'
        })
    };
}

function passwordResetEmail({ link, validity }) {
    return {
        subject: 'Reset your Gym 2.0 password',
        ...renderEmail({
            heading: 'Reset your password',
            paragraphs: [
                'Someone requested to reset the password of your Gym 2.0 account. Open the link below to set a new password.',
                `The link is valid for ${validity}.`
            ],
            buttonLabel: 'Reset password',
            link,
            footer: 'If you did not request this, you can safely ignore this email. Your password stays the same.'
        })
    };
}

// Sent instead of a confirmation link when an account asks to change its email to an address that already has one
function alreadyRegisteredEmail() {
    return {
        subject: 'Your email address already has a Gym 2.0 account',
        ...renderEmail({
            heading: 'This email address already has an account',
            paragraphs: [
                'Someone asked to change the email address of a Gym 2.0 account to this address. ' +
                'There is already an account registered with this address, so nothing was changed.',
                'If you want to use this address for another account, delete the account that has it first or change ' +
                'its email address. If you forgot its password, you can reset it on the login screen of the app.'
            ],
            footer: 'If you did not change the email address of a Gym 2.0 account, someone may have entered yours ' +
                'by mistake. You can safely ignore this email.'
        })
    };
}

function rejectRequest(req, res, reason) {
    log('warn', 'Rejected request', { path: req.path, reason });
    return res.status(400).json({ error: reason });
}

// Checks the fields both endpoints share. Returns the reason the request is invalid, or null.
function validateEmailRequest({ email, user_id, token, expires_in_minutes }) {
    if (typeof email !== 'string' || typeof token !== 'string' || !token
        || !Number.isInteger(user_id) || !Number.isInteger(expires_in_minutes) || expires_in_minutes < 1) {
        return 'email, user_id, token and expires_in_minutes (a positive integer) are required';
    }
    if (!EMAIL_REGEX.test(email)) {
        return 'Invalid email address';
    }
    return null;
}

async function sendEmail(res, { type, userId, to, email, successMessage, logFields = {} }) {
    const { subject, text, html } = email;
    const fields = { type, user_id: userId, recipient_domain: to.split('@').pop(), ...logFields };
    const startedAt = Date.now();

    try {
        const info = await transporter.sendMail({ from: FROM, to, subject, text, html });
        setSmtpHealth(true);
        log('info', 'Email sent', { ...fields, message_id: info.messageId, duration_ms: Date.now() - startedAt });
        res.status(200).json({ success: true, message: successMessage });
    } catch (error) {
        log('error', 'Failed to send email', { ...fields, duration_ms: Date.now() - startedAt, ...describeError(error) });
        // The failure may also mean that the SMTP server is unreachable, which /api/health should report
        checkSmtp();
        res.status(500).json({ error: 'Failed to send email. Please try again later.' });
    }
}

// reason is "signup" (the default) or "email_change"
app.post('/api/send-verification', async (req, res) => {
    const { email, user_id, token, expires_in_minutes, reason = 'signup' } = req.body ?? {};

    const invalid = validateEmailRequest({ email, user_id, token, expires_in_minutes });
    if (invalid) {
        return rejectRequest(req, res, invalid);
    }
    if (reason !== 'signup' && reason !== 'email_change') {
        return rejectRequest(req, res, 'reason must be "signup" or "email_change"');
    }

    const link = `${VERIFY_URL}?user_id=${user_id}&token=${encodeURIComponent(token)}`;

    await sendEmail(res, {
        type: 'verification',
        userId: user_id,
        to: email,
        email: verificationEmail({ reason, link, validity: formatValidity(expires_in_minutes) }),
        successMessage: 'Verification email sent',
        logFields: { reason }
    });
});

app.post('/api/send-password-reset', async (req, res) => {
    const { email, user_id, token, expires_in_minutes } = req.body ?? {};

    const invalid = validateEmailRequest({ email, user_id, token, expires_in_minutes });
    if (invalid) {
        return rejectRequest(req, res, invalid);
    }

    const link = `${RESET_URL}?token=${encodeURIComponent(token)}`;

    await sendEmail(res, {
        type: 'password_reset',
        userId: user_id,
        to: email,
        email: passwordResetEmail({ link, validity: formatValidity(expires_in_minutes) }),
        successMessage: 'Password reset email sent'
    });
});

app.post('/api/send-already-registered', async (req, res) => {
    const { email, user_id } = req.body ?? {};

    if (typeof email !== 'string' || !Number.isInteger(user_id)) {
        return rejectRequest(req, res, 'email and user_id are required');
    }
    if (!EMAIL_REGEX.test(email)) {
        return rejectRequest(req, res, 'Invalid email address');
    }

    await sendEmail(res, {
        type: 'already_registered',
        userId: user_id,
        to: email,
        email: alreadyRegisteredEmail(),
        successMessage: 'Already registered email sent'
    });
});

// Healthy only while the last SMTP check or send succeeded
app.get('/api/health', (req, res) => {
    const smtp = smtpHealthy === null ? 'unknown' : smtpHealthy ? 'ok' : 'unreachable';
    res.status(smtpHealthy ? 200 : 503).json({ status: smtpHealthy ? 'ok' : 'error', smtp });
});

// Errors outside the handlers, e.g. a body that isn't valid JSON, as JSON and logged like everything else
app.use((error, req, res, next) => {
    const status = error.status || error.statusCode || 500;
    log(status < 500 ? 'warn' : 'error', 'Request failed', { path: req.path, status, ...describeError(error) });
    res.status(status).json({ error: status < 500 && error.expose ? error.message : 'Internal server error' });
});

const server = app.listen(PORT, () => {
    log('info', 'Mailserver started', { port: Number(PORT) });
    checkSmtp();
});

// docker stop sends SIGTERM: stop accepting requests, let the open ones (emails being sent) finish, then exit.
// Docker kills the process after the compose file's stop_grace_period.
function shutdown(signal) {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;
    log('info', 'Shutting down, finishing open requests', { signal });
    clearTimeout(smtpCheckTimer);
    server.close(() => {
        transporter.close();
        log('info', 'Mailserver stopped');
        process.exit(0);
    });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
