import axiosInstance from "../axios";

// Admin-only endpoints (the API answers 403 for non-admin accounts).

export interface AgentUsage {
  agent_id: string;
  agent_name: string;
  slug: string;
  current_month: string;
  current_month_count: number;
  current_month_leads: number;
}

export interface Lead {
  id: string;
  agent_id: string;
  conversation_id: string;
  name: string | null;
  business_name: string | null;
  phone: string | null;
  email: string | null;
  interest: string | null;
  language: string | null;
  created_at: string;
  notify_status: string | null;
  notify_error: string | null;
}

export interface QuestionCount {
  question: string;
  count: number;
}

export interface MonthlyReport {
  agent_name: string;
  period: string;
  period_label: string;
  conversations: number;
  leads: number;
  top_questions: QuestionCount[];
  questions_grouped: boolean;
  unanswered: QuestionCount[];
  recipients: string[];
  smtp_configured: boolean;
  sent: boolean;
  html: string;
}

export interface DateRange {
  date_from?: string;
  date_to?: string;
}

const clean = (range: DateRange) =>
  Object.fromEntries(Object.entries(range).filter(([, value]) => !!value));

export const listAgentUsage = async (): Promise<AgentUsage[]> => {
  const response = await axiosInstance.get("/api/v1/admin/agent-usage");
  return response.data.agents || [];
};

export const listLeads = async (agentId: string, range: DateRange): Promise<Lead[]> => {
  const response = await axiosInstance.get(`/api/v1/admin/agents/${agentId}/leads`, {
    params: { ...clean(range), limit: 1000 },
  });
  return response.data.leads || [];
};

const filenameFrom = (disposition: string | undefined, fallback: string) =>
  /filename="([^"]+)"/.exec(disposition || "")?.[1] || fallback;

const saveBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export const downloadLeadsCsv = async (agentId: string, range: DateRange) => {
  const response = await axiosInstance.get(`/api/v1/admin/agents/${agentId}/leads/export.csv`, {
    params: clean(range),
    responseType: "blob",
  });
  saveBlob(response.data, filenameFrom(response.headers["content-disposition"], "leads.csv"));
};

export const generateMonthlyReport = async (
  agentId: string,
  month: string,
  send: boolean
): Promise<MonthlyReport> => {
  const response = await axiosInstance.post(`/api/v1/admin/agents/${agentId}/monthly-report`, { month, send });
  return response.data;
};

export const downloadMonthlyConversations = async (agentId: string, month: string) => {
  const response = await axiosInstance.get(
    `/api/v1/admin/agents/${agentId}/monthly-report/conversations.docx`,
    { params: { month }, responseType: "blob" }
  );
  saveBlob(response.data, filenameFrom(response.headers["content-disposition"], `conversations_${month}.docx`));
};

export interface LeadSettings {
  agent_id: string;
  agent_name: string;
  lead_notify_enabled: boolean;
  lead_notify_emails: string[];
  lead_whatsapp_number: string | null;
  smtp_configured: boolean;
}

export const getLeadSettings = async (agentId: string): Promise<LeadSettings> => {
  const response = await axiosInstance.get(`/api/v1/admin/agents/${agentId}/lead-settings`);
  return response.data;
};

export const saveLeadSettings = async (
  agentId: string,
  settings: Pick<LeadSettings, "lead_notify_enabled" | "lead_notify_emails" | "lead_whatsapp_number">
): Promise<LeadSettings> => {
  const response = await axiosInstance.patch(`/api/v1/admin/agents/${agentId}/lead-settings`, settings);
  return response.data;
};

export const sendTestLeadEmail = async (agentId: string): Promise<{ sent: boolean; recipients: string[] }> => {
  const response = await axiosInstance.post(`/api/v1/admin/agents/${agentId}/lead-settings/test-email`);
  return response.data;
};
