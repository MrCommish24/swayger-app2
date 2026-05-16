import express from "express";
import type { Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { startMMScheduler } from "./mm-scheduler";
import { registerUnsubscribeRoutes } from "./routes-unsubscribe";
import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import { sendNotificationEmail } from "./email";

const app = express();
const log = console.log;

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origins = new Set<string>();

    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }

    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }

    // Always allow the custom production domains
    origins.add("https://swayger.app");
    origins.add("https://www.swayger.app");

    const origin = req.header("origin");

    // Allow localhost origins for Expo web development (any port)
    const isLocalhost =
      origin?.startsWith("http://localhost:") ||
      origin?.startsWith("http://127.0.0.1:");

    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      res.header("Access-Control-Allow-Headers", "Content-Type");
      res.header("Access-Control-Allow-Credentials", "true");
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

function setupBodyParsing(app: express.Application) {
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false }));
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;

      const duration = Date.now() - start;

      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    });

    next();
  });
}

const SEO_SNIPPET = `
  <meta name="robots" content="index, follow" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Swayger" />
  <meta property="og:title" content="Swayger — Social Wager Contracts" />
  <meta property="og:description" content="Make 1v1 social wager contracts with friends. Lock in your pick, challenge someone, and settle it. Join the NBA picks challenge — no real money, just bragging rights." />
  <meta property="og:image" content="https://www.swayger.app/assets/images/icon.png" />
  <meta property="og:url" content="https://www.swayger.app" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="Swayger — Social Wager Contracts" />
  <meta name="twitter:description" content="Lock in your takes and prove who was right. 1v1 social wagers with friends, NBA picks challenge, and a full receipt of every outcome." />
  <meta name="twitter:image" content="https://www.swayger.app/assets/images/icon.png" />`;

function injectSeoTags(html: string): string {
  if (html.includes('og:title')) return html; // already present
  let result = html;
  // Update bare title if present
  result = result.replace(/<title>Swayger<\/title>/, '<title>Swayger — Social Wager Contracts</title>');
  result = result.replace('</head>', `${SEO_SNIPPET}\n</head>`);
  return result;
}

const ONESIGNAL_SNIPPET = `
  <script src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js" defer></script>
  <script>
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    OneSignalDeferred.push(async function(OneSignal) {
      await OneSignal.init({
        appId: "6c7fe969-e694-4977-819a-f10fbc4159c6",
        notifyButton: { enable: false },
        allowLocalhostAsSecureOrigin: true,
        serviceWorkerParam: { scope: "/" },
        serviceWorkerPath: "/OneSignalSDKWorker.js",
      });

      // After init, subscribe the user if we already know their ID.
      // React stores the Supabase UUID in localStorage as soon as a session starts.
      // We also listen for a swayger:session event in case React fires it after init completes.
      async function swaygerSubscribe(userId) {
        if (!userId) return;
        try {
          console.log("[onesignal] Subscribing user:", userId.slice(0, 8));
          await OneSignal.login(userId);
          console.log("[onesignal] login OK, optedIn before:", OneSignal.User.PushSubscription.optedIn);

          // Wait for service worker to be fully active before pushing subscription
          if (navigator.serviceWorker) {
            await navigator.serviceWorker.ready;
            console.log("[onesignal] ServiceWorker ready");
          }

          await OneSignal.User.PushSubscription.optIn();
          console.log("[onesignal] optIn complete, optedIn after:", OneSignal.User.PushSubscription.optedIn, "token:", OneSignal.User.PushSubscription.token);
          // Report success to server
          fetch("/api/debug/onesignal", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ status: "ok", userId: userId.slice(0,8), optedIn: OneSignal.User.PushSubscription.optedIn }) }).catch(function(){});
        } catch (e) {
          var msg = e && e.message ? e.message : String(e);
          console.error("[onesignal] Subscribe error:", msg);
          // Report error to server so we can see it in server logs
          fetch("/api/debug/onesignal", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ status: "error", userId: userId.slice(0,8), error: msg }) }).catch(function(){});
        }
      }

      // Try immediately with whatever userId is already stored
      var storedId = localStorage.getItem("swayger_uid");
      if (storedId && window.Notification && window.Notification.permission === "granted") {
        swaygerSubscribe(storedId);
      }

      // Also handle late-arriving session events (React bundle loaded after init),
      // but only subscribe if the user has already granted browser permission —
      // we don't want to auto-prompt new users who haven't seen the banner yet.
      window.addEventListener("swayger:session", function(e) {
        if (window.Notification && window.Notification.permission === "granted") {
          swaygerSubscribe(e.detail && e.detail.userId);
        }
      });

      // swayger:permission fires from the banner handler after the user clicks Allow.
      // At this point permission is guaranteed to be "granted".
      window.addEventListener("swayger:permission", function(e) {
        swaygerSubscribe(e.detail && e.detail.userId);
      });
    });
  </script>`;

