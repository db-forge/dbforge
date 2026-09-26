// Typed errors for the browser helpers. The UI shows `messages[lang][code]` (or its own i18n entry under
// `messageKey`); the raw wallet/RPC text is never copied into `message`.

import {
  BaseError,
  ChainMismatchError,
  ContractFunctionRevertedError,
  InsufficientFundsError,
  UserRejectedRequestError,
  type Hex,
} from "viem";

export type DbforgeClientErrorCode =
  | "CONFIG_MISSING"
  | "WALLET_NOT_CONNECTED"
  | "WRONG_NETWORK"
  | "INVALID_INPUT"
  | "USER_REJECTED"
  | "INSUFFICIENT_FUNDS"
  | "RESERVE_BALANCE"
  | "CONTRACT_PAUSED"
  | "NOT_BUYER"
  | "MISSION_NOT_ACTIVE"
  | "NOTHING_TO_WITHDRAW"
  | "NOT_ANCHORED"
  | "ALREADY_FINALIZED"
  | "ROOT_MISMATCH"
  | "GAS_CAP_EXCEEDED"
  | "TX_REVERTED"
  | "TX_TIMEOUT"
  | "EVENT_NOT_FOUND"
  | "RPC_ERROR";

export type Lang = "tr" | "en";

export const clientErrorMessages: Record<Lang, Record<DbforgeClientErrorCode, string>> = {
  tr: {
    CONFIG_MISSING: "Kontrat adresi veya ağ ayarı eksik.",
    WALLET_NOT_CONNECTED: "Önce cüzdanını bağla.",
    WRONG_NETWORK: "Cüzdanın yanlış ağda. Monad Testnet'e geç.",
    INVALID_INPUT: "Girilen değer geçersiz.",
    USER_REJECTED: "İşlemi cüzdanda reddettin.",
    INSUFFICIENT_FUNDS: "Bakiyen işlem tutarını ve gas ücretini karşılamıyor.",
    RESERVE_BALANCE: "Monad kuralı: işlemden sonra cüzdanında en az 10 MON kalmalı.",
    CONTRACT_PAUSED: "Sözleşme şu an duraklatıldı. Daha sonra tekrar dene.",
    NOT_BUYER: "Bu işlemi yalnız görevin sahibi yapabilir.",
    MISSION_NOT_ACTIVE: "Görev artık aktif değil.",
    NOTHING_TO_WITHDRAW: "Çekilecek bakiye yok.",
    NOT_ANCHORED: "Veri seti henüz zincire kaydedilmedi.",
    ALREADY_FINALIZED: "Veri seti zaten onaylandı.",
    ROOT_MISMATCH: "Veri seti sen incelerken güncellendi. Yeni sürümü incele ve tekrar onayla.",
    GAS_CAP_EXCEEDED: "İşlem beklenenden fazla gas istiyor; güvenlik için gönderilmedi.",
    TX_REVERTED: "İşlem zincirde başarısız oldu.",
    TX_TIMEOUT: "İşlem onayı gecikti. Gezginden işlem durumunu kontrol et.",
    EVENT_NOT_FOUND: "İşlem onaylandı ama beklenen kayıt bulunamadı.",
    RPC_ERROR: "Ağa bağlanılamadı. Tekrar dene.",
  },
  en: {
    CONFIG_MISSING: "A contract address or network setting is missing.",
    WALLET_NOT_CONNECTED: "Connect your wallet first.",
    WRONG_NETWORK: "Your wallet is on the wrong network. Switch to Monad Testnet.",
    INVALID_INPUT: "The value you entered is not valid.",
    USER_REJECTED: "You rejected the transaction in your wallet.",
    INSUFFICIENT_FUNDS: "Your balance does not cover the amount and the gas fee.",
    RESERVE_BALANCE: "Monad rule: at least 10 MON must stay in your wallet after this transaction.",
    CONTRACT_PAUSED: "The contract is paused. Try again later.",
    NOT_BUYER: "Only the mission owner can do this.",
    MISSION_NOT_ACTIVE: "The mission is no longer active.",
    NOTHING_TO_WITHDRAW: "There is nothing to withdraw.",
    NOT_ANCHORED: "The dataset is not on chain yet.",
    ALREADY_FINALIZED: "The dataset is already accepted.",
    ROOT_MISMATCH: "The dataset changed while you reviewed it. Review the new version and accept again.",
    GAS_CAP_EXCEEDED: "The transaction needs more gas than expected, so it was not sent.",
    TX_REVERTED: "The transaction failed on chain.",
    TX_TIMEOUT: "The confirmation is late. Check the transaction in the explorer.",
    EVENT_NOT_FOUND: "The transaction was confirmed, but the expected event is missing.",
    RPC_ERROR: "Could not reach the network. Try again.",
  },
};

export class DbforgeClientError extends Error {
  readonly code: DbforgeClientErrorCode;
  /** i18n key for apps with their own dictionaries: `monad.errors.<CODE>`. */
  readonly messageKey: string;
  /** Contract error name or a short internal tag (never raw RPC text). */
  readonly reason?: string;
  readonly txHash?: Hex;

  constructor(code: DbforgeClientErrorCode, opts: { reason?: string; txHash?: Hex } = {}) {
    super(clientErrorMessages.en[code]);
    this.name = "DbforgeClientError";
    this.code = code;
    this.messageKey = `monad.errors.${code}`;
    this.reason = opts.reason;
    this.txHash = opts.txHash;
  }

  localized(lang: Lang): string {
    return clientErrorMessages[lang][this.code];
  }
}

export function isDbforgeClientError(e: unknown): e is DbforgeClientError {
  return e instanceof DbforgeClientError;
}

const REVERT_CODES: Record<string, DbforgeClientErrorCode> = {
  EnforcedPause: "CONTRACT_PAUSED",
  NotBuyer: "NOT_BUYER",
  MissionNotActive: "MISSION_NOT_ACTIVE",
  NothingToWithdraw: "NOTHING_TO_WITHDRAW",
  NotAnchored: "NOT_ANCHORED",
  AlreadyFinalized: "ALREADY_FINALIZED",
  RootMismatch: "ROOT_MISMATCH",
  InvalidReward: "INVALID_INPUT",
  InvalidTarget: "INVALID_INPUT",
  InvalidMetadata: "INVALID_INPUT",
  IncorrectFunding: "INVALID_INPUT",
  InvalidContributor: "INVALID_INPUT",
  ZeroAddress: "INVALID_INPUT",
};

/** Maps any viem / wallet error to a DbforgeClientError. */
export function toClientError(e: unknown): DbforgeClientError {
  if (e instanceof DbforgeClientError) return e;
  if (e instanceof BaseError) {
    if (e.walk((x) => x instanceof UserRejectedRequestError)) return new DbforgeClientError("USER_REJECTED");
    // EIP-1193 code 4001 from wallets that viem does not wrap.
    if (e.walk((x) => (x as { code?: unknown }).code === 4001)) return new DbforgeClientError("USER_REJECTED");
    if (e.walk((x) => x instanceof ChainMismatchError)) return new DbforgeClientError("WRONG_NETWORK");
    const reverted = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName ?? "UnknownRevert";
      return new DbforgeClientError(REVERT_CODES[name] ?? "TX_REVERTED", { reason: name });
    }
    if (e.walk((x) => x instanceof InsufficientFundsError)) return new DbforgeClientError("INSUFFICIENT_FUNDS");
    return new DbforgeClientError("RPC_ERROR", { reason: e.name });
  }
  return new DbforgeClientError("RPC_ERROR", { reason: "UNKNOWN" });
}
