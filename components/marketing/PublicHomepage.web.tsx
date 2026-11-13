import React, { useEffect, useMemo, useRef, useState } from "react";
import Colors from "@/constants/colors";
import Head from "expo-router/head";
import {
  PUBLIC_SITE_ORIGIN,
  PUBLIC_HOME_TITLE,
  PUBLIC_HOME_DESCRIPTION,
  homepageAccountLink,
  homepageExperienceChoices,
} from "@/lib/public-homepage";
import { prepareHomepageReturn, prepareHomepagePlay } from "@/lib/homepage-return";
import { useAuth } from "@/lib/auth-context";
import { gameNightMarkup } from "./game-night-content";
import { gameNightStyles } from "./game-night-styles";

const C = Colors.dark;
type Intent = "play" | "organize";

const choiceDialogStyles = `
  .swayger-home {
    width:100%; min-width:0; height:100dvh; min-height:100dvh; max-height:100dvh;
    overflow-x:hidden; overflow-y:auto; overscroll-behavior-y:contain;
    -webkit-overflow-scrolling:touch; position:relative; isolation:isolate;
  }
  .swayger-home .footer-inner { flex-wrap:wrap; }
  body:has(.swayger-home) #swayger-privacy-footer { display:none; }
  .swayger-home .signin,.swayger-home .close,.swayger-home .card-action { min-height:44px; }
  .swayger-home .signin { display:inline-flex; align-items:center; }
  .swayger-home.dialog-open { overflow:hidden; }
  .swayger-home .experience-dialog {
    width:min(760px,calc(100% - 28px)); max-width:760px; max-height:min(88dvh,760px);
    padding:0; overflow:auto; border:1px solid rgba(255,255,255,.25); color:#fafaff;
    background:#111d40; box-shadow:0 28px 90px rgba(0,0,0,.55);
  }
  .swayger-home .experience-dialog::backdrop { background:rgba(5,9,25,.82); backdrop-filter:blur(5px); }
  .swayger-home .experience-dialog-inner { padding:clamp(22px,4vw,38px); }
  .swayger-home .section-kicker { color:#aebaff; text-transform:uppercase; font-size:10px; letter-spacing:.19em; }
  .swayger-home .experience-dialog-head { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; }
  .swayger-home .experience-dialog-head>div { min-width:0; flex:1 1 auto; }
  .swayger-home .experience-dialog h2 { max-width:580px; min-width:0; margin:12px 0 10px; font:800 clamp(38px,6vw,62px)/.9 SwaygerGameNight,sans-serif; overflow-wrap:anywhere; text-transform:uppercase; }
  .swayger-home .experience-intro { max-width:610px; margin:0; color:#cbd4ee; font-size:13px; line-height:1.65; }
  .swayger-home .experience-close { flex:0 0 auto; width:44px; height:44px; border:1px solid rgba(255,255,255,.35); background:transparent; color:#fafaff; font-size:24px; cursor:pointer; }
  .swayger-home .experience-close:hover { background:rgba(255,255,255,.1); }
  .swayger-home .experience-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin-top:24px; }
  .swayger-home .experience-option { min-width:0; min-height:185px; display:flex; flex-direction:column; align-items:flex-start; padding:17px; border:1px solid rgba(255,255,255,.17); background:#192951; }
  .swayger-home .experience-option h3 { margin:0 0 9px; font:800 25px/.95 SwaygerGameNight,sans-serif; text-transform:uppercase; }
  .swayger-home .experience-option p { flex:1; margin:0; color:#c3cde8; font-size:11px; line-height:1.6; }
  .swayger-home .experience-option a { display:inline-flex; align-items:center; min-height:44px; margin-top:13px; color:#b8c7ff; font-size:10px; letter-spacing:.08em; text-decoration:underline; text-underline-offset:4px; text-transform:uppercase; }
  .swayger-home .experience-option a:hover { color:#fff; }
  .swayger-home .experience-disclosure,.swayger-home .invite-note { margin:18px 0 0; padding-top:15px; border-top:1px solid rgba(224,232,255,.17); color:#cbd4ee; font-size:11px; line-height:1.65; }
  .swayger-home .experience-disclosure strong { color:#fff; }
  .swayger-home .experience-error { margin:14px 0 0; padding:12px 14px; border-left:3px solid #aebaff; color:#fff; background:rgba(7,13,34,.5); font-size:12px; line-height:1.55; }
  .swayger-home .play-action { margin-top:24px; }
  .swayger-home .play-link { display:inline-flex; align-items:center; justify-content:center; min-height:52px; padding:0 20px; color:#fafaff; background:#4059ee; text-decoration:none; text-transform:uppercase; font-size:11px; letter-spacing:.08em; font-family:system-ui,sans-serif; }
  .swayger-home .play-link:hover { background:#3047d1; }
  @media(max-width:760px) {
    .swayger-home .experience-grid { grid-template-columns:1fr; gap:8px; }
    .swayger-home .experience-option { min-height:0; padding:15px; }
    .swayger-home .experience-option p { max-width:none; }
    .swayger-home .experience-option a { margin-top:8px; }
    .swayger-home .experience-dialog-inner { padding:18px 16px; }
    .swayger-home .experience-dialog-head { gap:10px; }
    .swayger-home .experience-dialog h2 { font-size:clamp(34px,10.5vw,48px); }
  }
  @media(max-width:360px) {
    .swayger-home .experience-dialog-inner { padding:16px 14px; }
    .swayger-home .experience-dialog-head { gap:8px; }
    .swayger-home .experience-dialog h2 { font-size:34px; }
  }
`;

