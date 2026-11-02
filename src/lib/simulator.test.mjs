import assert from "node:assert/strict";
import { test } from "node:test";
import { catalog, carriers, customers, drivers, siteSeeds, suppliers } from "../data/sites.ts";
import {
  advanceTransfers,
  applyScan,
  approveCount,
  assignCrossDock,
  bookAppointment,
  checkIn,
  confirmPick,
  countAccuracy,
  createCount,
  createLiveSite,
  createTransfer,
  decideReturn,
  editLayout,
  fefo,
  frameAt,
  logService,
  nextLabel,
  binFor,
  orderLines,
  releasable,
  releaseWave,
  SERVICE_INTERVAL,
  setTag,
  SIM_HOUR,
  setAutoCheckIn,
  slotTaken,
  tick,
} from "./simulator.ts";
import { denied, seedUsers } from "./access.ts";
import { heatGrid } from "./heat.ts";

const data = { catalog, carriers, customers, drivers, suppliers };
const run = (live, seconds) => {
  for (let i = 0; i < seconds * 4; i++) live = tick(live, 0.25, data);
  return live;
};

test("seeded trucks are worked, leave, and new trucks arrive", () => {
  const start = createLiveSite(siteSeeds[0], data);
  const later = run(start, 600);
  assert.ok(!later.trucks.some((t) => t.id === "TRK-2051"), "loading truck departed");
  assert.ok(!later.trucks.some((t) => t.id === "TRK-2287"), "inbound truck departed");
  assert.ok(later.stats.outboundToday > start.stats.outboundToday);
  assert.ok(later.stats.arrivalsToday > start.stats.arrivalsToday);
  assert.ok(later.stats.putawaysToday > start.stats.putawaysToday);
  assert.ok(later.trucks.some((t) => t.id.startsWith("TRK-26")), "simulator spawned trucks");
});

test("every site keeps its invariants over 15 minutes", () => {
  const moves = (live) => live.forklifts.reduce((sum, f) => sum + f.movesToday, 0);
  for (const seed of siteSeeds) {
    let live = createLiveSite(seed, data);
    const startMoves = moves(live);
    for (let i = 0; i < 900 * 4; i++) {
      live = tick(live, 0.25, data);
      const slots = live.pallets.map((p) => p.slotId).filter(Boolean);
      assert.equal(new Set(slots).size, slots.length, `${seed.code}: two pallets in one slot`);
      for (const t of live.trucks) assert.ok(t.cargo.done <= t.cargo.total, `${seed.code}: ${t.id} over-handled`);
      const busyDoors = live.trucks.filter((t) => t.status !== "departing").map((t) => t.doorId);
      assert.equal(new Set(busyDoors).size, busyDoors.length, `${seed.code}: two trucks on one door`);
    }
    assert.ok(moves(live) - startMoves >= 20, `${seed.code}: forklifts did work`);
  }
});

test("tick leaves its input untouched", () => {
  const live = createLiveSite(siteSeeds[2], data);
  const before = JSON.stringify(live);
  tick(live, 0.25, data);
  assert.equal(JSON.stringify(live), before);
});

test("handheld receive, putaway, pick and load move stock like the forklifts do", () => {
  let live = createLiveSite(siteSeeds[2], data); // WH-04: TRK-2205 unloading 2/6, TRK-2229 loading 3/6
  const stock = live.stats.stockOnHand;
  const freeSlot = () => live.site.layout.slots.find((s) => !slotTaken(live, s.id));
  const ok = (result) => {
    assert.ok("live" in result, result.error);
    live = result.live;
  };

  const label = nextLabel(live);
  const slot = freeSlot();
  ok(applyScan(live, { kind: "receive", truckId: "TRK-2205", palletId: label, slotId: slot.id, qty: 80, qcHold: false }, data));
  assert.equal(live.trucks.find((t) => t.id === "TRK-2205").cargo.done, 3);
  assert.equal(live.stats.stockOnHand, stock + 1);
  assert.equal(live.pallets.find((p) => p.id === label).slotId, slot.id);
  assert.notEqual(nextLabel(live), label, "labels are not reused");

  const again = applyScan(live, { kind: "receive", truckId: "TRK-2205", palletId: nextLabel(live), slotId: slot.id, qty: 80, qcHold: false }, data);
  assert.match(again.error, /no longer free/);

  ok(applyScan(live, { kind: "putaway", palletId: label, bin: "A-01-1" }, data));
  assert.ok(!live.pallets.some((p) => p.id === label));

  const picked = nextLabel(live);
  ok(applyScan(live, { kind: "pick", truckId: "TRK-2229", palletId: picked, slotId: freeSlot().id }, data));
  ok(applyScan(live, { kind: "load", truckId: "TRK-2229", palletId: picked }, data));
  assert.equal(live.trucks.find((t) => t.id === "TRK-2229").cargo.done, 4);
  assert.equal(live.stats.stockOnHand, stock, "one in, one out");

  assert.match(applyScan(live, { kind: "putaway", palletId: "PAL-4104", bin: "A-01-1" }, data).error, /QC hold/);
  assert.match(applyScan(live, { kind: "load", truckId: "TRK-2205", palletId: "PAL-4101" }, data).error, /not loading/);
});

