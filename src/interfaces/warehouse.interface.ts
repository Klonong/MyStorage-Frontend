/** Ground position in metres: [x, z]. The building's front face points toward +z. */
export type Vec2 = [number, number];

export type SiteType = "hub" | "dc" | "cross-dock";

export interface DockDoor {
  id: string;
  code: string;
  direction: "in" | "out";
  x: number;
}

export interface SiteLayout {
  building: { width: number; depth: number; height: number };
  doors: DockDoor[];
  /** Staging slots on the apron left of the building. */
  slots: { id: string; code: string; pos: Vec2 }[];
  roadZ: number;
  gateX: number;
  trees: Vec2[];
  chargers: { id: string; pos: Vec2 }[];
}

export interface Site {
  id: string;
  code: string;
  name: string;
  type: SiteType;
  address: string;
  capacityPallets: number;
  layout: SiteLayout;
}

export type TruckStatus = "en-route" | "at-gate" | "docking" | "unloading" | "loading" | "departing";

export interface Truck {
  id: string;
  carrier: string;
  driver: string;
  plate: string;
  direction: "inbound" | "outbound";
  status: TruckStatus;
  pos: Vec2;
  heading: number;
  path: Vec2[];
  /** Backing into the dock: the truck faces away from where it moves. */
  reversing: boolean;
  doorId: string;
  cargo: { done: number; total: number; kgPerPallet: number };
  shipmentId: string;
  speed: number;
  waitUntil: number;
  appointmentId: string | null;
  /** Cleared by the gatehouse; until then the truck waits at the barrier. */
  checkedIn: boolean;
  gateAt: number | null;
  dockedAt: number | null;
  /** Driver link location sharing; paused trucks show their last known position. */
  sharing: boolean;
  /** Set for transfer trucks: the one SKU they carry. */
  sku: string | null;
}

export type AppointmentStatus = "booked" | "en-route" | "on-site" | "done" | "missed";

/** A booked dock slot. `slotAt` is the sim time the truck should be at its door. */
export interface Appointment {
  id: string;
  doorId: string;
  direction: "inbound" | "outbound";
  carrier: string;
  pallets: number;
  slotAt: number;
  truckId: string | null;
  status: AppointmentStatus;
  dockedAt: number | null;
  late: boolean;
  /** Transfer legs override the usual supplier or customer and carry a single SKU. */
  transferId?: string;
  party?: string;
  place?: string;
  sku?: string;
}

export interface AlertRules {
  gateWait: { on: boolean; seconds: number };
  dockDwell: { on: boolean; seconds: number };
  lateArrival: { on: boolean; seconds: number };
  qcHold: { on: boolean; seconds: number };
  battery: { on: boolean; percent: number };
  lowStock: { on: boolean };
}

export interface GateEvent {
  id: string;
  truckId: string;
  carrier: string;
  kind: "in" | "out";
  at: number;
  door: string;
}

export type ForkliftStatus = "idle" | "to-pick" | "carrying" | "handling" | "to-charger" | "charging";

export interface Forklift {
  id: string;
  driver: string;
  model: string;
  status: ForkliftStatus;
  task: string;
  battery: number;
  movesToday: number;
  chargerId: string;
  home: Vec2;
  pos: Vec2;
  heading: number;
  path: Vec2[];
  speed: number;
  doorId: string;
  carrying: string | null;
  /** Trip in progress: which truck, and the slot it picks from or drops to. */
  trip: { truckId: string; slotId: string; next: "pick" | "drop" } | null;
  waitUntil: number;
}

export type PalletStatus = "received" | "staged" | "qc-hold" | "loading";

export interface Pallet {
  id: string;
  sku: string;
  item: string;
  category: string;
  qty: number;
  weightKg: number;
  lot: string;
  status: PalletStatus;
  slotId: string | null;
  receivedAt: number;
  /** Outbound truck this pallet goes straight onto, skipping storage. */
  crossDockFor: string | null;
}

export interface ShipmentStep {
  label: string;
  at: number | null;
  eta: number | null;
}

export interface Shipment {
  id: string;
  direction: "inbound" | "outbound";
  party: string;
  place: string;
  steps: ShipmentStep[];
}

export interface InventoryLine {
  sku: string;
  item: string;
  category: string;
  qty: number;
  lowStock: number;
}

export interface SiteAlert {
  id: string;
  severity: "info" | "warning" | "critical";
  message: string;
  at: number;
}

export interface CountLine {
  bin: string;
  sku: string;
  item: string;
  expected: number;
  counted: number | null;
  countedAt: number | null;
}

export interface CountTask {
  id: string;
  scope: "zone" | "class";
  /** Zone letter (A-D) or ABC class. */
  target: string;
  blind: boolean;
  status: "open" | "review" | "approved";
  lines: CountLine[];
  createdAt: number;
  approvedAt: number | null;
}

export interface ReturnCase {
  id: string;
  customer: string;
  sku: string;
  item: string;
  qty: number;
  reason: string;
  status: "expected" | "arrived" | "restocked" | "scrapped";
  expectedAt: number;
  arrivedAt: number | null;
  decidedAt: number | null;
  note: string;
}

/** A finished truck visit, kept for reports after its appointment is cleared. */
export interface Visit {
  truckId: string;
  carrier: string;
  direction: "inbound" | "outbound";
  slotAt: number;
  dockedAt: number;
  doneAt: number;
  late: boolean;
  pallets: number;
}

/** Site metrics every 20 s of the demo clock; counters are running totals. */
export interface Sample {
  t: number;
  palletsIn: number;
  palletsOut: number;
  stock: number;
  docksBusy: number;
  doors: number;
  forkliftsBusy: number;
  forklifts: number;
}

export interface Transfer {
  id: string;
  fromSiteId: string;
  toSiteId: string;
  sku: string;
  item: string;
  pallets: number;
  status: "requested" | "loading" | "in-transit" | "arriving" | "received";
  createdAt: number;
  outboundAppointmentId: string;
  inboundAppointmentId: string | null;
  updatedAt: number;
}

export interface LiveSite {
  site: Site;
  /** Simulation clock in seconds since the console opened. */
  t: number;
  trucks: Truck[];
  forklifts: Forklift[];
  pallets: Pallet[];
  shipments: Record<string, Shipment>;
  inventory: InventoryLine[];
  alerts: SiteAlert[];
  stats: {
    stockOnHand: number;
    stockDelta: number;
    onTimePct: number;
    outboundToday: number;
    putawaysToday: number;
    arrivalsToday: number;
    palletsIn: number;
    palletsOut: number;
    crossDocked: number;
    returnsRestocked: number;
    returnsScrapped: number;
  };
  counts: CountTask[];
  returns: ReturnCase[];
  visits: Visit[];
  history: Sample[];
  appointments: Appointment[];
  rules: AlertRules;
  /** When on, the guard checks trucks in on their own after a short wait. */
  autoCheckIn: boolean;
  gateLog: GateEvent[];
  /** Outbound shipments still on the road, and when they arrive. */
  deliveries: { shipmentId: string; at: number }[];
  /** Keys of rule alerts already raised, so each fires once per object. */
  alerted: string[];
  seq: number;
  /** Pallet labels printed by handheld scanners so far. */
  labels: number;
}

export type Selection =
  | { kind: "truck" | "forklift" | "pallet"; id: string }
  | null;
