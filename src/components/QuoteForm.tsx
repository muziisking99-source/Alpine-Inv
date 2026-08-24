import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "motion/react";
import { StatusBadge } from "./StatusBadge";
import { money } from "@/lib/format";
import { useCustomers } from "@/lib/queries";
import { Trash2, Plus } from "lucide-react";

type Item = { _id: number; description: string; quantity: number; unit_price: number; total_price: number };
type Payload = {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_address: string;
  project_description: string;
  notes: string;
  doc_date: string;
  due_date: string | null;
  tax_rate: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  deposit_required: number;
};

let ITEM_SEQ = 1;
const nextId = () => ITEM_SEQ++;

export function QuoteForm({
  onSubmit,
  initial,
  title = "New Quotation",
  status = "draft",
  draftLabel = "Save as Draft",
  sendLabel = "Send Quote",
}: {
  onSubmit: (payload: Payload, items: Omit<Item, "_id">[], send: boolean) => Promise<void>;
  initial?: Partial<Payload> & { items?: Omit<Item, "_id">[] };
  title?: string;
  status?: string;
  draftLabel?: string;
  sendLabel?: string;
}) {
  const [customerName, setCustomerName] = useState(initial?.customer_name ?? "");
  const [customerEmail, setCustomerEmail] = useState(initial?.customer_email ?? "");
  const [customerPhone, setCustomerPhone] = useState(initial?.customer_phone ?? "");
  const [customerAddress, setCustomerAddress] = useState(initial?.customer_address ?? "");
  const [project, setProject] = useState(initial?.project_description ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [docDate, setDocDate] = useState(initial?.doc_date ?? new Date().toISOString().slice(0, 10));
  const [taxRate, setTaxRate] = useState<number>(initial?.tax_rate ?? 0);
  const [depositPercent, setDepositPercent] = useState<number>(() => {
    if (initial?.deposit_required && initial?.total && Number(initial.total) > 0) {
      return Math.round((Number(initial.deposit_required) / Number(initial.total)) * 100);
    }
    return 70;
  });
  const [items, setItems] = useState<Item[]>(
    (initial?.items ?? [{ description: "", quantity: 1, unit_price: 0, total_price: 0 }]).map((it) => ({ ...it, _id: nextId() })),
  );
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const focusIdRef = useRef<number | null>(null);
  const rowInputs = useRef<Record<number, HTMLInputElement | null>>({});

  const { data: customers = [] } = useCustomers();

  // Auto-focus a freshly added line item's description field.
  useEffect(() => {
    if (focusIdRef.current != null) {
      rowInputs.current[focusIdRef.current]?.focus();
      focusIdRef.current = null;
    }
  }, [items]);

  function pickCustomer(name: string) {
    setCustomerName(name);
    const match = customers.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (match) {
      if (match.email) setCustomerEmail(match.email);
      if (match.phone) setCustomerPhone(match.phone);
      if (match.address) setCustomerAddress(match.address);
    }
  }

  function updateItem(id: number, patch: Partial<Item>) {
    setItems((prev) =>
      prev.map((it) => {
        if (it._id !== id) return it;
        const next = { ...it, ...patch };
        next.total_price = Number((Number(next.quantity) * Number(next.unit_price)).toFixed(2));
        return next;
      }),
    );
  }

  function addItem() {
    const id = nextId();
    focusIdRef.current = id;
    setItems((p) => [...p, { _id: id, description: "", quantity: 1, unit_price: 0, total_price: 0 }]);
  }

  function removeItem(id: number) {
    setItems((p) => p.filter((it) => it._id !== id));
  }

  const subtotal = items.reduce((s, it) => s + Number(it.total_price || 0), 0);
  const taxAmount = Number(((subtotal * taxRate) / 100).toFixed(2));
  const total = Number((subtotal + taxAmount).toFixed(2));
  const depositRequired =
    total > 0 && depositPercent > 0
      ? Number(((total * depositPercent) / 100).toFixed(2))
      : 0;

  const validItems = items.filter((it) => it.description.trim());
  const emailValid = !customerEmail.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim());
  const errors = {
    customer_name: !customerName.trim() ? "Customer name is required." : "",
    customer_email: !emailValid ? "Enter a valid email address." : "",
    items: validItems.length === 0 ? "Add at least one line item with a description." : "",
  };
  const hasErrors = Object.values(errors).some(Boolean);
  const showErr = (field: keyof typeof errors) => (touched[field] || submitAttempted) && errors[field];

  async function submit(send: boolean) {
    setSubmitAttempted(true);
    if (hasErrors) {
      toast.error("Please fix the highlighted fields.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit(
        {
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerPhone,
          customer_address: customerAddress,
          project_description: project,
          notes,
          doc_date: docDate,
          due_date: null,
          tax_rate: taxRate,
          subtotal,
          tax_amount: taxAmount,
          total,
          deposit_required: depositRequired,
        },
        validItems.map(({ _id, ...rest }) => rest),
        send,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="page-title font-serif text-4xl leading-none">{title}</h1>
        <StatusBadge status={status} />
      </div>

      <datalist id="customer-names">
        {customers.map((c) => (
          <option key={c.name} value={c.name} />
        ))}
      </datalist>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        <Field label="Date">
          <input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Customer Name" error={showErr("customer_name") || undefined}>
          <input
            list="customer-names"
            value={customerName}
            onChange={(e) => pickCustomer(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, customer_name: true }))}
            placeholder="Start typing to autocomplete…"
            className={inputCls}
            aria-invalid={!!showErr("customer_name")}
          />
        </Field>
        <Field label="Customer Email" error={showErr("customer_email") || undefined}>
          <input
            type="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, customer_email: true }))}
            className={inputCls}
            aria-invalid={!!showErr("customer_email")}
          />
        </Field>
        <Field label="Customer Phone">
          <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className={inputCls} />
        </Field>
        <div className="md:col-span-2">
          <Field label="Customer Address">
            <input value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Project / Job Description">
            <input value={project} onChange={(e) => setProject(e.target.value)} className={inputCls} />
          </Field>
        </div>
      </div>

      <div className="mt-10">
        <div className="label-caps mb-3">Line Items</div>
        <div className="rounded-md border" style={{ borderColor: "var(--border)" }}>
          {/* Desktop column headers */}
          <div className="hidden grid-cols-[1fr_80px_120px_120px_40px] items-center gap-3 border-b bg-[color:var(--offwhite)] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--muted-navy)] md:grid" style={{ borderColor: "var(--border)" }}>
            <div>Description</div>
            <div className="text-center">Qty</div>
            <div className="text-right">Unit Price</div>
            <div className="text-right">Total</div>
            <div />
          </div>
          <AnimatePresence initial={false}>
          {items.map((it) => (
            <motion.div
              key={it._id}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 40 }}
              className="group overflow-hidden border-b"
              style={{ borderColor: "var(--border)" }}
            >
              {/* Mobile card layout */}
              <div className="space-y-3 p-4 md:hidden">
                <div className="flex items-start justify-between gap-2">
                  <input
                    ref={(el) => { rowInputs.current[it._id] = el; }}
                    value={it.description}
                    onChange={(e) => updateItem(it._id, { description: e.target.value })}
                    placeholder="Item description"
                    className="min-h-11 flex-1 border-b bg-transparent py-2 text-sm outline-none focus:border-[color:var(--royal)]"
                    style={{ borderColor: "var(--border)" }}
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(it._id)}
                    title="Remove line item"
                    aria-label="Remove line item"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded border text-[color:var(--danger)]"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <label className="block">
                    <div className="label-caps mb-1">Qty</div>
                    <NumberInput
                      value={it.quantity}
                      onCommit={(v) => updateItem(it._id, { quantity: v })}
                      className="min-h-11 w-full rounded border bg-white px-2 text-center text-sm outline-none focus:border-[color:var(--royal)]"
                      align="center"
                    />
                  </label>
                  <label className="block">
                    <div className="label-caps mb-1">Unit</div>
                    <MoneyInput
                      value={it.unit_price}
                      onCommit={(v) => updateItem(it._id, { unit_price: v })}
                      mobile
                    />
                  </label>
                  <div>
                    <div className="label-caps mb-1">Total</div>
                    <div className="flex min-h-11 items-center justify-end rounded bg-[color:var(--offwhite)] px-2 text-sm font-medium">{money(it.total_price)}</div>
                  </div>
                </div>
              </div>

              {/* Desktop grid layout */}
              <div className="hidden grid-cols-[1fr_80px_120px_120px_40px] items-center gap-3 px-4 py-2.5 md:grid">
                <input
                  ref={(el) => { rowInputs.current[it._id] = el; }}
                  value={it.description}
                  onChange={(e) => updateItem(it._id, { description: e.target.value })}
                  placeholder="Item description"
                  className="border-b bg-transparent py-1 text-sm outline-none focus:border-[color:var(--royal)]"
                  style={{ borderColor: "var(--border)" }}
                />
                <NumberInput
                  value={it.quantity}
                  onCommit={(v) => updateItem(it._id, { quantity: v })}
                  className="border-b bg-transparent py-1 text-center text-sm outline-none focus:border-[color:var(--royal)]"
                  align="center"
                />
                <MoneyInput
                  value={it.unit_price}
                  onCommit={(v) => updateItem(it._id, { unit_price: v })}
                />
                <div className="rounded bg-[color:var(--offwhite)] px-2 py-1 text-right text-sm">{money(it.total_price)}</div>
                <button
                  type="button"
                  onClick={() => removeItem(it._id)}
                  className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                  title="Remove line item"
                  aria-label="Remove line item"
                >
                  <Trash2 className="h-4 w-4 text-[color:var(--danger)]" />
                </button>
              </div>
            </motion.div>
          ))}
          </AnimatePresence>
          <button
            onClick={addItem}
            className="flex w-full items-center justify-center gap-2 border-t border-dashed py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--royal)] transition-colors hover:bg-[color:var(--offwhite)] active:scale-[0.99]"
            style={{ borderColor: "var(--royal)" }}
          >
            <Plus className="h-3.5 w-3.5" /> Add Line Item
          </button>
        </div>
        {showErr("items") && <p className="mt-2 text-xs text-[color:var(--danger)]">{errors.items}</p>}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-[1fr_320px]">
        <Field label="Notes">
          <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
        </Field>

        <div className="rounded-md border p-5" style={{ borderColor: "var(--border)" }}>
          <Row label="Subtotal" value={money(subtotal)} />
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-[color:var(--mid-navy)]">Tax %</span>
            <input
              type="number"
              min={0}
              value={taxRate}
              onChange={(e) => setTaxRate(Number(e.target.value))}
              className="w-20 rounded border bg-white px-2 py-1 text-right text-sm outline-none"
              style={{ borderColor: "var(--border)" }}
            />
          </div>
          <Row label="Tax" value={money(taxAmount)} />
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-[color:var(--mid-navy)]">Deposit %</span>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={depositPercent}
                onChange={(e) => setDepositPercent(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                className="w-16 rounded border bg-white px-2 py-1 text-right text-sm outline-none"
                style={{ borderColor: "var(--border)" }}
              />
              <span className="text-[color:var(--muted-navy)]">%</span>
            </div>
          </div>
          {depositPercent > 0 && (
            <Row label="Deposit amount" value={money(depositRequired)} />
          )}
          <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-baseline justify-between">
              <span className="label-caps">Total</span>
              <span className="font-serif text-3xl text-[color:var(--royal)]">{money(total)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap justify-end gap-3">
        <button
          disabled={busy}
          onClick={() => submit(false)}
          className="press rounded-[4px] border px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--mid-navy)] transition-colors hover:bg-[color:var(--offwhite)] active:scale-[0.97] disabled:opacity-60"
          style={{ borderColor: "var(--border)" }}
        >
          {draftLabel}
        </button>
        <button
          disabled={busy}
          onClick={() => submit(true)}
          className="press inline-flex items-center rounded-[4px] bg-[color:var(--eco)] px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white transition-all hover:brightness-95 active:scale-[0.97] disabled:opacity-60"
        >
          <span className="grid">
            <span className={`col-start-1 row-start-1 transition-opacity duration-150 ${busy ? "opacity-0" : "opacity-100"}`}>
              {sendLabel}
            </span>
            <span className={`col-start-1 row-start-1 flex items-center justify-center transition-opacity duration-150 ${busy ? "opacity-100" : "opacity-0"}`}>
              <Spinner />
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
  );
}

const inputCls =
  "w-full border-b bg-transparent py-2 text-sm outline-none transition-colors focus:border-[color:var(--royal)]";

function Field({ label, error, children }: { label: string; error?: string; children: any }) {
  return (
    <label className="block">
      <div className="label-caps mb-1.5">{label}</div>
      {children}
      {error && <p className="mt-1 text-xs text-[color:var(--danger)]">{error}</p>}
    </label>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-[color:var(--mid-navy)]">{label}</span>
      <span className="text-[color:var(--ink)]">{value}</span>
    </div>
  );
}

/** Money field that shows a raw number while focused and formats (R 4,250.00) on blur. */
function MoneyInput({ value, onCommit, mobile }: { value: number; onCommit: (v: number) => void; mobile?: boolean }) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(String(value));
  return (
    <input
      inputMode="decimal"
      value={focused ? draft : money(value)}
      onFocus={() => { setDraft(value ? String(value) : ""); setFocused(true); }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const parsed = Number(draft.replace(/[^0-9.-]/g, "")) || 0;
        onCommit(Number(parsed.toFixed(2)));
        setFocused(false);
      }}
      className={
        mobile
          ? "min-h-11 w-full rounded border bg-white px-2 text-right text-sm outline-none focus:border-[color:var(--royal)]"
          : "w-full border-b bg-transparent py-1 text-right text-sm outline-none focus:border-[color:var(--royal)]"
      }
      style={{ borderColor: "var(--border)" }}
    />
  );
}

/** Quantity field that groups thousands on blur but stays raw while editing. */
function NumberInput({ value, onCommit, className, align }: { value: number; onCommit: (v: number) => void; className: string; align: "center" | "right" }) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const display = focused ? draft : new Intl.NumberFormat("en-ZA").format(value || 0);
  return (
    <input
      inputMode="numeric"
      value={display}
      style={{ borderColor: "var(--border)", textAlign: align }}
      onFocus={() => { setDraft(value ? String(value) : ""); setFocused(true); }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const parsed = Number(draft.replace(/[^0-9.-]/g, "")) || 0;
        onCommit(parsed);
        setFocused(false);
      }}
      className={className}
    />
  );
}
