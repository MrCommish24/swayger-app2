/** Public metadata only. Never redirects or makes authentication decisions.
 * www is a verified deployment domain and the existing canonical redirect target.
 */
import { PUBLIC_SITE_ORIGIN, PUBLIC_HOME_TITLE, PUBLIC_HOME_DESCRIPTION } from "../lib/public-homepage";
export const PUBLIC_ORIGIN = PUBLIC_SITE_ORIGIN;
export const HOME_TITLE = PUBLIC_HOME_TITLE;
export const HOME_DESCRIPTION = PUBLIC_HOME_DESCRIPTION;

export function publicMetadata(pathname: "/" | "/how-it-works" = "/"): string {
  const title = pathname === "/" ? HOME_TITLE : "How Swayger Works — Pick. Lock. Compete. Settle. Share.";
  const description = pathname === "/" ? HOME_DESCRIPTION :
    "See how Game Day, Fantasy, and 1v1 turn sports predictions into competition with locked picks, standings, and shareable receipts.";
  const url = `${PUBLIC_ORIGIN}${pathname}`;
  const image = `${PUBLIC_ORIGIN}/assets/marketing/swayger-social.png`;
  return `<title>${title}</title>
<meta name="description" content="${description}" />
<meta name="robots" content="index, follow" />
<meta name="theme-color" content="#09090B" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Swayger" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${image}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="Swayger. Make sports talk competitive. Make your picks. Prove your takes. Keep the receipts." />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${image}" />`.replace(/<(title|meta|link)\b/g, '<$1 data-rh="true"');
}

export function injectPublicMetadata(html: string, pathname: "/" | "/how-it-works" = "/"): string {
  // Replace old tags rather than emitting duplicate/contradicting metadata.
  const clean = html
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, "")
    .replace(/<meta\b[^>]*(?:name=["'](?:description|robots|theme-color|twitter:[^"']+)["']|property=["']og:[^"']+["'])[^>]*>/gi, "")
    .replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, "");
  return clean.replace("</head>", `${publicMetadata(pathname)}\n</head>`);
}

export function publicSitemap(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${PUBLIC_ORIGIN}/</loc></url>
<url><loc>${PUBLIC_ORIGIN}/how-it-works</loc></url>
<url><loc>${PUBLIC_ORIGIN}/privacy</loc></url>
</urlset>`;
}
