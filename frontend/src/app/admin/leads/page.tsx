"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, FileText, Mail, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  downloadLeadsCsv,
  downloadMonthlyConversations,
  generateMonthlyReport,
  listAgentUsage,
  listLeads,
  MonthlyReport,
  QuestionCount,
} from "@/lib/api/admin";
import { showErrorToast, showSuccessToast } from "@/utils/toast";
import LeadSettingsCard from "./lead-settings-card";

const NEPAL = "Asia/Kathmandu";
const fieldClass =
  "h-9 rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm";

// "YYYY-MM-DD" for a moment, as the calendar shows it in Nepal.
const nepalDay = (when: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: NEPAL }).format(when);

const nepalDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    timeZone: NEPAL,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

const lastMonth = () => {
  const [year, month] = nepalDay(new Date()).split("-").map(Number);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
};

const errorText = (error: any, fallback: string) => {
  if (error?.response?.status === 403) return "This page is for admin accounts only.";
  const detail = error?.response?.data?.detail;
  return typeof detail === "string" ? detail : fallback;
};

const alertBadge = (status: string | null, error: string | null) => {
  if (status === "sent") return <Badge className="bg-emerald-600 hover:bg-emerald-600">Emailed</Badge>;
  if (status === "failed") return <Badge variant="destructive" title={error || ""}>Failed</Badge>;
  return <Badge variant="secondary">Not sent</Badge>;
};

const QuestionList = ({ title, items, empty }: { title: string; items: QuestionCount[]; empty: string }) => (
  <div>
    <h3 className="font-semibold mb-2">{title}</h3>
    {items.length === 0 ? (
      <p className="text-sm text-muted-foreground">{empty}</p>
    ) : (
      <ol className="space-y-1 text-sm">
        {items.map((item, index) => (
          <li key={index} className="flex justify-between gap-4 border-b border-gray-100 dark:border-zinc-800 py-1">
            <span>{item.question}</span>
            <span className="text-muted-foreground whitespace-nowrap">× {item.count}</span>
          </li>
        ))}
      </ol>
    )}
  </div>
);

