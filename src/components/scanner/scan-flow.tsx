"use client";

import { CheckCircle2, ChevronRight, CircleAlert, Minus, Plus, ScanLine } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { simData, useActiveSite, useWarehouse } from "@/hooks/useWarehouse";
import type { LiveSite } from "@/interfaces/warehouse.interface";
import { asnLine } from "@/lib/simulator";
import { cn } from "@/lib/utils";
import { countOf, flows, norm, truckOf, VARIANCE, type Count, type FlowId, type ScanStep, type Values } from "./flows";
import { ScannerShell } from "./scanner-shell";

const big = "h-14 w-full rounded-xl text-base";

/** Haptic feedback on handhelds; a no-op where vibration isn't supported. */
function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Some browsers throw when vibration is blocked; feedback is optional.
  }
}

function chipValue(live: LiveSite, key: string, values: Values, count: Count) {
  if (key === "count") return `${count.qty}${count.qcHold ? " · QC" : ""}`;
  if (key === "order") return `#${truckOf(live, values.order)?.shipmentId ?? values.order}`;
  if (key === "slot") return live.site.layout.slots.find((s) => s.id === values.slot)?.code ?? values.slot;
  return values[key];
}

function ScanInput({ onScan }: { onScan: (code: string) => void }) {
  const [code, setCode] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onScan(code);
        setCode("");
      }}
    >
      <label className="relative flex-1">
        <span className="sr-only">Scan or type a code</span>
        <ScanLine className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-primary" />
        {/* Hardware scanners type the code and press Enter, so a focused input is all they need. */}
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Scan or type code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="done"
          className="h-14 w-full rounded-xl border-2 border-primary/30 bg-white pr-3 pl-11 font-mono text-lg uppercase outline-none placeholder:font-sans placeholder:text-base placeholder:normal-case focus:border-primary"
        />
      </label>
      <button type="submit" className={cn(buttonVariants(), "h-14 rounded-xl px-5 text-base")}>
        Enter
      </button>
    </form>
  );
}

