"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";

export function OnboardingRedirect() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoaded && user && pathname === "/") {
      router.push("/onboarding");
    }
  }, [isLoaded, user, pathname, router]);

  return null;
}
