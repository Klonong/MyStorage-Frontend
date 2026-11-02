// Stand-in for the backend's live feed: moves trucks, forklifts and pallets
// through the receive / putaway / load flow. Pure functions over plain data,
// so a socket feed can replace `tick` later without touching the UI.
// Only `import type` here: the test runs this file in plain Node.
import type { CatalogItem, SiteSeed } from "@/data/sites";
import type {
  AlertRules,
  Appointment,
  CountTask,
  ReturnCase,
  Sample,
  Transfer,
  Visit,
  DockDoor,
  Forklift,
  LiveSite,
  Pallet,
  Shipment,
  SiteAlert,
  SiteLayout,
  Truck,
  Vec2,
} from "@/interfaces/warehouse.interface";

export interface SimData {
  catalog: CatalogItem[];
  carriers: string[];
  drivers: string[];
  customers: [string, string][];
  suppliers: [string, string][];
}

const TRUCK_SPEED = 8;
const REVERSE_SPEED = 2.2;
const FORKLIFT_SPEED = 3.2;
const HANDLING = 1.5;
const PUTAWAY_AFTER = 25;
/** Received pallets waiting in the yard before forklifts put away ahead of truck work. */
const YARD_BACKLOG = 4;
const QC_HOLD = 60;
/** Seconds the guard waits before checking a truck in on their own (when auto check-in is on). */
const AUTO_CHECKIN_AFTER = 6;
/** Trucks leave for an appointment this long before the slot: road, gate and reversing take about that. */
const LEAD = 50;
/** Where trucks join the street, in metres before the gate. */
const SPAWN_BACK = 200;
const APPOINTMENT_GAP = 85;
export const DELIVERY_AFTER = 90;
/** How long a booked slot holds its door on the schedule. */
export const SLOT_WINDOW = 70;

// ponytail: thresholds run on the demo clock, which compresses a shift into minutes; real values come with the backend.
export const defaultRules: AlertRules = {
  gateWait: { on: true, seconds: 30 },
  dockDwell: { on: true, seconds: 150 },
  lateArrival: { on: true, seconds: 20 },
  qcHold: { on: true, seconds: 55 },
  battery: { on: true, percent: 25 },
  lowStock: { on: true },
};

// ---------- layout geometry ----------

export function buildLayout(seed: SiteSeed): SiteLayout {
  const { width: w, depth: d } = seed.building;
  const n = seed.doors.length;
  const roadZ = d / 2 + 30;
  return {
    building: seed.building,
    doors: seed.doors.map((door, i) => ({
      id: `${seed.id}-door-${i}`,
      code: door.code,
      direction: door.direction,
      x: -w / 2 + (i + 0.5) * (w / n),
    })),
    slots: Array.from({ length: 10 }, (_, i) => ({
      id: `${seed.id}-slot-${i}`,
      code: `S${String(i + 1).padStart(2, "0")}`,
      pos: [-w / 2 - 6 - (i % 5) * 2.6, d / 2 + (i < 5 ? 8 : 5)] as Vec2,
    })),
    roadZ,
    gateX: -w / 2 - 34,
    trees: [
      [-w / 2 - 24, -d / 2 - 6],
      [-w / 2 - 14, -d / 2 - 10],
      [w / 2 + 8, -d / 2 + 2],
      [w / 2 + 12, d / 2 + 6],
      [w / 2 + 7, d / 2 + 15],
      [-w / 2 - 22, d / 2 + 16],
      [-w / 4, roadZ + 12],
      [w / 4, roadZ + 13],
    ],
    chargers: seed.forklifts.map((_, i) => ({ id: `C${i + 1}`, pos: [-w / 2 - 1.4, -d / 2 + 2 + i * 2.6] as Vec2 })),
  };
}

export const laneZ = (l: SiteLayout) => l.building.depth / 2 + 15;
/** Box trucks are ~10.4 m long; parked so the rear sits at the dock door. */
export const dockedPos = (l: SiteLayout, door: DockDoor): Vec2 => [door.x, l.building.depth / 2 + 5.9];
/** Where a forklift stands to work the rear of a docked trailer. */
export const dockPoint = (l: SiteLayout, door: DockDoor): Vec2 => [door.x - 2.6, l.building.depth / 2 + 1.6];
export const entrance = (l: SiteLayout): Vec2 => [-l.building.width / 2 - 1.2, l.building.depth / 2 - 3];
const homeOf = (l: SiteLayout, chargerId: string): Vec2 => {
  const c = l.chargers.find((ch) => ch.id === chargerId) ?? l.chargers[0];
  return [c.pos[0] - 2.2, c.pos[1]];
};

