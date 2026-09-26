// Texts for /auth, /contributor/join and the company wallet link card.
// Kept separate from tr.ts/en.ts; pick with `useContributorT()`.
import { useLocale } from "@/components/I18nProvider";

export const tr = {
  choose: {
    title: "DBForge'a hoş geldin",
    subtitle: "Nasıl devam etmek istediğini seç.",
    companyTitle: "Şirketim",
    companyBody: "Veri topla: görev oluştur, katkıları onayla, veri setini indir.",
    companyCta: "Şirket girişi",
    contributorTitle: "Katkı sahibiyim",
    contributorBody: "Görev yap, kazan: cüzdanınla giriş yap, veri yükle, MON kazan.",
    contributorCta: "Cüzdanla katıl",
  },
  join: {
    title: "Katkı sahibi olarak katıl",
    step1: "Cüzdanını bağla",
    step1Body: "Monad testnet üzerindeki cüzdanınla giriş yaparsın. Şifre yok.",
    connect: "Cüzdan bağla",
    connecting: "Bağlanıyor…",
    wrongNetwork: "Cüzdanın başka bir ağda. Devam etmek için Monad testnet'e geç.",
    switch: "Monad'a geç",
    noMetamask: "Tarayıcında cüzdan bulunamadı.",
    noMetamaskBody: "Gerçek giriş için MetaMask kur ve bu sayfayı yenile.",
    installMetamask: "MetaMask'i kur",
    step2: "İmzala ve giriş yap",
    step2Body: "Cüzdanın bir giriş mesajı imzalayacak. Bu işlem ücretsizdir, işlem göndermez.",
    sign: "İmzala ve giriş yap",
    signing: "İmza bekleniyor…",
    step3: "Görünen adını seç",
    step3Body: "Diğer kullanıcılar seni bu adla görür. Sonra da ekleyebilirsin.",
    displayName: "Görünen ad",
    save: "Kaydet",
    saving: "Kaydediliyor…",
    skip: "Şimdilik atla",
    connectedAs: "Bağlı cüzdan",
  },
  companyWallet: {
    title: "Fonlama cüzdanı",
    missing: "Görev oluşturmadan önce fonlama cüzdanını bağla. Ödemeler bu cüzdandan yapılır.",
    link: "Fonlama cüzdanını bağla",
    linking: "Bağlanıyor…",
    linked: "Bağlı cüzdan",
    success: "Fonlama cüzdanı bağlandı",
  },
  errors: {
    NONCE_INVALID: "Giriş mesajının süresi doldu. Tekrar dene.",
    SIGNATURE_INVALID: "İmza doğrulanamadı. Aynı cüzdanla tekrar dene.",
    DISPLAY_NAME_TAKEN: "Bu ad kullanılıyor. Başka bir ad seç.",
    RATE_LIMITED: "Çok fazla deneme. Biraz bekleyip tekrar dene.",
    WALLET_IN_USE: "Bu cüzdan başka bir hesaba bağlı.",
    displayNameLength: "Ad 2–30 karakter olmalı.",
    displayNameChars: "Yalnız harf, rakam, boşluk, nokta, alt çizgi ve tire kullan.",
    rejected: "İmza iptal edildi.",
    generic: "Bir şeyler ters gitti. Tekrar dene.",
  },
};

export type ContributorDict = typeof tr;

export const en: ContributorDict = {
  choose: {
    title: "Welcome to DBForge",
    subtitle: "Choose how you want to continue.",
    companyTitle: "I'm a company",
    companyBody: "Collect data: create missions, approve contributions, download the dataset.",
    companyCta: "Company sign-in",
    contributorTitle: "I'm a contributor",
    contributorBody: "Do missions, earn: sign in with your wallet, upload data, earn MON.",
    contributorCta: "Join with wallet",
  },
  join: {
    title: "Join as a contributor",
    step1: "Connect your wallet",
    step1Body: "You sign in with your wallet on Monad testnet. No password.",
    connect: "Connect wallet",
    connecting: "Connecting…",
    wrongNetwork: "Your wallet is on another network. Switch to Monad testnet to continue.",
    switch: "Switch to Monad",
    noMetamask: "No wallet found in your browser.",
    noMetamaskBody: "Install MetaMask for a real sign-in, then reload this page.",
    installMetamask: "Install MetaMask",
    step2: "Sign and sign in",
    step2Body: "Your wallet signs a sign-in message. It is free and sends no transaction.",
    sign: "Sign and sign in",
    signing: "Waiting for signature…",
    step3: "Choose a display name",
    step3Body: "Other users see you by this name. You can add it later.",
    displayName: "Display name",
    save: "Save",
    saving: "Saving…",
    skip: "Skip for now",
    connectedAs: "Connected wallet",
  },
  companyWallet: {
    title: "Funding wallet",
    missing: "Link your funding wallet before you create a mission. Payments come from this wallet.",
    link: "Link funding wallet",
    linking: "Linking…",
    linked: "Linked wallet",
    success: "Funding wallet linked",
  },
  errors: {
    NONCE_INVALID: "The sign-in message expired. Try again.",
    SIGNATURE_INVALID: "The signature could not be verified. Try again with the same wallet.",
    DISPLAY_NAME_TAKEN: "This name is taken. Choose another one.",
    RATE_LIMITED: "Too many attempts. Wait a moment and try again.",
    WALLET_IN_USE: "This wallet is linked to another account.",
    displayNameLength: "The name must be 2–30 characters.",
    displayNameChars: "Use only letters, digits, space, dot, underscore and hyphen.",
    rejected: "Signature cancelled.",
    generic: "Something went wrong. Try again.",
  },
};

export function useContributorT(): ContributorDict {
  return useLocale() === "en" ? en : tr;
}

type ErrorKey = keyof ContributorDict["errors"];

/** Maps an API error code / validation code / thrown error to a user message. */
export function authErrorText(d: ContributorDict, code: string | null | undefined, e?: unknown): string {
  if (code && code in d.errors) return d.errors[code as ErrorKey];
  const msg = e instanceof Error ? e.message : "";
  if (/reject|denied|cancel/i.test(msg)) return d.errors.rejected;
  return msg ? msg.split("\n")[0] : d.errors.generic;
}