export default function LeadsPage() {
  const today = nepalDay(new Date());
  const [agentId, setAgentId] = useState("");
  const [dateFrom, setDateFrom] = useState(`${today.slice(0, 7)}-01`);
  const [dateTo, setDateTo] = useState(today);
  const [month, setMonth] = useState(lastMonth());
  const [report, setReport] = useState<MonthlyReport | null>(null);

  const agents = useQuery({ queryKey: ["admin", "agent-usage"], queryFn: listAgentUsage, retry: false });

  useEffect(() => {
    if (!agentId && agents.data?.length) setAgentId(agents.data[0].agent_id);
  }, [agentId, agents.data]);

  const range = useMemo(() => ({ date_from: dateFrom, date_to: dateTo }), [dateFrom, dateTo]);
  const leads = useQuery({
    queryKey: ["admin", "leads", agentId, range],
    queryFn: () => listLeads(agentId, range),
    enabled: !!agentId,
    retry: false,
  });

  const exportCsv = useMutation({
    mutationFn: () => downloadLeadsCsv(agentId, range),
    onError: (error) => showErrorToast(errorText(error, "Could not export the leads.")),
  });

  const buildReport = useMutation({
    mutationFn: (send: boolean) => generateMonthlyReport(agentId, month, send),
    onSuccess: (data, send) => {
      setReport(data);
      if (send) showSuccessToast(`Report emailed to ${data.recipients.join(", ")}`);
    },
    onError: (error) => showErrorToast(errorText(error, "Could not build the report.")),
  });

  const downloadDocx = useMutation({
    mutationFn: () => downloadMonthlyConversations(agentId, month),
    onError: (error) => showErrorToast(errorText(error, "Could not download the conversations.")),
  });

  const selectAgent = (id: string) => {
    setAgentId(id);
    setReport(null);
  };

  const emailReport = () => {
    if (!report) return;
    const ok = window.confirm(
      `Email the ${report.period_label} report to ${report.recipients.join(", ")}?`
    );
    if (ok) buildReport.mutate(true);
  };

  if (agents.isError) {
    return (
      <div className="container mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold tracking-tight">Leads</h1>
        <p className="text-muted-foreground mt-4">{errorText(agents.error, "Could not load this page.")}</p>
      </div>
    );
  }

  const selected = agents.data?.find((agent) => agent.agent_id === agentId);
  const rows = leads.data || [];

  return (
    <div className="container mx-auto py-8 px-4 space-y-6 h-full overflow-y-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Leads</h1>
        <p className="text-muted-foreground mt-1">
          Contact details visitors left in website chats. Dates and times are Nepal time.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Assistant
          <select className={fieldClass} value={agentId} onChange={(e) => selectAgent(e.target.value)}>
            {(agents.data || []).map((agent) => (
              <option key={agent.agent_id} value={agent.agent_id}>
                {agent.agent_name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          From
          <input type="date" className={fieldClass} value={dateFrom} max={dateTo || today}
            onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          To
          <input type="date" className={fieldClass} value={dateTo} min={dateFrom} max={today}
            onChange={(e) => setDateTo(e.target.value)} />
        </label>
        <Button variant="outline" size="sm" onClick={() => leads.refetch()} disabled={!agentId || leads.isFetching}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
        <Button size="sm" onClick={() => exportCsv.mutate()} disabled={!agentId || rows.length === 0 || exportCsv.isPending}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {agents.isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : !agents.data?.length ? (
        <p className="text-muted-foreground">
          No assistant has a published API yet. Publish one from the Agents page to start capturing leads.
        </p>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <p className="text-sm text-muted-foreground">
              {leads.isLoading
                ? "Loading leads…"
                : `${rows.length} lead${rows.length === 1 ? "" : "s"} in this period`}
              {selected ? ` · ${selected.current_month_count} website conversations this month` : ""}
            </p>
          </CardHeader>
          <CardContent>
            {leads.isError ? (
              <p className="text-sm text-red-600">{errorText(leads.error, "Could not load the leads.")}</p>
            ) : rows.length === 0 && !leads.isLoading ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No leads in this period.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Interested in</TableHead>
                    <TableHead>Alert</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell className="whitespace-nowrap">{nepalDateTime(lead.created_at)}</TableCell>
                      <TableCell>
                        {lead.name || "—"}
                        {lead.business_name && (
                          <div className="text-xs text-muted-foreground">{lead.business_name}</div>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{lead.phone || "—"}</TableCell>
                      <TableCell>{lead.email || "—"}</TableCell>
                      <TableCell className="max-w-xs">{lead.interest || "—"}</TableCell>
                      <TableCell>{alertBadge(lead.notify_status, lead.notify_error)}</TableCell>
                      <TableCell>
                        <Link
                          href={`/agents/${lead.agent_id}/chat/${lead.conversation_id}`}
                          className="text-sm text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                        >
                          View chat
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {!!agentId && <LeadSettingsCard key={agentId} agentId={agentId} />}

      {!!agents.data?.length && (
        <Card>
          <CardHeader className="pb-2">
            <h2 className="text-xl font-semibold">Monthly client report</h2>
            <p className="text-sm text-muted-foreground">
              Emailed to the client automatically at the start of each month. Build it here to check it or send it
              yourself.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1 text-sm">
                Month
                <input type="month" className={fieldClass} value={month} max={today.slice(0, 7)}
                  onChange={(e) => { setMonth(e.target.value); setReport(null); }} />
              </label>
              <Button size="sm" onClick={() => buildReport.mutate(false)} disabled={!agentId || !month || buildReport.isPending}>
                <FileText className="mr-2 h-4 w-4" />
                {buildReport.isPending ? "Working…" : "Generate report"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => downloadDocx.mutate()}
                disabled={!agentId || !month || downloadDocx.isPending}>
                <Download className="mr-2 h-4 w-4" />
                Conversations (Word)
              </Button>
            </div>

            {report && (
              <div className="space-y-4 border-t border-gray-100 dark:border-zinc-800 pt-4">
                <div className="flex flex-wrap gap-8">
                  <div>
                    <div className="text-3xl font-semibold">{report.conversations}</div>
                    <div className="text-sm text-muted-foreground">Conversations in {report.period_label}</div>
                  </div>
                  <div>
                    <div className="text-3xl font-semibold">{report.leads}</div>
                    <div className="text-sm text-muted-foreground">Leads captured</div>
                  </div>
                </div>
                <QuestionList
                  title={report.questions_grouped ? "Most asked questions (similar ones grouped)" : "Most asked questions"}
                  items={report.top_questions}
                  empty="No questions were asked this month."
                />
                <QuestionList
                  title="Questions the assistant could not answer"
                  items={report.unanswered}
                  empty="None: the assistant had an answer for every question."
                />
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="sm" onClick={emailReport}
                    disabled={buildReport.isPending || !report.recipients.length || !report.smtp_configured}>
                    <Mail className="mr-2 h-4 w-4" />
                    Email to client
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {!report.smtp_configured
                      ? "Email sending is not set up on the server yet."
                      : report.recipients.length
                        ? `Goes to ${report.recipients.join(", ")}`
                        : "No notification email address is set for this assistant."}
                    {report.sent ? " · Sent just now." : ""}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
