import { app, safeStorage, shell } from "electron";
import http from "node:http";
import { URL } from "node:url";
import crypto from "node:crypto";
import path from "node:path";
import fs from "fs-extra";

export interface AuthUser {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  emailVerified?: boolean;
}

interface OAuthClient {
  client_id: string;
  client_secret: string;
  auth_uri: string;
  token_uri: string;
}

interface PersistedAuth {
  /** safeStorage-encrypted refresh token, base64. */
  encryptedRefreshToken: string;
  user: AuthUser;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
  id_token: string;
}

const SCOPES = ["openid", "email", "profile"];

export class AuthService {
  private client: OAuthClient | null = null;
  private user: AuthUser | null = null;
  private refreshToken: string | null = null;
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;
  private statePath: string;

  constructor() {
    this.statePath = path.join(app.getPath("userData"), "auth.json");
  }

  async init(): Promise<void> {
    this.client = await this.loadClient();
    await this.loadPersisted();
  }

  /** True when a Google OAuth client config was found and parsed. */
  hasOAuthConfig(): boolean {
    return !!this.client;
  }

  currentUser(): AuthUser | null {
    return this.user;
  }

  /**
   * Where the OAuth client JSON is read from. Looks for a stable
   * `google-oauth.json` first and falls back to any
   * `client_secret_*.googleusercontent.com.json` Google Console downloads.
   */
  private candidateConfigPaths(): string[] {
    const dirs = app.isPackaged
      ? [process.resourcesPath]
      : [app.getAppPath()];
    const stable = dirs.map((d) => path.join(d, "google-oauth.json"));
    const downloaded: string[] = [];
    for (const dir of dirs) {
      try {
        for (const name of fs.readdirSync(dir)) {
          if (/^client_secret_.*\.googleusercontent\.com\.json$/i.test(name)) {
            downloaded.push(path.join(dir, name));
          }
        }
      } catch {
        // ignore
      }
    }
    return [...stable, ...downloaded];
  }

  private async loadClient(): Promise<OAuthClient | null> {
    for (const candidate of this.candidateConfigPaths()) {
      if (!(await fs.pathExists(candidate))) continue;
      try {
        const raw = (await fs.readJson(candidate)) as Record<string, OAuthClient | undefined>;
        const block = raw.installed ?? raw.web;
        if (block?.client_id && block.token_uri && block.auth_uri) return block;
      } catch {
        // bad JSON — try next candidate
      }
    }
    return null;
  }

  private async loadPersisted(): Promise<void> {
    if (!(await fs.pathExists(this.statePath))) return;
    try {
      const data = (await fs.readJson(this.statePath)) as PersistedAuth;
      if (!data.encryptedRefreshToken || !data.user) return;
      if (!safeStorage.isEncryptionAvailable()) return;
      const buf = Buffer.from(data.encryptedRefreshToken, "base64");
      this.refreshToken = safeStorage.decryptString(buf);
      this.user = data.user;
    } catch {
      // corrupt state — drop it
      await fs.remove(this.statePath).catch(() => {});
    }
  }

