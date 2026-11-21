"use client";

import { useState } from "react";
import axios, { AxiosError } from "axios";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { HiOutlineMail } from "react-icons/hi";
import { domainBase } from "@/components/BaseDomain";
import GradientBackground from "@/components/GradientBackground";
import { Input } from "@/components/ui/input";

const Spinner = () => (
  <div className="flex justify-center items-center">
    <div className="loader ease-linear rounded-full border-4 border-t-4 border-gray-200 h-8 w-8 animate-spin"></div>
  </div>
);

export default function ForgotPage() {
  const [email, setEmail] = useState<string>("");
  const [forgetSuccessful, setForgetSuccessful] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(false);
    setErrorMessage("");

    try {
      if (typeof window !== "undefined") {
        const currentUrl = window.location.href;
        const domain = new URL(currentUrl).hostname;
        const url = `https://api.${domainBase()}/api/v1/users/forgotPassword`;

        const response = await axios.post(
          url,
          { email, url: domain },
          { withCredentials: true }
        );

        setForgetSuccessful(true);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: AxiosError | any) {
      setError(true);
      if (err.response && err.response.data) {
        setErrorMessage(err.response.data.message || "An error occurred.");
      } else {
        setErrorMessage("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[98vh] w-full flex items-center justify-center bg-white dark:bg-gray-900 transition-colors duration-200">
      <GradientBackground />

      <div className="flex flex-col bg-white dark:bg-gray-800 p-6 lg:p-12 rounded-[20px] gap-6 shadow-lg w-full max-w-md mx-auto">
        <div className="flex w-full items-center justify-center gap-3 text-2xl font-semibold">
          <Image
            src="/spirit-monkey-icon.png"
            alt="logo"
            height={32}
            width={32}
            className="animate-pulse"
          />
          <span className="text-brand-600 dark:text-white">Spirit Monkey</span>
        </div>

        <div className="text-center">
          <h2 className="text-2xl font-bold dark:text-white">
            Forgot Your Password?
          </h2>
          <p className="text-gray-600 dark:text-gray-300 mt-1">
            Enter your email, and we&apos;ll send you a link to reset your
            password.
          </p>
        </div>

        {forgetSuccessful ? (
          <div className="text-xl font-semibold text-center text-green-600">
            Please check your email for the reset link!
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter email"
              error={error ? errorMessage : ""}
              leftIcon={<HiOutlineMail className="text-gray-400" />}
              className="pl-10 pr-4 py-3 h-12 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-purple-500 transition-colors"
            />

            <button
              type="submit"
              className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors focus:ring-2 focus:ring-purple-500"
            >
              {loading ? <Spinner /> : "Send Reset Link"}
            </button>
          </form>
        )}

        <div className="text-center mt-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Remembered your password?{" "}
            <button
              onClick={() => router.push("/login")}
              className="text-purple-600 hover:text-purple-700 dark:text-purple-400"
            >
              Login
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
