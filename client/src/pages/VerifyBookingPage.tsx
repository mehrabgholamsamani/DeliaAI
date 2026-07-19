import { AlertCircle, CheckCircle2, Loader2, MailCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { verifyBooking } from "../api";

type VerificationStatus = "verifying" | "success" | "error";

export function VerifyBookingPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [status, setStatus] = useState<VerificationStatus>("verifying");
  const [message, setMessage] = useState("Verifying your booking request...");

  useEffect(() => {
    let isActive = true;

    async function runVerification() {
      if (!token) {
        setStatus("error");
        setMessage("This verification link is missing a token.");
        return;
      }

      try {
        await verifyBooking(token);

        if (!isActive) {
          return;
        }

        setStatus("success");
        setMessage("Your email is verified. Your booking request was already sent to the business.");
      } catch (error) {
        if (!isActive) {
          return;
        }

        setStatus("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "This verification link is invalid or expired."
        );
      }
    }

    void runVerification();

    return () => {
      isActive = false;
    };
  }, [token]);

  const Icon =
    status === "verifying" ? Loader2 : status === "success" ? CheckCircle2 : AlertCircle;

  return (
    <section className="mx-auto max-w-3xl px-5 py-16 lg:px-8">
      <div className="rounded-lg bg-white p-6 shadow-soft sm:p-8">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-aqua text-ink">
            {status === "success" ? (
              <MailCheck size={24} aria-hidden="true" />
            ) : (
              <Icon
                className={status === "verifying" ? "animate-spin" : ""}
                size={24}
                aria-hidden="true"
              />
            )}
          </div>
          <div>
            <span className="text-sm font-semibold uppercase tracking-[0.16em] text-mint">
              Email verification
            </span>
            <h1 className="mt-2 text-3xl font-bold leading-tight text-ink">
              {status === "success"
                ? "Booking request confirmed."
                : status === "error"
                  ? "Verification failed."
                  : "Checking your link."}
            </h1>
            <p className="mt-4 leading-7 text-slate-600">{message}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                className="inline-flex items-center justify-center rounded-lg bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                to="/booking"
              >
                Back to booking
              </Link>
              <Link
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:border-mint"
                to="/"
              >
                Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
