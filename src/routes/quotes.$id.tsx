import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { DocumentDetail, InfoCard } from "@/components/DocumentDetail";
import { DeleteDocButton } from "@/components/DeleteDocButton";
import { useUpdateStatus, useInvalidateDocuments, useMarkDepositPaid } from "@/lib/queries";
import { buildInvoiceFromQuote } from "@/lib/documents";
import { money } from "@/lib/format";
import { ArrowRightCircle, ClipboardList, Banknote } from "lucide-react";

export const Route = createFileRoute("/quotes/$id")({
  component: QuoteDetail,
});

function QuoteDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const updateStatus = useUpdateStatus();
  const invalidateDocuments = useInvalidateDocuments();
  const markDepositPaid = useMarkDepositPaid();

  async function convertToInvoice(doc: any, items: any[]) {
    const { data: numData } = await supabase.rpc("generate_doc_number", { p_doc_type: "invoice" });
    const { data: inv, error } = await supabase
      .from("documents")
      .insert(buildInvoiceFromQuote(doc, numData as string, user?.id))
      .select()
      .single();
    if (error || !inv) { toast.error(error?.message ?? "Could not create invoice"); return; }
    if (items.length) {
      await supabase.from("line_items").insert(items.map((i: any) => ({
        document_id: inv.id, description: i.description, quantity: i.quantity,
        unit_price: i.unit_price, total_price: i.total_price, sort_order: i.sort_order,
      })));
    }
    await supabase.from("activity_log").insert({ document_id: doc.id, action: "converted_to_invoice", description: `Invoice ${inv.doc_number} created`, performed_by: user?.id });
    toast.success(`Invoice ${inv.doc_number} created from ${doc.doc_number}`);
    invalidateDocuments();
    navigate({ to: "/invoices/$id", params: { id: inv.id } });
  }

  async function createJobCard(doc: any) {
    const { data: numData } = await supabase.rpc("generate_doc_number", { p_doc_type: "job_card" });
    const { data: jc, error } = await supabase.from("documents").insert({
      doc_type: "job_card", doc_number: numData as string, parent_id: doc.id,
      customer_name: doc.customer_name, customer_email: doc.customer_email,
      project_description: doc.project_description, status: "pending",
      created_by: user?.id,
    }).select().single();
    if (error || !jc) { toast.error(error?.message ?? "Could not create job card"); return; }
    await supabase.from("activity_log").insert({ document_id: doc.id, action: "job_carded", description: `Job Card ${jc.doc_number} created`, performed_by: user?.id });
    toast.success(`Job Card ${jc.doc_number} created`);
    invalidateDocuments();
    navigate({ to: "/jobs" });
  }

  return (
    <DocumentDetail
      id={id}
      listLabel="Quotations"
      listTo="/quotes"
      extraCards={(doc) => {
        const depositRequired = Number(doc.deposit_required || 0);
        if (depositRequired <= 0) return null;
        return (
          <InfoCard label="Deposit Required">
            <div className="text-sm font-medium text-[color:var(--ink)]">{money(depositRequired)}</div>
            <div className={`mt-1 text-xs font-semibold uppercase tracking-wide ${doc.deposit_paid ? "text-[color:var(--eco)]" : "text-[color:var(--amber-warn)]"}`}>
              {doc.deposit_paid ? "Deposit paid" : "Awaiting deposit"}
            </div>
          </InfoCard>
        );
      }}
      actions={(doc, items) => {
        const depositRequired = Number(doc.deposit_required || 0);
        const showDepositPaid = depositRequired > 0 && !doc.deposit_paid;
        return (
          <>
            {doc.status !== "approved" && (
              <button
                onClick={() => updateStatus.mutate({ id: doc.id, status: "approved", docNumber: doc.doc_number })}
                className="press inline-flex items-center gap-2 rounded-[4px] bg-[color:var(--eco)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-white transition-all hover:brightness-95 active:scale-[0.97]"
              >
                Mark Approved
              </button>
            )}
            {showDepositPaid && (
              <button
                onClick={() =>
                  markDepositPaid.mutate({
                    id: doc.id,
                    amount: depositRequired,
                    docNumber: doc.doc_number,
                  })
                }
                disabled={markDepositPaid.isPending}
                className="press inline-flex items-center gap-2 rounded-[4px] border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--eco)] transition-colors hover:bg-[color:var(--offwhite)] active:scale-[0.97] disabled:opacity-60"
                style={{ borderColor: "var(--eco)" }}
              >
                <Banknote className="h-4 w-4" /> Deposit Paid
              </button>
            )}
            <button
              onClick={() => navigate({ to: "/quotes/edit/$id", params: { id: doc.id } })}
              className="press inline-flex items-center gap-2 rounded-[4px] border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--mid-navy)] transition-colors hover:bg-[color:var(--offwhite)] active:scale-[0.97]"
              style={{ borderColor: "var(--border)" }}
            >
              <Pencil className="h-4 w-4" /> Edit
            </button>
            <button
              onClick={() => convertToInvoice(doc, items)}
              className="press inline-flex items-center gap-2 rounded-[4px] bg-[color:var(--royal)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-white transition-all hover:bg-[color:var(--royal-deep)] active:scale-[0.97]"
            >
              <ArrowRightCircle className="h-4 w-4" /> Convert to Invoice
            </button>
            <button
              onClick={() => createJobCard(doc)}
              className="press inline-flex items-center gap-2 rounded-[4px] border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--royal)] transition-colors hover:bg-[color:var(--offwhite)] active:scale-[0.97]"
              style={{ borderColor: "var(--royal)" }}
            >
              <ClipboardList className="h-4 w-4" /> Create Job Card
            </button>
            <DeleteDocButton doc={doc} listTo="/quotes" label="Delete Quote" />
          </>
        );
      }}
    />
  );
}
