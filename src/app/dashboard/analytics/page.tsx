"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AnalyticsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard/analytics/users");
  }, [router]);

  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500"></div>
    </div>
  );
}
