import React, { useEffect, useMemo, useRef, useState } from "react";
import Colors from "@/constants/colors";
import SwaygerMark from "@/components/SwaygerMark";
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

const C = Colors.dark;
type Intent = "play" | "organize";

const styles = `
  body:has(.swayger-home) #swayger-privacy-footer { display:none; }
  .swayger-home {
    --night:#101a3a; --night-deep:#0b1430; --panel:#17234a; --panel-hi:#202f5e;
    --paper:#f5f6fb; --muted:#bdc7e1; --quiet:#91a0c8; --rule:rgba(229,235,255,.15);
    --blue:${C.tint}; --blue-light:#aebaff; --lime:${C.text};
    color:var(--paper); background:var(--night); font-family:"DMSans_400Regular","DM Sans",sans-serif;
    min-height:100dvh; height:100dvh; overflow-x:hidden; overflow-y:auto; position:relative; isolation:isolate;
  }
  .swayger-home,.swayger-home * { box-sizing:border-box; }
  .swayger-home a { color:inherit; }
  .swayger-home a:focus-visible,.swayger-home button:focus-visible { outline:3px solid var(--lime); outline-offset:4px; }
  .swayger-home .display { font-family:"BarlowCondensed_800ExtraBold","Barlow Condensed",sans-serif; font-weight:800; }
  .swayger-home .medium { font-family:"DMSans_500Medium","DM Sans",sans-serif; }
  .swayger-home .wrap { width:min(1180px,calc(100% - 56px)); margin-inline:auto; }
  .swayger-home .skip { position:absolute; z-index:20; top:10px; left:10px; padding:12px 16px; color:var(--night); background:var(--lime); transform:translateY(-160%); transition:transform .2s; }
  .swayger-home .skip:focus { transform:translateY(0); }
  .swayger-home .topbar { position:relative; z-index:3; border-bottom:1px solid var(--rule); background:rgba(11,20,48,.7); }
  .swayger-home .nav { min-height:78px; display:flex; align-items:center; justify-content:space-between; gap:24px; }
  .swayger-home .brand { display:inline-flex; align-items:center; gap:11px; text-decoration:none; }
  .swayger-home .brand-word { font-size:23px; letter-spacing:.08em; line-height:1; }
  .swayger-home .nav-links { display:flex; gap:clamp(18px,3vw,38px); align-items:center; }
  .swayger-home .nav-links a { color:#c6cfea; text-decoration:none; font-size:13px; }
  .swayger-home .nav-links a:hover,.swayger-home .account-link:hover { color:var(--lime); }
  .swayger-home .header-actions { display:flex; align-items:center; gap:19px; flex-shrink:0; }
  .swayger-home .account-link { display:inline-flex; align-items:center; min-height:44px; font-size:13px; text-underline-offset:4px; }
  .swayger-home .nav-cta { min-height:44px; padding:0 16px; border:0; background:var(--blue); color:var(--paper); cursor:pointer; font-size:11px; letter-spacing:.1em; text-transform:uppercase; font-family:"DMSans_500Medium","DM Sans",sans-serif; }
  .swayger-home .nav-cta:hover,.swayger-home .button-primary:hover { background:${C.tintLight}; transform:translateY(-2px); }
  .swayger-home .hero { min-height:650px; position:relative; display:grid; grid-template-columns:1.08fr .92fr; gap:7vw; align-items:center; padding-block:80px 94px; }
  .swayger-home .hero:before { content:""; position:absolute; z-index:-1; width:760px; height:760px; right:-10%; top:-24%; border-radius:50%; background:radial-gradient(circle,rgba(73,105,244,.32),rgba(73,105,244,0) 69%); pointer-events:none; }
  .swayger-home .hero-copy { animation:swayger-rise .65s both; }
  .swayger-home .eyebrow,.swayger-home .section-kicker { color:var(--blue-light); text-transform:uppercase; font-size:10px; letter-spacing:.19em; font-family:"DMSans_500Medium","DM Sans",sans-serif; }
  .swayger-home .eyebrow { display:flex; align-items:center; gap:11px; }
  .swayger-home .eyebrow:before { content:""; width:30px; height:2px; background:var(--lime); }
  .swayger-home h1 { max-width:720px; margin:27px 0 22px; font-size:clamp(66px,9vw,122px); line-height:.84; letter-spacing:-.03em; text-transform:uppercase; }
  .swayger-home h1 em { color:var(--lime); font-style:normal; }
  .swayger-home .hero-line { max-width:480px; margin:0; color:#e1e6f5; font-size:clamp(17px,1.65vw,20px); line-height:1.55; }
  .swayger-home .hero-actions { display:flex; align-items:center; flex-wrap:wrap; gap:13px; margin-top:34px; }
  .swayger-home .button { min-height:52px; display:inline-flex; align-items:center; justify-content:center; gap:12px; padding:0 20px; text-decoration:none; text-transform:uppercase; letter-spacing:.08em; font-size:11px; font-family:"DMSans_500Medium","DM Sans",sans-serif; transition:transform .18s,background .18s,border-color .18s; }
  .swayger-home button.button { border:0; cursor:pointer; font:inherit; font-family:"DMSans_500Medium","DM Sans",sans-serif; }
  .swayger-home .button:hover { transform:translateY(-2px); }
  .swayger-home .button-primary { color:var(--paper); background:var(--blue); }
   .swayger-home .button-outline { color:var(--paper); background:transparent; border:1px solid rgba(255,255,255,.55); }
   .swayger-home button.button.button-outline { border:1px solid rgba(255,255,255,.55); }
  .swayger-home .button-outline:hover { border-color:var(--lime); }
  .swayger-home .text-link { color:#c7d0ff; text-decoration-thickness:1px; text-underline-offset:5px; font-size:12px; }
  .swayger-home .hero-art { min-width:0; position:relative; animation:swayger-rise .8s .1s both; }
  .swayger-home .proof-art { min-height:364px; padding:26px; position:relative; overflow:hidden; border:1px solid rgba(217,226,255,.28); background:linear-gradient(145deg,rgba(31,48,102,.95),rgba(17,27,62,.96)); box-shadow:18px 18px 0 rgba(73,105,244,.2); }
  .swayger-home .proof-art:before { content:""; position:absolute; width:330px; height:330px; border:1px solid rgba(195,208,255,.2); border-radius:50%; right:-116px; top:-148px; box-shadow:0 0 0 32px rgba(195,208,255,.04),0 0 0 66px rgba(195,208,255,.025); }
  .swayger-home .proof-art-top { position:relative; display:flex; justify-content:space-between; gap:16px; padding-bottom:15px; border-bottom:1px solid var(--rule); color:#c5d0f3; font-size:9px; letter-spacing:.15em; text-transform:uppercase; }
  .swayger-home .proof-mark { position:relative; display:grid; place-items:center; height:205px; margin:17px 0; border:1px dashed rgba(207,218,255,.38); background:rgba(9,18,47,.34); }
  .swayger-home .proof-mark:before,.swayger-home .proof-mark:after { content:""; position:absolute; border:1px solid rgba(169,187,255,.2); border-radius:50%; }
  .swayger-home .proof-mark:before { width:155px; height:155px; }
  .swayger-home .proof-mark:after { width:105px; height:105px; border-color:rgba(174,186,255,.46); }
  .swayger-home .proof-mark-inner { position:relative; z-index:1; width:56px; height:56px; display:grid; place-items:center; background:var(--blue); }
  .swayger-home .proof-art-caption { position:relative; max-width:310px; color:#e4e9f9; font-size:14px; line-height:1.45; }
  .swayger-home .proof-art-caption strong { display:block; color:var(--lime); font-size:15px; font-weight:500; }
  .swayger-home .proof-art-note { margin:9px 0 0; position:relative; color:#b9c4e4; font-size:10px; }
  .swayger-home .hero-index { position:absolute; right:0; bottom:30px; display:flex; align-items:center; gap:12px; color:#9aa8cf; font-size:9px; letter-spacing:.17em; text-transform:uppercase; }
  .swayger-home .hero-index:before { content:""; width:34px; height:1px; background:var(--lime); }
  .swayger-home .modes { padding:88px 0 96px; background:#f0f2fa; color:#101a3a; }
  .swayger-home .modes-heading { display:flex; justify-content:space-between; align-items:end; gap:25px; margin-bottom:34px; }
  .swayger-home .modes .section-kicker,.swayger-home .process .section-kicker { color:#3c59d6; }
  .swayger-home .modes h2,.swayger-home .community h2,.swayger-home .organizers h2,.swayger-home .final h2 { margin:13px 0 0; font-size:clamp(50px,6.7vw,82px); line-height:.86; letter-spacing:-.025em; text-transform:uppercase; }
  .swayger-home .modes-sub { max-width:290px; margin:0 0 4px; color:#4d5774; font-size:13px; line-height:1.65; }
  .swayger-home .mode-list { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
   .swayger-home .mode-card { min-height:280px; position:relative; overflow:hidden; display:flex; flex-direction:column; justify-content:space-between; padding:25px; color:#f5f6fb; text-decoration:none; background:#152248; transition:transform .2s,border-color .2s,background .2s; border:1px solid rgba(174,186,255,.24); border-top:3px solid #aebaff; }
   .swayger-home .mode-card:nth-child(2) { background:#20366f; border-color:rgba(214,222,255,.35); border-top-color:#f5f6fb; }
   .swayger-home .mode-card:nth-child(3) { background:#182d58; border-color:rgba(67,97,238,.6); border-top-color:#4361ee; }
  .swayger-home .mode-card:hover { transform:translateY(-5px); background:#263d82; }
  .swayger-home .mode-card:after { content:""; position:absolute; width:230px; height:230px; right:-120px; top:-120px; border:1px solid rgba(233,238,255,.18); border-radius:50%; box-shadow:0 0 0 26px rgba(233,238,255,.04),0 0 0 52px rgba(233,238,255,.025); }
  .swayger-home .mode-index { color:#c0cafa; font-size:9px; letter-spacing:.16em; }
  .swayger-home .mode-glyph { width:44px; height:44px; display:grid; place-items:center; margin-top:29px; border:1px solid rgba(174,186,255,.7); color:var(--lime); font-size:14px; letter-spacing:.04em; }
   .swayger-home .mode-card:nth-child(2) .mode-glyph { background:rgba(245,246,251,.12); border-color:rgba(245,246,251,.72); }
   .swayger-home .mode-card:nth-child(3) .mode-glyph { border-style:dashed; border-color:#8298ff; }
  .swayger-home .mode-card h3 { max-width:270px; min-height:84px; margin:20px 0 11px; font-size:clamp(34px,4vw,47px); line-height:.88; text-transform:uppercase; }
  .swayger-home .mode-card p { max-width:290px; min-height:78px; margin:0; color:#d2daf1; font-size:12px; line-height:1.6; }
  .swayger-home .mode-link { display:inline-flex; align-items:center; gap:10px; width:fit-content; margin-top:19px; color:var(--lime); font-size:10px; letter-spacing:.13em; text-transform:uppercase; }
  .swayger-home .mode-link span { font-size:17px; transition:transform .2s; }
  .swayger-home .mode-card:hover .mode-link span { transform:translateX(4px); }
  .swayger-home .process { padding:82px 0 88px; background:#d9e1fa; color:#101a3a; }
  .swayger-home .process-head { display:flex; align-items:end; justify-content:space-between; gap:25px; margin-bottom:34px; }
  .swayger-home .process h2 { margin:12px 0 0; font-size:clamp(48px,6.5vw,78px); line-height:.85; text-transform:uppercase; }
  .swayger-home .process-intro { max-width:320px; margin:0 0 2px; color:#4c587d; font-size:13px; line-height:1.6; }
  .swayger-home .steps { display:grid; grid-template-columns:repeat(5,1fr); list-style:none; padding:0; margin:0; border-top:1px solid rgba(16,26,58,.26); }
  .swayger-home .steps li { min-height:144px; padding:17px 14px 0 0; border-right:1px solid rgba(16,26,58,.2); }
  .swayger-home .steps li+li { padding-left:15px; }
  .swayger-home .steps li:last-child { border:0; }
  .swayger-home .step-num { color:#3c59d6; font-size:10px; letter-spacing:.12em; }
  .swayger-home .steps h3 { margin:25px 0 7px; font-size:clamp(23px,2.7vw,33px); line-height:.9; text-transform:uppercase; }
  .swayger-home .steps p { max-width:170px; margin:0; color:#4c5876; font-size:11px; line-height:1.55; }
  .swayger-home .community { position:relative; overflow:hidden; padding:92px 0 98px; background:#324fc4; }
  .swayger-home .community:before { content:""; position:absolute; width:680px; height:680px; right:-200px; top:-315px; border:1px solid rgba(255,255,255,.22); border-radius:50%; box-shadow:0 0 0 38px rgba(255,255,255,.04),0 0 0 78px rgba(255,255,255,.03),0 0 0 118px rgba(255,255,255,.02); }
  .swayger-home .community-grid { position:relative; z-index:1; display:grid; grid-template-columns:1fr .83fr; align-items:center; gap:8vw; }
  .swayger-home .community .section-kicker { color:#d6deff; }
  .swayger-home .community h2 { max-width:680px; }
  .swayger-home .community-copy { max-width:460px; margin:22px 0 26px; color:#e1e6ff; font-size:14px; line-height:1.7; }
  .swayger-home .community-art { min-height:290px; position:relative; display:flex; flex-direction:column; justify-content:space-between; padding:23px; border:1px solid rgba(255,255,255,.36); background:linear-gradient(140deg,rgba(11,20,48,.38),rgba(11,20,48,.78)); transform:rotate(1.5deg); }
  .swayger-home .community-art:before { content:""; position:absolute; inset:14px; border:1px solid rgba(255,255,255,.13); pointer-events:none; }
  .swayger-home .community-art-top { display:flex; justify-content:space-between; gap:10px; color:#d6deff; font-size:9px; letter-spacing:.15em; text-transform:uppercase; }
  .swayger-home .community-art-mark { position:relative; display:flex; align-items:center; gap:13px; color:#fff; font-size:clamp(23px,3vw,35px); line-height:.9; text-transform:uppercase; }
  .swayger-home .community-art-mark span { color:var(--lime); }
  .swayger-home .community-art-foot { position:relative; max-width:260px; color:#d3dcff; font-size:11px; line-height:1.55; }
  .swayger-home .organizers { padding:91px 0 96px; background:#111d40; border-block:1px solid var(--rule); }
  .swayger-home .organizer-grid { display:grid; grid-template-columns:1fr .72fr; gap:9vw; align-items:center; }
  .swayger-home .organizers h2 { max-width:670px; }
  .swayger-home .organizers p { max-width:490px; margin:20px 0 24px; color:var(--muted); font-size:14px; line-height:1.7; }
  .swayger-home .organizer-visual { position:relative; display:grid; place-items:center; width:100%; max-width:335px; aspect-ratio:1; justify-self:end; border:1px solid rgba(255,255,255,.2); background:repeating-linear-gradient(0deg,transparent 0 35px,rgba(255,255,255,.055) 36px 37px),repeating-linear-gradient(90deg,transparent 0 35px,rgba(255,255,255,.055) 36px 37px),#172650; }
  .swayger-home .organizer-visual:before,.swayger-home .organizer-visual:after { content:""; position:absolute; border:1px solid rgba(174,186,255,.52); border-radius:50%; }
  .swayger-home .organizer-visual:before { width:72%; aspect-ratio:1; }
  .swayger-home .organizer-visual:after { width:44%; aspect-ratio:1; border-color:rgba(174,186,255,.6); }
  .swayger-home .visual-mark { position:relative; z-index:1; width:78px; height:78px; display:grid; place-items:center; background:var(--blue); box-shadow:9px 9px 0 rgba(5,10,28,.6); }
  .swayger-home .visual-label { position:absolute; left:18px; bottom:15px; color:#b7c3e7; font-size:9px; letter-spacing:.14em; text-transform:uppercase; }
  .swayger-home .final { padding:104px 0 112px; text-align:center; position:relative; }
  .swayger-home .final:before { content:""; position:absolute; z-index:-1; width:760px; height:430px; left:50%; top:0; transform:translateX(-50%); background:radial-gradient(ellipse,rgba(73,105,244,.25),transparent 70%); }
  .swayger-home .final .section-kicker { display:flex; justify-content:center; }
  .swayger-home .final h2 { max-width:760px; margin:17px auto 22px; font-size:clamp(54px,7.6vw,92px); }
  .swayger-home .final p { max-width:430px; margin:0 auto 27px; color:var(--muted); font-size:14px; line-height:1.65; }
  .swayger-home .footer { padding:28px 0; border-top:1px solid var(--rule); }
  .swayger-home .footer-inner { display:flex; align-items:center; justify-content:space-between; gap:22px; }
  .swayger-home .footer-brand { display:flex; align-items:center; gap:10px; }
  .swayger-home .footer-brand span { font-size:14px; letter-spacing:.08em; }
  .swayger-home .footer small { color:#9aa8cd; font-size:10px; }
  .swayger-home .footer-links { display:flex; gap:23px; flex-wrap:wrap; }
  .swayger-home .footer-links a { color:#b4c0df; font-size:11px; text-decoration:none; }
  .swayger-home .footer-links a:hover { color:var(--lime); }
  .swayger-home .experience-dialog { width:min(760px,calc(100% - 28px)); max-width:760px; max-height:min(88dvh,760px); padding:0; overflow:auto; border:1px solid rgba(255,255,255,.25); color:var(--paper); background:#111d40; box-shadow:0 28px 90px rgba(0,0,0,.55); }
  .swayger-home .experience-dialog::backdrop { background:rgba(5,9,25,.82); backdrop-filter:blur(5px); }
  .swayger-home .experience-dialog-inner { padding:clamp(22px,4vw,38px); }
   .swayger-home .experience-dialog-head { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; min-width:0; }
   .swayger-home .experience-dialog-head > div { min-width:0; flex:1 1 auto; }
   .swayger-home .experience-dialog h2 { max-width:580px; min-width:0; margin:12px 0 10px; font-size:clamp(38px,6vw,62px); line-height:.9; overflow-wrap:anywhere; text-transform:uppercase; }
  .swayger-home .experience-intro { max-width:610px; margin:0; color:#cbd4ee; font-size:13px; line-height:1.65; }
  .swayger-home .experience-close { flex:0 0 auto; width:44px; height:44px; border:1px solid rgba(255,255,255,.35); background:transparent; color:var(--paper); font-size:24px; cursor:pointer; }
  .swayger-home .experience-close:hover { background:rgba(255,255,255,.1); }
  .swayger-home .experience-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin-top:24px; }
  .swayger-home .experience-option { min-width:0; min-height:185px; display:flex; flex-direction:column; align-items:flex-start; padding:17px; border:1px solid rgba(255,255,255,.17); background:#192951; }
  .swayger-home .experience-option h3 { margin:0 0 9px; font-size:25px; line-height:.95; text-transform:uppercase; }
  .swayger-home .experience-option p { flex:1; margin:0; color:#c3cde8; font-size:11px; line-height:1.6; }
  .swayger-home .experience-option a { display:inline-flex; align-items:center; min-height:44px; margin-top:13px; color:var(--lime); font-size:10px; letter-spacing:.08em; text-decoration:underline; text-underline-offset:4px; text-transform:uppercase; }
  .swayger-home .experience-option a:hover { color:#fff; }
  .swayger-home .play-link:hover { background:${C.tintLight}; }
  .swayger-home .experience-disclosure { margin:18px 0 0; padding-top:15px; border-top:1px solid var(--rule); color:#cbd4ee; font-size:11px; line-height:1.65; }
  .swayger-home .experience-disclosure strong { color:#fff; }
  .swayger-home .experience-error { margin:14px 0 0; padding:12px 14px; border-left:3px solid var(--lime); color:#fff; background:rgba(7,13,34,.5); font-size:12px; line-height:1.55; }
  .swayger-home .play-action { margin-top:24px; }
  .swayger-home .play-link { display:inline-flex; align-items:center; justify-content:center; min-height:52px; padding:0 20px; color:var(--paper); background:var(--blue); text-decoration:none; text-transform:uppercase; font-size:11px; letter-spacing:.08em; font-family:"DMSans_500Medium","DM Sans",sans-serif; }
  .swayger-home .invite-note { margin:20px 0 0; padding-top:17px; border-top:1px solid var(--rule); color:#cbd4ee; font-size:12px; line-height:1.65; }
  @keyframes swayger-rise { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
  @media(max-width:850px) {
    .swayger-home .hero { min-height:580px; grid-template-columns:1fr .82fr; gap:30px; }
    .swayger-home h1 { font-size:clamp(62px,10vw,94px); }
    .swayger-home .proof-art { padding:19px; }
    .swayger-home .community-grid { gap:5vw; }
  }
  @media(max-width:680px) {
    .swayger-home .wrap { width:min(100% - 36px,540px); }
    .swayger-home .nav { min-height:68px; gap:10px; }
    .swayger-home .brand { gap:7px; }
    .swayger-home .brand-word { font-size:18px; }
    .swayger-home .nav-links { display:none; }
    .swayger-home .header-actions { gap:10px; }
    .swayger-home .account-link { font-size:12px; }
    .swayger-home .nav-cta { min-height:44px; padding-inline:11px; font-size:9px; }
     .swayger-home .hero { display:flex; flex-direction:column; align-items:stretch; gap:36px; min-height:0; padding-block:52px 64px; }
    .swayger-home h1 { font-size:clamp(63px,17.6vw,94px); margin:23px 0 18px; }
    .swayger-home .hero-line { font-size:16px; }
    .swayger-home .hero-actions { align-items:flex-start; flex-direction:column; gap:13px; margin-top:26px; }
    .swayger-home .hero-art { width:calc(100% - 10px); margin-inline:auto; }
    .swayger-home .proof-art { min-height:320px; }
    .swayger-home .hero-index { bottom:20px; }
     .swayger-home .modes,.swayger-home .process,.swayger-home .community,.swayger-home .organizers { padding-block:58px; }
    .swayger-home .modes-heading,.swayger-home .process-head { display:block; }
     .swayger-home .modes h2,.swayger-home .community h2,.swayger-home .organizers h2 { font-size:clamp(43px,12.5vw,60px); }
     .swayger-home .process h2 { font-size:clamp(42px,12vw,58px); }
     .swayger-home .modes-sub,.swayger-home .process-intro { margin-top:15px; }
    .swayger-home .mode-list { grid-template-columns:1fr; gap:9px; }
    .swayger-home .mode-card { min-height:235px; padding:22px; }
    .swayger-home .mode-card h3 { font-size:39px; }
    .swayger-home .steps { grid-template-columns:1fr; border-top:0; }
    .swayger-home .steps li,.swayger-home .steps li+li { min-height:0; display:grid; grid-template-columns:32px 1fr; column-gap:10px; padding:14px 0; border-right:0; border-top:1px solid rgba(16,26,58,.22); }
    .swayger-home .steps h3 { margin:0 0 4px; font-size:28px; }
    .swayger-home .steps p { grid-column:2; max-width:none; }
    .swayger-home .community-grid,.swayger-home .organizer-grid { grid-template-columns:1fr; gap:30px; }
    .swayger-home .community-art { min-height:240px; margin-inline:5px; }
    .swayger-home .organizer-visual { max-width:270px; justify-self:center; }
     .swayger-home .final { padding:68px 0 74px; }
     .swayger-home .final h2 { font-size:clamp(46px,12.5vw,64px); }
    .swayger-home .footer-inner { align-items:flex-start; flex-direction:column; }
    .swayger-home .footer-links { gap:18px; }
    .swayger-home .experience-grid { grid-template-columns:1fr; gap:8px; }
    .swayger-home .experience-option { min-height:0; padding:15px; }
    .swayger-home .experience-option p { max-width:none; }
    .swayger-home .experience-option a { margin-top:8px; }
     .swayger-home .experience-dialog-inner { padding:18px 16px; }
     .swayger-home .experience-dialog-head { gap:10px; }
     .swayger-home .experience-dialog h2 { font-size:clamp(34px,10.5vw,48px); }
  }
  @media(max-width:360px) {
    .swayger-home .wrap { width:calc(100% - 30px); }
    .swayger-home .brand-word { font-size:16px; }
    .swayger-home .header-actions { gap:7px; }
    .swayger-home .nav-cta { padding-inline:8px; }
     .swayger-home h1 { font-size:54px; }
    .swayger-home .mode-card { padding:19px; }
    .swayger-home .community-art { padding:18px; }
     .swayger-home .experience-dialog-inner { padding:16px 14px; }
     .swayger-home .experience-dialog-head { gap:8px; }
     .swayger-home .experience-dialog h2 { font-size:34px; }
  }
  @media(prefers-reduced-motion:reduce) {
    .swayger-home *, .swayger-home *:before, .swayger-home *:after { animation-duration:.01ms!important; animation-iteration-count:1!important; scroll-behavior:auto!important; transition-duration:.01ms!important; }
  }
`;

