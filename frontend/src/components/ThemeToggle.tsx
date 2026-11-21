"use client";

import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RiMoonLine, RiSunLine } from "react-icons/ri";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  if (window.location.pathname === '/workflow') return null;
  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="fixed top-4 right-4 p-2 rounded-lg bg-gray-200 dark:bg-navy-800 z-50 hover:bg-gray-300 dark:hover:bg-navy-800/80 transition-colors duration-200"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? (
        <RiSunLine className="w-5 h-5 text-yellow-500" />
      ) : (
        <RiMoonLine className="w-5 h-5 text-gray-700" />
      )}
    </button>
  );
}
