// Mock sites for the operations console until the backend serves them.
// Only `import type` here: the simulator test loads this file in plain Node.
import type { PalletStatus, SiteType, TruckStatus } from "@/interfaces/warehouse.interface";

export interface CatalogItem {
  sku: string;
  item: string;
  category: string;
  qtyPerPallet: number;
  kgPerPallet: number;
}

export interface SiteSeed {
  id: string;
  code: string;
  name: string;
  type: SiteType;
  address: string;
  capacityPallets: number;
  building: { width: number; depth: number; height: number };
  doors: { code: string; direction: "in" | "out" }[];
  forklifts: { id: string; driver: string; model: string; battery: number; door: number }[];
  trucks: {
    id: string;
    carrier: string;
    driver: string;
    plate: string;
    door: number;
    direction: "inbound" | "outbound";
    status: TruckStatus;
    done: number;
    total: number;
    shipmentId: string;
    party: string;
    place: string;
  }[];
  pallets: { id: string; slot: number; sku: string; status: PalletStatus }[];
  inventory: { sku: string; qty: number; lowStock: number }[];
  stats: {
    stockOnHand: number;
    stockDelta: number;
    onTimePct: number;
    outboundToday: number;
    putawaysToday: number;
    arrivalsToday: number;
  };
}

export const catalog: CatalogItem[] = [
  { sku: "PPE-HLM-Y", item: "Safety Helmet", category: "PPE", qtyPerPallet: 82, kgPerPallet: 56 },
  { sku: "LGT-LED-60", item: "LED Panel 60×60", category: "Lighting", qtyPerPallet: 40, kgPerPallet: 180 },
  { sku: "FUR-CHR-01", item: "Office Chair", category: "Furniture", qtyPerPallet: 12, kgPerPallet: 210 },
  { sku: "PKG-BOX-M", item: "Cardboard Box (M)", category: "Packaging", qtyPerPallet: 250, kgPerPallet: 120 },
  { sku: "PPE-GLV-N", item: "Nitrile Gloves", category: "PPE", qtyPerPallet: 600, kgPerPallet: 140 },
];

/** Rotated through for trucks the simulator spawns after the seeded ones. */
export const carriers = ["WareTrack Freight", "Nordline Logistics", "Bluepeak", "Cargolink"];
export const drivers = ["Sam Chen", "Ada Larsen", "Leo Martins", "Priya Nair", "Tom Becker", "Mia Santoso", "Omar Haddad", "Lena Fischer"];
export const customers: [string, string][] = [
  ["Oakridge Market", "Philadelphia, PA"],
  ["Sunvale Grocers", "Providence, RI"],
  ["Harbor Supply", "Baltimore, MD"],
  ["Crestline Retail", "Hartford, CT"],
];
export const suppliers: [string, string][] = [
  ["Apex Lighting", "Allentown, PA"],
  ["SafeWorks PPE", "Albany, NY"],
  ["Corrupak", "Scranton, PA"],
  ["Seatline Furniture", "Camden, NJ"],
];