export default function PublicHomepage() {
  const { session } = useAuth();
  const accountLink = homepageAccountLink(!!session);
  const experienceChoices = useMemo(
    () => homepageExperienceChoices(!!session, "organize"),
    [session],
  );
  const [choiceIntent, setChoiceIntent] = useState<Intent>("play");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [navigationError, setNavigationError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
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

  async function openChoices(intent: Intent, event: React.MouseEvent<HTMLButtonElement>) {
    activeTriggerRef.current = event.currentTarget;
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

  function closeChoices() {
    setDialogOpen(false);
    requestAnimationFrame(() => activeTriggerRef.current?.focus());
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

  const dialogTitle = choiceIntent === "organize" ? "Start your competition." : "Ready to compete?";

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
            <button className="nav-cta medium" type="button" onClick={(event) => openChoices("play", event)}>Play Swayger <span aria-hidden="true">↗</span></button>
          </div>
        </div>
      </header>

      <main id="main-content">
        <section className="wrap hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <div className="eyebrow">Your call. On the record.</div>
            <h1 id="hero-title" className="display">Make sports talk <em>competitive.</em></h1>
            <p className="hero-line">Make your picks. Prove your takes. Keep the receipts.</p>
            <div className="hero-actions">
              <button className="button button-primary" type="button" onClick={(event) => openChoices("play", event)}>Play Swayger <span aria-hidden="true">↗</span></button>
              <button className="button button-outline" type="button" onClick={(event) => openChoices("organize", event)}>Bring Swayger to Your Group</button>
              <a className="text-link" href="/how-it-works">See How It Works</a>
            </div>
          </div>
          <div className="hero-art" aria-label="Swayger proof preview awaiting approved capture">
            <div className="proof-art">
              <div className="proof-art-top"><span>Game Day / Final standings</span><span>Capture pending</span></div>
              <div className="proof-mark" aria-hidden="true">
                <div className="proof-mark-inner"><SwaygerMark color={C.text} size={32} /></div>
              </div>
              <div className="proof-art-caption">
                <strong>Approved Game Day capture awaiting upload</strong>
                No sample result shown.
              </div>
              <p className="proof-art-note">Real picks. A clear deadline. Results confirmed by the organizer.</p>
            </div>
          </div>
          <div className="hero-index" aria-hidden="true">The next call is yours</div>
        </section>

        <section className="modes" aria-labelledby="modes-title">
          <div className="wrap">
            <div className="modes-heading">
              <div>
                <div className="section-kicker">Three ways to call it</div>
                <h2 id="modes-title" className="display">Pick your<br />competition.</h2>
              </div>
              <p className="modes-sub">The competitive prediction layer for sports communities.</p>
            </div>
            <div className="mode-list">
              {experienceChoices.map((choice, index) => {
                const descriptions = [
                  "A game or slate with your crew. Hosting requires approved Game Day access; use a host’s invite to join.",
                  "Commissioners bring weekly predictions to a fantasy league. Members join through their league’s invite.",
                  "Create one prediction and invite a friend to take the other side. Confirm the result together.",
                ];
                const glyphs = ["GD", "F", "1:1"];
                return (
                  <a
                    className="mode-card"
                    href={choice.href}
                    key={choice.id}
                    onClick={(event) => handleChoice(event, choice.returnTo)}
                  >
                    <div>
                      <div className="mode-index">0{index + 1} / SWAYGER</div>
                      <div className="mode-glyph" aria-hidden="true">{glyphs[index]}</div>
                    </div>
                    <div>
                      <h3 className="display">{choice.title === "Game Day" ? "Swayger Game Day" : choice.title === "Fantasy" ? "Swayger Fantasy" : "1v1 Swaygers"}</h3>
                      <p>{descriptions[index]}</p>
                      <span className="mode-link">{choice.action}<span aria-hidden="true">→</span></span>
                    </div>
                  </a>
                );
              })}
            </div>
            {navigationError ? <p className="experience-error" role="alert">{navigationError}</p> : null}
          </div>
        </section>

        <section id="how-it-works" className="process" aria-labelledby="process-title">
          <div className="wrap">
            <div className="process-head">
              <div>
                <div className="section-kicker">The call, then the proof</div>
                <h2 id="process-title" className="display">Pick. Lock.<br />Compete.</h2>
              </div>
              <p className="process-intro">Make your call before the action. Your organizer confirms the result; the record keeps it straight.</p>
            </div>
            <ol className="steps">
              <li><span className="step-num">01</span><div><h3 className="display">Pick</h3><p>Call the game or matchup.</p></div></li>
              <li><span className="step-num">02</span><div><h3 className="display">Lock</h3><p>Your pick locks at the deadline.</p></div></li>
              <li><span className="step-num">03</span><div><h3 className="display">Compete</h3><p>See how your calls compare.</p></div></li>
              <li><span className="step-num">04</span><div><h3 className="display">Settle</h3><p>An organizer confirms results.</p></div></li>
              <li><span className="step-num">05</span><div><h3 className="display">Share</h3><p>Bring the proof back to the group.</p></div></li>
            </ol>
          </div>
        </section>

        <section id="community" className="community" aria-labelledby="community-title">
          <div className="wrap community-grid">
            <div>
              <div className="section-kicker">Your people. Their takes.</div>
              <h2 id="community-title" className="display">Already have the group? Bring Swayger to it.</h2>
              <p className="community-copy">Keep your community where it is. Swayger gives the picks a place to lock, the competition a shared record, and the postgame debate a reason to come back. Bring your Discord, watch party, league, or crew.</p>
              <button className="button button-primary" type="button" onClick={(event) => openChoices("organize", event)}>Choose a group format <span aria-hidden="true">↗</span></button>
            </div>
            <div className="community-art" aria-label="Swayger community illustration, not a Discord screenshot">
              <div className="community-art-top"><span>Group energy, documented</span><span>SWAYGER / COMMUNITY</span></div>
              <div className="community-art-mark"><SwaygerMark color={C.text} size={48} /><div>Make the<br /><span>call together.</span></div></div>
              <div className="community-art-foot">Approved Discord pick-card and leaderboard captures awaiting upload. No competition result shown.</div>
            </div>
          </div>
        </section>

        <section id="organizers" className="organizers" aria-labelledby="organizers-title">
          <div className="wrap organizer-grid">
            <div>
              <div className="section-kicker">For the friend who gets it going</div>
              <h2 id="organizers-title" className="display">Run the competition. Let Swayger handle the rest.</h2>
              <p>You choose the format, set the rules and deadline, invite your people, and manually confirm results. Swayger tracks picks, standings, and receipts.</p>
              <button className="button button-outline" type="button" onClick={(event) => openChoices("organize", event)}>Choose a group format</button>
            </div>
            <div className="organizer-visual" aria-hidden="true">
              <div className="visual-mark"><SwaygerMark color={C.text} size={45} /></div>
              <span className="visual-label">Your rules. Your people.</span>
            </div>
          </div>
        </section>

        <section className="final" aria-labelledby="final-title">
          <div className="wrap">
            <div className="section-kicker">Next game. New receipts.</div>
            <h2 id="final-title" className="display">Make your call count.</h2>
            <p>Bring your people in. Lock your pick before the game and let the record speak.</p>
            <button className="button button-primary" type="button" onClick={(event) => openChoices("play", event)}>Play Swayger <span aria-hidden="true">↗</span></button>
          </div>
        </section>
      </main>

      <dialog
        ref={dialogRef}
        className="experience-dialog"
        aria-labelledby="experience-dialog-title"
        aria-describedby="experience-dialog-intro"
        onCancel={(event) => { event.preventDefault(); closeChoices(); }}
        onClick={(event) => { if (event.target === dialogRef.current) closeChoices(); }}
      >
        <div className="experience-dialog-inner">
          <div className="experience-dialog-head">
            <div>
              <div className="section-kicker">{choiceIntent === "organize" ? "Start a room, league, or challenge" : "Join the competition"}</div>
              <h2 id="experience-dialog-title" className="display">{dialogTitle}</h2>
            </div>
            <button ref={closeButtonRef} type="button" className="experience-close" aria-label="Close dialog" onClick={closeChoices}><span aria-hidden="true">×</span></button>
          </div>
          {choiceIntent === "organize" ? (
            <>
              <p id="experience-dialog-intro" className="experience-intro">Choose the format that fits your group. You set it up, share its invite, and confirm results under your rules.</p>
              {navigationError ? <p className="experience-error" role="alert">{navigationError}</p> : null}
              <div className="experience-grid">
                {experienceChoices.map((choice) => (
                  <article className="experience-option" key={choice.id}>
                    <h3 className="display">
                      {choice.title === "Game Day" ? "Swayger Game Day" : choice.title === "Fantasy" ? "Swayger Fantasy" : "1v1 Swaygers"}
                    </h3>
                    <p>{choice.description}</p>
                    <a href={choice.href} onClick={(event) => handleChoice(event, choice.returnTo)}>{choice.action}<span aria-hidden="true"> →</span></a>
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
                <a className="play-link" href={session ? "/" : "/auth"} onClick={handlePlay}>{session ? "Continue to competition" : "Sign in to play"} <span aria-hidden="true">↗</span></a>
              </div>
              <p className="invite-note">Have an invite? Open your Game Day room link, Fantasy league link, or 1v1 challenge link directly. Existing guest and preview options are available there. No invite? Sign in to your dashboard to see competition available to your account.</p>
            </>
          )}
        </div>
      </dialog>

      <footer className="footer">
        <div className="wrap footer-inner">
          <div>
            <div className="footer-brand"><SwaygerMark color={C.textSecondary} size={20} /><span className="display">SWAYGER</span></div>
            <small>Make sports talk competitive.</small>
          </div>
          <nav className="footer-links" aria-label="Footer navigation">
            <a href="/how-it-works">How it works</a>
            <a href="/privacy">Privacy</a>
            <a href={accountLink.href}>{accountLink.label}</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
