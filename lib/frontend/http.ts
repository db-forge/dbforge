// fetch wrapper for app/api/*. Error bodies look like
// { error: { code, message, details? } } — see app/api/_lib/errors.ts.

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

// User-facing Turkish text for error codes the UI can actually hit.
const MESSAGES: Record<string, string> = {
  MISSION_NOT_FOUND: "Görev bulunamadı",
  MISSION_NOT_ACTIVE: "Bu görev şu an gönderim kabul etmiyor",
  MISSION_TARGET_REACHED: "Görev hedefine ulaştı",
  UNSUPPORTED_MEDIA_TYPE: "Desteklenmeyen dosya türü (mp4 veya webm yükle)",
  FILE_TOO_LARGE: "Dosya çok büyük",
  EMPTY_FILE: "Dosya boş",
  DUPLICATE_SUBMISSION: "Bu video bu göreve daha önce gönderilmiş",
  MEDIA_OBJECT_MISSING: "Video depoda bulunamadı",
  INVALID_CONTRIBUTOR_ADDRESS: "Cüzdan adresi geçersiz",
  STORAGE_UPLOAD_FAILED: "Video yüklenemedi, tekrar dene",
  AI_PROVIDER_UNAVAILABLE: "AI doğrulama servisi şu an kullanılamıyor",
  FRAME_EXTRACTION_UNAVAILABLE: "Videodan kare çıkarılamadı",
  SETTLEMENT_GATEWAY_UNAVAILABLE: "Ödeme servisi şu an kullanılamıyor",
  CHAIN_MISSION_NOT_CONFIGURED: "Görev henüz zincire bağlanmamış",
  VERIFICATION_FAILED: "Doğrulama tamamlanamadı",
};

export function errorMessage(code: string | undefined, fallback: string) {
  return (code && MESSAGES[code]) || fallback;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { cache: "no-store", ...init });
  } catch {
    throw new ApiRequestError(0, "NETWORK_ERROR", "Sunucuya ulaşılamadı");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const code: string = body?.error?.code ?? `HTTP_${res.status}`;
    throw new ApiRequestError(res.status, code, errorMessage(code, body?.error?.message ?? "İstek başarısız"));
  }
  return body as T;
}