function injectOneSignal(html: string): string {
  if (html.includes("OneSignalSDK")) return html; // already present, skip
  return html.replace("</head>", `${ONESIGNAL_SNIPPET}\n</head>`);
}

function getAppName(): string {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function serveExpoManifest(platform: string, res: Response) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json",
  );

  if (!fs.existsSync(manifestPath)) {
    return res
      .status(404)
      .json({ error: `Manifest not found for platform: ${platform}` });
  }

  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}

function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName,
}: {
  req: Request;
  res: Response;
  landingPageTemplate: string;
  appName: string;
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

function configureExpoAndLanding(app: express.Application) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html",
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();

  const privacyPolicyPath = path.resolve(process.cwd(), "server", "templates", "privacy-policy.html");
  const privacyPolicyHtml = fs.readFileSync(privacyPolicyPath, "utf-8");
  app.get("/privacy", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(privacyPolicyHtml);
  });

  app.get("/robots.txt", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/plain");
    res.send("User-agent: *\nAllow: /\nSitemap: https://www.swayger.app/sitemap.xml\n");
  });

  // OneSignal service worker — required for web push subscriptions in Chrome/Edge/Firefox
  app.get("/OneSignalSDKWorker.js", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "application/javascript");
    res.setHeader("Service-Worker-Allowed", "/");
    res.send(`importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");`);
  });

  registerUnsubscribeRoutes(app);

  log("Serving static Expo files with dynamic manifest routing");

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) {
      return next();
    }

    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }

    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }

    if (req.path === "/") {
      const webIndexPath = path.resolve(process.cwd(), "dist", "index.html");
      if (fs.existsSync(webIndexPath)) {
        let html = fs.readFileSync(webIndexPath, "utf-8");
        html = injectSeoTags(html);
        html = injectOneSignal(html);
        const privacyFooter = `<footer style="position:fixed;bottom:0;width:100%;text-align:center;padding:8px;font-family:sans-serif;font-size:12px;color:#64748b;background:#0B1120;z-index:0;"><a href="/privacy" style="color:#1DA1F2;text-decoration:none;">Privacy Policy</a></footer>`;
        html = html.replace("</body>", `${privacyFooter}</body>`);
        res.setHeader("Content-Type", "text/html");
        return res.send(html);
      }
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName,
      });
    }

    next();
  });

  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
  app.use(express.static(path.resolve(process.cwd(), "dist")));
  app.use(express.static(path.resolve(process.cwd(), "static-build")));

  // SPA fallback — deep links like /invite/ABC123 all return index.html
  // Excludes server-rendered routes so they aren't swallowed by the Expo app.
  const SERVER_PATHS = ["/api", "/assets", "/admin", "/feedback", "/outreach-feedback", "/unsubscribe", "/promo", "/how-it-works", "/privacy"];
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (SERVER_PATHS.some((p) => req.path.startsWith(p))) {
      return next();
    }
    const webIndexPath = path.resolve(process.cwd(), "dist", "index.html");
    if (fs.existsSync(webIndexPath)) {
      let html = fs.readFileSync(webIndexPath, "utf-8");
      html = injectSeoTags(html);
      html = injectOneSignal(html);
      res.setHeader("Content-Type", "text/html");
      return res.send(html);
    }
    next();
  });

  log("Expo routing: Checking expo-platform header on / and /manifest");
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });
}