test("the gate holds trucks until check-in when the gatehouse is manual", () => {
  let live = setAutoCheckIn(createLiveSite(siteSeeds[0], data), false); // WH-01: TRK-2287 en route to Bay 2
  live = run(live, 70);
  const waiting = live.trucks.find((t) => t.id === "TRK-2287");
  assert.equal(waiting.status, "at-gate", "nobody checked it in");
  assert.ok(live.alerts.some((a) => a.message.includes("TRK-2287 waiting at the gate")), "gate-wait rule fired");
  assert.match(checkIn(live, "TRK-2051").error, /not waiting/);

  const result = checkIn(live, "TRK-2287");
  assert.ok("live" in result, result.error);
  live = run(result.live, 1);
  assert.equal(live.trucks.find((t) => t.id === "TRK-2287").status, "docking");
  assert.equal(live.gateLog[0].kind, "in");
});

test("appointments feed the doors and outbound shipments get delivered", () => {
  let live = createLiveSite(siteSeeds[0], data);
  const door = live.site.layout.doors[0];
  assert.match(bookAppointment(live, { doorId: door.id, carrier: "Bluepeak", pallets: 3, slotAt: live.t + 10 }).error, /ahead/);
  const booked = bookAppointment(live, { doorId: door.id, carrier: "Bluepeak", pallets: 3, slotAt: live.t + 900 });
  assert.ok("live" in booked);
  assert.ok(booked.live.appointments.some((a) => a.carrier === "Bluepeak" && a.slotAt === 900 && a.status === "booked"));

  live = run(live, 500);
  const delivered = live.shipments["SHP-78442"].steps.find((s) => s.label === "Delivered");
  assert.ok(delivered.at !== null, "TRK-2051's shipment was delivered");
  assert.ok(live.appointments.some((a) => a.status === "done"), "slots get worked");
  for (const d of live.site.layout.doors) {
    assert.ok(live.appointments.filter((a) => a.doorId === d.id && a.status === "booked").length >= 1, `${d.code} has slots booked ahead`);
  }
});

test("cycle counts post their variances as stock adjustments", () => {
  let live = createLiveSite(siteSeeds[0], data);
  const created = createCount(live, { scope: "zone", target: "A", blind: true }, data);
  assert.ok("live" in created, created.error);
  live = created.live;
  const task = live.counts[0];
  assert.ok(task.lines.length >= 3 && task.lines.every((l) => l.bin.startsWith("A-")), "zone A bins only");
  assert.match(approveCount(live, task.id, data).error, /not ready/);

  const short = task.lines[0];
  for (const line of task.lines) {
    const r = applyScan(live, { kind: "count", taskId: task.id, bin: line.bin, qty: line === short ? line.expected - 5 : line.expected }, data);
    assert.ok("live" in r, r.error);
    live = r.live;
  }
  assert.equal(live.counts[0].status, "review");
  const before = live.inventory.find((l) => l.sku === short.sku).qty;
  const approved = approveCount(live, task.id, data);
  assert.ok("live" in approved);
  live = approved.live;
  assert.equal(live.inventory.find((l) => l.sku === short.sku).qty, before - 5);
  assert.equal(countAccuracy(live), (task.lines.length - 1) / task.lines.length);
  assert.match(createCount(live, { scope: "zone", target: "E", blind: false }, data).error, /Nothing to count/);
});

test("returns are restocked or scrapped once, and new ones keep arriving", () => {
  let live = createLiveSite(siteSeeds[0], data);
  const rma = live.returns.find((r) => r.status === "arrived");
  const before = live.inventory.find((l) => l.sku === rma.sku).qty;
  const restocked = decideReturn(live, rma.id, "restock", "Box intact", data);
  assert.ok("live" in restocked);
  live = restocked.live;
  assert.equal(live.inventory.find((l) => l.sku === rma.sku).qty, before + rma.qty);
  assert.match(decideReturn(live, rma.id, "scrap", "", data).error, /not waiting/);
  live = run(live, 320);
  assert.ok(live.returns.length > 3, "new returns announced");
  assert.ok(live.returns.some((r) => r.status === "arrived" && r.id !== rma.id), "expected returns arrive");
});

