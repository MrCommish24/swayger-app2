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
    --night:#0c1533; --night-deep:#081027; --panel:#14234a; --panel-hi:#1a2d5e;
    --paper:#f4f6fc; --muted:#c0cbea; --quiet:#91a2cb; --rule:rgba(224,232,255,.17);
    --blue:${C.tint}; --blue-light:#c1cbff; --lime:${C.text};
    color:var(--paper); background:var(--night); font-family:"DMSans_400Regular","DM Sans",sans-serif;
    width:100%; min-width:0; height:100dvh; min-height:100dvh; max-height:100dvh;
    overflow-x:hidden; overflow-y:auto; overscroll-behavior-y:contain;
    -webkit-overflow-scrolling:touch; position:relative; isolation:isolate;
  }
  .swayger-home,.swayger-home * { box-sizing:border-box; }
  .swayger-home a { color:inherit; }
  .swayger-home a:focus-visible,.swayger-home button:focus-visible { outline:3px solid var(--lime); outline-offset:4px; }
  .swayger-home .display { font-family:"BarlowCondensed_800ExtraBold","Barlow Condensed",sans-serif; font-weight:800; }
  .swayger-home .medium { font-family:"DMSans_500Medium","DM Sans",sans-serif; }
  .swayger-home .wrap { width:min(1260px,calc(100% - 64px)); margin-inline:auto; }
  .swayger-home .skip { position:absolute; z-index:20; top:10px; left:10px; padding:12px 16px; color:var(--night); background:var(--lime); transform:translateY(-160%); transition:transform .2s; }
  .swayger-home .skip:focus { transform:translateY(0); }
  .swayger-home .topbar { position:relative; z-index:3; border-bottom:1px solid var(--rule); background:rgba(8,16,39,.88); }
  .swayger-home .nav { min-height:76px; display:flex; align-items:center; justify-content:space-between; gap:24px; }
  .swayger-home .brand { display:inline-flex; align-items:center; gap:11px; text-decoration:none; }
  .swayger-home .brand-word { font-size:23px; letter-spacing:.08em; line-height:1; }
  .swayger-home .nav-links { display:flex; gap:clamp(18px,3vw,38px); align-items:center; }
  .swayger-home .nav-links a { color:#c6cfea; text-decoration:none; font-size:12px; transition:color .18s; }
  .swayger-home .nav-links a:hover,.swayger-home .account-link:hover { color:var(--lime); }
  .swayger-home .header-actions { display:flex; align-items:center; gap:19px; flex-shrink:0; }
  .swayger-home .account-link { display:inline-flex; align-items:center; min-height:44px; font-size:13px; text-underline-offset:4px; }
  .swayger-home .nav-cta { min-height:44px; padding:0 16px; border:0; background:var(--blue); color:var(--paper); cursor:pointer; font-size:11px; letter-spacing:.1em; text-transform:uppercase; font-family:"DMSans_500Medium","DM Sans",sans-serif; transition:transform .2s,background .2s; }
  .swayger-home .nav-cta:hover,.swayger-home .button-primary:hover { background:${C.tintLight}; transform:translateY(-2px); }
  .swayger-home .hero { min-height:680px; position:relative; display:grid; grid-template-columns:1fr  .82fr; gap:clamp(30px,6vw,92px); align-items:center; padding-block:74px 98px; }
  .swayger-home .hero:before { content:""; position:absolute; z-index:-1; width:min(760px,100%); height:760px; right:0; top:-17%; border-radius:50%; background:radial-gradient(circle,rgba(67,97,238,.26),rgba(67,97,238,0) 69%); pointer-events:none; }
  .swayger-home .hero-copy { animation:swayger-rise .65s both; }
  .swayger-home .eyebrow,.swayger-home .section-kicker { color:var(--blue-light); text-transform:uppercase; font-size:10px; letter-spacing:.19em; font-family:"DMSans_500Medium","DM Sans",sans-serif; }
  .swayger-home .eyebrow { display:flex; align-items:center; gap:11px; }
  .swayger-home .eyebrow:before { content:""; width:30px; height:2px; background:var(--lime); }
  .swayger-home h1 { max-width:690px; margin:25px 0 20px; font-size:clamp(68px,8.3vw,116px); line-height:.83; letter-spacing:-.025em; text-transform:uppercase; }
  .swayger-home h1 em { color:var(--lime); font-style:normal; }
  .swayger-home .hero-line { max-width:465px; margin:0; color:#e1e6f5; font-size:clamp(17px,1.6vw,20px); line-height:1.55; }
  .swayger-home .hero-actions { display:flex; align-items:center; flex-wrap:wrap; gap:12px; margin-top:31px; }
  .swayger-home .button { min-height:52px; display:inline-flex; align-items:center; justify-content:center; gap:12px; padding:0 20px; text-decoration:none; text-transform:uppercase; letter-spacing:.075em; font-size:10px; font-family:"DMSans_500Medium","DM Sans",sans-serif; transition:transform .2s,background .2s,border-color .2s,color .2s; }
  .swayger-home button.button { border:0; cursor:pointer; font:inherit; font-family:"DMSans_500Medium","DM Sans",sans-serif; }
  .swayger-home .button:hover { transform:translateY(-2px); }
  .swayger-home .button-primary { color:var(--paper); background:var(--blue); }
  .swayger-home .button-outline { color:var(--paper); background:transparent; border:1px solid rgba(255,255,255,.62); }
  .swayger-home button.button.button-outline { border:1px solid rgba(255,255,255,.62); }
  .swayger-home .button-outline:hover { border-color:var(--lime); }
  .swayger-home .text-link { color:#c7d0ff; text-decoration-thickness:1px; text-underline-offset:5px; font-size:12px; }
  .swayger-home .hero-art { min-width:0; position:relative; animation:swayger-rise .8s .1s both; }
  .swayger-home .proof-art { min-width:0; margin:0; padding:0; position:relative; overflow:hidden; border:1px solid rgba(217,226,255,.4); background:#101a3a; box-shadow:16px 18px 0 rgba(67,97,238,.3); }
  .swayger-home .proof-art img { display:block; width:100%; height:auto; }
  .swayger-home .proof-art-caption { padding:12px 15px 13px; color:#d5def5; font-size:11px; line-height:1.45; }
  .swayger-home .proof-art-caption strong { display:block; color:var(--lime); font-size:12px; font-weight:500; }
  .swayger-home .hero-index { position:absolute; right:0; bottom:27px; display:flex; align-items:center; gap:12px; color:#9aa8cf; font-size:9px; letter-spacing:.17em; text-transform:uppercase; }
  .swayger-home .hero-index:before { content:""; width:34px; height:1px; background:var(--lime); }
  .swayger-home .modes { padding:84px 0 92px; background:#f0f2fa; color:#101a3a; }
  .swayger-home .modes-heading { display:flex; justify-content:space-between; align-items:end; gap:25px; margin-bottom:30px; }
  .swayger-home .modes .section-kicker,.swayger-home .process .section-kicker { color:#3c59d6; }
  .swayger-home .modes h2,.swayger-home .community h2,.swayger-home .organizers h2,.swayger-home .final h2 { margin:13px 0 0; font-size:clamp(50px,6.5vw,80px); line-height:.86; letter-spacing:-.025em; text-transform:uppercase; }
  .swayger-home .modes-sub { max-width:290px; margin:0 0 4px; color:#4d5774; font-size:13px; line-height:1.65; }
  .swayger-home .mode-list { display:grid; grid-template-columns:minmax(0,1fr); gap:20px; }
  .swayger-home .experience-card { min-width:0; display:grid; grid-template-columns:minmax(0,.55fr) minmax(0,1fr); align-items:center; overflow:hidden; background:#152248; border:1px solid rgba(174,186,255,.24); border-top:3px solid #aebaff; transition:transform .22s,background .22s; }
  .swayger-home .experience-card:nth-child(2) { background:#20366f; border-color:rgba(214,222,255,.35); border-top-color:#f5f6fb; }
  .swayger-home .experience-card:nth-child(3) { background:#182d58; border-color:rgba(67,97,238,.6); border-top-color:#4361ee; }
  .swayger-home .experience-card:hover { transform:translateY(-4px); background:#263d82; }
  .swayger-home .mode-card { min-height:280px; position:relative; overflow:hidden; display:flex; flex-direction:column; justify-content:space-between; padding:23px; color:#f5f6fb; text-decoration:none; background:transparent; border:0; }
  .swayger-home .mode-card:hover { background:transparent; }
  .swayger-home .mode-card:after { content:""; position:absolute; width:230px; height:230px; right:-120px; top:-120px; border:1px solid rgba(233,238,255,.18); border-radius:50%; box-shadow:0 0 0 26px rgba(233,238,255,.04),0 0 0 52px rgba(233,238,255,.025); pointer-events:none; }
  .swayger-home .mode-index { color:#c0cafa; font-size:9px; letter-spacing:.16em; }
  .swayger-home .mode-glyph { width:44px; height:44px; display:grid; place-items:center; margin-top:25px; border:1px solid rgba(174,186,255,.7); color:var(--lime); font-size:13px; letter-spacing:.04em; }
  .swayger-home .experience-card:nth-child(2) .mode-glyph { background:rgba(245,246,251,.12); border-color:rgba(245,246,251,.72); }
  .swayger-home .experience-card:nth-child(3) .mode-glyph { border-style:dashed; border-color:#8298ff; }
  .swayger-home .mode-card h3 { max-width:270px; min-height:68px; margin:18px 0 10px; font-size:clamp(31px,3.7vw,44px); line-height:.88; text-transform:uppercase; }
  .swayger-home .mode-card p { max-width:290px; min-height:68px; margin:0; color:#d2daf1; font-size:12px; line-height:1.6; }
  .swayger-home .mode-link { display:inline-flex; align-items:center; gap:10px; width:fit-content; margin-top:16px; color:var(--lime); font-size:10px; letter-spacing:.13em; text-transform:uppercase; }
  .swayger-home .mode-link span { font-size:17px; transition:transform .2s; }
  .swayger-home .mode-card:hover .mode-link span { transform:translateX(4px); }
  .swayger-home .product-captures { display:grid; gap:16px; padding:20px; }
  .swayger-home .product-shot { min-width:0; margin:0; padding-top:10px; border-top:1px solid rgba(229,235,255,.18); }
  .swayger-home .product-shot img { display:block; width:100%; height:auto; background:#09090b; }
  .swayger-home .product-shot figcaption { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:7px 12px; padding:8px 1px 0; color:#e1e6f5; font-size:10px; line-height:1.4; }
  .swayger-home .full-image-link { display:inline-flex; align-items:center; min-height:38px; color:var(--lime); font-family:"DMSans_500Medium","DM Sans",sans-serif; font-size:10px; text-underline-offset:3px; text-decoration-thickness:1px; white-space:nowrap; }
  .swayger-home .full-image-link:focus-visible { outline:3px solid var(--lime); outline-offset:2px; }
  .swayger-home .process { padding:58px 0; background:#d9e1fa; color:#101a3a; }
  .swayger-home .steps { display:grid; grid-template-columns:repeat(4,1fr); list-style:none; padding:0; margin:0; border-top:1px solid rgba(16,26,58,.26); }
  .swayger-home .steps li { min-height:92px; display:flex; align-items:center; gap:13px; padding:12px 14px 12px 0; border-right:1px solid rgba(16,26,58,.2); }
  .swayger-home .steps li+li { padding-left:18px; }
  .swayger-home .steps li:last-child { border:0; }
  .swayger-home .step-num { color:#3c59d6; font-size:10px; letter-spacing:.12em; }
  .swayger-home .steps h3 { margin:0; font-size:clamp(22px,2.7vw,34px); line-height:.9; text-transform:uppercase; }
  .swayger-home .community { position:relative; overflow:hidden; padding:86px 0 92px; background:#324fc4; }
  .swayger-home .community:before { content:""; position:absolute; width:680px; height:680px; right:-200px; top:-315px; border:1px solid rgba(255,255,255,.22); border-radius:50%; box-shadow:0 0 0 38px rgba(255,255,255,.04),0 0 0 78px rgba(255,255,255,.03),0 0 0 118px rgba(255,255,255,.02); }
  .swayger-home .community-grid { position:relative; z-index:1; display:grid; grid-template-columns:.72fr 1fr; align-items:center; gap:7vw; }
  .swayger-home .community .section-kicker { color:#d6deff; }
  .swayger-home .community h2 { max-width:550px; }
  .swayger-home .community-copy { max-width:460px; margin:20px 0 25px; color:#e1e6ff; font-size:14px; line-height:1.7; }
  .swayger-home .community-proof-wrap { min-width:0; }
  .swayger-home .community-proof { min-width:0; margin:0; padding:10px; border:1px solid rgba(255,255,255,.38); background:rgba(11,20,48,.5); box-shadow:12px 12px 0 rgba(11,20,48,.24); }
  .swayger-home .community-proof img { display:block; width:100%; height:auto; background:#09090b; }
  .swayger-home .community-proof figcaption { padding:11px 2px 1px; color:#fff; font-size:13px; font-weight:500; }
  .swayger-home .community-proof-link { display:inline-flex; margin:4px 0 0 10px; }
  .swayger-home .organizers { padding:86px 0 90px; background:#111d40; border-block:1px solid var(--rule); }
  .swayger-home .organizer-grid { display:grid; grid-template-columns:.8fr 1fr; gap:7vw; align-items:center; }
  .swayger-home .organizers h2 { max-width:700px; }
  .swayger-home .organizers p { max-width:490px; margin:20px 0 24px; color:var(--muted); font-size:14px; line-height:1.7; }
  .swayger-home .organizer-proof { min-width:0; margin:0; padding:10px; border:1px solid rgba(193,203,255,.3); background:#101b3d; }
  .swayger-home .organizer-proof img { display:block; width:100%; height:auto; background:#09090b; }
  .swayger-home .organizer-proof figcaption { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px 12px; padding:8px 2px 0; color:#e3e9fb; font-size:11px; }
  .swayger-home .final { padding:92px 0 100px; text-align:center; position:relative; }
  .swayger-home .final:before { content:""; position:absolute; z-index:-1; width:min(760px,100%); height:430px; left:50%; top:0; transform:translateX(-50%); background:radial-gradient(ellipse,rgba(73,105,244,.25),transparent 70%); }
  .swayger-home .final .section-kicker { display:flex; justify-content:center; }
  .swayger-home .final h2 { max-width:760px; margin:17px auto 25px; font-size:clamp(54px,7.6vw,92px); }
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
    .swayger-home .hero { min-height:600px; grid-template-columns:1fr .82fr; gap:30px; }
    .swayger-home h1 { font-size:clamp(62px,9.5vw,94px); }
    .swayger-home .community-grid,.swayger-home .organizer-grid { gap:5vw; }
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
    .swayger-home .hero { display:flex; flex-direction:column; align-items:stretch; gap:34px; min-height:0; padding-block:50px 64px; }
    .swayger-home h1 { font-size:clamp(63px,17.6vw,94px); margin:23px 0 18px; }
    .swayger-home .hero-line { font-size:16px; }
    .swayger-home .hero-actions { align-items:stretch; flex-direction:column; gap:10px; margin-top:25px; }
    .swayger-home .hero-actions .button { width:100%; }
    .swayger-home .hero-art { width:calc(100% - 10px); margin-inline:auto; }
    .swayger-home .hero-index { bottom:20px; }
    .swayger-home .modes,.swayger-home .process,.swayger-home .community,.swayger-home .organizers { padding-block:58px; }
    .swayger-home .modes-heading { display:block; }
    .swayger-home .modes h2,.swayger-home .community h2,.swayger-home .organizers h2 { font-size:clamp(43px,12.5vw,60px); }
    .swayger-home .modes-sub { margin-top:15px; }
    .swayger-home .mode-list { grid-template-columns:1fr; gap:9px; }
    .swayger-home .experience-card { grid-template-columns:minmax(0,1fr); }
    .swayger-home .mode-card { min-height:235px; padding:22px; }
    .swayger-home .mode-card h3 { font-size:39px; }
    .swayger-home .steps { grid-template-columns:1fr 1fr; border-top:0; }
    .swayger-home .steps li,.swayger-home .steps li+li { min-height:66px; padding:10px 8px 10px 0; border-right:0; border-top:1px solid rgba(16,26,58,.22); }
    .swayger-home .steps li:nth-child(even) { padding-left:10px; border-left:1px solid rgba(16,26,58,.2); }
    .swayger-home .steps h3 { font-size:25px; }
    .swayger-home .community-grid,.swayger-home .organizer-grid { grid-template-columns:1fr; gap:27px; }
    .swayger-home .community-proof { width:100%; }
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
    .swayger-home .hero .button { padding-inline:12px; font-size:9px; letter-spacing:.045em; }
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
            <a href="#experiences">Experiences</a>
            <a href="#community">Your crew</a>
            <a href="#organizers">Organize</a>
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
          <div className="hero-art">
            <figure className="proof-art">
              <img
                src="/assets/marketing/knicks-spurs-final-standings.png"
                width={680}
                height={1022}
                loading="eager"
                alt="Final standings for Knicks vs Spurs Game 5 in a Swayger room, with participant display names."
              />
              <figcaption className="proof-art-caption">
                <strong>Knicks vs Spurs · Game 5 final standings</strong>
                The final standings are in.
              </figcaption>
            </figure>
          </div>
          <div className="hero-index" aria-hidden="true">The next call is yours</div>
        </section>

        <section id="experiences" className="modes" aria-labelledby="modes-title">
          <div className="wrap">
            <div className="modes-heading">
              <div>
                <div className="section-kicker">Three ways to call it</div>
                <h2 id="modes-title" className="display">Choose your<br />competition.</h2>
              </div>
              <p className="modes-sub">Picks with your crew. Locked before the action. Settled with receipts.</p>
            </div>
            <div className="mode-list">
              {[...experienceChoices]
                .sort((a, b) => ["game-day", "1v1", "fantasy"].indexOf(a.id) - ["game-day", "1v1", "fantasy"].indexOf(b.id))
                .map((choice, index) => {
                const content = {
                  "game-day": { title: "Swayger Game Day", desc: "Call a game or full slate with your crew. Host access required to start a room; join through your host’s invite.", glyph: "GD" },
                  "1v1": { title: "1v1 Swaygers", desc: "Put one prediction on the line with a friend. Take opposite sides, then settle the call together.", glyph: "1:1" },
                  fantasy: { title: "Swayger Fantasy", desc: "Bring weekly predictions to your fantasy league. Commissioners set the slate; members join by invite.", glyph: "F" },
                }[choice.id];
                return (
                  <article className="experience-card" key={choice.id}>
                    <a
                      className="mode-card"
                      href={choice.href}
                      onClick={(event) => handleChoice(event, choice.returnTo)}
                    >
                      <div>
                        <div className="mode-index">0{index + 1} / SWAYGER</div>
                        <div className="mode-glyph" aria-hidden="true">{content.glyph}</div>
                      </div>
                      <div>
                        <h3 className="display">{content.title}</h3>
                        <p>{content.desc}</p>
                        <span className="mode-link">{choice.action}<span aria-hidden="true">→</span></span>
                      </div>
                    </a>
                    <div className="product-captures">
                      {choice.id === "game-day" ? (
                        <figure className="product-shot">
                          <img src="/assets/marketing/knicks-spurs-pregame-picks-homepage.jpg" width={1322} height={472} loading="lazy" alt="Knicks–Spurs Game 5 revealed pregame picks, group pick counts, and correct answers in a Swayger Game Day room." />
                          <figcaption>Knicks–Spurs · Game 5 revealed picks<a className="full-image-link" href="/assets/marketing/knicks-spurs-pregame-picks-homepage.jpg" target="_blank" rel="noopener noreferrer">View full-size</a></figcaption>
                        </figure>
                      ) : null}
                      {choice.id === "1v1" ? (
                        <figure className="product-shot">
                          <img src="/assets/marketing/1v1-nba-playoffs-homepage.jpg" width={1339} height={561} loading="lazy" alt="Settled NBA Playoffs 1v1: Jokic is the creator’s pick, Antman is the opponent’s pick, and the creator wins 25 Swayger Points." />
                          <figcaption>Joker vs Antman · settled<a className="full-image-link" href="/assets/marketing/1v1-nba-playoffs-homepage.jpg" target="_blank" rel="noopener noreferrer">View full-size</a></figcaption>
                        </figure>
                      ) : null}
                      {choice.id === "fantasy" ? (
                        <>
                          <figure className="product-shot">
                            <img src="/assets/marketing/fantasy-week-10-picks-homepage.jpg" width={1324} height={525} loading="lazy" alt="Week 10 Swayger Fantasy participant predictions with two questions, point values, and Choose Team controls; no answers have been submitted." />
                            <figcaption>Week 10 · participant picks<a className="full-image-link" href="/assets/marketing/fantasy-week-10-picks-homepage.jpg" target="_blank" rel="noopener noreferrer">View full-size</a></figcaption>
                          </figure>
                          <figure className="product-shot">
                            <img src="/assets/marketing/fantasy-week-1-homepage.jpg" width={1339} height={799} loading="lazy" alt="Food Pyramid XX Week 1 finalized Fantasy receipt, with two co-winners and all four final standings rows." />
                            <figcaption>Food Pyramid XX · Week 1 finalized receipt<a className="full-image-link" href="/assets/marketing/fantasy-week-1-homepage.jpg" target="_blank" rel="noopener noreferrer">View full-size</a></figcaption>
                          </figure>
                        </>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
            {navigationError ? <p className="experience-error" role="alert">{navigationError}</p> : null}
          </div>
        </section>

        <section id="how-it-works" className="process" aria-label="How Swayger works">
          <div className="wrap">
            <ol className="steps">
              <li><span className="step-num">01</span><h3 className="display">Pick</h3></li>
              <li><span className="step-num">02</span><h3 className="display">Lock</h3></li>
              <li><span className="step-num">03</span><h3 className="display">Compete</h3></li>
              <li><span className="step-num">04</span><h3 className="display">Get receipts</h3></li>
            </ol>
          </div>
        </section>

        <section id="community" className="community" aria-labelledby="community-title">
          <div className="wrap community-grid">
            <div>
              <div className="section-kicker">Keep the crew. Keep the receipts.</div>
              <h2 id="community-title" className="display">Built for your crew</h2>
              <p className="community-copy">Your group already has the opinions. Give every pick a deadline, every matchup a little heat, and every result a place to live.</p>
              <button className="button button-outline" type="button" onClick={(event) => openChoices("organize", event)}>Choose a group format <span aria-hidden="true">↗</span></button>
            </div>
            <div className="community-proof-wrap">
              <figure className="community-proof">
                <img src="/assets/marketing/madden-week-5-pick-card-homepage.jpg" width={634} height={587} loading="lazy" alt="Madden Week 5 Parlay web participant pick card: Dev Upgrade administered by the commissioner, 8 of 8 answered, with the first three selected matchup picks." />
                <figcaption>Madden Weekly Pick Card</figcaption>
              </figure>
              <a className="full-image-link community-proof-link" href="/assets/marketing/madden-week-5-pick-card-homepage.jpg" target="_blank" rel="noopener noreferrer">View full-size</a>
            </div>
          </div>
        </section>

        <section id="organizers" className="organizers" aria-labelledby="organizers-title">
          <div className="wrap organizer-grid">
            <div>
              <div className="section-kicker">For the friend who gets it going</div>
              <h2 id="organizers-title" className="display">You bring the crew. Swayger brings the competition.</h2>
              <p>Choose the format, set the rules and deadline, invite your people, then confirm results. Swayger keeps picks, standings, and receipts together.</p>
              <button className="button button-outline" type="button" onClick={(event) => openChoices("organize", event)}>Choose a group format</button>
            </div>
            <figure className="organizer-proof">
              <img src="/assets/marketing/gameday-organizer-homepage.jpg" width={1338} height={564} loading="lazy" alt="New Game Day Room setup screen showing NBA, NFL, Soccer, and Madden sport choices, room details, teams, and optional card scheduling." />
              <figcaption>New Game Day Room<a className="full-image-link" href="/assets/marketing/gameday-organizer-homepage.jpg" target="_blank" rel="noopener noreferrer">View full-size</a></figcaption>
            </figure>
          </div>
        </section>

        <section className="final" aria-labelledby="final-title">
          <div className="wrap">
            <div className="section-kicker">Next game. New receipts.</div>
            <h2 id="final-title" className="display">Make your call count.</h2>
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
                {[...experienceChoices]
                  .sort((a, b) => ["game-day", "1v1", "fantasy"].indexOf(a.id) - ["game-day", "1v1", "fantasy"].indexOf(b.id))
                  .map((choice) => (
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
