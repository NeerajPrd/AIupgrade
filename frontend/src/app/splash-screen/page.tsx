"use client";

import React, { useState, FormEvent, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GrFormNext } from "react-icons/gr";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Link from "next/link";

const SplashScreen = () => {
  const [nextPressed, setNextPressed] = useState<boolean>(false);
  const [name, setName] = useState<string>("");
  const router = useRouter();

  const handleSetName = (e?: FormEvent | KeyboardEvent): void => {
    e?.preventDefault();

    // Trim and validate name
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }

    try {
      // Safely use localStorage and sessionStorage
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("chatMessages");
        localStorage.setItem("name", trimmedName);

        // Use a slight delay for smooth transition
        setTimeout(() => router.push("/chat"), 200);
      }
    } catch (error) {
      console.error("Error setting user name:", error);
      // Optionally, you could add user-facing error handling
    }
  };

  const renderBackgroundBlur = (): JSX.Element => (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      {[
        "purple-400 via-blue-300 -top-24 left-20 w-[45%] h-[45%]",
        "red-400 via-orange-300 top-1/2 -left-10 w-[40%] h-[40%]",
        "pink-400 via-purple-300 -top-20 right-16 w-[50%] h-[50%]",
        "blue-400 via-purple-300 bottom-10 right-10 w-[40%] h-[40%]",
      ].map((blurConfig, index) => (
        <div
          key={index}
          className={`absolute rounded-full bg-gradient-to-br from-${blurConfig} 
            to-transparent dark:from-${blurConfig.replace("400", "700")} 
            dark:via-${blurConfig.split(" ")[1].replace("300", "800")} 
            dark:to-transparent blur-[12rem] opacity-40`}
        />
      ))}
    </div>
  );

  return (
    <div
      className={`relative h-screen flex flex-col items-center justify-center 
        bg-white text-black dark:bg-navy-900 dark:text-white`}
    >
      {renderBackgroundBlur()}
      <div className="w-full max-w-md px-6 sm:px-12">
        <AnimatePresence>
          {nextPressed ? (
            <motion.div
              key="namePage"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="absolute top-1/2 left-1/2 transform -translate-x-1/2 
                -translate-y-1/2 rounded-lg p-8 sm:p-10 shadow-lg 
                bg-white dark:bg-navy-900 border border-gray-200 
                dark:border-gray-600"
            >
              <div className="flex items-center gap-3 justify-center mb-6">
                <Image
                  src="/spirit-monkey-icon.png"
                  alt="Spirit Monkey"
                  height={32}
                  width={32}
                />
                <span className="text-2xl font-semibold">Spirit Monkey</span>
              </div>
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold">Let&apos;s Get Started!</h2>
                <p className="text-lg mt-2 leading-relaxed">
                  What should I call you?
                </p>
              </div>
              <form onSubmit={handleSetName} className="mb-6">
                <div className="flex w-full">
                  <input
                    type="text"
                    aria-label="Enter your name"
                    placeholder="Your Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSetName(e)}
                    required
                    minLength={2}
                    className="border rounded-l-lg p-3 flex-grow focus:ring-0
                      border-gray-300 dark:border-gray-600 
                      dark:bg-navy-900 dark:text-white"
                  />
                  <button
                    type="submit"
                    onClick={handleSetName}
                    className="bg-brand-600 text-white rounded-r-lg p-3 
                      flex items-center justify-center hover:bg-brand-700 
                      transition-colors"
                  >
                    <GrFormNext aria-hidden="true" />
                  </button>
                </div>
              </form>
              <div className="text-center text-sm space-y-4">
                <Link
                  href="/login"
                  className="hover:underline text-brand-600 
                    dark:text-brand-400"
                >
                  Already have an account? Log In
                </Link>
                <br />
                <Link
                  href="/signup"
                  className="hover:underline text-brand-600 
                    dark:text-brand-400"
                >
                  Register Now! Sign Up
                </Link>
              </div>
              <p
                className="mt-8 text-xs text-center text-gray-500 
                  dark:text-gray-400 leading-relaxed"
              >
                Your privacy matters. Chats are private, and data is never
                shared for marketing.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="splashPage"
              className="text-center"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            >
              <motion.div
                initial={{ y: 0 }}
                animate={{ y: -40 }}
                transition={{ delay: 0.5, duration: 1 }}
                className="flex items-center gap-4 justify-center mb-8"
              >
                <div
                  className="border-4 rounded-full w-12 h-12 
                    border-red-300 dark:border-red-600"
                />
                <h1 className="text-4xl font-semibold dark:text-white">
                  Spirit Monkey
                </h1>
              </motion.div>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2 }}
                className="text-xl mb-8 leading-relaxed dark:text-white"
              >
                Welcome to <strong>Spirit Monkey!</strong> I&apos;m here to assist
                you.
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.6 }}
                className="space-y-6 mt-10"
              >
                <button
                  onClick={() => setNextPressed(true)}
                  className="w-full text-white font-bold rounded-lg py-3 
                    bg-brand-600 hover:bg-brand-700 transition-colors"
                >
                  Next
                </button>
                <Link
                  href="/login"
                  className="block text-brand-600 dark:text-brand-400 
                    hover:underline"
                >
                  Already have an account? Log In
                </Link>
                <Link
                  href="/signup"
                  className="block text-brand-600 dark:text-brand-400 
                    hover:underline"
                >
                  Register Now! Sign Up
                </Link>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default SplashScreen;
