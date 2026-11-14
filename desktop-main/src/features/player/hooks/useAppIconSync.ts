import { useEffect } from "react";
import { useTheme } from "next-themes";
import logo from "@/assets/logo.png";

interface IconLayout {
  canvas: number;
  inset: number;
  radius: number;
  logo: { x: number; y: number; width: number; height: number };
  shadow: boolean;
}

const FULL_BLEED: IconLayout = {
  canvas: 512,
  inset: 0,
  radius: 112,
  logo: { x: 112, y: 112, width: 288, height: 288 },
  shadow: false,
};

const MAC_DOCK: IconLayout = {
  canvas: 1024,
  inset: 100,
  radius: 185,
  logo: { x: 280, y: 280, width: 464, height: 464 },
  shadow: true,
};

function loadLogo(): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  return new Promise((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load logo for icon"));
    img.src = logo;
  });
}

async function renderIconDataUrl(
  isLight: boolean,
  layout: IconLayout,
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = layout.canvas;
  canvas.height = layout.canvas;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const size = layout.canvas - layout.inset * 2;
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(layout.inset, layout.inset, size, size, layout.radius);
  } else {
    ctx.rect(layout.inset, layout.inset, size, size);
  }
  if (layout.shadow) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 10;
  }
  // The official app icon is the white mark on black, in both themes.
  ctx.fillStyle = "#000000";
  ctx.fill();
  ctx.shadowColor = "transparent";

  ctx.lineWidth = 2;
  ctx.strokeStyle = isLight
    ? "rgba(0, 0, 0, 0.12)"
    : "rgba(255, 255, 255, 0.08)";
  ctx.stroke();

  const img = await loadLogo();
  const { x, y, width, height } = layout.logo;
  ctx.drawImage(img, x, y, width, height);
  return canvas.toDataURL("image/png");
}

export function useAppIconSync() {
  const { theme, resolvedTheme } = useTheme();

  useEffect(() => {
    const isLight = (resolvedTheme || theme) === "light";
    let active = true;

    const layout =
      window.irisElectron?.platform === "darwin" ? MAC_DOCK : FULL_BLEED;

    void renderIconDataUrl(isLight, layout).then((dataUrl) => {
      if (!active || !dataUrl) return;

      if (window.irisElectron?.setAppIcon) {
        window.irisElectron.setAppIcon(dataUrl, {
          isDefault: true,
        });
      }

      let favicon =
        document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (!favicon) {
        favicon = document.createElement("link");
        favicon.rel = "icon";
        document.head.appendChild(favicon);
      }
      favicon.href = dataUrl;
    });

    return () => {
      active = false;
    };
  }, [theme, resolvedTheme]);
}
