// Turns an uploaded image or video into a small JPEG data URL, usable as a
// mission cover (survives reloads, unlike blob: URLs).
import { t } from "./i18n";

const MAX_W = 800;

function drawToDataUrl(source: CanvasImageSource, w: number, h: number) {
  const scale = Math.min(1, MAX_W / w);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

export function fileToCoverDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  return new Promise<string>((resolve, reject) => {
    if (file.type.startsWith("video/")) {
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.src = url;
      video.onloadeddata = () => {
        video.currentTime = Math.min(0.5, video.duration / 2 || 0);
      };
      video.onseeked = () => resolve(drawToDataUrl(video, video.videoWidth, video.videoHeight));
      video.onerror = () => reject(new Error(t().errors.videoRead));
    } else {
      const img = new Image();
      img.onload = () => resolve(drawToDataUrl(img, img.naturalWidth, img.naturalHeight));
      img.onerror = () => reject(new Error(t().errors.imageRead));
      img.src = url;
    }
  }).finally(() => URL.revokeObjectURL(url));
}
