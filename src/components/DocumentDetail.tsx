import type { ReactNode } from "react";
import { toast } from "sonner";
import { useDocument, useLineItems, useActivity } from "@/lib/queries";
import { StatusBadge } from "@/components/StatusBadge";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { money, fmtDate, DOC_LABEL } from "@/lib/format";
import { generatePDF } from "@/lib/pdf";
import { FileDown } from "lucide-react";

type Props = {
  id: string;
  listLabel: string;
  listTo: string;
  /** Extra info cards after Customer/Project/Date (e.g. due date, parent doc). */
  extraCards?: (doc: any) => ReactNode;
  /** Action buttons after the PDF button. */
  actions?: (doc: any, items: any[]) => ReactNode;
  /** Extra options forwarded to generatePDF (e.g. parentRef). */
  pdfOptions?: (doc: any) => Record<string, unknown>;
};

export function DocumentDetail({ id, listLabel, listTo, extraCards, actions, pdfOptions }: Props) {
  const { data: docData, isPending } = useDocument(id);
  const { data: items = [] } = useLineItems(id);
  const { data: activityAsc = [] } = useActivity(id);
  const activity = [...activityAsc].reverse();

  if (isPending || !docData) return <DetailSkeleton />;
  const doc = docData;

  async function handlePDF() {
    await generatePDF(
      doc,
      items.map((i: any) => ({
        description: i.description,
        quantity: Number(i.quantity),
        unit_price: Number(i.unit_price),
        total_price: Number(i.total_price),
      })),
      pdfOptions?.(doc),
    );
    toast.success(`${doc.doc_number} downloaded`);
  }

  return (
    <div>
      <Breadcrumbs items={[{ label: listLabel, to: listTo }, { label: doc.doc_number }]} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="label-caps">{DOC_LABEL[doc.doc_type]}</div>
          <h1 className="page-title mt-1 font-serif text-4xl leading-none">{doc.doc_number}</h1>
          <div className="mt-3"><StatusBadge status={doc.status} /></div>
        </div>
        <div className="flex w-full flex-wrap gap-2 md:w-auto md:justify-end">
          <button
            onClick={handlePDF}
            className="press inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[4px] border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--mid-navy)] transition-colors hover:bg-[color:var(--offwhite)] active:scale-[0.97] sm:flex-none"
            style={{ borderColor: "var(--border)" }}
          >
            <FileDown className="h-4 w-4" /> PDF
          </button>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto [&>button]:min-h-11 [&>button]:flex-1 [&>button]:justify-center sm:[&>button]:flex-none">
            {actions?.(doc, items)}
          </div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        <InfoCard label="Customer">
          <div className="text-sm text-[color:var(--ink)]">{doc.customer_name}</div>
          <div className="mt-1 text-xs text-[color:var(--muted-navy)]">{doc.customer_email}</div>
          <div className="text-xs text-[color:var(--muted-navy)]">{doc.customer_address}</div>
          <div className="text-xs text-[color:var(--muted-navy)]">{doc.customer_phone}</div>
          {doc.customer_vat_number && (
            <div className="text-xs text-[color:var(--muted-navy)]">VAT No: {doc.customer_vat_number}</div>
          )}
        </InfoCard>
        <InfoCard label="Project">
          <div className="text-sm text-[color:var(--ink)]">{doc.project_description || "—"}</div>
        </InfoCard>
        <InfoCard label="Date">
          <div className="text-sm text-[color:var(--ink)]">{fmtDate(doc.doc_date)}</div>
        </InfoCard>
        {extraCards?.(doc)}
      </div>

      {items.length > 0 && (
        <div className="mt-8 rounded-md border bg-white" style={{ borderColor: "var(--border)" }}>
          {/* Desktop table */}
          <table className="hidden w-full sm:table">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th className="px-6 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--muted-navy)]">Description</th>
                <th className="px-6 py-3 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--muted-navy)]">Qty</th>
                <th className="px-6 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--muted-navy)]">Unit</th>
                <th className="px-6 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--muted-navy)]">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i: any) => (
                <tr key={i.id} className="border-b" style={{ borderColor: "var(--border)" }}>
                  <td className="px-6 py-3 text-sm text-[color:var(--ink)]">{i.description}</td>
                  <td className="px-6 py-3 text-center text-sm">{Number(i.quantity)}</td>
                  <td className="px-6 py-3 text-right text-sm">{money(i.unit_price)}</td>
                  <td className="px-6 py-3 text-right text-sm font-medium">{money(i.total_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile cards */}
          <div className="divide-y sm:hidden" style={{ borderColor: "var(--border)" }}>
            {items.map((i: any) => (
              <div key={i.id} className="p-4">
                <div className="text-sm font-medium text-[color:var(--ink)]">{i.description}</div>
                <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <div className="label-caps mb-1">Qty</div>
                    <div className="text-sm text-[color:var(--ink)]">{Number(i.quantity)}</div>
                  </div>
                  <div>
                    <div className="label-caps mb-1">Unit</div>
                    <div className="text-sm text-[color:var(--ink)]">{money(i.unit_price)}</div>
                  </div>
                  <div className="text-right">
                    <div className="label-caps mb-1">Total</div>
                    <div className="text-sm font-medium text-[color:var(--ink)]">{money(i.total_price)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end px-4 py-4 sm:px-6">
            <div className="w-full sm:w-72">
              <div className="flex justify-between py-1 text-sm text-[color:var(--mid-navy)]"><span>Subtotal</span><span>{money(doc.subtotal)}</span></div>
              <div className="flex justify-between py-1 text-sm text-[color:var(--mid-navy)]"><span>Tax ({doc.tax_rate}%)</span><span>{money(doc.tax_amount)}</span></div>
              <div className="mt-2 flex items-baseline justify-between border-t pt-2" style={{ borderColor: "var(--border)" }}>
                <span className="label-caps">Total</span>
                <span className="font-serif text-2xl text-[color:var(--royal)]">{money(doc.total)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {doc.notes && (
        <div className="mt-6 rounded-md border p-5" style={{ borderColor: "var(--border)" }}>
          <div className="label-caps mb-2">Notes</div>
          <div className="text-sm text-[color:var(--mid-navy)]">{doc.notes}</div>
        </div>
      )}

      <div className="mt-10">
        <h3 className="font-serif text-xl">Activity</h3>
        <div className="mt-4 space-y-3">
          {activity.map((a: any) => (
            <div key={a.id} className="flex items-start gap-3 rounded-md border p-3" style={{ borderColor: "var(--border)" }}>
              <div className="mt-1.5 h-2 w-2 rounded-full" style={{ backgroundColor: "var(--royal)" }} />
              <div>
                <div className="text-sm text-[color:var(--ink)]">{a.description || a.action}</div>
                <div className="text-[11px] text-[color:var(--muted-navy)]">{fmtDate(a.performed_at)}</div>
              </div>
            </div>
          ))}
          {activity.length === 0 && <div className="text-sm text-[color:var(--muted-navy)]">No activity yet.</div>}
        </div>
      </div>
    </div>
  );
}

export function InfoCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-md border p-5" style={{ borderColor: "var(--border)" }}>
      <div className="label-caps mb-2">{label}</div>
      {children}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div>
      <div className="skeleton h-4 w-48" />
      <div className="mt-6 flex items-start justify-between">
        <div>
          <div className="skeleton h-3 w-20" />
          <div className="skeleton mt-2 h-10 w-52" />
          <div className="skeleton mt-3 h-6 w-24 rounded-full" />
        </div>
        <div className="flex gap-2">
          <div className="skeleton h-9 w-24" />
          <div className="skeleton h-9 w-36" />
        </div>
      </div>
      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton h-28 w-full" />
        ))}
      </div>
      <div className="skeleton mt-8 h-64 w-full" />
    </div>
  );
}