test("a cross-dock site ships receipts without putting anything away", () => {
  let live = createLiveSite(siteSeeds[2], data); // WH-04
  live = run(live, 600);
  assert.equal(live.stats.putawaysToday, 0);
  assert.ok(live.stats.crossDocked > 0, "pallets went straight from inbound to outbound");

  const hub = createLiveSite(siteSeeds[0], data);
  assert.ok("live" in assignCrossDock(hub, "PAL-1030", "TRK-2051"));
  assert.match(assignCrossDock(hub, "PAL-1030", "TRK-2287").error, /cannot take/);
  assert.match(assignCrossDock(hub, "PAL-1029", "TRK-2051").error, /QC hold/);
});

test("a transfer leaves one site and is received at the other", () => {
  let sites = Object.fromEntries(siteSeeds.map((s) => [s.id, createLiveSite(s, data)]));
  assert.match(createTransfer(sites, [], { fromSiteId: "wh-01", toSiteId: "wh-01", sku: "LGT-LED-60", pallets: 2 }, data).error, /different/);
  assert.match(createTransfer(sites, [], { fromSiteId: "wh-01", toSiteId: "wh-02", sku: "FUR-CHR-01", pallets: 20 }, data).error, /has only/);
  const made = createTransfer(sites, [], { fromSiteId: "wh-01", toSiteId: "wh-02", sku: "LGT-LED-60", pallets: 2 }, data);
  assert.ok("sites" in made, made.error);
  ({ sites } = made);
  let transfers = made.transfers;
  const seen = new Set();
  for (let i = 0; i < 1500 * 4 && transfers[0].status !== "received"; i++) {
    sites = Object.fromEntries(Object.entries(sites).map(([id, live]) => [id, tick(live, 0.25, data)]));
    ({ sites, transfers } = advanceTransfers(sites, transfers));
    seen.add(transfers[0].status);
  }
  assert.deepEqual([...seen], ["requested", "loading", "in-transit", "arriving", "received"].filter((s) => seen.has(s)));
  assert.equal(transfers[0].status, "received");
  assert.ok(seen.has("in-transit") && seen.has("arriving"));
});

test("forklifts log engine hours, flag their service and reset on sign-off", () => {
  const start = createLiveSite(siteSeeds[0], data);
  const later = run(start, 600);
  const due = later.forklifts.find((f) => f.engineHours >= f.serviceDueAt);
  assert.ok(later.forklifts.every((f, i) => f.engineHours >= start.forklifts[i].engineHours));
  assert.ok(due, "the forklift seeded near its service reached it");
  assert.ok(later.alerts.some((a) => a.message === `${due.id} is due for its ${SERVICE_INTERVAL} h service`));
  const serviced = logService(later, due.id).forklifts.find((f) => f.id === due.id);
  assert.equal(serviced.serviceDueAt, Math.round(due.engineHours) + SERVICE_INTERVAL);
});

test("the map shows UWB exactly, BLE nearby, and untagged forklifts at their last scan", () => {
  let live = run(createLiveSite(siteSeeds[1], data), 120);
  const [uwb, ble, untagged] = live.forklifts;
  assert.deepEqual([uwb.tag, ble.tag, untagged.tag], ["uwb", "ble", null]);
  assert.deepEqual(uwb.shown, uwb.pos);
  assert.ok(Math.hypot(ble.shown[0] - ble.pos[0], ble.shown[1] - ble.pos[1]) <= 1.5 * Math.SQRT2 + 1e-9);
  assert.deepEqual(untagged.shown, untagged.lastScan.pos);
  live = run(setTag(live, untagged.id, "uwb"), 1);
  const tagged = live.forklifts.find((f) => f.id === untagged.id);
  assert.deepEqual(tagged.shown, tagged.pos);
});

test("replay keeps 24 demo hours of frames and finds the one on screen", () => {
  const live = run(createLiveSite(siteSeeds[0], data), 1600);
  const span = 24 * SIM_HOUR;
  assert.ok(live.frames[0].t > live.t - span && live.frames[0].t <= live.t - span + 2, "oldest frame is about 24 h back");
  assert.ok(live.frames.every((f, i) => i === 0 || f.t > live.frames[i - 1].t), "frames in time order");
  assert.equal(frameAt(live.frames, live.frames[0].t - 1), null);
  const mid = live.frames[300];
  assert.equal(frameAt(live.frames, mid.t + 0.5), mid);
});

