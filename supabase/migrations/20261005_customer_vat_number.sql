-- Customer VAT number stored on quotes and carried onto invoices.

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS customer_vat_number text;