function ScanStepView({ live, step, values, onScan }: { live: LiveSite; step: ScanStep; values: Values; onScan: (code: string) => void }) {
  const Icon = step.icon;
  const options = step.options(live, values);
  return (
    <>
      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-900/5">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="size-5" />
          </span>
          <div>
            <h2 className="text-lg leading-snug font-semibold">{step.prompt(live, values)}</h2>
            <p className="text-sm text-muted-foreground">{step.hint(live, values)}</p>
          </div>
        </div>
        <ScanInput onScan={onScan} />
      </section>
      <section aria-label="Suggestions">
        <h3 className="mb-2 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Tap to scan</h3>
        {options.length === 0 && <p className="rounded-xl bg-white p-4 text-sm text-muted-foreground ring-1 ring-slate-900/5">Nothing is ready right now. It will show up here as soon as it is.</p>}
        <ul className="space-y-2">
          {options.map((o) => (
            <li key={o.code}>
              <button
                type="button"
                onClick={() => onScan(o.code)}
                className="flex min-h-14 w-full items-center gap-3 rounded-xl bg-white px-4 py-2.5 text-left ring-1 ring-slate-900/5 hover:ring-primary/40 active:bg-slate-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-sm font-semibold">{o.title}</span>
                  {o.note && <span className="block truncate text-xs text-muted-foreground">{o.note}</span>}
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function CountStepView({ live, values, onDone }: { live: LiveSite; values: Values; onDone: (count: Count, sku: string) => void }) {
  const truck = truckOf(live, values.truck);
  // Read once: the ASN line must not change under the operator while they count.
  const [item] = useState(() => (truck ? asnLine(truck, simData) : null));
  const [qty, setQty] = useState(item?.qtyPerPallet ?? 0);
  const [qcHold, setQcHold] = useState(false);
  const [approved, setApproved] = useState(false);
  if (!item) return <p className="rounded-xl bg-white p-4 text-sm">This truck has left. Go back and scan another.</p>;
  const variance = Math.abs(qty - item.qtyPerPallet) / item.qtyPerPallet;
  const needsApproval = variance > VARIANCE;
  return (
    <section className="space-y-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-900/5">
      <div>
        <p className="text-xs font-semibold tracking-wide text-primary uppercase">Per ASN</p>
        <h2 className="text-lg font-semibold">
          {item.qtyPerPallet} × {item.item}
        </h2>
        <p className="font-mono text-sm text-muted-foreground">{item.sku}</p>
      </div>
      <div>
        <label htmlFor="qty" className="mb-1.5 block text-sm font-medium">
          Units counted
        </label>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="One less" onClick={() => setQty((q) => Math.max(0, q - 1))} className={cn(buttonVariants({ variant: "outline" }), "size-14 rounded-xl")}>
            <Minus className="size-5" />
          </button>
          <input
            id="qty"
            type="number"
            inputMode="numeric"
            min={0}
            value={qty}
            onChange={(e) => setQty(Math.max(0, Number(e.target.value) || 0))}
            className="h-14 min-w-0 flex-1 rounded-xl border-2 border-slate-200 text-center text-2xl font-semibold tabular-nums outline-none focus:border-primary"
          />
          <button type="button" aria-label="One more" onClick={() => setQty((q) => q + 1)} className={cn(buttonVariants({ variant: "outline" }), "size-14 rounded-xl")}>
            <Plus className="size-5" />
          </button>
        </div>
        {needsApproval && (
          <div className="mt-3 space-y-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-600/20">
            <p className="flex gap-2">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              {Math.round(variance * 100)}% off the ASN. More than {VARIANCE * 100}% needs a supervisor.
            </p>
            <label className="flex min-h-11 items-center gap-3 font-medium">
              <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} className="size-5 accent-amber-600" />
              Supervisor approved the variance
            </label>
          </div>
        )}
      </div>
      <label className="flex min-h-12 items-center gap-3 rounded-xl bg-slate-50 px-3 text-sm font-medium">
        <input type="checkbox" checked={qcHold} onChange={(e) => setQcHold(e.target.checked)} className="size-5 accent-primary" />
        Damaged or needs inspection: put on QC hold
      </label>
      <button
        type="button"
        disabled={qty <= 0 || (needsApproval && !approved)}
        onClick={() => onDone({ qty, qcHold, approved }, item.sku)}
        className={cn(buttonVariants(), big)}
      >
        Continue
      </button>
    </section>
  );
}

/** Units counted in one bin. Blind counts never show the system figure. */
function QtyStepView({ live, values, onDone }: { live: LiveSite; values: Values; onDone: (qty: string) => void }) {
  const task = countOf(live, values.task);
  const line = task?.lines.find((l) => l.bin === values.bin);
  const [qty, setQty] = useState("");
  if (!task || !line) return <p className="rounded-xl bg-white p-4 text-sm">This count has closed. Go back and scan another sheet.</p>;
  return (
    <form
      className="space-y-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-900/5"
      onSubmit={(e) => {
        e.preventDefault();
        if (qty !== "") onDone(qty);
      }}
    >
      <div>
        <p className="font-mono text-sm text-muted-foreground">Bin {line.bin}</p>
        <h2 className="text-lg font-semibold">{line.item}</h2>
        <p className="text-sm text-muted-foreground">{task.blind ? "Blind count: count every unit, the system figure stays hidden." : `System says ${line.expected} units`}</p>
      </div>
      <div className="grid gap-2">
        <label htmlFor="count-qty" className="text-sm font-medium">
          Units counted
        </label>
        <input
          id="count-qty"
          type="number"
          inputMode="numeric"
          min={0}
          autoFocus
          value={qty}
          onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ""))}
          className="h-14 w-full rounded-xl border-2 border-slate-200 text-center text-2xl font-semibold tabular-nums outline-none focus:border-primary"
        />
      </div>
      <button type="submit" disabled={qty === ""} className={cn(buttonVariants(), big)}>
        Continue
      </button>
    </form>
  );
}

export function ScanFlow({ flow }: { flow: FlowId }) {
  const def = flows[flow];
  const live = useActiveSite();
  const scan = useWarehouse((s) => s.scan);
  const [index, setIndex] = useState(0);
  const [values, setValues] = useState<Values>({});
  const [count, setCount] = useState<Count>({ qty: 0, qcHold: false, approved: false });
  const [phase, setPhase] = useState<"steps" | "review" | "done">("steps");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const step = def.steps[index];
  const total = def.steps.length;

  const advance = (next: Values) => {
    setValues(next);
    setError(null);
    buzz(40);
    if (index + 1 < total) setIndex(index + 1);
    else setPhase("review");
  };

  const onScan = (raw: string) => {
    if (step.kind !== "scan") return;
    const code = norm(raw);
    if (!code) return;
    const result = step.resolve(live, code, values);
    if ("error" in result) {
      setError(result.error);
      buzz([80, 40, 80]);
      return;
    }
    advance({ ...values, ...result.extra, [step.key]: result.value });
  };

  const confirm = () => {
    const err = scan(def.action(values, count));
    if (err) {
      setError(err);
      buzz([80, 40, 80]);
      return;
    }
    setMessage(useWarehouse.getState().scanLog[0]?.message ?? "Done");
    setError(null);
    setPhase("done");
    buzz([40, 30, 40]);
  };

  /** Back to step `to`, dropping everything scanned from there on. */
  const goTo = (to: number) => {
    const keys = new Set(def.steps.slice(0, to).map((s) => s.key));
    // `sku` is pinned by the bin (pick) or count (receive) step, so it goes when they go.
    setValues((v) => Object.fromEntries(Object.entries(v).filter(([k]) => keys.has(k) || (k === "sku" && (keys.has("bin") || keys.has("count"))))));
    setIndex(to);
    setPhase("steps");
    setError(null);
  };

  /** Restart, keeping the leading steps listed in `keep` while they are still valid (same truck or order). */
  const next = () => {
    let to = 0;
    const kept: Values = {};
    for (const s of def.steps) {
      if (s.kind !== "scan" || !def.keep.includes(s.key) || !values[s.key]) break;
      if ("error" in s.resolve(live, values[s.key], kept)) break;
      kept[s.key] = values[s.key];
      to += 1;
    }
    setValues(kept);
    setIndex(to);
    setPhase("steps");
    setError(null);
  };

  const sub = phase === "steps" ? `Step ${index + 1} of ${total}` : phase === "review" ? "Check and confirm" : "Done";
  const done = def.steps.slice(0, phase === "steps" ? index : total);

  return (
    <ScannerShell title={def.title} sub={`${sub} · ${live.site.name}`} back>
      <ol className="flex gap-1.5" aria-label="Progress">
        {def.steps.map((s, i) => (
          <li key={s.key} className={cn("h-1.5 flex-1 rounded-full", i < index || phase !== "steps" ? "bg-primary" : i === index ? "bg-primary/40" : "bg-slate-200")} />
        ))}
        <li className={cn("h-1.5 flex-1 rounded-full", phase === "done" ? "bg-primary" : phase === "review" ? "bg-primary/40" : "bg-slate-200")} />
      </ol>

      {done.length > 0 && phase !== "done" && (
        <ul className="flex flex-wrap gap-2" aria-label="Scanned so far">
          {done.map((s, i) => (
            <li key={s.key}>
              <button type="button" onClick={() => goTo(i)} className="flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-xs ring-1 ring-slate-900/10 hover:ring-primary/40">
                <CheckCircle2 className="size-3.5 text-emerald-600" />
                <span className="text-muted-foreground capitalize">{s.key === "count" ? "Count" : s.key}</span>
                <span className="font-mono font-semibold">{chipValue(live, s.key, values, count)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="flex gap-2 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700 ring-1 ring-red-600/20">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      {phase === "steps" && step.kind === "scan" && <ScanStepView key={step.key} live={live} step={step} values={values} onScan={onScan} />}
      {phase === "steps" && step.kind === "qty" && <QtyStepView key={values.bin} live={live} values={values} onDone={(qty) => advance({ ...values, qty })} />}
      {phase === "steps" && step.kind === "count" && (
        <CountStepView
          live={live}
          values={values}
          onDone={(c, sku) => {
            setCount(c);
            advance({ ...values, sku });
          }}
        />
      )}

      {phase === "review" && (
        <section className="space-y-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-900/5">
          <h2 className="text-lg font-semibold">Confirm {def.title.toLowerCase()}</h2>
          <dl className="divide-y divide-slate-100">
            {def.review(live, values, count).map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="text-right font-mono text-sm font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          <button type="button" onClick={confirm} className={cn(buttonVariants(), big)}>
            Confirm
          </button>
          <button type="button" onClick={() => goTo(0)} className={cn(buttonVariants({ variant: "ghost" }), big)}>
            Start over
          </button>
        </section>
      )}

      {phase === "done" && (
        <section className="flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-900/5">
          <span className="flex size-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/60">
            <CheckCircle2 className="size-10" />
          </span>
          <p role="status" className="text-lg font-semibold">
            {message}
          </p>
          <p className="text-sm text-muted-foreground">The live map has been updated.</p>
          <div className="mt-2 w-full space-y-2">
            <button type="button" onClick={next} className={cn(buttonVariants(), big)} autoFocus>
              {def.keep.length ? "Scan next pallet" : `${def.title} another`}
            </button>
            <Link href="/scanner" className={cn(buttonVariants({ variant: "outline" }), big)}>
              Back to tasks
            </Link>
          </div>
        </section>
      )}
    </ScannerShell>
  );
}
