"use client";

import { useState, useEffect } from "react";
import * as authApi from "@/lib/api/auth";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  RiLockPasswordLine,
  RiRobot2Line,
  RiEyeLine,
  RiEyeOffLine,
  RiUserLine,
} from "react-icons/ri";
import { HiOutlineMail } from "react-icons/hi";
import { cn } from "@/lib/utils";
import { showSuccessToast, showErrorToast } from "@/utils/toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signupSchema, SignupFormData } from "@/lib/schemas/auth";
import { useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";

const AI_MESSAGES = [
  "> INITIALIZING_NEW_USER_PROFILE... 🧬",
  "> CONFIGURING_NEURAL_PATHWAYS... 🧠",
  "> GENERATING_SECURE_KEYS... 🔑",
  "> PREPARING_AI_WORKSPACE... ⚡",
  "> OPTIMIZING_USER_EXPERIENCE... ✨",
  "> ESTABLISHING_QUANTUM_LINK... 🌐",
] as const;

const AiMessage = ({
  message,
  className,
}: {
  message: string;
  className?: string;
}) => (
  <div
    className={cn(
      "transform transition-all duration-500 ease-out",
      "flex items-center gap-2 rounded-lg border border-purple-500/30 bg-black/80 px-4 py-2",
      "shadow-lg shadow-purple-500/20 backdrop-blur-sm",
      "animate-[pulse_3s_ease-in-out_infinite]",
      className
    )}
  >
    <RiRobot2Line className="text-purple-400" />
    <span className="text-sm font-mono text-purple-400 tracking-wide">
      {message}
    </span>
  </div>
);

export default function SignupPage() {
  const [verifyEmail, setVerifyEmail] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [aiMessageIndex, setAiMessageIndex] = useState(0);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirm_password: "",
    }
  });

  const signupMutation = useMutation({
    mutationFn: (data: SignupFormData) => authApi.signup({
      email: data.email,
      password: data.password,
      password_confirm: data.confirm_password,
      name: data.name
    }),
    onSuccess: () => {
      showSuccessToast("Account created successfully!");
      setVerifyEmail(true);
    },
    onError: (error: any) => {
      const errorMessage =
        error.response?.data?.message ||
        error.response?.data?.error ||
        "An error occurred during signup. Please try again.";
      
      // If the API returns the specific error array format mentioned
      if (error.response?.data?.errors && Array.isArray(error.response.data.errors)) {
        error.response.data.errors.forEach((err: any) => {
          showErrorToast(`${err.field.replace('body.', '')}: ${err.message}`);
        });
      } else {
        showErrorToast(errorMessage);
      }
    }
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setAiMessageIndex((prev) => (prev + 1) % AI_MESSAGES.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const onSubmit = (data: SignupFormData) => {
    signupMutation.mutate(data);
  };

  return (
    <div className="min-h-screen w-full flex dark:bg-gray-900">
      {/* Left Section */}
      <div className="hidden lg:block lg:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 via-blue-600/20 to-purple-600/20 z-10" />
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/bg.webp')" }}
        />
        <div className="absolute bottom-8 left-8 flex gap-8 text-sm text-white/80 z-20">
          <a
            href="/privacy-policy"
            className="hover:text-white transition-colors"
          >
            Privacy Policy
          </a>
          <a
            href="/terms-and-conditions"
            className="hover:text-white transition-colors"
          >
            Terms of Service
          </a>
        </div>
      </div>

      {/* Right Section */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 lg:p-12 relative">
        <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:40px_40px] dark:bg-grid-white/[0.05]" />
        <div className="absolute inset-0 bg-gradient-to-br from-purple-100/30 via-transparent to-blue-100/30 dark:from-purple-900/30 dark:to-blue-900/30 backdrop-blur-3xl" />

        <div className="relative w-full max-w-md mx-auto space-y-8">
          {/* <AiMessage
            message={AI_MESSAGES[aiMessageIndex]}
            className="absolute -top-20 left-1/2 -translate-x-1/2 transform"
          /> */}

          <div className="text-center space-y-2">
            <div className="flex justify-center mb-8">
              <Image
                src="/spirit-monkey-icon.png"
                alt="Logo"
                width={40}
                height={40}
                className="animate-pulse"
                priority
              />
            </div>
            <h1 className="text-3xl font-bold dark:text-white">
              {verifyEmail ? "Verification Sent" : "Join the Future"}
            </h1>
            <p className="text-gray-600 dark:text-gray-300">
              {verifyEmail
                ? "Check your email to complete registration"
                : "Create your AI-powered workspace"}
            </p>
          </div>

          {verifyEmail ? (
            <div className="text-center space-y-6">
              <div className="p-6 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <RiRobot2Line className="mx-auto text-4xl text-purple-500 mb-4" />
                <p className="text-gray-600 dark:text-gray-300">
                  We've sent a verification link to{" "}
                  <strong>{getValues("email")}</strong>. Please check your inbox
                  and spam folder.
                </p>
              </div>
              <button
                onClick={() => router.push("/login")}
                className="w-full py-3 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white font-medium hover:from-purple-500 hover:to-blue-500 transition-all"
              >
                Go to Login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-4">
                {/* Name Input */}
                <Input
                  {...register("name")}
                  type="text"
                  placeholder="Full Name"
                  error={errors.name?.message}
                  leftIcon={<RiUserLine className="text-gray-400" />}
                  className="pl-10 pr-4 py-3 h-12 rounded-lg border bg-white/50 dark:bg-black/50 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-600 transition-all"
                />

                {/* Email Input */}
                <Input
                  {...register("email")}
                  type="email"
                  placeholder="Email address"
                  error={errors.email?.message}
                  leftIcon={<HiOutlineMail className="text-gray-400" />}
                  className="pl-10 pr-4 py-3 h-12 rounded-lg border bg-white/50 dark:bg-black/50 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-600 transition-all"
                />

                {/* Password Input */}
                <Input
                  {...register("password")}
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  error={errors.password?.message}
                  leftIcon={<RiLockPasswordLine className="text-gray-400" />}
                  rightIcon={
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none"
                    >
                      {showPassword ? <RiEyeOffLine /> : <RiEyeLine />}
                    </button>
                  }
                  className="pl-10 pr-12 py-3 h-12 rounded-lg border bg-white/50 dark:bg-black/50 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600 transition-all"
                />

                {/* Confirm Password Input */}
                <Input
                  {...register("confirm_password")}
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Confirm password"
                  error={errors.confirm_password?.message}
                  leftIcon={<RiLockPasswordLine className="text-gray-400" />}
                  rightIcon={
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none"
                    >
                      {showConfirmPassword ? <RiEyeOffLine /> : <RiEyeLine />}
                    </button>
                  }
                  className="pl-10 pr-12 py-3 h-12 rounded-lg border bg-white/50 dark:bg-black/50 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-600 transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={signupMutation.isPending}
                className={cn(
                  "relative w-full py-3 px-4 rounded-lg",
                  "bg-gradient-to-r from-purple-600 to-blue-600",
                  "text-white font-medium",
                  "transition-all duration-300",
                  "hover:from-blue-500 hover:to-blue-500",
                  "focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
                  "disabled:opacity-70 disabled:cursor-not-allowed",
                  "group overflow-hidden"
                )}
              >
                <div className="relative flex items-center justify-center gap-2">
                  {signupMutation.isPending ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <>
                      <span>Create Account</span>
                      <RiRobot2Line className="animate-pulse" />
                    </>
                  )}
                </div>
              </button>

              <div className="text-center space-y-2">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => router.push("/login")}
                    className="text-purple-600 hover:text-purple-700 dark:text-purple-400"
                  >
                    Sign In
                  </button>
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  or{" "}
                  <button
                    type="button"
                    onClick={() => router.push("/")}
                    className="text-purple-600 hover:text-purple-700 dark:text-purple-400"
                  >
                    continue as guest
                  </button>
                </p>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