/** Forklifts travel on the apron lane in front of the docks, never through trailers. */
function route(l: SiteLayout, from: Vec2, to: Vec2): Vec2[] {
  const lz = laneZ(l);
  return [[from[0], lz], [to[0], lz], to];
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(b[0] - a[0], b[1] - a[1]);

function turnToward(heading: number, target: number, maxStep: number) {
  const diff = Math.atan2(Math.sin(target - heading), Math.cos(target - heading));
  return heading + Math.max(-maxStep, Math.min(maxStep, diff));
}

/** Moves along the remaining path; returns true once the last waypoint is reached. */
function follow(o: { pos: Vec2; heading: number; path: Vec2[] }, step: number, turn: number, reverse = false) {
  while (step > 0 && o.path.length) {
    const target = o.path[0];
    const gap = dist(o.pos, target);
    if (gap > 0.001) {
      const dx = target[0] - o.pos[0];
      const dz = target[1] - o.pos[1];
      const facing = reverse ? Math.atan2(-dx, -dz) : Math.atan2(dx, dz);
      o.heading = turnToward(o.heading, facing, turn);
    }
    if (gap <= step) {
      o.pos = [target[0], target[1]];
      o.path = o.path.slice(1);
      step -= gap;
    } else {
      o.pos = [o.pos[0] + ((target[0] - o.pos[0]) / gap) * step, o.pos[1] + ((target[1] - o.pos[1]) / gap) * step];
      step = 0;
    }
  }
  return o.path.length === 0;
}

// ---------- initial state ----------

function shipmentFor(
  id: string,
  direction: "inbound" | "outbound",
  party: string,
  place: string,
  t: number,
  stage: number,
): Shipment {
  const labels =
    direction === "outbound"
      ? ["Order confirmed", "Picked", "Loading", "In transit", "Delivered"]
      : ["Dispatched", "In transit", "At gate", "Unloading", "Received"];
  // Steps before `stage` are done (spaced 12 min apart); the rest get ETAs.
  const steps = labels.map((label, i) =>
    i < stage
      ? { label, at: t - (stage - i) * 720, eta: null }
      : { label, at: null, eta: t + (i - stage + 1) * (i >= 3 ? 1500 : 240) },
  );
  return { id, direction, party, place, steps };
}

function newPallet(live: LiveSite, item: CatalogItem, slotId: string | null): Pallet {
  const n = Number(live.site.code.slice(3));
  live.seq += 1;
  return {
    id: `PAL-${n * 1000 + 500 + live.seq}`,
    sku: item.sku,
    item: item.item,
    category: item.category,
    qty: item.qtyPerPallet,
    weightKg: item.kgPerPallet,
    lot: `L${2500 + n}-${String(100 + ((live.seq * 37) % 900))}`,
    status: "received",
    slotId,
    receivedAt: live.t,
    crossDockFor: null,
  };
}

const RETURN_REASONS = ["Damaged in transit", "Wrong item shipped", "Customer changed mind", "Defective on arrival"];

/**
 * Half an hour of believable past activity, so reports have something to show
 * the moment the console opens. Deterministic: the same site always gets the same past.
 */
function seedPast(seed: SiteSeed, layout: SiteLayout, data: SimData) {
  const n = Number(seed.code.slice(3));
  const steps = Array.from({ length: 90 }, (_, i) => 90 - i);
  const ins = steps.map((k): number => (Math.sin(k / 6 + n) > -0.2 ? (k % 3 === 0 ? 2 : 1) : 0));
  const outs = steps.map((k): number => (Math.cos(k / 5 + n) > -0.1 ? (k % 4 === 0 ? 2 : 1) : 0));
  const totalIn = ins.reduce((a, b) => a + b, 0);
  const totalOut = outs.reduce((a, b) => a + b, 0);
  let pin = 0;
  let pout = 0;
  const history: Sample[] = steps.map((k, i) => {
    pin += ins[i];
    pout += outs[i];
    const doors = layout.doors.length;
    const forklifts = seed.forklifts.length;
    return {
      t: -20 * k,
      palletsIn: pin,
      palletsOut: pout,
      stock: seed.stats.stockOnHand - (totalIn - pin) + (totalOut - pout),
      docksBusy: Math.max(0, Math.min(doors, Math.round(doors * (0.5 + 0.4 * Math.sin(k / 8 + n))))),
      doors,
      forkliftsBusy: Math.max(0, Math.min(forklifts, Math.round(forklifts * (0.55 + 0.35 * Math.cos(k / 7 + n))))),
      forklifts,
    };
  });
  const visits: Visit[] = Array.from({ length: 14 }, (_, i): Visit => {
    const late = (i + n) % 4 === 1;
    const dockedAt = -1750 + i * 120;
    return {
      truckId: `TRK-${2400 + n * 20 + i}`,
      carrier: data.carriers[(i + n) % data.carriers.length],
      direction: i % 2 ? "outbound" : "inbound",
      slotAt: dockedAt - (late ? 30 + ((i * 13) % 40) : (i * 7) % 15),
      dockedAt,
      doneAt: dockedAt + 110 + ((i * 37 + n * 11) % 80),
      late,
      pallets: 4 + (i % 4),
    };
  }).reverse();
  const returns: ReturnCase[] = [0, 1, 2].map((i): ReturnCase => {
    const item = data.catalog[(i + n) % data.catalog.length];
    return {
      id: `RMA-${n}${String(501 + i)}`,
      customer: data.customers[(i + n) % data.customers.length][0],
      sku: item.sku,
      item: item.item,
      qty: Math.max(1, Math.round(item.qtyPerPallet / (4 + i))),
      reason: RETURN_REASONS[(i + n) % RETURN_REASONS.length],
      status: i === 0 ? "arrived" : "expected",
      expectedAt: i === 0 ? -120 : 40 + i * 70,
      arrivedAt: i === 0 ? -60 : null,
      decidedAt: null,
      note: "",
    };
  });
  return { history, visits, returns, palletsIn: pin, palletsOut: pout };
}

export function createLiveSite(seed: SiteSeed, data: SimData): LiveSite {
  const layout = buildLayout(seed);
  const { roadZ, gateX } = layout;
  const doorAt = (i: number) => layout.doors[i];
  const item = (sku: string) => data.catalog.find((c) => c.sku === sku) ?? data.catalog[0];
  const shipments: Record<string, Shipment> = {};
  const appointments: Appointment[] = [];
  const n = Number(seed.code.slice(3));

  const trucks: Truck[] = seed.trucks.map((s, i) => {
    const door = doorAt(s.door);
    const base = {
      id: s.id,
      carrier: s.carrier,
      driver: s.driver,
      plate: s.plate,
      direction: s.direction,
      status: s.status,
      doorId: door.id,
      cargo: { done: s.done, total: s.total, kgPerPallet: 180 },
      shipmentId: s.shipmentId,
      reversing: false,
      waitUntil: 0,
      appointmentId: `APT-${n}${String(i + 1).padStart(3, "0")}`,
      checkedIn: s.status !== "en-route" && s.status !== "at-gate",
      gateAt: s.status === "at-gate" ? 0 : null,
      dockedAt: s.status === "loading" || s.status === "unloading" ? -90 : null,
      sharing: true,
      sku: null,
    };
    const stage = { "en-route": 1, "at-gate": 2, docking: 2, unloading: 3, loading: 2, departing: 3 }[s.status];
    shipments[s.shipmentId] = shipmentFor(s.shipmentId, s.direction, s.party, s.place, 0, stage);
    const docked = s.status === "loading" || s.status === "unloading";
    appointments.push({
      id: base.appointmentId,
      doorId: door.id,
      direction: s.direction,
      carrier: s.carrier,
      pallets: s.total,
      slotAt: docked ? -100 : s.status === "en-route" ? 45 : 15,
      truckId: s.id,
      status: s.status === "en-route" ? "en-route" : "on-site",
      dockedAt: docked ? -90 : null,
      late: false,
    });
    if (s.status === "en-route") {
      return { ...base, pos: [gateX - 50 - i * 25, roadZ + 2] as Vec2, heading: Math.PI / 2, path: [[gateX, roadZ + 2] as Vec2], speed: TRUCK_SPEED };
    }
    if (s.status === "docking") {
      return { ...base, reversing: true, pos: [door.x + 1.5, roadZ - 9] as Vec2, heading: 0.1, path: [dockedPos(layout, door)], speed: REVERSE_SPEED };
    }
    if (s.status === "at-gate") {
      return { ...base, pos: [gateX, roadZ + 2] as Vec2, heading: Math.PI / 2, path: [], speed: 0 };
    }
    return { ...base, pos: dockedPos(layout, door), heading: 0, path: [], speed: 0 };
  });

  const forklifts: Forklift[] = seed.forklifts.map((f, i) => {
    const chargerId = layout.chargers[i].id;
    const home = homeOf(layout, chargerId);
    return {
      id: f.id,
      driver: f.driver,
      model: f.model,
      status: "idle",
      task: "Idle",
      battery: f.battery,
      movesToday: 12 + ((i * 7) % 20),
      chargerId,
      home,
      pos: home,
      heading: Math.PI / 2,
      path: [],
      speed: 0,
      doorId: doorAt(f.door).id,
      carrying: null,
      trip: null,
      waitUntil: 0,
    };
  });

  const pallets: Pallet[] = seed.pallets.map((p, i) => {
    const it = item(p.sku);
    return {
      id: p.id,
      sku: it.sku,
      item: it.item,
      category: it.category,
      qty: it.qtyPerPallet,
      weightKg: it.kgPerPallet,
      lot: `L2501-${870 + i * 13}`,
      status: p.status,
      slotId: layout.slots[p.slot].id,
      receivedAt: p.status === "qc-hold" ? 0 : -900 - i * 240,
      crossDockFor: null,
    };
  });

  const past = seedPast(seed, layout, data);

  // Two booked slots per door ahead of time; doors already working start later.
  const busy = new Set(trucks.map((t) => t.doorId));
  layout.doors.forEach((door, i) => {
    const first = (busy.has(door.id) ? 150 : 55) + i * 12;
    for (const slotAt of [first, first + APPOINTMENT_GAP]) {
      appointments.push({
        id: `APT-${n}${String(appointments.length + 1).padStart(3, "0")}`,
        doorId: door.id,
        direction: door.direction === "in" ? "inbound" : "outbound",
        carrier: data.carriers[(appointments.length * 3 + i) % data.carriers.length],
        pallets: 4 + ((appointments.length + i) % 4),
        slotAt,
        truckId: null,
        status: "booked",
        dockedAt: null,
        late: false,
      });
    }
  });

  return {
    site: { id: seed.id, code: seed.code, name: seed.name, type: seed.type, address: seed.address, capacityPallets: seed.capacityPallets, layout },
    t: 0,
    trucks,
    forklifts,
    pallets,
    shipments,
    inventory: seed.inventory.map((line) => ({ ...line, item: item(line.sku).item, category: item(line.sku).category })),
    alerts: [],
    stats: { ...seed.stats, palletsIn: past.palletsIn, palletsOut: past.palletsOut, crossDocked: 0, returnsRestocked: 0, returnsScrapped: 0 },
    counts: [],
    returns: past.returns,
    visits: past.visits,
    history: past.history,
    appointments,
    rules: defaultRules,
    autoCheckIn: true,
    gateLog: [],
    deliveries: [],
    alerted: [],
    seq: appointments.length,
    labels: 0,
  };
}

// ---------- tick ----------

function alert(live: LiveSite, severity: SiteAlert["severity"], message: string) {
  live.seq += 1;
  live.alerts = [{ id: `${live.site.id}-a${live.seq}`, severity, message, at: live.t }, ...live.alerts].slice(0, 20);
}

/** Rule alerts fire once per rule and object, however long the condition lasts. */
function alertOnce(live: LiveSite, key: string, severity: SiteAlert["severity"], message: string) {
  if (live.alerted.includes(key)) return;
  live.alerted = [key, ...live.alerted].slice(0, 200);
  alert(live, severity, message);
}

/** Marks a shipment step done now; any earlier step still open is closed too. */
function stamp(live: LiveSite, shipmentId: string, label: string) {
  const s = live.shipments[shipmentId];
  const index = s?.steps.findIndex((st) => st.label === label) ?? -1;
  if (!s || index < 0) return;
  live.shipments = {
    ...live.shipments,
    [shipmentId]: {
      ...s,
      steps: s.steps.map((st, i) => (i === index ? { ...st, at: live.t, eta: null } : i < index && st.at === null ? { ...st, at: Math.min(st.eta ?? live.t, live.t), eta: null } : st)),
    },
  };
}

const patchAppointment = (live: LiveSite, id: string | null, patch: Partial<Appointment>) => {
  live.appointments = live.appointments.map((a) => (a.id === id ? { ...a, ...patch } : a));
};

function logGate(live: LiveSite, truck: Truck, kind: "in" | "out") {
  live.seq += 1;
  const door = live.site.layout.doors.find((d) => d.id === truck.doorId)?.code ?? "";
  live.gateLog = [{ id: `${live.site.id}-g${live.seq}`, truckId: truck.id, carrier: truck.carrier, kind, at: live.t, door }, ...live.gateLog].slice(0, 20);
}

function checkInTruck(live: LiveSite, truck: Truck, byGuard: boolean) {
  const layout = live.site.layout;
  const door = layout.doors.find((d) => d.id === truck.doorId)!;
  truck.checkedIn = true;
  truck.status = "docking";
  truck.path = [[door.x + 9, layout.roadZ + 2]];
  logGate(live, truck, "in");
  alert(live, "info", `${truck.id} checked in${byGuard ? " by the gatehouse" : ""}, heading to ${door.code}`);
}

function adjustStock(live: LiveSite, sku: string, pallets: number, data: SimData, units?: number) {
  const item = data.catalog.find((c) => c.sku === sku);
  if (!item) return;
  live.stats = {
    ...live.stats,
    stockOnHand: live.stats.stockOnHand + pallets,
    stockDelta: live.stats.stockDelta + pallets,
    palletsIn: live.stats.palletsIn + Math.max(0, pallets),
    palletsOut: live.stats.palletsOut + Math.max(0, -pallets),
  };
  live.inventory = live.inventory.map((line) => {
    if (line.sku !== sku) return line;
    const qty = Math.max(0, line.qty + (units ?? pallets * item.qtyPerPallet));
    if (live.rules.lowStock.on && line.qty >= line.lowStock && qty < line.lowStock) {
      alert(live, "warning", `${line.item} below low-stock threshold (${qty.toLocaleString("en-US")} / ${line.lowStock.toLocaleString("en-US")})`);
    }
    return { ...line, qty };
  });
}

/** Sends the truck for a booked appointment: it joins the street well before the gate. */
function spawnTruck(live: LiveSite, appt: Appointment, data: SimData): Truck {
  const { roadZ, gateX } = live.site.layout;
  const n = Number(live.site.code.slice(3));
  live.seq += 1;
  const k = live.seq;
  const [party, place] = appt.party && appt.place ? [appt.party, appt.place] : (appt.direction === "inbound" ? data.suppliers : data.customers)[k % 4];
  const shipmentId = `SHP-${78460 + n * 100 + k}`;
  const id = `TRK-${2500 + n * 100 + k}`;
  live.shipments = { ...live.shipments, [shipmentId]: shipmentFor(shipmentId, appt.direction, party, place, live.t, appt.direction === "inbound" ? 2 : 1) };
  patchAppointment(live, appt.id, { truckId: id, status: "en-route" });
  return {
    id,
    carrier: appt.carrier,
    driver: data.drivers[k % data.drivers.length],
    plate: `${(k % 9) + 1}${String.fromCharCode(65 + (k % 26))}${String.fromCharCode(75 + (k % 12))}-${2500 + n * 100 + k}`,
    direction: appt.direction,
    status: "en-route",
    pos: [gateX - SPAWN_BACK, roadZ + 2],
    heading: Math.PI / 2,
    path: [[gateX, roadZ + 2]],
    reversing: false,
    doorId: appt.doorId,
    cargo: { done: 0, total: appt.pallets, kgPerPallet: 180 },
    shipmentId,
    speed: TRUCK_SPEED,
    waitUntil: 0,
    appointmentId: appt.id,
    checkedIn: false,
    gateAt: null,
    dockedAt: null,
    sharing: true,
    sku: appt.sku ?? null,
  };
}

function stepTruck(live: LiveSite, truck: Truck, dt: number): boolean {
  const layout = live.site.layout;
  const door = layout.doors.find((d) => d.id === truck.doorId)!;
  const { roadZ } = layout;
  if (truck.waitUntil > live.t) {
    truck.speed = 0;
    return true;
  }
  if (truck.path.length) {
    const speed = truck.reversing ? REVERSE_SPEED : TRUCK_SPEED;
    truck.speed = speed;
    if (!follow(truck, speed * dt, 1.8 * dt, truck.reversing)) return true;
  }
  truck.speed = 0;
  const rules = live.rules;
  switch (truck.status) {
    case "en-route":
      truck.status = "at-gate";
      truck.gateAt = live.t;
      patchAppointment(live, truck.appointmentId, { status: "on-site" });
      stamp(live, truck.shipmentId, "At gate");
      alert(live, "info", `${truck.id} at the gate for ${door.code}`);
      break;
    case "at-gate": {
      const waited = live.t - (truck.gateAt ?? live.t);
      if (live.autoCheckIn && waited >= AUTO_CHECKIN_AFTER) checkInTruck(live, truck, true);
      else if (rules.gateWait.on && waited > rules.gateWait.seconds) alertOnce(live, `gate:${truck.id}`, "warning", `${truck.id} waiting at the gate for ${Math.round(waited)} s`);
      break;
    }
    case "docking":
      if (!truck.reversing) {
        truck.reversing = true;
        truck.path = [[door.x + 1.5, roadZ - 9], dockedPos(layout, door)];
      } else {
        truck.reversing = false;
        truck.status = truck.direction === "inbound" ? "unloading" : "loading";
        truck.dockedAt = live.t;
        stamp(live, truck.shipmentId, truck.direction === "inbound" ? "Unloading" : "Loading");
        const appt = live.appointments.find((a) => a.id === truck.appointmentId);
        const lateBy = appt ? live.t - appt.slotAt : 0;
        const late = rules.lateArrival.on && lateBy > rules.lateArrival.seconds;
        patchAppointment(live, truck.appointmentId, { status: "on-site", dockedAt: live.t, late });
        if (late) alertOnce(live, `late:${truck.id}`, "warning", `${truck.id} docked ${Math.round(lateBy)} s after its slot at ${door.code}`);
      }
      break;
    case "unloading":
    case "loading":
      if (rules.dockDwell.on && truck.dockedAt !== null && live.t - truck.dockedAt > rules.dockDwell.seconds) {
        alertOnce(live, `dwell:${truck.id}`, "warning", `${truck.id} has been at ${door.code} longer than ${rules.dockDwell.seconds} s`);
      }
      if (truck.cargo.done >= truck.cargo.total) {
        truck.status = "departing";
        truck.path = [[door.x, roadZ - 8], [door.x + 7, roadZ + 2], [layout.building.width / 2 + 90, roadZ + 2]];
        const appt = live.appointments.find((a) => a.id === truck.appointmentId);
        live.visits = [
          { truckId: truck.id, carrier: truck.carrier, direction: truck.direction, slotAt: appt?.slotAt ?? truck.dockedAt ?? live.t, dockedAt: truck.dockedAt ?? live.t, doneAt: live.t, late: appt?.late ?? false, pallets: truck.cargo.total },
          ...live.visits,
        ].slice(0, 200);
        patchAppointment(live, truck.appointmentId, { status: "done" });
        if (truck.direction === "inbound") {
          stamp(live, truck.shipmentId, "Received");
          live.stats = { ...live.stats, arrivalsToday: live.stats.arrivalsToday + 1 };
        } else {
          stamp(live, truck.shipmentId, "In transit");
          live.deliveries = [...live.deliveries, { shipmentId: truck.shipmentId, at: live.t + DELIVERY_AFTER }];
          live.stats = { ...live.stats, outboundToday: live.stats.outboundToday + 1 };
        }
      }
      break;
    case "departing":
      logGate(live, truck, "out");
      return false;
  }
  return true;
}

/** Keeps each door fed from its appointments and two slots booked ahead. */
function runAppointments(live: LiveSite, data: SimData) {
  const busy = new Set(live.trucks.filter((t) => t.status !== "departing").map((t) => t.doorId));
  for (const door of live.site.layout.doors) {
    const booked = live.appointments.filter((a) => a.doorId === door.id && a.status === "booked").sort((a, b) => a.slotAt - b.slotAt);
    const next = booked[0];
    if (next && !busy.has(door.id) && live.t >= next.slotAt - LEAD) {
      live.trucks = [...live.trucks, spawnTruck(live, next, data)];
      busy.add(door.id);
    }
    if (live.appointments.filter((a) => a.doorId === door.id && a.status === "booked").length < 2) {
      const last = Math.max(live.t, ...live.appointments.filter((a) => a.doorId === door.id).map((a) => a.slotAt));
      live.seq += 1;
      live.appointments = [
        ...live.appointments,
        {
          id: `APT-${Number(live.site.code.slice(3))}${String(live.seq).padStart(3, "0")}`,
          doorId: door.id,
          direction: door.direction === "in" ? "inbound" : "outbound",
          carrier: data.carriers[live.seq % data.carriers.length],
          pallets: 4 + (live.seq % 4),
          slotAt: last + APPOINTMENT_GAP + (live.seq % 3) * 15,
          truckId: null,
          status: "booked",
          dockedAt: null,
          late: false,
        },
      ];
    }
  }
  // Keep the board readable: drop finished slots older than ten minutes.
  live.appointments = live.appointments.filter((a) => !(a.status === "done" && live.t - a.slotAt > 600));
}

function claimed(live: LiveSite, truckId: string) {
  return live.forklifts.filter((f) => f.trip?.truckId === truckId && (f.trip.next === "pick" || truckIs(live, truckId, "loading"))).length;
}
const truckIs = (live: LiveSite, id: string, status: Truck["status"]) => live.trucks.some((t) => t.id === id && t.status === status);

function freeSlot(live: LiveSite) {
  const taken = new Set([
    ...live.pallets.map((p) => p.slotId),
    ...live.forklifts.map((f) => (f.trip?.next === "drop" || truckIs(live, f.trip?.truckId ?? "", "unloading") ? f.trip?.slotId : null)),
  ]);
  return live.site.layout.slots.find((s) => !taken.has(s.id));
}

function startTrip(live: LiveSite, f: Forklift) {
  const layout = live.site.layout;
  const reserved = new Set(live.forklifts.map((x) => x.trip?.slotId));
  const doorCode = (id: string) => layout.doors.find((d) => d.id === id)?.code ?? "";
  const ready = live.pallets.filter((p) => p.slotId && p.status === "received" && live.t - p.receivedAt > PUTAWAY_AFTER && !reserved.has(p.slotId));
  const putaway = () => {
    const slot = layout.slots.find((s) => s.id === ready[0].slotId)!;
    f.trip = { truckId: "putaway", slotId: slot.id, next: "pick" };
    f.path = route(layout, f.pos, slot.pos);
    f.task = `Putaway ${ready[0].id} to storage`;
  };
  // A filling yard blocks receiving, so it is cleared before more truck work.
  if (ready.length >= YARD_BACKLOG && live.site.type !== "cross-dock") return putaway();

  // Own door first, then help at any other door with work left.
  const working = live.trucks
    .filter((t) => (t.status === "unloading" || t.status === "loading") && t.cargo.done + claimed(live, t.id) < t.cargo.total)
    .sort((a, b) => Number(b.doorId === f.doorId) - Number(a.doorId === f.doorId));

  for (const truck of working) {
    const door = layout.doors.find((d) => d.id === truck.doorId)!;
    if (truck.status === "unloading") {
      const slot = freeSlot(live);
      if (!slot) continue;
      f.trip = { truckId: truck.id, slotId: slot.id, next: "pick" };
      f.path = route(layout, f.pos, dockPoint(layout, door));
      f.task = `Unloading ${truck.id} at ${door.code}`;
      return;
    }
    const elsewhere = (p: Pallet) => p.crossDockFor !== null && p.crossDockFor !== truck.id && live.trucks.some((t) => t.id === p.crossDockFor && t.status !== "departing");
    const candidates = truck.sku ? [] : live.pallets.filter((p) => p.slotId && p.status !== "qc-hold" && !reserved.has(p.slotId) && !elsewhere(p));
    const pallet = candidates.find((p) => p.crossDockFor === truck.id) ?? candidates[0];
    const slot = pallet && layout.slots.find((s) => s.id === pallet.slotId);
    f.trip = { truckId: truck.id, slotId: slot ? slot.id : "storage", next: "pick" };
    f.path = route(layout, f.pos, slot ? slot.pos : entrance(layout));
    f.task = `Loading ${truck.id} at ${doorCode(truck.doorId)}`;
    return;
  }

  // A cross-dock never stores: everything in its yard waits for an outbound truck.
  if (ready.length && live.site.type !== "cross-dock") putaway();
}

function arrive(live: LiveSite, f: Forklift, data: SimData) {
  const layout = live.site.layout;
  const trip = f.trip!;
  const truck = live.trucks.find((t) => t.id === trip.truckId);
  const door = truck && layout.doors.find((d) => d.id === truck.doorId);
  const slot = layout.slots.find((s) => s.id === trip.slotId);
  f.waitUntil = live.t + HANDLING;

  if (trip.next === "pick") {
    let pallet: Pallet | undefined;
    if (trip.truckId === "putaway" || (truck?.status === "loading" && slot)) {
      pallet = live.pallets.find((p) => p.slotId === trip.slotId);
      if (pallet) pallet = { ...pallet, slotId: null, status: trip.truckId === "putaway" ? pallet.status : "loading" };
    } else if (truck?.status === "unloading") {
      pallet = newPallet(live, data.catalog.find((c) => c.sku === truck.sku) ?? data.catalog[live.seq % data.catalog.length], null);
      truck.cargo = { ...truck.cargo, done: truck.cargo.done + 1, kgPerPallet: pallet.weightKg };
    } else if (truck?.status === "loading") {
      const line = live.inventory.find((l) => l.sku === truck.sku) ?? [...live.inventory].sort((a, b) => b.qty - a.qty)[0];
      pallet = { ...newPallet(live, data.catalog.find((c) => c.sku === line.sku) ?? data.catalog[0], null), status: "loading" };
    }
    if (!pallet) {
      f.trip = null;
      return;
    }
    live.pallets = [...live.pallets.filter((p) => p.id !== pallet!.id), pallet];
    f.carrying = pallet.id;
    f.trip = { ...trip, next: "drop" };
    f.path = route(layout, f.pos, trip.truckId === "putaway" ? entrance(layout) : truck?.status === "unloading" && slot ? slot.pos : door ? dockPoint(layout, door) : f.home);
    return;
  }

  const pallet = live.pallets.find((p) => p.id === f.carrying);
  f.carrying = null;
  f.trip = null;
  f.movesToday += 1;
  if (!pallet) return;
  if (trip.truckId === "putaway") {
    live.pallets = live.pallets.filter((p) => p.id !== pallet.id);
    live.stats = { ...live.stats, putawaysToday: live.stats.putawaysToday + 1 };
  } else if (pallet.status === "loading") {
    live.pallets = live.pallets.filter((p) => p.id !== pallet.id);
    if (truck) truck.cargo = { ...truck.cargo, done: truck.cargo.done + 1, kgPerPallet: pallet.weightKg };
    if (pallet.crossDockFor) live.stats = { ...live.stats, crossDocked: live.stats.crossDocked + 1 };
    adjustStock(live, pallet.sku, -1, data);
  } else {
    const hold = live.seq % 6 === 0;
    const crossDock = !hold && live.site.type === "cross-dock";
    const outbound = crossDock ? live.trucks.find((t) => t.direction === "outbound" && t.status !== "departing" && t.cargo.done < t.cargo.total) : undefined;
    live.pallets = live.pallets.map((p) =>
      p.id === pallet.id ? { ...p, slotId: trip.slotId, status: hold ? "qc-hold" : crossDock ? "staged" : "received", receivedAt: live.t, crossDockFor: outbound?.id ?? null } : p,
    );
    adjustStock(live, pallet.sku, 1, data);
    if (hold) alert(live, "warning", `${pallet.id} (${pallet.item}) put on QC hold at ${slot?.code}`);
  }
}

function stepForklift(live: LiveSite, f: Forklift, dt: number, data: SimData) {
  const working = f.status !== "idle" && f.status !== "charging";
  const before = f.battery;
  f.battery = Math.max(0, Math.min(100, f.battery + (f.status === "charging" ? 1.6 : working ? -0.35 : -0.02) * dt));
  const low = live.rules.battery.percent;
  if (live.rules.battery.on && before >= low && f.battery < low) alert(live, "warning", `${f.id} battery at ${Math.round(f.battery)}%`);

  if (f.waitUntil > live.t) {
    f.speed = 0;
    f.status = "handling";
    return;
  }
  if (f.path.length) {
    f.status = f.carrying ? "carrying" : f.trip ? "to-pick" : f.status === "to-charger" ? "to-charger" : "idle";
    f.speed = FORKLIFT_SPEED;
    if (!follow(f, FORKLIFT_SPEED * dt, 4 * dt)) return;
    f.speed = 0;
    if (f.trip) return arrive(live, f, data);
    if (f.status === "to-charger") {
      f.status = "charging";
      f.task = `Charging at ${f.chargerId}`;
    }
    return;
  }
  f.speed = 0;
  if (f.status === "charging") {
    if (f.battery < 95) return;
    f.status = "idle";
  }
  if (f.trip) return arrive(live, f, data);
  if (f.battery < 25) {
    f.status = "to-charger";
    f.task = `Low battery, to charger ${f.chargerId}`;
    f.path = route(live.site.layout, f.pos, f.home);
    return;
  }
  startTrip(live, f);
  if (f.trip) return;
  f.status = "idle";
  f.task = "Idle";
  if (dist(f.pos, f.home) > 0.5) f.path = route(live.site.layout, f.pos, f.home);
}

/** Advances one site by `dt` seconds. Returns a new object; the input is not mutated. */
export function tick(prev: LiveSite, dt: number, data: SimData): LiveSite {
  const live: LiveSite = {
    ...prev,
    t: prev.t + dt,
    trucks: prev.trucks.map((t) => ({ ...t })),
    forklifts: prev.forklifts.map((f) => ({ ...f })),
  };

  live.trucks = live.trucks.filter((truck) => stepTruck(live, truck, dt));
  runAppointments(live, data);

  const arrived = live.deliveries.filter((d) => d.at <= live.t);
  if (arrived.length) {
    live.deliveries = live.deliveries.filter((d) => d.at > live.t);
    for (const d of arrived) stamp(live, d.shipmentId, "Delivered");
  }

  if (live.rules.qcHold.on) {
    for (const p of live.pallets) {
      if (p.status === "qc-hold" && live.t - p.receivedAt > live.rules.qcHold.seconds) {
        alertOnce(live, `qc:${p.id}`, "warning", `${p.id} has been on QC hold for ${live.rules.qcHold.seconds} s`);
      }
    }
  }

  // QC holds clear after a minute, then go through putaway like any receipt.
  const released = live.pallets.filter((p) => p.status === "qc-hold" && p.slotId && live.t - p.receivedAt > QC_HOLD);
  if (released.length) {
    const ids = new Set(released.map((p) => p.id));
    live.pallets = live.pallets.map((p) => (ids.has(p.id) ? { ...p, status: "received", receivedAt: live.t } : p));
    for (const p of released) alert(live, "info", `${p.id} passed QC`);
  }

  for (const f of live.forklifts) stepForklift(live, f, dt, data);
  runReturns(live, dt, data);
  if (Math.floor(live.t / SAMPLE_EVERY) > Math.floor(prev.t / SAMPLE_EVERY)) {
    live.history = [...live.history, sample(live)].slice(-HISTORY_SAMPLES);
  }
  return live;
}

const SAMPLE_EVERY = 20;
const HISTORY_SAMPLES = 180;

function sample(live: LiveSite): Sample {
  return {
    t: live.t,
    palletsIn: live.stats.palletsIn,
    palletsOut: live.stats.palletsOut,
    stock: live.stats.stockOnHand,
    docksBusy: live.trucks.filter((t) => t.status === "loading" || t.status === "unloading").length,
    doors: live.site.layout.doors.length,
    forkliftsBusy: live.forklifts.filter((f) => f.status !== "idle" && f.status !== "charging" && f.status !== "to-charger").length,
    forklifts: live.forklifts.length,
  };
}

/** Customer returns: a new one is announced every few minutes and arrives shortly after. */
function runReturns(live: LiveSite, dt: number, data: SimData) {
  const due = live.returns.filter((r) => r.status === "expected" && live.t >= r.expectedAt);
  if (due.length) {
    const ids = new Set(due.map((r) => r.id));
    live.returns = live.returns.map((r) => (ids.has(r.id) ? { ...r, status: "arrived", arrivedAt: live.t } : r));
    for (const r of due) alert(live, "info", `${r.id} arrived: ${r.qty} × ${r.item} from ${r.customer}`);
  }
  if (Math.floor(live.t / 150) > Math.floor((live.t - dt) / 150)) {
    live.seq += 1;
    const k = live.seq;
    const item = data.catalog[k % data.catalog.length];
    const n = Number(live.site.code.slice(3));
    const next: ReturnCase = {
      id: `RMA-${n}${String(600 + k)}`,
      customer: data.customers[k % data.customers.length][0],
      sku: item.sku,
      item: item.item,
      qty: Math.max(1, Math.round(item.qtyPerPallet / (3 + (k % 4)))),
      reason: RETURN_REASONS[k % RETURN_REASONS.length],
      status: "expected",
      expectedAt: live.t + 45,
      arrivedAt: null,
      decidedAt: null,
      note: "",
    };
    live.returns = [next, ...live.returns].slice(0, 30);
  }
}

// ---------- handheld scanner ----------
// A person with a scanner works alongside the forklifts, so every action is
// re-checked against the live state at the moment it is confirmed.

export type ScanAction =
  | { kind: "receive"; truckId: string; palletId: string; slotId: string; qty: number; qcHold: boolean; sku?: string }
  | { kind: "putaway"; palletId: string; bin: string }
  | { kind: "pick"; truckId: string; palletId: string; slotId: string; sku?: string }
  | { kind: "load"; truckId: string; palletId: string }
  | { kind: "count"; taskId: string; bin: string; qty: number };

export type ScanResult = { live: LiveSite; message: string } | { error: string };

const idNum = (id: string) => Number(id.replace(/\D/g, "")) || 0;
const zones: Record<string, string> = { PPE: "A", Lighting: "B", Furniture: "C", Packaging: "D" };

/** A slot is taken when a pallet sits there or a forklift trip is headed to or from it. */
export const slotTaken = (live: LiveSite, slotId: string) =>
  live.pallets.some((p) => p.slotId === slotId) || live.forklifts.some((f) => f.trip?.slotId === slotId);

/** Pallets the truck can still take or give without overlapping forklift trips. */
export const openCapacity = (live: LiveSite, truck: Truck) => truck.cargo.total - truck.cargo.done - claimed(live, truck.id);

/** Label the next handheld-created pallet gets, e.g. PAL-H1007. */
export const nextLabel = (live: LiveSite) => `PAL-H${Number(live.site.code.slice(3))}${String(live.labels + 1).padStart(3, "0")}`;

/** What the next pallet off an inbound truck should be, per its ASN. */
export const asnLine = (truck: Truck, data: SimData) =>
  data.catalog.find((c) => c.sku === truck.sku) ?? data.catalog[(idNum(truck.id) + truck.cargo.done) % data.catalog.length];

/** What the next pallet onto an outbound truck should be, per its order. */
export const orderLine = (truck: Truck, data: SimData) =>
  data.catalog.find((c) => c.sku === truck.sku) ?? data.catalog[(idNum(truck.id) + truck.cargo.done + 2) % data.catalog.length];

/** Storage bin for a category, e.g. A-07-3: zone by category, aisle and level spread by `seed`. */
export const binFor = (category: string, seed: string) =>
  `${zones[category] ?? "E"}-${String(1 + (idNum(seed) % 12)).padStart(2, "0")}-${1 + (idNum(seed) % 4)}`;

export function applyScan(prev: LiveSite, action: ScanAction, data: SimData): ScanResult {
  const live: LiveSite = { ...prev, trucks: prev.trucks.map((t) => ({ ...t })) };
  const slots = live.site.layout.slots;
  const n = Number(live.site.code.slice(3));
  const yardPallet = (id: string): { pallet?: Pallet; error?: string } => {
    const pallet = live.pallets.find((p) => p.id === id);
    if (!pallet?.slotId) return { error: `${id} is not in the yard` };
    if (pallet.status === "qc-hold") return { error: `${id} is on QC hold` };
    if (live.forklifts.some((f) => f.trip?.slotId === pallet.slotId)) return { error: `A forklift is already moving ${id}` };
    return { pallet };
  };
  const freeSlot = (slotId: string) => {
    const slot = slots.find((s) => s.id === slotId);
    return slot && !slotTaken(live, slot.id) ? slot : null;
  };
  const done = (message: string, severity: SiteAlert["severity"] = "info"): ScanResult => {
    alert(live, severity, message);
    return { live, message };
  };

  switch (action.kind) {
    case "receive": {
      const truck = live.trucks.find((t) => t.id === action.truckId);
      if (truck?.status !== "unloading") return { error: `${action.truckId} is not unloading` };
      if (openCapacity(live, truck) < 1) return { error: `Every pallet on ${truck.id} is already being received` };
      const slot = freeSlot(action.slotId);
      if (!slot) return { error: "That slot is no longer free" };
      if (live.pallets.some((p) => p.id === action.palletId)) return { error: `${action.palletId} is already in use` };
      const item = data.catalog.find((c) => c.sku === action.sku) ?? asnLine(truck, data);
      const pallet: Pallet = {
        id: action.palletId,
        sku: item.sku,
        item: item.item,
        category: item.category,
        qty: action.qty,
        weightKg: Math.round((item.kgPerPallet * action.qty) / item.qtyPerPallet),
        lot: `L${2500 + n}-${String(100 + ((live.labels * 41) % 900))}`,
        status: action.qcHold ? "qc-hold" : "received",
        slotId: slot.id,
        receivedAt: live.t,
        crossDockFor: null,
      };
      live.pallets = [...live.pallets, pallet];
      live.labels += 1;
      truck.cargo = { ...truck.cargo, done: truck.cargo.done + 1, kgPerPallet: pallet.weightKg };
      adjustStock(live, item.sku, 1, data, action.qty);
      return action.qcHold
        ? done(`${pallet.id} (${item.item}) put on QC hold at ${slot.code}`, "warning")
        : done(`${pallet.id} received from ${truck.id} into ${slot.code}`);
    }
    case "putaway": {
      const { pallet, error } = yardPallet(action.palletId);
      if (!pallet) return { error: error! };
      live.pallets = live.pallets.filter((p) => p.id !== pallet.id);
      live.stats = { ...live.stats, putawaysToday: live.stats.putawaysToday + 1 };
      return done(`${pallet.id} put away to ${action.bin}`);
    }
    case "pick": {
      const truck = live.trucks.find((t) => t.id === action.truckId);
      if (!truck || truck.direction !== "outbound" || truck.status === "departing") return { error: `${action.truckId} has no open order` };
      const slot = freeSlot(action.slotId);
      if (!slot) return { error: "That slot is no longer free" };
      const item = data.catalog.find((c) => c.sku === action.sku) ?? orderLine(truck, data);
      if ((live.inventory.find((l) => l.sku === item.sku)?.qty ?? 0) < item.qtyPerPallet) return { error: `Not enough ${item.item} in storage` };
      live.pallets = [
        ...live.pallets,
        { id: action.palletId, sku: item.sku, item: item.item, category: item.category, qty: item.qtyPerPallet, weightKg: item.kgPerPallet, lot: `L${2400 + n}-${String(100 + ((live.labels * 29) % 900))}`, status: "staged", slotId: slot.id, receivedAt: live.t, crossDockFor: truck.id },
      ];
      live.labels += 1;
      return done(`${action.palletId} (${item.item}) staged at ${slot.code} for ${truck.id}`);
    }
    case "load": {
      const truck = live.trucks.find((t) => t.id === action.truckId);
      if (truck?.status !== "loading") return { error: `${action.truckId} is not loading` };
      if (openCapacity(live, truck) < 1) return { error: `${truck.id} is already full` };
      const { pallet, error } = yardPallet(action.palletId);
      if (!pallet) return { error: error! };
      live.pallets = live.pallets.filter((p) => p.id !== pallet.id);
      truck.cargo = { ...truck.cargo, done: truck.cargo.done + 1, kgPerPallet: pallet.weightKg };
      if (pallet.crossDockFor) live.stats = { ...live.stats, crossDocked: live.stats.crossDocked + 1 };
      adjustStock(live, pallet.sku, -1, data, -pallet.qty);
      return done(`${pallet.id} loaded onto ${truck.id}`);
    }
    case "count": {
      const task = live.counts.find((c) => c.id === action.taskId);
      if (task?.status !== "open") return { error: `${action.taskId} is not open for counting` };
      const line = task.lines.find((l) => l.bin === action.bin);
      if (!line) return { error: `Bin ${action.bin} is not on ${task.id}` };
      if (!Number.isInteger(action.qty) || action.qty < 0) return { error: "Enter the units you counted" };
      const lines = task.lines.map((l) => (l.bin === action.bin ? { ...l, counted: action.qty, countedAt: live.t } : l));
      const complete = lines.every((l) => l.counted !== null);
      live.counts = live.counts.map((c) => (c.id === task.id ? { ...c, lines, status: complete ? "review" : "open" } : c));
      return done(`${action.bin} counted: ${action.qty} × ${line.item}${complete ? `. ${task.id} is ready for review` : ""}`);
    }
  }
}

/** What is left of an arriving truck's drive, from where it is now to its dock, for the map's route line. */
export function plannedRoute(l: SiteLayout, truck: Truck): Vec2[] {
  const door = l.doors.find((d) => d.id === truck.doorId);
  if (!door) return [];
  const approach: Vec2[] = [[door.x + 9, l.roadZ + 2], [door.x + 1.5, l.roadZ - 9], dockedPos(l, door)];
  switch (truck.status) {
    case "en-route":
      return [truck.pos, ...truck.path, ...approach];
    case "at-gate":
      return [truck.pos, ...approach];
    case "docking":
      return truck.reversing ? [truck.pos, ...truck.path] : [truck.pos, ...truck.path, ...approach.slice(1)];
    default:
      return [];
  }
}

// ---------- yard and transport (phase 2) ----------

/** Seconds until the truck is at its dock, or until it is done there. */
export function etaSeconds(live: LiveSite, truck: Truck) {
  if (truck.status === "loading" || truck.status === "unloading") return (truck.cargo.total - truck.cargo.done) * 30;
  if (truck.status === "departing") return 0;
  const route = plannedRoute(live.site.layout, truck);
  const metres = route.slice(1).reduce((sum, p, i) => sum + dist(route[i], p), 0);
  const gate = truck.status === "at-gate" && !truck.checkedIn ? Math.max(0, AUTO_CHECKIN_AFTER - (live.t - (truck.gateAt ?? live.t))) : 0;
  return metres / 6 + gate;
}

/** Gatehouse check-in, optionally sending the truck to a different free door. */
export function checkIn(prev: LiveSite, truckId: string, doorId?: string): { live: LiveSite } | { error: string } {
  const live: LiveSite = { ...prev, trucks: prev.trucks.map((t) => ({ ...t })) };
  const truck = live.trucks.find((t) => t.id === truckId);
  if (truck?.status !== "at-gate") return { error: `${truckId} is not waiting at the gate` };
  if (doorId && doorId !== truck.doorId) {
    const door = live.site.layout.doors.find((d) => d.id === doorId);
    if (!door) return { error: "Unknown door" };
    if (live.trucks.some((t) => t.id !== truck.id && t.doorId === doorId && t.status !== "departing")) return { error: `${door.code} is taken` };
    truck.doorId = doorId;
    patchAppointment(live, truck.appointmentId, { doorId });
  }
  checkInTruck(live, truck, false);
  return { live };
}

export function bookAppointment(prev: LiveSite, input: { doorId: string; carrier: string; pallets: number; slotAt: number }): { live: LiveSite } | { error: string } {
  const door = prev.site.layout.doors.find((d) => d.id === input.doorId);
  if (!door) return { error: "Unknown door" };
  if (input.pallets < 1 || input.pallets > 26) return { error: "A truck carries 1 to 26 pallets" };
  if (input.slotAt < prev.t + LEAD) return { error: "Book at least a minute ahead" };
  const live = { ...prev, seq: prev.seq + 1 };
  live.appointments = [
    ...prev.appointments,
    {
      id: `APT-${Number(prev.site.code.slice(3))}${String(live.seq).padStart(3, "0")}`,
      doorId: door.id,
      direction: door.direction === "in" ? "inbound" : "outbound",
      carrier: input.carrier,
      pallets: Math.round(input.pallets),
      slotAt: input.slotAt,
      truckId: null,
      status: "booked",
      dockedAt: null,
      late: false,
    },
  ];
  return { live };
}

export const setRules = (live: LiveSite, rules: AlertRules): LiveSite => ({ ...live, rules });
export const setAutoCheckIn = (live: LiveSite, on: boolean): LiveSite => ({ ...live, autoCheckIn: on });
export const setSharing = (live: LiveSite, truckId: string, on: boolean): LiveSite => ({
  ...live,
  trucks: live.trucks.map((t) => (t.id === truckId ? { ...t, sharing: on } : t)),
});

// ---------- stock flows (phase 3) ----------

type Result = { live: LiveSite } | { error: string };

/** ABC by units on hand: the top two items are A, the next two B, the rest C. */
export function abcClass(live: LiveSite, sku: string) {
  const rank = [...live.inventory].sort((a, b) => b.qty - a.qty).findIndex((l) => l.sku === sku);
  return rank < 2 ? "A" : rank < 4 ? "B" : "C";
}

export const zoneOf = (category: string) => zones[category] ?? "E";

/** Opens a cycle count: three bins per item in scope, expected quantities frozen now. */
export function createCount(prev: LiveSite, input: { scope: "zone" | "class"; target: string; blind: boolean }, data: SimData): Result {
  const items = prev.inventory.filter((line) =>
    input.scope === "zone" ? zoneOf(line.category) === input.target : abcClass(prev, line.sku) === input.target,
  );
  if (!items.length) return { error: `Nothing to count in ${input.scope} ${input.target}` };
  const live = { ...prev, seq: prev.seq + 1 };
  const k = live.seq;
  const n = Number(prev.site.code.slice(3));
  const lines = items.flatMap((line, j) => {
    const first = Math.round(line.qty * 0.4);
    const second = Math.round(line.qty * 0.35);
    return [first, second, line.qty - first - second].map((expected, i) => ({
      bin: `${zoneOf(line.category)}-${String(1 + ((k + j * 3 + i) % 12)).padStart(2, "0")}-${1 + ((k + i) % 4)}`,
      sku: line.sku,
      item: data.catalog.find((c) => c.sku === line.sku)?.item ?? line.item,
      expected,
      counted: null,
      countedAt: null,
    }));
  });
  const task: CountTask = { id: `CC-${n}${100 + k}`, scope: input.scope, target: input.target, blind: input.blind, status: "open", lines, createdAt: prev.t, approvedAt: null };
  live.counts = [task, ...prev.counts].slice(0, 20);
  return { live };
}

/** Posts a finished count: every variance becomes a stock adjustment. */
export function approveCount(prev: LiveSite, taskId: string, data: SimData): Result {
  const task = prev.counts.find((c) => c.id === taskId);
  if (task?.status !== "review") return { error: `${taskId} is not ready for approval` };
  const live: LiveSite = { ...prev };
  const bySku = new Map<string, number>();
  for (const l of task.lines) bySku.set(l.sku, (bySku.get(l.sku) ?? 0) + (l.counted ?? l.expected) - l.expected);
  for (const [sku, units] of bySku) if (units) adjustStock(live, sku, 0, data, units);
  const off = task.lines.filter((l) => l.counted !== l.expected).length;
  const net = [...bySku.values()].reduce((a, b) => a + b, 0);
  live.counts = live.counts.map((c) => (c.id === taskId ? { ...c, status: "approved", approvedAt: live.t } : c));
  alert(live, off ? "warning" : "info", off ? `${taskId} approved: ${off} bins adjusted, ${net > 0 ? "+" : ""}${net} units` : `${taskId} approved: every bin matched`);
  return { live };
}

/** Share of approved count lines that matched the system, or null before any count. */
export function countAccuracy(live: LiveSite) {
  const lines = live.counts.filter((c) => c.status === "approved").flatMap((c) => c.lines);
  return lines.length ? lines.filter((l) => l.counted === l.expected).length / lines.length : null;
}

export function decideReturn(prev: LiveSite, id: string, decision: "restock" | "scrap", note: string, data: SimData): Result {
  const rma = prev.returns.find((r) => r.id === id);
  if (rma?.status !== "arrived") return { error: `${id} is not waiting for inspection` };
  const live: LiveSite = { ...prev };
  if (decision === "restock") {
    adjustStock(live, rma.sku, 0, data, rma.qty);
    live.stats = { ...live.stats, returnsRestocked: live.stats.returnsRestocked + 1 };
  } else {
    live.stats = { ...live.stats, returnsScrapped: live.stats.returnsScrapped + 1 };
  }
  live.returns = live.returns.map((r) => (r.id === id ? { ...r, status: decision === "restock" ? "restocked" : "scrapped", decidedAt: live.t, note: note.trim() } : r));
  alert(live, "info", `${id} ${decision === "restock" ? "restocked" : "scrapped"}: ${rma.qty} × ${rma.item}`);
  return { live };
}

/** Sends a yard pallet straight to an outbound truck instead of storage. */
export function assignCrossDock(prev: LiveSite, palletId: string, truckId: string): Result {
  const pallet = prev.pallets.find((p) => p.id === palletId);
  const truck = prev.trucks.find((t) => t.id === truckId);
  if (!pallet?.slotId) return { error: `${palletId} is not in the yard` };
  if (pallet.status === "qc-hold") return { error: `${palletId} is on QC hold` };
  if (prev.forklifts.some((f) => f.trip?.slotId === pallet.slotId)) return { error: `A forklift is already moving ${palletId}` };
  if (!truck || truck.direction !== "outbound" || truck.status === "departing" || truck.cargo.done >= truck.cargo.total) return { error: `${truckId} cannot take more pallets` };
  const live: LiveSite = { ...prev, pallets: prev.pallets.map((p) => (p.id === palletId ? { ...p, status: "staged", crossDockFor: truckId } : p)) };
  alert(live, "info", `${palletId} cross-docked to ${truckId}`);
  return { live };
}

type Sites = Record<string, LiveSite>;
const IN_HOUSE_CARRIER = "WareTrack Freight";

/** Books the outbound leg of a stock transfer between two sites. */
export function createTransfer(
  sites: Sites,
  transfers: Transfer[],
  input: { fromSiteId: string; toSiteId: string; sku: string; pallets: number },
  data: SimData,
): { sites: Sites; transfers: Transfer[] } | { error: string } {
  const src = sites[input.fromSiteId];
  const dst = sites[input.toSiteId];
  const item = data.catalog.find((c) => c.sku === input.sku);
  if (!src || !dst || src === dst) return { error: "Pick two different sites" };
  if (!item) return { error: "Unknown item" };
  if (!Number.isInteger(input.pallets) || input.pallets < 1 || input.pallets > 26) return { error: "A transfer moves 1 to 26 pallets" };
  const onHand = src.inventory.find((l) => l.sku === input.sku)?.qty ?? 0;
  if (onHand < input.pallets * item.qtyPerPallet) return { error: `${src.site.code} has only ${onHand} × ${item.item}` };
  const door = src.site.layout.doors.find((d) => d.direction === "out");
  if (!door) return { error: `${src.site.code} has no outbound door` };
  const id = `TRF-${301 + transfers.length}`;
  const apptId = `APT-${Number(src.site.code.slice(3))}${String(src.seq + 1).padStart(3, "0")}`;
  const next: LiveSite = {
    ...src,
    seq: src.seq + 1,
    appointments: [
      ...src.appointments,
      { id: apptId, doorId: door.id, direction: "outbound", carrier: IN_HOUSE_CARRIER, pallets: input.pallets, slotAt: src.t + LEAD + 20, truckId: null, status: "booked", dockedAt: null, late: false, transferId: id, party: dst.site.name, place: dst.site.address, sku: input.sku },
    ],
  };
  alert(next, "info", `${id} booked: ${input.pallets} pallets of ${item.item} to ${dst.site.code}`);
  const transfer: Transfer = { id, fromSiteId: src.site.id, toSiteId: dst.site.id, sku: input.sku, item: item.item, pallets: input.pallets, status: "requested", createdAt: src.t, outboundAppointmentId: apptId, inboundAppointmentId: null, updatedAt: src.t };
  return { sites: { ...sites, [src.site.id]: next }, transfers: [transfer, ...transfers] };
}

/** Moves transfers along as their legs progress; when the outbound truck leaves, the inbound leg is booked at the other site. */
export function advanceTransfers(sites: Sites, transfers: Transfer[]): { sites: Sites; transfers: Transfer[] } {
  let out = sites;
  let changed = false;
  const leg = (live: LiveSite, id: string | null) => live.appointments.find((a) => a.id === id);
  const next = transfers.map((tr): Transfer => {
    if (tr.status === "received") return tr;
    const src = out[tr.fromSiteId];
    const dst = out[tr.toSiteId];
    if (tr.status === "requested" || tr.status === "loading") {
      const a = leg(src, tr.outboundAppointmentId);
      const status = !a || a.status === "done" ? "in-transit" : a.status === "booked" ? "requested" : "loading";
      if (status === tr.status) return tr;
      changed = true;
      if (status !== "in-transit") return { ...tr, status, updatedAt: src.t };
      const door = dst.site.layout.doors.find((d) => d.direction === "in") ?? dst.site.layout.doors[0];
      const apptId = `APT-${Number(dst.site.code.slice(3))}${String(dst.seq + 1).padStart(3, "0")}`;
      const booked: LiveSite = {
        ...dst,
        seq: dst.seq + 1,
        appointments: [
          ...dst.appointments,
          { id: apptId, doorId: door.id, direction: "inbound", carrier: IN_HOUSE_CARRIER, pallets: tr.pallets, slotAt: dst.t + DELIVERY_AFTER + LEAD, truckId: null, status: "booked", dockedAt: null, late: false, transferId: tr.id, party: src.site.name, place: src.site.address, sku: tr.sku },
        ],
      };
      alert(booked, "info", `${tr.id} on its way from ${src.site.code}: ${tr.pallets} pallets of ${tr.item}`);
      out = { ...out, [dst.site.id]: booked };
      return { ...tr, status, inboundAppointmentId: apptId, updatedAt: dst.t };
    }
    const a = leg(dst, tr.inboundAppointmentId);
    const status = !a || a.status === "done" ? "received" : a.status === "booked" ? "in-transit" : "arriving";
    if (status === tr.status) return tr;
    changed = true;
    if (status === "received") {
      const done: LiveSite = { ...dst };
      alert(done, "info", `${tr.id} received at ${dst.site.code}`);
      out = { ...out, [dst.site.id]: done };
    }
    return { ...tr, status, updatedAt: dst.t };
  });
  return changed ? { sites: out, transfers: next } : { sites, transfers };
}
