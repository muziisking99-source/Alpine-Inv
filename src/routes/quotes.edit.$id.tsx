import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { QuoteForm } from "@/components/QuoteForm";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { supabase } from "@/integrations/supabase/client";
import { useDocument, useLineItems, useInvalidateDocuments, qk } from "@/lib/queries";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/quotes/edit/$id")({
  component: EditQuote,
});

function EditQuote() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const invalidateDocuments = useInvalidateDocuments();
  const { data: doc, isPending } = useDocument(id);
  const { data: items = [], isPending: itemsPending } = useLineItems(id);

  async function handleSave(payload: any, newItems: any[], sendMode: boolean) {
    if (!user || !doc) return;
    const { error } = await supabase
      .from("documents")
      .update({
        ...payload,
        status: sendMode ? "sent" : doc.status,
      })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }

    await supabase.from("line_items").delete().eq("document_id", id);
    if (newItems.length) {
      await supabase
        .from("line_items")
        .insert(newItems.map((it, i) => ({ ...it, document_id: id, sort_order: i })));
    }

    await supabase.from("activity_log").insert({
      document_id: id,
      action: sendMode ? "sent" : "updated",
      description: `Quote ${doc.doc_number} ${sendMode ? "sent" : "updated"}`,
      performed_by: user.id,
    });

    toast.success(`Quote ${doc.doc_number} updated`);
    invalidateDocuments();
    qc.invalidateQueries({ queryKey: qk.document(id) });
    qc.invalidateQueries({ queryKey: qk.lineItems(id) });
    qc.invalidateQueries({ queryKey: qk.activity(id) });
    navigate({ to: "/quotes/$id", params: { id } });
  }

  if (isPending || itemsPending || !doc) {
    return (
      <div>
        <div className="skeleton h-4 w-48" />
        <div className="skeleton mt-6 h-10 w-64" />
        <div className="skeleton mt-8 h-64 w-full" />
      </div>
    );
  }

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: "Quotations", to: "/quotes" },
          { label: doc.doc_number, to: `/quotes/${doc.id}` },
          { label: "Edit" },
        ]}
      />
      <QuoteForm
        title={`Edit ${doc.doc_number}`}
        status={doc.status}
        draftLabel="Save Changes"
        sendLabel="Save & Send"
        initial={{
          customer_name: doc.customer_name ?? "",
          customer_email: doc.customer_email ?? "",
          customer_phone: doc.customer_phone ?? "",
          customer_address: doc.customer_address ?? "",
          project_description: doc.project_description ?? "",
          notes: doc.notes ?? "",
          doc_date: doc.doc_date ?? undefined,
          tax_rate: Number(doc.tax_rate ?? 0),
          total: Number(doc.total ?? 0),
          deposit_required: Number(doc.deposit_required ?? 0),
          items: items.map((i: any) => ({
            description: i.description,
            quantity: Number(i.quantity),
            unit_price: Number(i.unit_price),
            total_price: Number(i.total_price),
          })),
        }}
        onSubmit={handleSave}
      />
    </div>
  );
}
