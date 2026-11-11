"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getLeadSettings, saveLeadSettings, sendTestLeadEmail } from "@/lib/api/admin";
import { showErrorToast, showSuccessToast } from "@/utils/toast";

const fieldClass =
  "h-9 w-full rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm";

const errorText = (error: any, fallback: string) => {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  // FastAPI validation errors arrive as a list of {msg}.
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  return fallback;
};

/** Who gets lead alerts and the monthly report for one assistant, and its WhatsApp handoff number. */
export default function LeadSettingsCard({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [emails, setEmails] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  const settings = useQuery({
    queryKey: ["admin", "lead-settings", agentId],
    queryFn: () => getLeadSettings(agentId),
    enabled: !!agentId,
    retry: false,
  });

  useEffect(() => {
    if (!settings.data) return;
    setEnabled(settings.data.lead_notify_enabled);
    setEmails(settings.data.lead_notify_emails.join(", "));
    setWhatsapp(settings.data.lead_whatsapp_number || "");
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () =>
      saveLeadSettings(agentId, {
        lead_notify_enabled: enabled,
        lead_notify_emails: emails.split(/[\s,;]+/).filter(Boolean),
        lead_whatsapp_number: whatsapp.trim(),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["admin", "lead-settings", agentId], data);
      showSuccessToast("Settings saved");
    },
    onError: (error) => showErrorToast(errorText(error, "Could not save the settings.")),
  });

  const testEmail = useMutation({
    mutationFn: () => sendTestLeadEmail(agentId),
    onSuccess: (data) => showSuccessToast(`Test email sent to ${data.recipients.join(", ")}`),
    onError: (error) => showErrorToast(errorText(error, "Could not send the test email.")),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <h2 className="text-xl font-semibold">Alert settings</h2>
        <p className="text-sm text-muted-foreground">
          Where this assistant&apos;s lead alerts and monthly report are sent, and the WhatsApp number offered to
          visitors.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {settings.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : settings.isError ? (
          <p className="text-sm text-red-600">{errorText(settings.error, "Could not load the settings.")}</p>
        ) : (
          <>
            {settings.data && !settings.data.smtp_configured && (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Email sending is not set up on the server yet, so nothing will be emailed.
              </p>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              Email the client when a visitor leaves contact details, and send the monthly report
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Client email addresses (separate with commas)
              <input type="text" className={fieldClass} value={emails} placeholder="owner@example.com, sales@example.com"
                onChange={(e) => setEmails(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm max-w-sm">
              Client WhatsApp number (shows a &quot;Chat on WhatsApp&quot; button in the chat; leave empty to hide it)
              <input type="tel" className={fieldClass} value={whatsapp} placeholder="+977 98XXXXXXXX"
                onChange={(e) => setWhatsapp(e.target.value)} />
            </label>
            <div className="flex flex-wrap gap-3">
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
                <Save className="mr-2 h-4 w-4" />
                {save.isPending ? "Saving…" : "Save"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => testEmail.mutate()}
                disabled={testEmail.isPending || !settings.data?.lead_notify_emails.length || !settings.data?.smtp_configured}>
                <Send className="mr-2 h-4 w-4" />
                Send test email
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