  private async persist(): Promise<void> {
    if (!this.refreshToken || !this.user) {
      if (await fs.pathExists(this.statePath)) await fs.remove(this.statePath);
      return;
    }
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("Encrypted storage is not available on this system; refusing to persist tokens in plaintext.");
    }
    const encrypted = safeStorage.encryptString(this.refreshToken);
    const data: PersistedAuth = {
      encryptedRefreshToken: encrypted.toString("base64"),
      user: this.user,
    };
    await fs.writeJson(this.statePath, data, { spaces: 2 });
  }

  async signOut(): Promise<void> {
    this.user = null;
    this.refreshToken = null;
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
    if (await fs.pathExists(this.statePath)) await fs.remove(this.statePath);
  }

  async signIn(): Promise<AuthUser> {
    if (!this.client) {
      throw new Error(
        "Google OAuth client is not configured. Drop your client_secret_*.json into the project root as google-oauth.json.",
      );
    }
    const verifier = base64UrlEncode(crypto.randomBytes(32));
    const challenge = base64UrlEncode(crypto.createHash("sha256").update(verifier).digest());
    const state = base64UrlEncode(crypto.randomBytes(16));

    const { code, redirectUri } = await this.captureAuthCode(state, challenge);
    const tokens = await this.exchangeCodeForTokens(code, verifier, redirectUri);

    const user = parseIdToken(tokens.id_token);
    if (!user) throw new Error("Google did not return a usable id_token.");

    this.user = user;
    this.accessToken = tokens.access_token;
    this.accessTokenExpiresAt = Date.now() + (tokens.expires_in - 60) * 1000;
    if (tokens.refresh_token) this.refreshToken = tokens.refresh_token;

    await this.persist();
    return user;
  }

  /**
   * Open Google's consent page in the user's default browser, and listen on
   * a loopback port for the redirect that carries the authorization code.
   */
  private async captureAuthCode(
    state: string,
    challenge: string,
  ): Promise<{ code: string; redirectUri: string }> {
    return new Promise((resolve, reject) => {
      const server = http.createServer();
      let settled = false;
      let redirectUri = "";

      const cleanup = () => {
        if (settled) return;
        settled = true;
        server.close(() => {
          /* ignore */
        });
      };

      server.on("error", (err) => {
        cleanup();
        reject(err);
      });

      server.on("request", (req, res) => {
        try {
          const reqUrl = new URL(req.url || "/", `http://${req.headers.host}`);
          const code = reqUrl.searchParams.get("code");
          const returnedState = reqUrl.searchParams.get("state");
          const error = reqUrl.searchParams.get("error");

          if (error) {
            res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
            res.end(renderResultPage(false, `Google reported: ${error}`));
            cleanup();
            reject(new Error(`OAuth denied: ${error}`));
            return;
          }
          if (!code || returnedState !== state) {
            res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
            res.end(renderResultPage(false, "Missing or mismatched state."));
            cleanup();
            reject(new Error("OAuth state mismatch"));
            return;
          }

          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(renderResultPage(true));
          cleanup();
          resolve({ code, redirectUri });
        } catch (err) {
          cleanup();
          reject(err);
        }
      });

      // Bind to an OS-assigned free port on localhost loopback.
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (!addr || typeof addr === "string") {
          cleanup();
          reject(new Error("Failed to bind local OAuth callback server."));
          return;
        }
        redirectUri = `http://127.0.0.1:${addr.port}`;
        const authUrl = this.buildAuthUrl(state, challenge, redirectUri);
        shell.openExternal(authUrl).catch((err) => {
          cleanup();
          reject(err);
        });
      });

      // Timeout after 5 minutes so we don't leak the port forever.
      setTimeout(
        () => {
          if (!settled) {
            cleanup();
            reject(new Error("Sign-in timed out. Please try again."));
          }
        },
        5 * 60 * 1000,
      );
    });
  }

  private buildAuthUrl(state: string, challenge: string, redirectUri: string): string {
    const url = new URL(this.client!.auth_uri);
    url.searchParams.set("client_id", this.client!.client_id);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", SCOPES.join(" "));
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", state);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    return url.toString();
  }

  private async exchangeCodeForTokens(
    code: string,
    verifier: string,
    redirectUri: string,
  ): Promise<TokenResponse> {
    const body = new URLSearchParams({
      code,
      client_id: this.client!.client_id,
      client_secret: this.client!.client_secret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    });
    const res = await fetch(this.client!.token_uri, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Token exchange failed (${res.status}): ${text}`);
    }
    return (await res.json()) as TokenResponse;
  }
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function parseIdToken(idToken: string): AuthUser | null {
  try {
    const parts = idToken.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8")) as {
      sub: string;
      email: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    };
    if (!payload.sub || !payload.email) return null;
    return {
      sub: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified,
      name: payload.name,
      picture: payload.picture,
    };
  } catch {
    return null;
  }
}

function renderResultPage(success: boolean, detail = ""): string {
  const heading = success ? "You're signed in" : "Sign-in failed";
  const sub = success
    ? "Click the button below to jump back to WebToDesktop Builder."
    : detail || "Something went wrong. Please try again from the app.";
  const accent = success ? "#22c55e" : "#ef4444";
  // The web2desktop:// scheme is registered by the Electron main process at
  // startup. Clicking the link asks the OS to deliver the URL to our
  // running instance, which focuses the main window via second-instance.
  // After triggering that, we attempt window.close() — works for tabs
  // opened by the OS in some browsers; harmless when blocked.
  const action = success
    ? `<a id="back" href="web2desktop://focus" class="btn">Back to Desktop</a>
       <p class="hint">If nothing happens, click the WebToDesktop Builder icon in your taskbar.</p>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${heading}</title>
<style>
  html,body{height:100%;margin:0;font-family:-apple-system,"Segoe UI",system-ui,sans-serif;background:#0b0e13;color:#e6e8ed;}
  .wrap{height:100%;display:flex;align-items:center;justify-content:center;padding:32px;text-align:center;}
  .dot{width:56px;height:56px;border-radius:9999px;background:${accent}1f;border:1px solid ${accent}55;margin:0 auto 18px;display:flex;align-items:center;justify-content:center;color:${accent};font-size:26px;}
  h1{font-size:22px;margin:0 0 6px;font-weight:600;}
  p{color:#9aa3b2;margin:0;font-size:14px;line-height:1.5;}
  .btn{display:inline-flex;align-items:center;gap:8px;margin-top:20px;padding:11px 22px;border-radius:10px;background:#3b82f6;color:#fff;font-size:14px;font-weight:600;text-decoration:none;border:0;cursor:pointer;box-shadow:0 8px 24px -8px rgba(59,130,246,.55);transition:filter .15s ease, transform .12s ease;}
  .btn:hover{filter:brightness(1.08);}
  .btn:active{transform:translateY(1px);}
  .btn:after{content:"→";font-weight:400;}
  .hint{margin-top:14px;font-size:12px;color:#5c6473;}
</style></head><body><div class="wrap"><div>
  <div class="dot">${success ? "&check;" : "!"}</div>
  <h1>${heading}</h1><p>${sub}</p>
  ${action}
</div>
<script>
  // Try to close the tab once the user clicks "Back to Desktop". Browsers
  // that won't allow it (because the tab wasn't opened by JS) just stay
  // open, and the user can close it manually.
  (function(){
    var btn = document.getElementById("back");
    if (!btn) return;
    btn.addEventListener("click", function(){
      setTimeout(function(){ try { window.close(); } catch(e){} }, 400);
    });
  })();
</script>
</div></body></html>`;
}
