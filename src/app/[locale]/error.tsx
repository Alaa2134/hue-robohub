"use client";
import { useEffect } from "react";
import { StatusScreen } from "@/components/site/status-screen";
import { Button } from "@/components/ui/button";

export default function SiteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const ar = typeof document !== "undefined" && document.documentElement.lang === "ar";
  return (
    <StatusScreen
      code="500"
      title={ar ? "عطل في النظام" : "System fault"}
      body={ar ? "حدث خطأ من جانبنا وتم تسجيله." : "Something failed on our side. The incident has been logged."}
      reference={error.digest}
    >
      <Button variant="primary" onClick={reset}>
        {ar ? "حاول مرة أخرى" : "Try again"}
      </Button>
    </StatusScreen>
  );
}
