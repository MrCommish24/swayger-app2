import React from "react";
import Colors from "@/constants/colors";
import SwaygerMark from "@/components/SwaygerMark";
import GameDayReceiptCard from "@/components/GameDayReceiptCard";
import type { GDLeaderboardEntry } from "@/lib/gameday-api";
import Head from "expo-router/head";
import { PUBLIC_SITE_ORIGIN, PUBLIC_HOME_TITLE, PUBLIC_HOME_DESCRIPTION, homepageAccountLink } from "@/lib/public-homepage";
import { useAuth } from "@/lib/auth-context";

const C = Colors.dark;

const exampleStandings: GDLeaderboardEntry[] = [
  { participant_id: "preview-1", display_name: "Maya", is_guest: true, game_day_sp: 84, correct_picks: 7, pending_picks: 0, total_picks: 9, rank: 4 },
  { participant_id: "preview-2", display_name: "Jordan", is_guest: true, game_day_sp: 76, correct_picks: 6, pending_picks: 0, total_picks: 9, rank: 5 },
  { participant_id: "preview-3", display_name: "Cam", is_guest: true, game_day_sp: 68, correct_picks: 5, pending_picks: 0, total_picks: 9, rank: 6 },
];

const styles = `
  body:has(.swayger-home) #swayger-privacy-footer { display: none; }
  .swayger-home {
    --ink: ${C.background};
    --panel: ${C.surface};
    --panel-raised: ${C.surfaceLight};
    --paper: ${C.text};
    --muted: ${C.textSecondary};
    --quiet: ${C.textMuted};
    --line: ${C.border};
    --blue: ${C.tint};
    --green: ${C.success};
    --gold: ${C.accentGold};
    color: var(--paper);
    background: var(--ink);
    font-family: "DMSans_400Regular", "DM Sans", sans-serif;
    min-height: 100dvh;
    height: 100dvh;
    overflow-x: hidden;
    overflow-y: auto;
    scroll-behavior: smooth;
    position: relative;
    isolation: isolate;
  }
  .swayger-home, .swayger-home * { box-sizing: border-box; }
  .swayger-home a { color: inherit; }
  .swayger-home a:focus-visible { outline: 3px solid var(--paper); outline-offset: 5px; border-radius: 4px; }
  .swayger-home .display { font-family: "BarlowCondensed_800ExtraBold", "Barlow Condensed", sans-serif; font-weight: 800; }
  .swayger-home .medium { font-family: "DMSans_500Medium", "DM Sans", sans-serif; }
  .swayger-home .wrap { width: min(1160px, calc(100% - 48px)); margin-inline: auto; }
  .swayger-home .skip {
    position: absolute; z-index: 20; top: 10px; left: 10px; padding: 12px 16px;
    color: var(--ink); background: var(--paper); transform: translateY(-160%); transition: transform .2s ease;
  }
  .swayger-home .skip:focus { transform: translateY(0); }
  .swayger-home .topbar { position: relative; z-index: 2; border-bottom: 1px solid rgba(255,255,255,.09); }
  .swayger-home .nav { min-height: 78px; display: flex; align-items: center; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
  .swayger-home .header-actions { display: flex; align-items: center; gap: 18px; margin-left: auto; flex-shrink: 0; }
  .swayger-home .account-link { display: inline-flex; align-items: center; min-height: 44px; color: var(--paper); font-size: 14px; text-decoration: underline; text-underline-offset: 4px; white-space: nowrap; }
  .swayger-home .account-link:hover { color: #AEBBFF; }
  .swayger-home .brand { display: inline-flex; align-items: center; gap: 11px; text-decoration: none; }
  .swayger-home .brand-word { font-size: 24px; letter-spacing: .055em; line-height: 1; }
  .swayger-home .nav-links { display: flex; gap: clamp(18px, 3vw, 38px); align-items: center; }
  .swayger-home .nav-links a { text-decoration: none; color: #c3c4cd; font-size: 13px; transition: color .18s ease; }
  .swayger-home .nav-links a:hover { color: var(--paper); }
  .swayger-home .nav-cta { text-decoration: none; border: 1px solid rgba(255,255,255,.27); padding: 11px 17px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; transition: background .2s ease, color .2s ease, border-color .2s ease; }
  .swayger-home .nav-cta:hover { background: var(--paper); color: var(--ink); border-color: var(--paper); }
  .swayger-home .hero {
    position: relative; min-height: 675px; display: grid; grid-template-columns: 1.08fr .92fr;
    align-items: center; gap: clamp(30px, 5vw, 72px); padding-block: 78px 100px;
  }
  .swayger-home .hero:before {
    content: ""; position: absolute; z-index: -1; width: 660px; height: 660px; left: 42%; top: -7%;
    border-radius: 50%; background: radial-gradient(circle, rgba(67,97,238,.18), rgba(67,97,238,0) 68%);
    pointer-events: none;
  }
  .swayger-home .hero-copy { position: relative; z-index: 1; animation: swayger-rise .7s both; }
  .swayger-home .eyebrow { display: flex; align-items: center; gap: 11px; color: #9aa9ff; text-transform: uppercase; font-size: 11px; letter-spacing: .19em; font-family: "DMSans_500Medium", sans-serif; }
  .swayger-home .eyebrow:before { content: ""; width: 28px; height: 2px; background: var(--blue); }
  .swayger-home h1 { font-size: clamp(66px, 9.2vw, 126px); line-height: .82; letter-spacing: -.035em; text-transform: uppercase; max-width: 720px; margin: 26px 0 23px; }
  .swayger-home h1 em { color: var(--blue); font-style: normal; }
  .swayger-home .hero-line { color: #d7d8df; max-width: 470px; font-size: clamp(17px, 1.65vw, 20px); line-height: 1.55; margin: 0; }
  .swayger-home .hero-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 13px; margin-top: 34px; }
  .swayger-home .button { min-height: 52px; display: inline-flex; align-items: center; justify-content: center; gap: 13px; padding: 0 20px; text-decoration: none; text-transform: uppercase; letter-spacing: .08em; font-size: 12px; font-family: "DMSans_500Medium", sans-serif; transition: transform .18s ease, background .18s ease, border-color .18s ease; }
  .swayger-home .button:hover { transform: translateY(-3px); }
  .swayger-home .button-primary { background: var(--blue); color: #fff; }
  .swayger-home .button-primary:hover { background: #5472f0; }
  .swayger-home .button-outline { border: 1px solid rgba(255,255,255,.25); }
  .swayger-home .button-outline:hover { border-color: rgba(255,255,255,.7); }
  .swayger-home .text-link { color: #aeb8ff; text-decoration-thickness: 1px; text-underline-offset: 5px; font-size: 13px; }
  .swayger-home .hero-art { min-width: 0; position: relative; animation: swayger-rise .85s .12s both; }
  .swayger-home .art-stamp { position: absolute; z-index: 2; top: -22px; right: -16px; width: 104px; height: 104px; display: grid; place-items: center; border: 1px solid #5472F0; border-radius: 50%; color: #AEBBFF; transform: rotate(10deg); background: rgba(9,9,11,.7); }
  .swayger-home .art-stamp span { font-size: 10px; line-height: 1.2; text-align: center; letter-spacing: .14em; text-transform: uppercase; }
  .swayger-home .receipt-frame { position: relative; padding: 20px; background: linear-gradient(145deg, #262735, #12131a 72%); border: 1px solid rgba(255,255,255,.14); box-shadow: 22px 22px 0 rgba(67,97,238,.17); transform: rotate(1.3deg); }
  .swayger-home .receipt-caption { display: flex; justify-content: space-between; gap: 12px; color: #bbbcc7; font-size: 9px; letter-spacing: .15em; text-transform: uppercase; margin-bottom: 15px; }
  .swayger-home .receipt-preview { display: flex; justify-content: center; overflow: hidden; }
  /* The legacy native receipt has decorative emoji badges; omit that one icon in the web preview. */
  .swayger-home .receipt-preview > div > div:first-child > div:first-child { display: none !important; }
  .swayger-home .receipt-preview > div > div:nth-child(3) > div:nth-child(5) > div > div:first-child { display: none !important; }
  .swayger-home .receipt-preview > div { transform: scale(.93); transform-origin: top center; }
  .swayger-home .preview-note { margin: 13px 0 0; color: #9c9da8; font-size: 10px; line-height: 1.5; text-align: center; }
  .swayger-home .scroll-mark { position: absolute; bottom: 28px; left: 0; display: flex; align-items: center; gap: 12px; color: #858691; font-size: 9px; letter-spacing: .18em; text-transform: uppercase; }
  .swayger-home .scroll-mark:before { content: ""; width: 1px; height: 34px; background: var(--blue); }
  .swayger-home .intro { padding: 82px 0 100px; border-top: 1px solid rgba(255,255,255,.08); }
  .swayger-home .intro-grid { display: grid; grid-template-columns: .72fr 1.28fr; gap: 7vw; align-items: start; }
  .swayger-home .section-kicker { color: #95a4ff; text-transform: uppercase; letter-spacing: .18em; font-size: 10px; font-family: "DMSans_500Medium", sans-serif; }
  .swayger-home .intro h2 { font-size: clamp(40px, 5.8vw, 74px); line-height: .92; letter-spacing: -.02em; text-transform: uppercase; margin: 0; max-width: 820px; }
  .swayger-home .intro p { color: var(--muted); font-size: 16px; line-height: 1.75; max-width: 560px; margin: 23px 0 0; }
  .swayger-home .process { padding: 96px 0 102px; color: var(--ink); background: #d6d9e5; }
  .swayger-home .process-head { display: flex; align-items: end; justify-content: space-between; gap: 30px; margin-bottom: 46px; }
  .swayger-home .process .section-kicker { color: #364fc6; }
  .swayger-home .process h2 { font-size: clamp(52px, 7vw, 86px); line-height: .86; letter-spacing: -.03em; text-transform: uppercase; margin: 15px 0 0; }
  .swayger-home .process-intro { max-width: 275px; margin: 0 0 2px; color: #575b69; font-size: 14px; line-height: 1.6; }
  .swayger-home .steps { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(5, 1fr); border-top: 1px solid rgba(9,9,11,.24); }
  .swayger-home .steps li { min-height: 174px; padding: 19px 17px 0 0; border-right: 1px solid rgba(9,9,11,.18); }
  .swayger-home .steps li + li { padding-left: 18px; }
  .swayger-home .steps li:last-child { border-right: 0; }
  .swayger-home .step-num { color: #465fd4; font-size: 11px; letter-spacing: .1em; }
  .swayger-home .steps h3 { font-size: clamp(24px, 2.8vw, 35px); margin: 27px 0 7px; text-transform: uppercase; line-height: .95; }
  .swayger-home .steps p { color: #595d6b; margin: 0; font-size: 12px; line-height: 1.55; max-width: 165px; }
  .swayger-home .modes { padding: 104px 0 112px; }
  .swayger-home .modes-heading { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-bottom: 38px; }
  .swayger-home .modes h2, .swayger-home .community h2, .swayger-home .organizers h2, .swayger-home .final h2 { font-size: clamp(52px, 7vw, 88px); text-transform: uppercase; line-height: .86; letter-spacing: -.025em; margin: 13px 0 0; }
  .swayger-home .modes-sub { max-width: 280px; color: var(--muted); font-size: 13px; line-height: 1.6; margin-bottom: 3px; }
  .swayger-home .mode-list { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
  .swayger-home .mode-card { min-height: 342px; position: relative; overflow: hidden; padding: 27px; border: 1px solid rgba(255,255,255,.12); background: #17181f; display: flex; flex-direction: column; justify-content: space-between; transition: transform .22s ease, border-color .22s ease, background .22s ease; }
  .swayger-home .mode-card:hover { transform: translateY(-6px); border-color: rgba(116,136,255,.7); background: #1c1e29; }
  .swayger-home .mode-card:after { content: ""; position: absolute; width: 230px; height: 230px; border: 1px solid rgba(255,255,255,.08); border-radius: 50%; right: -102px; top: -106px; box-shadow: 0 0 0 26px rgba(255,255,255,.025), 0 0 0 52px rgba(255,255,255,.018); }
  .swayger-home .mode-index { color: #9698a4; font-size: 10px; letter-spacing: .15em; }
  .swayger-home .mode-icon { width: 45px; height: 45px; display: grid; place-items: center; border: 1px solid rgba(116,136,255,.55); color: #aab5ff; font-size: 19px; margin-top: 37px; }
  .swayger-home .mode-card h3 { font-size: 39px; text-transform: uppercase; line-height: .9; margin: 21px 0 12px; }
  .swayger-home .mode-card p { max-width: 290px; color: #b5b6c0; font-size: 13px; line-height: 1.65; margin: 0; }
  .swayger-home .mode-link { display: inline-flex; align-items: center; gap: 13px; width: fit-content; margin-top: 27px; text-decoration: none; color: #b4beff; text-transform: uppercase; font-size: 10px; letter-spacing: .13em; }
  .swayger-home .mode-link span { font-size: 18px; transition: transform .2s ease; }
  .swayger-home .mode-link:hover span { transform: translateX(5px); }
  .swayger-home .community { position: relative; padding: 94px 0 101px; background: #202b62; overflow: hidden; }
  .swayger-home .community:after { content: ""; position: absolute; width: 580px; height: 580px; right: -140px; top: -240px; border: 1px solid rgba(255,255,255,.13); border-radius: 50%; box-shadow: 0 0 0 38px rgba(255,255,255,.035), 0 0 0 77px rgba(255,255,255,.025), 0 0 0 116px rgba(255,255,255,.02); pointer-events: none; }
  .swayger-home .community-grid { position: relative; z-index: 1; display: grid; grid-template-columns: 1fr .8fr; align-items: center; gap: 8vw; }
  .swayger-home .community .section-kicker { color: #bac4ff; }
  .swayger-home .community h2 { max-width: 700px; }
  .swayger-home .community-copy { max-width: 390px; color: #d2d6ed; font-size: 15px; line-height: 1.7; margin: 22px 0 0; }
  .swayger-home .community-board { position: relative; padding: 26px; background: rgba(12,15,34,.57); border: 1px solid rgba(255,255,255,.24); transform: rotate(-2deg); }
  .swayger-home .board-top { display: flex; justify-content: space-between; color: #bfc7f4; font-size: 9px; letter-spacing: .15em; text-transform: uppercase; padding-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,.18); }
  .swayger-home .board-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 16px 0; border-bottom: 1px solid rgba(255,255,255,.12); }
  .swayger-home .board-row:last-child { border-bottom: 0; padding-bottom: 0; }
  .swayger-home .board-name { display: flex; align-items: center; gap: 11px; font-size: 13px; }
  .swayger-home .board-dot { width: 28px; height: 28px; display: grid; place-items: center; color: #dbe0ff; background: rgba(255,255,255,.13); font-size: 10px; }
  .swayger-home .board-score { color: #c7d0ff; font-family: "BarlowCondensed_700Bold", sans-serif; font-size: 20px; }
  .swayger-home .difference { padding: 103px 0 107px; }
  .swayger-home .difference-grid { display: grid; grid-template-columns: .75fr 1.25fr; gap: 9vw; }
  .swayger-home .difference h2 { margin: 14px 0 0; font-size: clamp(43px, 5.7vw, 70px); text-transform: uppercase; line-height: .88; }
  .swayger-home .difference-copy { max-width: 620px; color: var(--muted); font-size: 16px; line-height: 1.75; }
  .swayger-home .difference-list { margin-top: 24px; border-top: 1px solid var(--line); }
  .swayger-home .difference-row { display: grid; grid-template-columns: 42px 1fr; gap: 15px; padding: 17px 0; border-bottom: 1px solid var(--line); }
  .swayger-home .difference-row b { color: #98a6ff; font-size: 10px; letter-spacing: .1em; padding-top: 3px; }
  .swayger-home .difference-row p { color: #dddde3; font-size: 13px; line-height: 1.55; margin: 0; }
  .swayger-home .organizers { padding: 96px 0 102px; background: #16171d; border-block: 1px solid rgba(255,255,255,.09); }
  .swayger-home .organizer-grid { display: grid; grid-template-columns: 1fr .72fr; gap: 10vw; align-items: center; }
  .swayger-home .organizers h2 { max-width: 680px; }
  .swayger-home .organizers p { max-width: 470px; color: var(--muted); line-height: 1.7; font-size: 15px; margin: 22px 0 27px; }
  .swayger-home .organizer-checks { list-style: none; padding: 0; margin: 0; border-top: 1px solid var(--line); }
  .swayger-home .organizer-checks li { padding: 15px 0; border-bottom: 1px solid var(--line); display: flex; align-items: flex-start; gap: 13px; color: #d5d6de; font-size: 13px; line-height: 1.5; }
  .swayger-home .organizer-checks li:before { content: "+"; color: #9ba9ff; font-size: 16px; line-height: 1; }
  .swayger-home .organizer-visual { aspect-ratio: 1; max-width: 360px; justify-self: end; width: 100%; position: relative; display: grid; place-items: center; border: 1px solid rgba(255,255,255,.14); background: repeating-linear-gradient(0deg, transparent 0 34px, rgba(255,255,255,.05) 35px 36px), repeating-linear-gradient(90deg, transparent 0 34px, rgba(255,255,255,.05) 35px 36px), #1d1f2b; }
  .swayger-home .organizer-visual:before { content: ""; position: absolute; width: 70%; aspect-ratio: 1; border: 1px solid rgba(116,136,255,.52); border-radius: 50%; }
  .swayger-home .organizer-visual:after { content: ""; position: absolute; width: 42%; aspect-ratio: 1; border: 1px solid rgba(245,158,11,.55); border-radius: 50%; }
  .swayger-home .visual-mark { position: relative; z-index: 1; width: 84px; height: 84px; display: grid; place-items: center; background: var(--blue); box-shadow: 10px 10px 0 rgba(9,9,11,.55); }
  .swayger-home .visual-label { position: absolute; left: 18px; bottom: 16px; color: #a5a6b0; font-size: 9px; letter-spacing: .15em; text-transform: uppercase; }
  .swayger-home .final { padding: 116px 0 121px; text-align: center; position: relative; }
  .swayger-home .final:before { content: ""; position: absolute; z-index: -1; width: 740px; height: 420px; left: 50%; top: 5%; transform: translateX(-50%); background: radial-gradient(ellipse, rgba(67,97,238,.17), transparent 70%); }
  .swayger-home .final .section-kicker { justify-content: center; display: flex; }
  .swayger-home .final h2 { max-width: 760px; margin: 17px auto 25px; font-size: clamp(58px, 8vw, 98px); }
  .swayger-home .final p { color: var(--muted); font-size: 15px; margin: 0 auto 28px; max-width: 430px; line-height: 1.65; }
  .swayger-home .footer { padding: 30px 0; border-top: 1px solid rgba(255,255,255,.1); }
  .swayger-home .footer-inner { display: flex; align-items: center; justify-content: space-between; gap: 22px; }
  .swayger-home .footer-brand { display: flex; align-items: center; gap: 10px; }
  .swayger-home .footer-brand span { font-size: 15px; letter-spacing: .07em; }
  .swayger-home .footer small { color: #777983; font-size: 10px; }
  .swayger-home .footer-links { display: flex; gap: 23px; flex-wrap: wrap; }
  .swayger-home .footer-links a { color: #a5a6b0; font-size: 11px; text-decoration: none; }
  .swayger-home .footer-links a:hover { color: var(--paper); }
  @keyframes swayger-rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
  @media (max-width: 850px) {
    .swayger-home .hero { min-height: auto; grid-template-columns: 1fr .82fr; gap: 28px; padding-block: 72px 98px; }
    .swayger-home h1 { font-size: clamp(64px, 11vw, 96px); }
    .swayger-home .receipt-frame { padding: 13px; }
    .swayger-home .art-stamp { width: 82px; height: 82px; right: -9px; }
    .swayger-home .mode-card { padding: 21px; min-height: 330px; }
    .swayger-home .community-grid { gap: 5vw; }
  }
  @media (max-width: 650px) {
    .swayger-home .wrap { width: min(100% - 36px, 520px); }
    .swayger-home .nav { min-height: 68px; gap: 10px 12px; padding-block: 8px; }
    .swayger-home .header-actions { gap: 10px; }
    .swayger-home .account-link { font-size: 13px; }
    .swayger-home .brand-word { font-size: 18px; }
    .swayger-home .brand { gap: 7px; }
    .swayger-home .nav-links { display: none; }
    .swayger-home .nav-cta { padding: 10px 8px; font-size: 10px; }
    .swayger-home .hero { display: flex; flex-direction: column; align-items: stretch; gap: 54px; padding-block: 59px 82px; }
    .swayger-home h1 { font-size: clamp(68px, 18vw, 96px); margin-top: 22px; }
    .swayger-home .hero-line { font-size: 16px; }
    .swayger-home .hero-actions { align-items: flex-start; flex-direction: column; gap: 17px; margin-top: 26px; }
    .swayger-home .button { min-height: 49px; }
    .swayger-home .hero-art { width: calc(100% - 15px); margin: 0 auto; }
    .swayger-home .receipt-frame { padding: 14px; }
    .swayger-home .receipt-preview > div { transform: scale(.85); transform-origin: top center; margin-bottom: -48px; }
    .swayger-home .scroll-mark { bottom: 19px; }
    .swayger-home .intro, .swayger-home .modes, .swayger-home .difference { padding-block: 69px; }
    .swayger-home .intro-grid, .swayger-home .difference-grid, .swayger-home .community-grid, .swayger-home .organizer-grid { grid-template-columns: 1fr; gap: 28px; }
    .swayger-home .intro h2 { font-size: 53px; margin-top: 18px; }
    .swayger-home .intro p { margin-top: 18px; font-size: 14px; }
    .swayger-home .process { padding: 70px 0 76px; }
    .swayger-home .process-head, .swayger-home .modes-heading { display: block; }
    .swayger-home .process h2 { font-size: 62px; }
    .swayger-home .process-intro, .swayger-home .modes-sub { margin-top: 19px; }
    .swayger-home .steps { grid-template-columns: 1fr; border-top: 0; }
    .swayger-home .steps li, .swayger-home .steps li + li { min-height: 0; padding: 14px 0; border-right: 0; border-top: 1px solid rgba(9,9,11,.2); display: grid; grid-template-columns: 34px 1fr; column-gap: 10px; }
    .swayger-home .steps h3 { margin: 0 0 4px; font-size: 29px; }
    .swayger-home .steps p { grid-column: 2; max-width: none; }
    .swayger-home .modes h2, .swayger-home .community h2, .swayger-home .organizers h2 { font-size: 59px; }
    .swayger-home .mode-list { grid-template-columns: 1fr; gap: 10px; }
    .swayger-home .mode-card { min-height: 292px; padding: 24px; }
    .swayger-home .community { padding: 72px 0; }
    .swayger-home .community-copy { font-size: 14px; }
    .swayger-home .community-board { margin: 8px 8px 0; }
    .swayger-home .difference h2 { font-size: 55px; }
    .swayger-home .difference-copy { font-size: 14px; }
    .swayger-home .organizers { padding: 73px 0; }
    .swayger-home .organizer-visual { max-width: 290px; justify-self: center; margin-top: 12px; }
    .swayger-home .final { padding: 84px 0 89px; }
    .swayger-home .final h2 { font-size: 67px; }
    .swayger-home .footer-inner { align-items: flex-start; flex-direction: column; }
    .swayger-home .footer-links { gap: 18px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .swayger-home *, .swayger-home *:before, .swayger-home *:after {
      animation-duration: .01ms !important; animation-iteration-count: 1 !important;
      scroll-behavior: auto !important; transition-duration: .01ms !important;
    }
  }
`;