async function runSettlementExpiry() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return;

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const now = new Date();
    const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();

    // ── 1. Pre-fetch swaygers about to expire (for emails BEFORE they're gone) ──

    // Invites expiring now
    const { data: expiringInvites } = await supabase
      .from("swaygers")
      .select("id, title, category, stake_units, creator_id, opponent_id")
      .eq("status", "pending_invite")
      .lt("expires_at", now.toISOString());

    // Settlements expiring now (by settlement_deadline)
    const { data: expiringSettlements } = await supabase
      .from("swaygers")
      .select("id, title, category, stake_units, creator_id, opponent_id")
      .eq("status", "settlement_proposed")
      .not("settlement_deadline", "is", null)
      .lt("settlement_deadline", now.toISOString());

    // Settlements expiring now (legacy — no deadline, using 7-day updated_at)
    const legacyCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: legacyExpiringSettlements } = await supabase
      .from("swaygers")
      .select("id, title, category, stake_units, creator_id, opponent_id")
      .eq("status", "settlement_proposed")
      .is("settlement_deadline", null)
      .lt("updated_at", legacyCutoff);

    // Upcoming invite reminders (2 days before expires_at, not yet sent)
    const { data: inviteReminders } = await supabase
      .from("swaygers")
      .select("id, title, category, stake_units, creator_id, opponent_id, expires_at")
      .eq("status", "pending_invite")
      .eq("invite_reminder_sent", false)
      .gt("expires_at", now.toISOString())
      .lt("expires_at", twoDaysFromNow);

    // Upcoming settlement reminders (2 days before settlement_deadline, not yet sent)
    const { data: settlementReminders } = await supabase
      .from("swaygers")
      .select("id, title, category, stake_units, creator_id, opponent_id, settlement_deadline")
      .eq("status", "settlement_proposed")
      .eq("settlement_reminder_sent", false)
      .not("settlement_deadline", "is", null)
      .gt("settlement_deadline", now.toISOString())
      .lt("settlement_deadline", twoDaysFromNow);

    // ── 2. Run the expiry RPC ─────────────────────────────────────────────────

    const { data, error } = await supabase.rpc("expire_old_proposals");
    if (error) {
      console.error("[expiry] expire_old_proposals error:", error.message);
      return;
    }

    const count = data as number;
    if (count > 0) {
      log(`[expiry] Expired ${count} swayger(s) (invites + settlements)`);
    }

    // ── 3. Build profile map for all affected users ───────────────────────────

    type SwaygerRow = { id: string; title: string; category: string; stake_units: number; creator_id: string; opponent_id: string | null };

    const allRows: SwaygerRow[] = [
      ...(expiringInvites ?? []),
      ...(expiringSettlements ?? []),
      ...(legacyExpiringSettlements ?? []),
      ...(inviteReminders ?? []),
      ...(settlementReminders ?? []),
    ];

    if (allRows.length === 0) return;

    const allUserIds = [...new Set(allRows.flatMap((s) =>
      [s.creator_id, s.opponent_id].filter(Boolean) as string[]
    ))];

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, display_name, notification_email")
      .in("id", allUserIds);

    type ProfileRow = { id: string; username: string; display_name: string | null; notification_email: string | null };
    const profileMap = new Map<string, ProfileRow>(
      ((profiles ?? []) as ProfileRow[]).map((p) => [p.id, p])
    );

    function buildRecipients(sw: SwaygerRow, includeOpponent = true): { email: string; name: string }[] {
      const recs: { email: string; name: string }[] = [];
      const cp = profileMap.get(sw.creator_id);
      if (cp?.notification_email) recs.push({ email: cp.notification_email, name: cp.display_name || cp.username });
      if (includeOpponent && sw.opponent_id) {
        const op = profileMap.get(sw.opponent_id);
        if (op?.notification_email) recs.push({ email: op.notification_email, name: op.display_name || op.username });
      }
      return recs;
    }

    // ── 4. Send invite-expired emails ─────────────────────────────────────────

    for (const sw of (expiringInvites ?? []) as SwaygerRow[]) {
      const recipients = buildRecipients(sw, false); // creator only (no opponent yet)
      if (!recipients.length) continue;
      await sendNotificationEmail({
        event: "invite_expired",
        swayger: { id: sw.id, title: sw.title, category: sw.category || "Other", stakeUnits: sw.stake_units || 1 },
        sender: { name: "Swayger" },
        recipients,
      }).catch((e: unknown) => console.error(`[expiry] invite_expired email for ${sw.id}:`, e));
    }

    // ── 5. Send settlement-expired emails ─────────────────────────────────────

    const settlingExpired = [
      ...(expiringSettlements ?? []),
      ...(legacyExpiringSettlements ?? []),
    ] as SwaygerRow[];

    for (const sw of settlingExpired) {
      const recipients = buildRecipients(sw, true);
      if (!recipients.length) continue;
      await sendNotificationEmail({
        event: "settlement_expired",
        swayger: { id: sw.id, title: sw.title, category: sw.category || "Other", stakeUnits: sw.stake_units || 1 },
        sender: { name: "Swayger" },
        recipients,
      }).catch((e: unknown) => console.error(`[expiry] settlement_expired email for ${sw.id}:`, e));
    }

    // ── 6. Send 2-day invite reminder emails + mark sent ──────────────────────

    for (const sw of (inviteReminders ?? []) as SwaygerRow[]) {
      const recipients = buildRecipients(sw, false); // only creator for invite reminders
      if (recipients.length) {
        await sendNotificationEmail({
          event: "settlement_deadline_reminder",
          swayger: { id: sw.id, title: sw.title, category: sw.category || "Other", stakeUnits: sw.stake_units || 1 },
          sender: { name: "Swayger" },
          recipients,
        }).catch((e: unknown) => console.error(`[expiry] invite reminder email for ${sw.id}:`, e));
      }
      await supabase.from("swaygers").update({ invite_reminder_sent: true }).eq("id", sw.id);
    }

    // ── 7. Send 2-day settlement reminder emails + mark sent ──────────────────

    for (const sw of (settlementReminders ?? []) as SwaygerRow[]) {
      const recipients = buildRecipients(sw, true);
      if (recipients.length) {
        await sendNotificationEmail({
          event: "settlement_deadline_reminder",
          swayger: { id: sw.id, title: sw.title, category: sw.category || "Other", stakeUnits: sw.stake_units || 1 },
          sender: { name: "Swayger" },
          recipients,
        }).catch((e: unknown) => console.error(`[expiry] settlement reminder email for ${sw.id}:`, e));
      }
      await supabase.from("swaygers").update({ settlement_reminder_sent: true }).eq("id", sw.id);
    }

  } catch (err) {
    console.error("[expiry] Unexpected error:", err);
  }
}

(async () => {
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);

  // Redirect bare domain → www so OneSignal (configured for www.swayger.app) works correctly
  app.use((req: Request, res: Response, next: NextFunction) => {
    const host = req.headers.host || "";
    if (host === "swayger.app") {
      return res.redirect(301, `https://www.swayger.app${req.originalUrl}`);
    }
    next();
  });

  configureExpoAndLanding(app);

  const server = await registerRoutes(app);

  setupErrorHandler(app);

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`express server serving on port ${port}`);
      // Run expiry check every hour
      runSettlementExpiry();
      setInterval(runSettlementExpiry, 60 * 60 * 1000);
      // Start MM pre-lock reminder scheduler
      startMMScheduler();
    },
  );
})();
