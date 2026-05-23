"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getActor, getToken } from "../lib/api";
import Spinner from "../components/Spinner";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const t = getToken();
    const a = getActor();
    if (t && a) router.replace("/dashboard");
    else router.replace("/login");
  }, [router]);
  return (
    <div className="flex h-screen items-center justify-center">
      <Spinner />
    </div>
  );
}
