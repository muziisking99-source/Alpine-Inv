/** Shared document conversion helpers. */

export function buildInvoiceFromQuote(quote: {
  id: string;
  customer_name: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  customer_vat_number?: string | null;
  project_description?: string | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  deposit_required?: number | null;
  deposit_paid?: boolean | null;
}, docNumber: string, userId?: string | null) {
  const depositRequired = Number(quote.deposit_required || 0);
  const depositPaid = Boolean(quote.deposit_paid) && depositRequired > 0;
  const amountPaid = depositPaid ? depositRequired : 0;

  return {
    doc_type: "invoice" as const,
    doc_number: docNumber,
    parent_id: quote.id,
    customer_name: quote.customer_name,
    customer_email: quote.customer_email,
    customer_phone: quote.customer_phone,
    customer_address: quote.customer_address,
    customer_vat_number: quote.customer_vat_number,
    project_description: quote.project_description,
    subtotal: quote.subtotal,
    tax_rate: quote.tax_rate,
    tax_amount: quote.tax_amount,
    total: quote.total,
    deposit_required: depositRequired,
    deposit_paid: depositPaid,
    amount_paid: amountPaid,
    status: depositPaid ? "part_paid" : "unpaid",
    created_by: userId,
  };
}
