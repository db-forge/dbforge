// Seed data for the frontend demo. Only lib/frontend/api.ts reads this.
import type { Category, Company } from "@/lib/frontend/types";
import { seededHex } from "@/lib/frontend/utils";

export interface MockMission {
  id: string;
  chainMissionId: string;
  buyerAddress: string;
  title: string;
  description: string;
  rewardMon: number;
  targetCount: number;
  acceptedCount: number;
  status: "draft" | "active" | "completed" | "cancelled";
  company: Company;
  category: Category;
  coverUrl: string;
  sampleVideoUrl: string;
  createdAt: string;
  registeredCount: number;
  perUserLimit: number;
  minDurationSec: number;
  criteria: string[];
}

export const COMPANIES = {
  nova: { name: "Nova Robotics", handle: "novarobotics", initials: "NR" },
  kinetic: { name: "Kinetic Labs", handle: "kineticlabs", initials: "KL" },
  atlas: { name: "Atlas Motion", handle: "atlasmotion", initials: "AM" },
} satisfies Record<string, Company>;

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

const BASE_CRITERIA = [
  "En az 10 saniye, kesintisiz tek çekim",
  "Eller ve nesne kadrajda net görünüyor",
  "Yeterli ışık, bulanık olmayan görüntü",
  "Daha önce yüklenmemiş, özgün video",
];

export const SEED_MISSIONS: MockMission[] = [
  {
    id: "m1",
    chainMissionId: "1",
    buyerAddress: seededHex("nova", 20),
    title: "Masadan pet şişe düşürme",
    description:
      "Masanın üzerindeki pet şişeyi elinle iterek yere düşür. Robot kollarının nesne düşme fiziğini öğrenmesi için farklı masa ve şişe tipleri arıyoruz.",
    rewardMon: 0.1,
    targetCount: 100,
    acceptedCount: 82,
    status: "active",
    company: COMPANIES.nova,
    category: "gundelik",
    coverUrl: "/missions/bottle-drop.jpg",
    sampleVideoUrl: "/demo/bottle-drop.mp4",
    createdAt: hoursAgo(2),
    registeredCount: 214,
    perUserLimit: 5,
    minDurationSec: 10,
    criteria: [...BASE_CRITERIA, "Şişe masadan tamamen düşmeli"],
  },
  {
    id: "m2",
    chainMissionId: "2",
    buyerAddress: seededHex("nova", 20),
    title: "Tişört katlama",
    description:
      "Düz bir yüzeyde bir tişörtü baştan sona katla. İnsansı robotların kumaş manipülasyonu için yüksek kaliteli el hareketi verisi topluyoruz.",
    rewardMon: 0.25,
    targetCount: 50,
    acceptedCount: 31,
    status: "active",
    company: COMPANIES.nova,
    category: "gundelik",
    coverUrl: "/missions/tshirt-fold.jpg",
    sampleVideoUrl: "/demo/tshirt-fold.mp4",
    createdAt: hoursAgo(5),
    registeredCount: 96,
    perUserLimit: 3,
    minDurationSec: 10,
    criteria: [...BASE_CRITERIA, "Katlama işlemi başlangıçtan bitişe görünmeli"],
  },
  {
    id: "m3",
    chainMissionId: "3",
    buyerAddress: seededHex("kinetic", 20),
    title: "Buzdolabı kapağı açma",
    description:
      "Buzdolabı kapağını tutup aç, içeriyi kısa süre göster ve kapat. Ev robotlarının menteşeli kapı etkileşimini öğrenmesi için.",
    rewardMon: 0.15,
    targetCount: 100,
    acceptedCount: 57,
    status: "active",
    company: COMPANIES.kinetic,
    category: "gundelik",
    coverUrl: "/missions/fridge-open.jpg",
    sampleVideoUrl: "/demo/fridge-open.mp4",
    createdAt: hoursAgo(9),
    registeredCount: 158,
    perUserLimit: 5,
    minDurationSec: 10,
    criteria: [...BASE_CRITERIA, "Kapak kolu ve menteşe tarafı görünmeli"],
  },
  {
    id: "m4",
    chainMissionId: "4",
    buyerAddress: seededHex("kinetic", 20),
    title: "Telefonu şarja takma",
    description:
      "Şarj kablosunu telefonun girişine tak. İnce motor becerisi gerektiren konnektör takma hareketleri için çeşitli açılardan veri arıyoruz.",
    rewardMon: 0.08,
    targetCount: 100,
    acceptedCount: 73,
    status: "active",
    company: COMPANIES.kinetic,
    category: "teknoloji",
    coverUrl: "/missions/phone-charge.jpg",
    sampleVideoUrl: "/demo/phone-charge.mp4",
    createdAt: hoursAgo(26),
    registeredCount: 187,
    perUserLimit: 5,
    minDurationSec: 10,
    criteria: [...BASE_CRITERIA, "Konnektör girişe takılırken yakın plan olmalı"],
  },
  {
    id: "m5",
    chainMissionId: "5",
    buyerAddress: seededHex("atlas", 20),
    title: "Şapka takma",
    description:
      "Bir şapkayı eline al ve başına tak. Giyilebilir nesne manipülasyonu için ayna karşısında veya ön kamerayla çekim yapabilirsin.",
    rewardMon: 0.12,
    targetCount: 40,
    acceptedCount: 40,
    status: "completed",
    company: COMPANIES.atlas,
    category: "gundelik",
    coverUrl: "/missions/wear-hat.jpg",
    sampleVideoUrl: "/demo/wear-hat.mp4",
    createdAt: hoursAgo(50),
    registeredCount: 121,
    perUserLimit: 3,
    minDurationSec: 10,
    criteria: [...BASE_CRITERIA, "Şapka başa tamamen oturmalı"],
  },
];

export const DEMO_VIDEOS = [
  { name: "bottle-drop.mp4", url: "/demo/bottle-drop.mp4", label: "Pet şişe düşürme" },
  { name: "tshirt-fold.mp4", url: "/demo/tshirt-fold.mp4", label: "Tişört katlama" },
  { name: "fridge-open.mp4", url: "/demo/fridge-open.mp4", label: "Buzdolabı açma" },
  { name: "phone-charge.mp4", url: "/demo/phone-charge.mp4", label: "Telefon şarj" },
  { name: "wear-hat.mp4", url: "/demo/wear-hat.mp4", label: "Şapka takma" },
];
