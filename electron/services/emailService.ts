import { app } from "electron";
import path from "node:path";
import fs from "fs-extra";
import nodemailer, { type Transporter } from "nodemailer";

/**
 * SMTP transport config. Read at boot from `email-config.json` placed
 * alongside `google-oauth.json` (project root in dev, resources dir in
 * packaged builds). When the file is absent or unparseable, EmailService
 * stays in a no-op state — every send call is silently dropped instead
 * of crashing builds.
 *
 * Example (drop into project root, NEVER commit):
 *
 *   {
 *     "host": "smtp.titan.email",
 *     "port": 465,
 *     "secure": true,
 *     "user": "noreply@toodesktop.com",
 *     "password": "<smtp-app-password>",
 *     "fromName": "WebToDesktop Builder",
 *     "fromAddress": "noreply@toodesktop.com"
 *   }
 *
 * SECURITY: shipping `email-config.json` inside the packaged installer
 * means anyone who unpacks the app.asar can extract the SMTP password
 * and spam from your domain. For production, run a small backend that
 * holds the creds and exposes a "send build notification" endpoint the
 * Electron app calls with a short-lived auth token. This service stays
 * here as a stopgap.
 */
interface EmailConfig {
  host: string;
  port: number;
  /** true for SMTPS (typically port 465); false for STARTTLS (587). */
  secure: boolean;
  user: string;
  password: string;
  /** Display name in the From header. Defaults to "WebToDesktop Builder". */
  fromName?: string;
  /** Full From address. Defaults to `user`. */
  fromAddress?: string;
}

export interface BuildSuccessTemplateInput {
  /** Recipient email — the signed-in Google account. */
  to: string;
  /** Recipient display name, used to personalize the greeting. */
  toName?: string;
  /** Name of the app the user just built. */
  appName: string;
  /** Filesystem path to the produced installer. Surfaced as a hint —
   *  email recipients can't actually click it, but it's useful when the
   *  user reads on a different device and wants to know where to look. */
  outputPath?: string;
  /** ISO timestamp of build completion. */
  finishedAt: string;
}

export class EmailService {
  private transporter: Transporter | null = null;
  private config: EmailConfig | null = null;

  /**
   * Locate the SMTP config file. Same lookup pattern AuthService uses
   * for `google-oauth.json` — project root in dev, resources dir in
   * packaged installs. Returning a path that doesn't exist is fine; the
   * caller checks `pathExists` before reading.
   */
  private configPath(): string {
    const dir = app.isPackaged ? process.resourcesPath : app.getAppPath();
    return path.join(dir, "email-config.json");
  }

  async init(): Promise<void> {
    const cfgPath = this.configPath();
    if (!(await fs.pathExists(cfgPath))) {
      // No config file present — that's OK, leave the service in no-op
      // mode. Operators who haven't onboarded SMTP yet still get
      // working builds; emails are just skipped.
      return;
    }
    try {
      const raw = (await fs.readJson(cfgPath)) as Partial<EmailConfig>;
      if (!raw.host || !raw.user || !raw.password) {
        // eslint-disable-next-line no-console
        console.warn("[email] email-config.json is missing required fields (host, user, password). Skipping.");
        return;
      }
      this.config = {
        host: raw.host,
        port: typeof raw.port === "number" ? raw.port : 465,
        secure: raw.secure ?? true,
        user: raw.user,
        password: raw.password,
        fromName: raw.fromName ?? "WebToDesktop Builder",
        fromAddress: raw.fromAddress ?? raw.user,
      };
      this.transporter = nodemailer.createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: { user: this.config.user, pass: this.config.password },
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[email] Failed to load email-config.json:", err);
      this.transporter = null;
      this.config = null;
    }
  }

  /** True once a valid SMTP transport has been created. Callers use this
   *  to skip the entire "do you want to send this email" pathway when the
   *  service is disabled. */
  isReady(): boolean {
    return this.transporter !== null && this.config !== null;
  }

  /**
   * Send the "your build succeeded" notification. Best-effort: returns
   * an error string when the send fails so the orchestrator can log it
   * without throwing inside its terminal cleanup path.
   */
  async sendBuildSuccess(input: BuildSuccessTemplateInput): Promise<{ ok: boolean; error?: string }> {
    if (!this.transporter || !this.config) {
      return { ok: false, error: "email service not configured" };
    }
    const from = `"${this.config.fromName}" <${this.config.fromAddress}>`;
    const greeting = input.toName ? `Hi ${input.toName.split(/\s+/)[0]},` : "Hi,";
    const subject = `Your ${input.appName} desktop build is ready`;
    const text = [
      greeting,
      "",
      `Your build for ${input.appName} just finished — the installer is waiting for you.`,
      input.outputPath ? `Output folder: ${input.outputPath}` : "",
      `Completed at: ${input.finishedAt}`,
      "",
      "Open WebToDesktop Builder and click into the project to grab the .exe / .dmg / AppImage.",
      "",
      "— WebToDesktop Builder",
    ].filter(Boolean).join("\n");

    const html = `<!doctype html>
<html><body style="margin:0;background:#f6f7fb;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1f2937;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:14px;border:1px solid #e5e7eb;overflow:hidden">
    <div style="padding:22px 24px;border-bottom:1px solid #eef0f4;display:flex;align-items:center;gap:10px;">
      <div style="width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,#7c3aed,#3b82f6);"></div>
      <div style="font-weight:600;font-size:15px;">WebToDesktop Builder</div>
    </div>
    <div style="padding:24px;">
      <div style="font-size:18px;font-weight:600;margin-bottom:8px;">Your ${escapeHtml(input.appName)} build is ready</div>
      <p style="margin:0 0 12px;line-height:1.55;font-size:14px;color:#4b5563;">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 14px;line-height:1.55;font-size:14px;color:#4b5563;">
        Your desktop installer for <strong>${escapeHtml(input.appName)}</strong> finished building successfully.
      </p>
      ${input.outputPath ? `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:#4b5563;word-break:break-all;margin-bottom:14px;">${escapeHtml(input.outputPath)}</div>` : ""}
      <p style="margin:0 0 18px;line-height:1.55;font-size:13px;color:#6b7280;">Open WebToDesktop Builder and click into the project to grab the installer.</p>
      <p style="margin:0;font-size:12px;color:#9ca3af;">Completed at ${escapeHtml(input.finishedAt)}</p>
    </div>
  </div>
</body></html>`;

    try {
      await this.transporter.sendMail({ from, to: input.to, subject, text, html });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
