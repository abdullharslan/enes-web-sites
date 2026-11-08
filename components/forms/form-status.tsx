import type { PublicFormStatus } from "@/lib/forms/state";

interface FormStatusProps {
  status: PublicFormStatus;
  messages: {
    errorSummary: string;
    success: string;
    rateLimited: string;
    unavailable: string;
    failed: string;
  };
}

/** Announces the outcome of a submission to everyone, including screen readers. */
export function FormStatus({ status, messages }: FormStatusProps) {
  const message =
    status === "sent"
      ? { text: messages.success, tone: "text-gold" }
      : status === "invalid"
        ? { text: messages.errorSummary, tone: "text-danger" }
        : status === "rateLimited" || status === "unavailable" || status === "failed"
          ? { text: messages[status], tone: "text-danger" }
          : null;
  return (
    <div aria-live="polite" className="min-h-6 text-sm">
      {message && <p className={message.tone}>{message.text}</p>}
    </div>
  );
}