type Capture = { title: string; src: string; alt: string };

// Dialog state must not replace the approved DOM: its buttons are the
// focus-return targets. React 19 reapplies raw innerHTML when it rerenders.
const ApprovedGameNightContent = React.memo(function ApprovedGameNightContent({ markup }: { markup: string }) {
  return <div dangerouslySetInnerHTML={{ __html: markup }} />;
});

export default function PublicHomepage() {
  const { session } = useAuth();
  const accountLink = homepageAccountLink(!!session);
  const experienceChoices = useMemo(
    () => homepageExperienceChoices(!!session, "organize"),
    [session],
  );
  const [choiceIntent, setChoiceIntent] = useState<Intent>("play");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [capture, setCapture] = useState<Capture | null>(null);
  const [navigationError, setNavigationError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const captureDialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const captureCloseRef = useRef<HTMLButtonElement>(null);
  const captureScrollRef = useRef<HTMLDivElement>(null);
  const activeTriggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (dialogOpen && !dialog.open) {
      dialog.showModal();
      closeButtonRef.current?.focus();
    } else if (!dialogOpen && dialog.open) {
      dialog.close();
    }
  }, [dialogOpen]);

  useEffect(() => {
    const dialog = captureDialogRef.current;
    if (!dialog) return;
    if (captureOpen && !dialog.open) {
      dialog.showModal();
      captureScrollRef.current?.scrollTo(0, 0);
      captureCloseRef.current?.focus();
    } else if (!captureOpen && dialog.open) {
      dialog.close();
    }
  }, [captureOpen]);

  async function openChoices(intent: Intent, trigger: HTMLElement) {
    activeTriggerRef.current = trigger;
    setNavigationError("");
    if (intent === "play") {
      try {
        await prepareHomepagePlay();
      } catch {
        setNavigationError("We couldn’t clear your previous choice. Check your browser storage settings and try again.");
      }
    }
    setChoiceIntent(intent);
    setDialogOpen(true);
  }

  function restoreTriggerFocus() {
    requestAnimationFrame(() => activeTriggerRef.current?.focus());
  }

  function closeChoices() {
    setDialogOpen(false);
    restoreTriggerFocus();
  }

  async function handleChoice(
    event: React.MouseEvent<HTMLAnchorElement>,
    returnTo?: string | null,
  ) {
    if (!returnTo) return;
    event.preventDefault();
    const href = event.currentTarget.href;
    setNavigationError("");
    try {
      await prepareHomepageReturn(returnTo);
      window.location.assign(href);
    } catch {
      setNavigationError("We couldn’t save your place. Check your browser storage settings and try again.");
    }
  }

  async function handlePlay(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    const href = event.currentTarget.href;
    setNavigationError("");
    try {
      await prepareHomepagePlay();
      window.location.assign(href);
    } catch {
      setNavigationError("We couldn’t clear your previous choice. Check your browser storage settings and try again.");
    }
  }

  function openCapture(shot: HTMLElement, trigger: HTMLElement) {
    const image = shot.querySelector("img");
    if (!image) return;
    const full = shot.dataset.full || image.currentSrc || image.src;
    setCapture({
      title: shot.dataset.title || image.alt || "Swayger product capture",
      src: full,
      alt: image.alt || shot.dataset.title || "Swayger product capture",
    });
    activeTriggerRef.current = trigger;
    setCaptureOpen(true);
  }

  function closeCapture() {
    setCaptureOpen(false);
    restoreTriggerFocus();
  }

  function handleShowcaseClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const action = target.closest<HTMLElement>("[data-home-action]");
    if (action) {
      event.preventDefault();
      void openChoices(action.dataset.homeAction === "organize" ? "organize" : "play", action);
      return;
    }

    const showcase = target.closest<HTMLElement>("[data-showcase]");
    if (showcase) {
      const shot = showcase.closest(".card")?.querySelector<HTMLElement>(".shot");
      if (shot) openCapture(shot, showcase);
      return;
    }

    const shot = target.closest<HTMLElement>(".shot");
    if (shot) openCapture(shot, shot);
  }

  const dialogTitle = choiceIntent === "organize" ? "Start your competition." : "Ready to compete?";
  const markup = gameNightMarkup
    .replace(/__ACCOUNT_HREF__/g, accountLink.href)
    .replace(/__ACCOUNT_LABEL__/g, accountLink.label);

  return (
    <div id="top" className={`swayger-home${dialogOpen || captureOpen ? " dialog-open" : ""}`} onClick={handleShowcaseClick}>
      <Head>
        <title>{PUBLIC_HOME_TITLE}</title>
        <meta name="description" content={PUBLIC_HOME_DESCRIPTION} />
        <meta name="theme-color" content={C.background} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={`${PUBLIC_SITE_ORIGIN}/`} />
        <meta property="og:title" content={PUBLIC_HOME_TITLE} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Swayger" />
        <meta property="og:description" content={PUBLIC_HOME_DESCRIPTION} />
        <meta property="og:url" content={`${PUBLIC_SITE_ORIGIN}/`} />
        <meta property="og:image" content={`${PUBLIC_SITE_ORIGIN}/assets/marketing/swayger-social.png`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="Swayger. Make sports talk competitive. Make your picks. Prove your takes. Keep the receipts." />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={PUBLIC_HOME_TITLE} />
        <meta name="twitter:description" content={PUBLIC_HOME_DESCRIPTION} />
        <meta name="twitter:image" content={`${PUBLIC_SITE_ORIGIN}/assets/marketing/swayger-social.png`} />
      </Head>
      <style>{gameNightStyles}{choiceDialogStyles}</style>
      <ApprovedGameNightContent markup={markup} />

      <dialog
        ref={dialogRef}
        className="experience-dialog"
        aria-labelledby="experience-dialog-title"
        aria-describedby="experience-dialog-intro"
        onCancel={(event) => { event.preventDefault(); closeChoices(); }}
        onClick={(event) => { if (event.target === dialogRef.current) closeChoices(); }}
        onClose={() => { if (dialogOpen) setDialogOpen(false); restoreTriggerFocus(); }}
      >
        <div className="experience-dialog-inner">
          <div className="experience-dialog-head">
            <div>
              <div className="section-kicker">{choiceIntent === "organize" ? "Start a room, league, or challenge" : "Join the competition"}</div>
              <h2 id="experience-dialog-title" className="display">{dialogTitle}</h2>
            </div>
            <button ref={closeButtonRef} type="button" className="experience-close" aria-label="Close dialog" onClick={closeChoices}>
              <span aria-hidden="true">×</span>
            </button>
          </div>
          {choiceIntent === "organize" ? (
            <>
              <p id="experience-dialog-intro" className="experience-intro">Choose the format that fits your group. You set it up, share its invite, and confirm results under your rules.</p>
              {navigationError ? <p className="experience-error" role="alert">{navigationError}</p> : null}
              <div className="experience-grid">
                {[...experienceChoices]
                  .sort((a, b) => ["game-day", "1v1", "fantasy"].indexOf(a.id) - ["game-day", "1v1", "fantasy"].indexOf(b.id))
                  .map((choice) => (
                    <article className="experience-option" key={choice.id}>
                      <h3 className="display">
                        {choice.title === "Game Day" ? "Swayger Game Day" : choice.title === "Fantasy" ? "Swayger Fantasy" : "1v1 Swaygers"}
                      </h3>
                      <p>{choice.description}</p>
                      <a href={choice.href} onClick={(event) => handleChoice(event, choice.returnTo)}>
                        {choice.action}<span aria-hidden="true"> →</span>
                      </a>
                    </article>
                  ))}
              </div>
              <p className="experience-disclosure"><strong>Results need a person:</strong> hosts and commissioners confirm results using their competition’s rules. Swayger keeps the picks, standings, and receipts together.</p>
            </>
          ) : (
            <>
              <p id="experience-dialog-intro" className="experience-intro">Use the competition link your host or commissioner shared with you.</p>
              {navigationError ? <p className="experience-error" role="alert">{navigationError}</p> : null}
              <div className="play-action">
                <a className="play-link" href={session ? "/" : "/auth"} onClick={handlePlay}>
                  {session ? "Continue to competition" : "Sign in to play"} <span aria-hidden="true">↗</span>
                </a>
              </div>
              <p className="invite-note">Have an invite? Open your Game Day room link, Fantasy league link, or 1v1 challenge link directly. Existing guest and preview options are available there. No invite? Sign in to your dashboard to see competition available to your account.</p>
            </>
          )}
        </div>
      </dialog>

      <dialog
        ref={captureDialogRef}
        className="capture-dialog"
        aria-labelledby="detail-title"
        onCancel={(event) => { event.preventDefault(); closeCapture(); }}
        onClick={(event) => { if (event.target === captureDialogRef.current) closeCapture(); }}
        onClose={() => { if (captureOpen) setCaptureOpen(false); restoreTriggerFocus(); }}
      >
        <div className="dialog-bar">
          <h2 id="detail-title">{capture?.title || "Swayger capture"}</h2>
          <button ref={captureCloseRef} type="button" className="close" onClick={closeCapture} aria-label="Close image viewer">Close</button>
        </div>
        <p className="detail-hint">Swipe across to read the full capture.</p>
        <div ref={captureScrollRef} className="detail-scroll">
          {capture ? (
            <img
              src={capture.src}
              alt={capture.alt}
              onLoad={(event) => event.currentTarget.style.setProperty("--natural", String(event.currentTarget.naturalWidth || 760))}
            />
          ) : null}
        </div>
      </dialog>
    </div>
  );
}
