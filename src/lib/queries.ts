import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

/* ------------------------------------------------------------------ */
/* Query keys                                                          */
/* ------------------------------------------------------------------ */

export const qk = {
  documents: ["documents"] as const,
  document: (id: string) => ["document", id] as const,
  lineItems: (docId: string) => ["line-items", docId] as const,
  activity: (docId: string) => ["activity", docId] as const,
  jobTasks: ["job-tasks"] as const,
  profile: (userId: string) => ["profile", userId] as const,
};

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

async function fetchDocuments() {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** All documents, shared by the dashboard, sidebar counts, lists and tracker. */
export function useDocuments(enabled = true) {
  return useQuery({
    queryKey: qk.documents,
    queryFn: fetchDocuments,
    staleTime: 30_000,
    enabled,
  });
}

/** Documents of one type, derived from the shared cache (no extra request). */
export function useDocumentsByType(docType: string, enabled = true) {
  return useQuery({
    queryKey: qk.documents,
    queryFn: fetchDocuments,
    staleTime: 30_000,
    enabled,
    select: (docs) => docs.filter((d: any) => d.doc_type === docType),
  });
}

export function useDocument(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.document(id ?? ""),
    queryFn: async () => {
      const { data, error } = await supabase.from("documents").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    staleTime: 15_000,
    enabled: !!id,
  });
}

export function useLineItems(docId: string, enabled = true) {
  return useQuery({
    queryKey: qk.lineItems(docId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("line_items")
        .select("*")
        .eq("document_id", docId)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
    enabled,
  });
}

/** Activity log for a document, ascending by time. */
export function useActivity(docId: string, enabled = true) {
  return useQuery({
    queryKey: qk.activity(docId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_log")
        .select("*")
        .eq("document_id", docId)
        .order("performed_at");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 15_000,
    enabled,
  });
}

/** All job tasks (small table), grouped client-side per job card. */
export function useJobTasks(enabled = true) {
  return useQuery({
    queryKey: qk.jobTasks,
    queryFn: async () => {
      const { data, error } = await supabase.from("job_tasks").select("*").order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
    enabled,
  });
}

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: qk.profile(userId ?? ""),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("name, role")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
    enabled: !!userId,
  });
}

/** Current user's role ("admin" | "staff"), defaults to "staff" until loaded. */
export function useRole(): string {
  const { user } = useAuth();
  const { data } = useProfile(user?.id);
  return data?.role ?? "staff";
}

/** Whether the current user is an admin (may delete documents). */
export function useIsAdmin(): boolean {
  return useRole() === "admin";
}

export type CustomerSuggestion = { name: string; email: string; phone: string; address: string; vatNumber: string };

/** Unique customers derived from the shared documents cache, for autocomplete. */
export function useCustomers() {
  return useQuery({
    queryKey: qk.documents,
    queryFn: fetchDocuments,
    staleTime: 30_000,
    select: (docs): CustomerSuggestion[] => {
      const seen = new Set<string>();
      const list: CustomerSuggestion[] = [];
      for (const d of docs as any[]) {
        const key = (d.customer_name ?? "").toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        list.push({
          name: d.customer_name ?? "",
          email: d.customer_email ?? "",
          phone: d.customer_phone ?? "",
          address: d.customer_address ?? "",
          vatNumber: d.customer_vat_number ?? "",
        });
        if (list.length >= 50) break;
      }
      return list;
    },
  });
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

async function logActivity(documentId: string, action: string, description: string) {
  const { data: user } = await supabase.auth.getUser();
  await supabase.from("activity_log").insert({
    document_id: documentId,
    action,
    description,
    performed_by: user.user?.id,
  });
}

/** Invalidate every document-related cache after create/convert flows. */
export function useInvalidateDocuments() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: qk.documents });
}

/** Update a document's status with an optimistic cache update. */
export function useUpdateStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string; docNumber?: string }) => {
      const { error } = await supabase.from("documents").update({ status }).eq("id", id);
      if (error) throw error;
      await logActivity(id, "status_changed", `Marked ${status}`);
    },
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: qk.documents });
      const prevDocs = qc.getQueryData<any[]>(qk.documents);
      qc.setQueryData<any[]>(qk.documents, (docs) =>
        (docs ?? []).map((d) => (d.id === id ? { ...d, status } : d)),
      );
      const prevDoc = qc.getQueryData<any>(qk.document(id));
      if (prevDoc) qc.setQueryData(qk.document(id), { ...prevDoc, status });
      return { prevDocs, prevDoc, id };
    },
    onError: (err: any, _vars, ctx) => {
      if (ctx?.prevDocs) qc.setQueryData(qk.documents, ctx.prevDocs);
      if (ctx?.prevDoc) qc.setQueryData(qk.document(ctx.id), ctx.prevDoc);
      toast.error(err?.message ?? "Status update failed");
    },
    onSuccess: (_data, { status, docNumber }) => {
      if (docNumber) toast.success(`${docNumber} marked ${status.replace(/_/g, " ")}`);
    },
    onSettled: (_d, _e, { id }) => {
      qc.invalidateQueries({ queryKey: qk.documents });
      qc.invalidateQueries({ queryKey: qk.document(id) });
      qc.invalidateQueries({ queryKey: qk.activity(id) });
    },
  });
}

