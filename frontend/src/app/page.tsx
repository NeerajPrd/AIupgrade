"use client";

import { useRouter } from "next/navigation";
import React, { useEffect } from "react";
import Image from "next/image";

const Homepage = () => {
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const timer = setTimeout(() => {
        router.replace("/chat");
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [router]);

  return (
    <div className="h-screen w-screen fixed flex flex-col items-center justify-center gap-4 bg-background">
      <Image
        src="/spirit-monkey-logo-800.png"
        alt="Spirit Monkey"
        width={320}
        height={224}
        priority
        className="h-auto w-[260px] sm:w-[320px] animate-pulse dark:rounded-2xl dark:bg-white dark:p-4"
      />
    </div>
  );
};

export default Homepage;