export const siteSeeds: SiteSeed[] = [
  {
    id: "wh-01",
    code: "WH-01",
    name: "Riverside Hub",
    type: "hub",
    address: "25 Harbor Rd, Riverside",
    capacityPallets: 1800,
    building: { width: 34, depth: 20, height: 9 },
    doors: [
      { code: "Bay 1", direction: "out" },
      { code: "Bay 2", direction: "in" },
    ],
    forklifts: [
      { id: "FL-01", driver: "Sam Hadded", model: "Toyota 8FBE18", battery: 75, door: 0 },
      { id: "FL-02", driver: "Rina Putri", model: "Linde E20", battery: 41, door: 1 },
    ],
    trucks: [
      { id: "TRK-2051", carrier: "WareTrack Freight", driver: "Dan Brooks", plate: "4KD-2051", door: 0, direction: "outbound", status: "loading", done: 2, total: 6, shipmentId: "SHP-78442", party: "Oakridge Market", place: "Philadelphia, PA" },
      { id: "TRK-2287", carrier: "Bluepeak", driver: "Priya Nair", plate: "7TR-2287", door: 1, direction: "inbound", status: "en-route", done: 0, total: 5, shipmentId: "SHP-78451", party: "SafeWorks PPE", place: "Albany, NY" },
    ],
    pallets: [
      { id: "PAL-1026", slot: 0, sku: "PPE-HLM-Y", status: "staged" },
      { id: "PAL-1027", slot: 1, sku: "PPE-GLV-N", status: "staged" },
      { id: "PAL-1028", slot: 2, sku: "LGT-LED-60", status: "staged" },
      { id: "PAL-1029", slot: 3, sku: "PKG-BOX-M", status: "qc-hold" },
      { id: "PAL-1030", slot: 4, sku: "FUR-CHR-01", status: "staged" },
      { id: "PAL-1031", slot: 6, sku: "PPE-HLM-Y", status: "staged" },
      { id: "PAL-1032", slot: 7, sku: "LGT-LED-60", status: "staged" },
    ],
    inventory: [
      { sku: "LGT-LED-60", qty: 1240, lowStock: 400 },
      { sku: "FUR-CHR-01", qty: 96, lowStock: 60 },
      { sku: "PKG-BOX-M", qty: 640, lowStock: 800 },
      { sku: "PPE-GLV-N", qty: 7200, lowStock: 2000 },
      { sku: "PPE-HLM-Y", qty: 1804, lowStock: 500 },
    ],
    stats: { stockOnHand: 1412, stockDelta: 15, onTimePct: 96.6, outboundToday: 9, putawaysToday: 22, arrivalsToday: 1 },
  },
  {
    id: "wh-02",
    code: "WH-02",
    name: "Northgate DC",
    type: "dc",
    address: "480 Northgate Blvd, Newark NJ",
    capacityPallets: 4200,
    building: { width: 48, depth: 24, height: 10 },
    doors: [
      { code: "Bay 1", direction: "in" },
      { code: "Bay 2", direction: "in" },
      { code: "Bay 3", direction: "out" },
      { code: "Bay 4", direction: "out" },
    ],
    forklifts: [
      { id: "FL-03", driver: "Marco Silva", model: "Toyota 8FBE18", battery: 76, door: 2 },
      { id: "FL-04", driver: "Hana Sato", model: "Linde E20", battery: 88, door: 0 },
      { id: "FL-05", driver: "Joel Kim", model: "Toyota 8FBE18", battery: 29, door: 1 },
      { id: "FL-06", driver: "Ines Moreau", model: "Jungheinrich EFG", battery: 93, door: 3 },
    ],
    trucks: [
      { id: "TRK-2127", carrier: "Bluepeak", driver: "Leo Martins", plate: "2BX-2127", door: 2, direction: "outbound", status: "loading", done: 4, total: 7, shipmentId: "SHP-78444", party: "Harbor Supply", place: "Baltimore, MD" },
      { id: "TRK-2104", carrier: "Nordline Logistics", driver: "Tom Becker", plate: "9NL-2104", door: 0, direction: "inbound", status: "unloading", done: 1, total: 6, shipmentId: "SHP-78439", party: "Apex Lighting", place: "Allentown, PA" },
      { id: "TRK-2133", carrier: "Cargolink", driver: "Mia Santoso", plate: "5CL-2133", door: 1, direction: "inbound", status: "en-route", done: 0, total: 5, shipmentId: "SHP-78453", party: "Corrupak", place: "Scranton, PA" },
    ],
    pallets: [
      { id: "PAL-2201", slot: 0, sku: "LGT-LED-60", status: "staged" },
      { id: "PAL-2202", slot: 1, sku: "LGT-LED-60", status: "staged" },
      { id: "PAL-2203", slot: 2, sku: "FUR-CHR-01", status: "staged" },
      { id: "PAL-2204", slot: 3, sku: "PPE-GLV-N", status: "staged" },
      { id: "PAL-2205", slot: 5, sku: "PKG-BOX-M", status: "qc-hold" },
      { id: "PAL-2206", slot: 6, sku: "PPE-HLM-Y", status: "staged" },
      { id: "PAL-2207", slot: 8, sku: "LGT-LED-60", status: "staged" },
      { id: "PAL-2208", slot: 9, sku: "PPE-GLV-N", status: "staged" },
    ],
    inventory: [
      { sku: "LGT-LED-60", qty: 1787, lowStock: 400 },
      { sku: "FUR-CHR-01", qty: 174, lowStock: 60 },
      { sku: "PKG-BOX-M", qty: 993, lowStock: 1200 },
      { sku: "PPE-GLV-N", qty: 5793, lowStock: 2000 },
      { sku: "PPE-HLM-Y", qty: 2210, lowStock: 500 },
    ],
    stats: { stockOnHand: 3310, stockDelta: 35, onTimePct: 98.2, outboundToday: 21, putawaysToday: 35, arrivalsToday: 2 },
  },
  {
    id: "wh-04",
    code: "WH-04",
    name: "Southfield Cross-Dock",
    type: "cross-dock",
    address: "9 Southfield Ave, Southfield",
    capacityPallets: 1600,
    building: { width: 60, depth: 20, height: 8 },
    doors: [
      { code: "In 1", direction: "in" },
      { code: "In 2", direction: "in" },
      { code: "In 3", direction: "in" },
      { code: "Out 1", direction: "out" },
      { code: "Out 2", direction: "out" },
      { code: "Out 3", direction: "out" },
    ],
    forklifts: [
      { id: "FL-07", driver: "Ravi Patel", model: "Toyota 8FBE18", battery: 64, door: 0 },
      { id: "FL-08", driver: "Grace Owusu", model: "Linde E20", battery: 82, door: 4 },
      { id: "FL-09", driver: "Ken Ito", model: "Toyota 8FBE18", battery: 55, door: 2 },
      { id: "FL-10", driver: "Sara Lind", model: "Jungheinrich EFG", battery: 91, door: 1 },
      { id: "FL-11", driver: "Ali Rahman", model: "Linde E20", battery: 23, door: 5 },
    ],
    trucks: [
      { id: "TRK-2205", carrier: "WareTrack Freight", driver: "Sam Chen", plate: "2BY-5648", door: 0, direction: "inbound", status: "unloading", done: 2, total: 6, shipmentId: "SHP-78450", party: "Oakridge Market", place: "Philadelphia, PA" },
      { id: "TRK-2229", carrier: "Nordline Logistics", driver: "Omar Haddad", plate: "6NL-2229", door: 4, direction: "outbound", status: "loading", done: 3, total: 6, shipmentId: "SHP-78452", party: "Sunvale Grocers", place: "Providence, RI" },
      { id: "TRK-2307", carrier: "Nordline Logistics", driver: "Ada Larsen", plate: "EKT-2697", door: 2, direction: "inbound", status: "docking", done: 0, total: 8, shipmentId: "SHP-78456", party: "Sunvale Grocers", place: "Providence, RI" },
      { id: "TRK-2481", carrier: "Cargolink", driver: "Lena Fischer", plate: "3CG-2481", door: 1, direction: "inbound", status: "en-route", done: 0, total: 5, shipmentId: "SHP-78458", party: "Corrupak", place: "Scranton, PA" },
    ],
    pallets: [
      { id: "PAL-4101", slot: 0, sku: "PKG-BOX-M", status: "staged" },
      { id: "PAL-4102", slot: 1, sku: "PPE-GLV-N", status: "staged" },
      { id: "PAL-4103", slot: 3, sku: "LGT-LED-60", status: "staged" },
      { id: "PAL-4104", slot: 4, sku: "PPE-HLM-Y", status: "qc-hold" },
      { id: "PAL-4105", slot: 6, sku: "FUR-CHR-01", status: "staged" },
    ],
    inventory: [
      { sku: "LGT-LED-60", qty: 420, lowStock: 400 },
      { sku: "FUR-CHR-01", qty: 48, lowStock: 60 },
      { sku: "PKG-BOX-M", qty: 1500, lowStock: 1200 },
      { sku: "PPE-GLV-N", qty: 3600, lowStock: 2000 },
      { sku: "PPE-HLM-Y", qty: 656, lowStock: 500 },
    ],
    stats: { stockOnHand: 610, stockDelta: 20, onTimePct: 96.2, outboundToday: 14, putawaysToday: 0, arrivalsToday: 2 },
  },
];