test("heatmaps count working forklift positions and close pairs", () => {
  const layout = createLiveSite(siteSeeds[0], data).site.layout;
  const fl = (id, pos, status = "carrying") => ({ id, pos, heading: 0, status, carrying: null });
  const frames = [
    { t: 2, trucks: [], forklifts: [fl("A", [0, 20]), fl("B", [2.5, 20]), fl("C", [0, 20], "charging")] },
    { t: 4, trucks: [], forklifts: [fl("A", [0, 20]), fl("B", [10, 20])] },
  ];
  const travel = heatGrid(frames, layout, "travel");
  assert.equal(travel.cells.reduce((a, b) => a + b, 0), 4, "charging forklift not counted");
  assert.equal(travel.max, 2, "A sat in one cell for both frames");
  const congestion = heatGrid(frames, layout, "congestion");
  assert.equal(congestion.cells.reduce((a, b) => a + b, 0), 1, "only the close pair in the first frame");
});

const lotsMatch = (live) => live.inventory.every((l) => l.qty === l.lots.reduce((sum, x) => sum + x.qty, 0) && l.lots.every((x) => x.qty > 0));

test("stock is held in lots that always add up, and ships FEFO then FIFO", () => {
  const start = createLiveSite(siteSeeds[0], data);
  assert.ok(lotsMatch(start));
  const gloves = start.inventory.find((l) => l.sku === "PPE-GLV-N");
  const [first, second] = fefo(gloves.lots);
  assert.ok(first.expires < second.expires, "earliest expiry first");
  assert.ok(first.receivedAt > second.receivedAt, "even though it was received later (FEFO beats FIFO)");
  assert.deepEqual(fefo([{ lot: "a", expires: null, receivedAt: 5, qty: 1 }, { lot: "b", expires: null, receivedAt: 1, qty: 1 }]).map((l) => l.lot), ["b", "a"], "no expiry: FIFO");
  const later = run(start, 900);
  assert.ok(lotsMatch(later), "every receipt and issue kept lots in step with on-hand units");
});

test("a wave allocates FEFO in walking order and short picks cut the order", () => {
  let live = createLiveSite(siteSeeds[0], data);
  const orders = releasable(live).slice(0, 2);
  assert.equal(orders.length, 2);
  assert.equal(releaseWave(live, [], data).error, "Pick at least one order");
  live = releaseWave(live, orders.map((o) => o.id), data).live;
  const wave = live.waves[0];
  const asked = orders.reduce((sum, o) => sum + o.pallets, 0);
  assert.equal(wave.lines.reduce((sum, l) => sum + l.pallets, 0), asked, "every ordered pallet is on a line");
  assert.deepEqual(wave.lines.map((l) => l.bin), [...wave.lines.map((l) => l.bin)].sort(), "walking order");
  for (const l of wave.lines.filter((x) => x.lot)) {
    const firstLot = fefo(live.inventory.find((i) => i.sku === l.sku).lots)[0];
    if (wave.lines.filter((x) => x.sku === l.sku).length === 1) assert.equal(l.lot, firstLot.lot, `${l.sku} takes its FEFO lot`);
  }
  assert.ok(!releasable(live).some((a) => orders.some((o) => o.id === a.id)), "waved orders leave the release list");
  assert.ok(releaseWave(live, [orders[0].id], data).error);

  const line = wave.lines.find((l) => l.lot && l.pallets >= 1);
  const appt = live.appointments.find((a) => a.id === line.appointmentId);
  assert.ok(confirmPick(live, wave.id, line.id, line.pallets + 1).error);
  live = confirmPick(live, wave.id, line.id, line.pallets - 1).live;
  assert.equal(live.appointments.find((a) => a.id === appt.id).pallets, appt.pallets - 1, "short pick shrinks the order");
  assert.ok(live.alerts[0].message.startsWith(`Short pick on ${appt.id}`));
  assert.ok(confirmPick(live, wave.id, line.id, 0).error, "a line is picked once");
});

