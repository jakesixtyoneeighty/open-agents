import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";

export const alt = `${BRAND.name} — ${BRAND.headline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage() {
  const face = await readFile(
    join(process.cwd(), "public", BRAND.assets.icon512),
  );
  const faceSrc = `data:image/png;base64,${face.toString("base64")}`;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        overflow: "hidden",
        background: "#070a1c",
        color: "#ffffff",
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      {/* Aurora glows */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          background:
            "radial-gradient(ellipse 700px 500px at 10% 10%, rgba(34, 211, 238, 0.28), transparent 60%), radial-gradient(ellipse 700px 520px at 95% 90%, rgba(168, 85, 247, 0.32), transparent 60%), radial-gradient(ellipse 500px 400px at 60% 40%, rgba(59, 130, 246, 0.18), transparent 60%)",
        }}
      />

      {/* Left: copy */}
      <div
        style={{
          position: "absolute",
          top: 72,
          left: 80,
          bottom: 72,
          width: 620,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <svg viewBox="0 0 32 32" width="44" height="44" fill="none">
            <defs>
              <linearGradient id="m" x1="3" y1="4" x2="29" y2="28">
                <stop offset="0" stopColor="#22d3ee" />
                <stop offset="0.5" stopColor="#3b82f6" />
                <stop offset="1" stopColor="#a855f7" />
              </linearGradient>
            </defs>
            <path
              d="M6 25.5V8.5L16 19.5L26 8.5V25.5"
              stroke="url(#m)"
              strokeWidth="5.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: -1 }}>
            Mojo
          </span>
          <span
            style={{
              fontSize: 34,
              fontWeight: 700,
              letterSpacing: -1,
              marginLeft: -14,
              color: "#7aa2ff",
            }}
          >
            Code
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              lineHeight: 1.02,
              letterSpacing: "-0.04em",
            }}
          >
            Same problems.
          </div>
          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              lineHeight: 1.02,
              letterSpacing: "-0.04em",
              backgroundImage:
                "linear-gradient(90deg, #22d3ee, #3b82f6 50%, #a855f7)",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            Brighter solutions.
          </div>
          <div
            style={{
              marginTop: 24,
              fontSize: 26,
              lineHeight: 1.4,
              color: "rgba(255, 255, 255, 0.6)",
            }}
          >
            Mojo is the coding agent that ships the pull request.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 16,
            fontSize: 18,
            letterSpacing: 4,
            color: "rgba(255, 255, 255, 0.45)",
          }}
        >
          PEOPLE × AI × BETTER SOFTWARE
        </div>
      </div>

      {/* Right: Mojo */}
      <div
        style={{
          position: "absolute",
          right: 80,
          top: 115,
          width: 400,
          height: 400,
          borderRadius: 400,
          padding: 8,
          display: "flex",
          background: "linear-gradient(135deg, #22d3ee, #3b82f6 50%, #a855f7)",
          boxShadow: "0 30px 120px rgba(99, 102, 241, 0.55)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={faceSrc}
          alt=""
          width={384}
          height={384}
          style={{ borderRadius: 384, border: "6px solid #070a1c" }}
        />
      </div>
    </div>,
    { ...size },
  );
}
