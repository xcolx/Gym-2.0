import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

// The preview image of links to the site, generated once by `next build`

export const alt = "Gym 2.0 – Every set logged. Every muscle seen.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const icon = await readFile(join(process.cwd(), "public/icons/icon-512.png"));
  const iconSrc = `data:image/png;base64,${icon.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 96px",
          color: "white",
          // BRAND_GRADIENT of components/landing/brand.ts
          background: "linear-gradient(135deg, #ff5a4e 0%, #ff1f1f 50%, #d10000 100%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <img src={iconSrc} alt="" width={120} height={120} style={{ borderRadius: 28 }} />
          <span style={{ fontSize: 64 }}>Gym 2.0</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 56, fontSize: 84, lineHeight: 1.05 }}>
          <span>Every set logged.</span>
          <span>Every muscle seen.</span>
        </div>
        <div style={{ display: "flex", marginTop: 40, fontSize: 34, opacity: 0.85 }}>
          Free · Open source · No ads · iPhone and web
        </div>
      </div>
    ),
    size,
  );
}