export default function PublicHomepage() {
  const { session } = useAuth();
  const accountLink = homepageAccountLink(!!session);
  return (
    <div className="swayger-home">
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
      <style>{styles}</style>
      <a className="skip" href="#main-content">Skip to content</a>
      <header className="topbar">
        <div className="wrap nav">
          <a className="brand" href="/" aria-label="Swayger home">
            <SwaygerMark color={C.text} size={27} />
            <span className="display brand-word">SWAYGER</span>
          </a>
          <nav className="nav-links" aria-label="Main navigation">
            <a href="#how-it-works">How it works</a>
            <a href="#community">For your group</a>
            <a href="#organizers">For organizers</a>
          </nav>
          <div className="header-actions">
            <a className="account-link medium" href={accountLink.href}>{accountLink.label}</a>
            <a className="nav-cta medium" href="/gameday">Play Swayger <span aria-hidden="true">↗</span></a>
          </div>
        </div>
      </header>

      <main id="main-content">
        <section className="wrap hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <div className="eyebrow">Your group chat, with a scoreboard</div>
            <h1 id="hero-title" className="display">Make sports talk <em>competitive.</em></h1>
            <p className="hero-line">Make your picks. Prove your takes. Keep the receipts.</p>
            <p className="hero-line" style={{ marginTop: 16, fontSize: 15, color: C.textSecondary }}>Turn the sports conversations your group already has into friendly prediction competitions.</p>
            <div className="hero-actions">
              <a className="button button-primary" href="/gameday">Play Swayger <span aria-hidden="true">↗</span></a>
              <a className="button button-outline" href="#community">Bring Swayger to Your Group</a>
              <a className="text-link" href="/how-it-works">See How It Works</a>
            </div>
          </div>
          <div className="hero-art">
            <div className="art-stamp" aria-hidden="true"><span>Talk<br />is cheap.<br />Receipts<br />aren't.</span></div>
            <div className="receipt-frame">
              <div className="receipt-caption"><span>Illustrative component preview</span><span>Example data</span></div>
              <div className="receipt-preview" aria-hidden="true">
                <GameDayReceiptCard
                  roomName="Sunday picks with the crew"
                  teamA="Ravens"
                  teamB="Bills"
                  gameDate="2025-10-12"
                  scoringMode="most_correct"
                  leaderboard={exampleStandings}
                />
              </div>
              <p className="preview-note">A sample of the standings and shareable receipt. Names and scores are examples.</p>
            </div>
          </div>
          <div className="scroll-mark" aria-hidden="true">The friendly competition starts here</div>
        </section>

        <section className="intro" aria-labelledby="intro-title">
          <div className="wrap intro-grid">
            <div className="section-kicker">Sports are better together</div>
            <div>
              <h2 id="intro-title" className="display">The competitive prediction layer for sports communities.</h2>
              <p>Turn the predictions your crew already makes into a friendly competition. Picks lock before the action, standings show how everyone did, and the receipts give the group something to talk about after.</p>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="process" aria-labelledby="process-title">
          <div className="wrap">
            <div className="process-head">
              <div>
                <div className="section-kicker">A take with a timestamp</div>
                <h2 id="process-title" className="display">Call it.<br />Lock it.</h2>
              </div>
              <p className="process-intro">No long setup. Just your call, the group, and a result everyone can see.</p>
            </div>
            <ol className="steps">
              <li><span className="step-num">01</span><div><h3 className="display">Pick</h3><p>Make the call on the game or matchup.</p></div></li>
              <li><span className="step-num">02</span><div><h3 className="display">Lock</h3><p>Your picks lock at the posted deadline.</p></div></li>
              <li><span className="step-num">03</span><div><h3 className="display">Compete</h3><p>See how your takes stack up with the group.</p></div></li>
              <li><span className="step-num">04</span><div><h3 className="display">Settle</h3><p>Results are scored against the competition's rules.</p></div></li>
              <li><span className="step-num">05</span><div><h3 className="display">Share</h3><p>Pass around the standings and keep the debate going.</p></div></li>
            </ol>
          </div>
        </section>

        <section className="modes" aria-labelledby="modes-title">
          <div className="wrap">
            <div className="modes-heading">
              <div>
                <div className="section-kicker">Pick your kind of competition</div>
                <h2 id="modes-title" className="display">One crew.<br />Three ways in.</h2>
              </div>
              <p className="modes-sub">Bring your Sunday crew, fantasy league, or one friend. Pick the format that fits.</p>
            </div>
            <div className="mode-list">
              <article className="mode-card">
                <div><div className="mode-index">01 / GAME DAY</div><div className="mode-icon" aria-hidden="true">G</div></div>
                <div><h3 className="display">Game Day</h3><p>Make picks together around a game or slate. Great for an NFL Sunday, a Madden league, or your watch-party chat.</p><a className="mode-link" href="/gameday">Play Game Day <span aria-hidden="true">→</span></a></div>
              </article>
              <article className="mode-card">
                <div><div className="mode-index">02 / FANTASY</div><div className="mode-icon" aria-hidden="true">F</div></div>
                <div><h3 className="display">Fantasy</h3><p>Give draft day and each week a little more friendly competition. Bring your league together around the picks.</p><a className="mode-link" href="/fantasy/setup">Set up Fantasy <span aria-hidden="true">→</span></a></div>
              </article>
              <article className="mode-card">
                <div><div className="mode-index">03 / HEAD TO HEAD</div><div className="mode-icon" aria-hidden="true">1:1</div></div>
                <div><h3 className="display">1v1</h3><p>Challenge one friend and put your predictions side by side. Every call gets a clear moment to prove itself.</p><a className="mode-link" href="/auth">Start a 1v1 <span aria-hidden="true">→</span></a></div>
              </article>
            </div>
          </div>
        </section>

        <section id="community" className="community" aria-labelledby="community-title">
          <div className="wrap community-grid">
            <div>
              <div className="section-kicker">Made for the people you watch with</div>
              <h2 id="community-title" className="display">Already have the group? Bring Swayger to it.</h2>
              <p className="community-copy">Keep the community you already have. Swayger gives your group a place to make picks, see the standings, and share the proof—whether the conversation lives on Discord or in the stands.</p>
              <a className="button button-primary" href="/gameday">Start with Game Day <span aria-hidden="true">↗</span></a>
            </div>
            <div className="community-board" aria-label="Communities that can compete">
              <div className="board-top"><span>Your people. Your competition.</span></div>
              <div className="board-row"><span className="board-name">Group chats &amp; watch parties</span></div>
              <div className="board-row"><span className="board-name">Fantasy &amp; Madden leagues</span></div>
              <div className="board-row"><span className="board-name">Discord &amp; in-venue communities</span></div>
            </div>
          </div>
        </section>

        <section className="difference" aria-labelledby="difference-title">
          <div className="wrap difference-grid">
            <div>
              <div className="section-kicker">The Swayger difference</div>
              <h2 id="difference-title" className="display">Good banter.<br />Better receipts.</h2>
            </div>
            <div>
              <p className="difference-copy">The best sports takes happen among friends. Swayger makes them easy to call, fair to compare, and fun to revisit—without getting in the way of the game.</p>
              <div className="difference-list">
                <div className="difference-row"><b>01</b><p><strong>Everyone gets a fair shot.</strong> Picks lock at the deadline, so the call is on record before the result.</p></div>
                <div className="difference-row"><b>02</b><p><strong>See the whole picture.</strong> Standings and scoring make it clear how the group did.</p></div>
                <div className="difference-row"><b>03</b><p><strong>Make the moment shareable.</strong> Receipts bring the result back to the group chat.</p></div>
              </div>
            </div>
          </div>
        </section>

        <section id="organizers" className="organizers" aria-labelledby="organizers-title">
          <div className="wrap organizer-grid">
            <div>
              <div className="section-kicker">For the friend who gets it going</div>
              <h2 id="organizers-title" className="display">Run the competition. Let Swayger handle the rest.</h2>
              <p>Set up the format, invite your people, and make the rules clear from the start. Swayger keeps picks and standings together so you can get back to watching.</p>
              <p>Hosts and commissioners stay in control of setup and result confirmation.</p>
              <ul className="organizer-checks">
                <li>Choose a format that fits your group.</li>
                <li>Share the competition with the people you want in.</li>
                <li>Review results and standings when the action is done.</li>
              </ul>
              <a className="button button-outline" href="/fantasy/setup">Get started with Fantasy</a>
            </div>
            <div className="organizer-visual" aria-hidden="true">
              <div className="visual-mark"><SwaygerMark color={C.text} size={45} /></div>
              <span className="visual-label">A better way to call it</span>
            </div>
          </div>
        </section>

        <section className="final" aria-labelledby="final-title">
          <div className="wrap">
            <div className="section-kicker">Your group has a take</div>
            <h2 id="final-title" className="display">Now put it on the board.</h2>
            <p>Make the next game a little more interesting with the people who already know your calls.</p>
            <a className="button button-primary" href="/gameday">Play Swayger <span aria-hidden="true">↗</span></a>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap footer-inner">
          <div>
            <div className="footer-brand"><SwaygerMark color={C.textSecondary} size={20} /><span className="display">SWAYGER</span></div>
            <small>Make sports talk competitive.</small>
          </div>
          <nav className="footer-links" aria-label="Footer navigation">
            <a href="/how-it-works">How it works</a>
            <a href="/privacy">Privacy</a>
            <a href="/auth">Sign in</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