/** Toggle a job task complete/pending — optimistic, rolls back on failure. */
export function useToggleTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ task }: { task: any }) => {
      const completing = task.status !== "completed";
      const { error } = await supabase
        .from("job_tasks")
        .update({
          status: completing ? "completed" : "pending",
          completed_at: completing ? new Date().toISOString() : null,
        })
        .eq("id", task.id);
      if (error) throw error;
      return completing;
    },
    onMutate: async ({ task }) => {
      const completing = task.status !== "completed";
      await qc.cancelQueries({ queryKey: qk.jobTasks });
      const prev = qc.getQueryData<any[]>(qk.jobTasks);
      qc.setQueryData<any[]>(qk.jobTasks, (tasks) =>
        (tasks ?? []).map((t) =>
          t.id === task.id ? { ...t, status: completing ? "completed" : "pending" } : t,
        ),
      );
      return { prev };
    },
    onError: (err: any, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.jobTasks, ctx.prev);
      toast.error(err?.message ?? "Could not update task");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.jobTasks }),
  });
}

export function useAddTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ jobId, description, sortOrder }: { jobId: string; description: string; sortOrder: number }) => {
      const { error } = await supabase
        .from("job_tasks")
        .insert({ job_card_id: jobId, task_description: description, sort_order: sortOrder });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Task added"),
    onError: (err: any) => toast.error(err?.message ?? "Could not add task"),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.jobTasks }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId }: { taskId: string }) => {
      const { error } = await supabase.from("job_tasks").delete().eq("id", taskId);
      if (error) throw error;
    },
    onMutate: async ({ taskId }) => {
      await qc.cancelQueries({ queryKey: qk.jobTasks });
      const prev = qc.getQueryData<any[]>(qk.jobTasks);
      qc.setQueryData<any[]>(qk.jobTasks, (tasks) => (tasks ?? []).filter((t) => t.id !== taskId));
      return { prev };
    },
    onError: (err: any, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.jobTasks, ctx.prev);
      toast.error(err?.message ?? "Could not delete task");
    },
    onSuccess: () => toast.success("Task deleted"),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.jobTasks }),
  });
}

export function useDeleteJob() {
  const qc = useQueryClient();
  return useMutation({
    // Deleting the document cascades to its job_tasks / line_items / activity,
    // so this stays atomic (no partial delete if the caller lacks permission).
    mutationFn: async ({ job }: { job: any }) => {
      const { error } = await supabase.from("documents").delete().eq("id", job.id);
      if (error) throw error;
    },
    onSuccess: (_d, { job }) => toast.success(`${job.doc_number} deleted`),
    onError: (err: any) => toast.error(err?.message ?? "Could not delete job card"),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.documents });
      qc.invalidateQueries({ queryKey: qk.jobTasks });
    },
  });
}

/** Delete any document (quote / invoice / delivery / job card). Admin-only via RLS. */
export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ doc }: { doc: any }) => {
      const { error } = await supabase.from("documents").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: (_d, { doc }) => toast.success(`${doc.doc_number} deleted`),
    onError: (err: any) => toast.error(err?.message ?? "Could not delete document"),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.documents });
      qc.invalidateQueries({ queryKey: qk.jobTasks });
    },
  });
}

/** Mark a quote deposit as received. */
export function useMarkDepositPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, amount, docNumber }: { id: string; amount: number; docNumber: string }) => {
      const { error } = await supabase.from("documents").update({ deposit_paid: true }).eq("id", id);
      if (error) throw error;
      await logActivity(id, "deposit_paid", `Deposit of R ${amount.toFixed(2)} received`);
      return docNumber;
    },
    onSuccess: (docNumber) => toast.success(`Deposit marked paid on ${docNumber}`),
    onError: (err: any) => toast.error(err?.message ?? "Could not mark deposit paid"),
    onSettled: (_d, _e, { id }) => {
      qc.invalidateQueries({ queryKey: qk.documents });
      qc.invalidateQueries({ queryKey: qk.document(id) });
      qc.invalidateQueries({ queryKey: qk.activity(id) });
    },
  });
}

/** Record a partial or full payment on an invoice. */
export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ doc, amount }: { doc: any; amount: number }) => {
      const total = Number(doc.total || 0);
      const currentPaid = Number(doc.amount_paid || 0);
      const newPaid = Math.min(total, Number((currentPaid + amount).toFixed(2)));
      const status = newPaid >= total ? "paid" : "part_paid";
      const { error } = await supabase
        .from("documents")
        .update({ amount_paid: newPaid, status })
        .eq("id", doc.id);
      if (error) throw error;
      await logActivity(
        doc.id,
        "payment_recorded",
        `Payment of R ${amount.toFixed(2)} recorded (R ${newPaid.toFixed(2)} total paid)`,
      );
      return { docNumber: doc.doc_number as string, status, newPaid };
    },
    onSuccess: ({ docNumber, status }) =>
      toast.success(`${docNumber} ${status === "paid" ? "fully paid" : "payment recorded"}`),
    onError: (err: any) => toast.error(err?.message ?? "Could not record payment"),
    onSettled: (_d, _e, { doc }) => {
      qc.invalidateQueries({ queryKey: qk.documents });
      qc.invalidateQueries({ queryKey: qk.document(doc.id) });
      qc.invalidateQueries({ queryKey: qk.activity(doc.id) });
    },
  });
}

/** Mark an invoice fully paid (sets amount_paid = total). */
export function useMarkInvoicePaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ doc }: { doc: any }) => {
      const total = Number(doc.total || 0);
      const { error } = await supabase
        .from("documents")
        .update({ amount_paid: total, status: "paid" })
        .eq("id", doc.id);
      if (error) throw error;
      await logActivity(doc.id, "status_changed", "Marked paid");
      return doc.doc_number as string;
    },
    onSuccess: (docNumber) => toast.success(`${docNumber} marked paid`),
    onError: (err: any) => toast.error(err?.message ?? "Could not mark paid"),
    onSettled: (_d, _e, { doc }) => {
      qc.invalidateQueries({ queryKey: qk.documents });
      qc.invalidateQueries({ queryKey: qk.document(doc.id) });
      qc.invalidateQueries({ queryKey: qk.activity(doc.id) });
    },
  });
}