test("waved trucks load their allocated lots and leave with a matching manifest", () => {
  let live = createLiveSite(siteSeeds[0], data);
  const order = releasable(live).find((a) => a.status === "booked");
  live = releaseWave(live, [order.id], data).live;
  const lots = new Set(live.waves[0].lines.map((l) => l.lot));
  let shipmentId = null;
  for (let i = 0; i < 4 * 900 && live.appointments.find((a) => a.id === order.id)?.status !== "done"; i++) {
    live = tick(live, 0.25, data);
    shipmentId ??= live.trucks.find((t) => t.appointmentId === order.id)?.shipmentId ?? null;
  }
  assert.equal(live.appointments.find((a) => a.id === order.id)?.status, "done", "the waved order shipped");
  const manifest = live.shipments[shipmentId].manifest;
  assert.equal(manifest.length, order.pallets, "manifest lists every loaded pallet");
  assert.ok(manifest.every((m) => lots.has(m.lot)), "only allocated lots were loaded");
  assert.ok(orderLines(order, data).every(({ sku }) => manifest.some((m) => m.sku === sku)), "every ordered SKU shipped");
});

test("roles and site scopes decide who may change what", () => {
  const user = (role) => seedUsers.find((u) => u.role === role);
  assert.equal(denied(user("admin"), "admin", "wh-02", "WH-02"), null);
  assert.equal(denied(user("manager"), "approve", "wh-04", "WH-04"), null, "manager covers every site");
  assert.match(denied(user("picker"), "approve", "wh-02", "WH-02"), /can't approve/);
  assert.equal(denied(user("supervisor"), "release", "wh-01", "WH-01"), null);
  assert.match(denied(user("supervisor"), "release", "wh-04", "WH-04"), /no access to WH-04/, "a WH-01 supervisor cannot change WH-04");
  assert.match(denied(user("dispatcher"), "scan", "wh-01", "WH-01"), /can't scan/);
  assert.equal(denied(undefined, "scan", "wh-01", "WH-01"), "Sign in first");
});

test("layout edits are validated and drive bins, doors and slots", () => {
  let live = createLiveSite(siteSeeds[0], data);
  const l = live.site.layout;
  const [a, b] = l.zones;
  assert.equal(l.zones.length, 4);
  assert.match(binFor(l, "PPE", "PAL-7"), /^A-\d{2}-\d$/, "PPE bins are in zone A");

  assert.match(editLayout(live, { kind: "zone", zone: { ...a, x: b.x } }).error, /Overlaps zone B/);
  assert.match(editLayout(live, { kind: "zone", zone: { ...a, d: l.building.depth } }).error, /dock doors clear|building walls/);
  assert.match(editLayout(live, { kind: "zone", zone: { ...a, aisles: 99 } }).error, /aisles/);
  live = editLayout(live, { kind: "zone", zone: { ...a, code: "P", aisles: 1, levels: 2 } }).live;
  assert.equal(binFor(live.site.layout, "PPE", "PAL-7"), "P-01-2", "renamed zone and new racking change the bin codes");

  const busy = live.trucks.find((t) => t.status === "loading" || t.status === "unloading");
  const busyDoor = live.site.layout.doors.find((d) => d.id === busy.doorId);
  assert.match(editLayout(live, { kind: "remove-door", id: busyDoor.id }).error, /trucks or bookings/);
  assert.match(editLayout(live, { kind: "door", door: { ...busyDoor, x: busyDoor.x + 1 } }).error, /truck at it|Too close/);
  const w = live.site.layout.building.width;
  const doors = live.site.layout.doors.length;
  let added = null;
  for (let x = -w / 2 + 2; !added && x <= w / 2 - 2; x += 0.5) {
    const r = editLayout(live, { kind: "door", door: { id: "new-door", code: "Bay 9", direction: "out", x } });
    if ("live" in r) added = r.live;
  }
  if (added) {
    assert.equal(added.site.layout.doors.length, doors + 1);
    assert.ok(run(added, 5).appointments.some((ap) => ap.doorId === "new-door"), "a new door gets booked slots");
  } else {
    assert.ok(live.site.layout.doors.length * 4.5 > w - 4, "no free 4.5 m gap on this wall");
  }

  const taken = live.site.layout.slots.find((s) => slotTaken(live, s.id));
  assert.match(editLayout(live, { kind: "remove-slot", id: taken.id }).error, /pallet on it/);
  const free = live.site.layout.slots.find((s) => !slotTaken(live, s.id));
  assert.match(editLayout(live, { kind: "slot", slot: { ...free, pos: [0, 0] } }).error, /outside the building/);
  live = editLayout(live, { kind: "remove-slot", id: free.id }).live;
  assert.ok(!live.site.layout.slots.some((s) => s.id === free.id));
  live = run(live, 120);
  assert.ok(lotsMatch(live), "the site keeps running on the edited layout");
});
