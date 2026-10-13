interface FormStatusProps {
  status: "idle" | "invalid" | "sent";
  messages: { errorSummary: string; success: string };
}

/** Announces validation failure or successful hand-off to screen readers. */
export function FormStatus({ status, messages }: FormStatusProps) {
  return (
    <div aria-live="polite" className="min-h-6 text-sm">
      {status === "invalid" && <p className="text-danger">{messages.errorSummary}</p>}
      {status === "sent" && <p className="text-gold">{messages.success}</p>}
    </div>
  );
}
