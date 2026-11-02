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
  countAccuracy,
  createCount,
  createLiveSite,
  createTransfer,
  decideReturn,
  nextLabel,
  setAutoCheckIn,
  slotTaken,
  tick,
} from "./simulator.ts";

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
