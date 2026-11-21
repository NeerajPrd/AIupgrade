"use client";

import { useEffect, useState, memo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  RiLockPasswordLine,
  RiRobot2Line,
  RiEyeLine,
  RiEyeOffLine,
} from "react-icons/ri";
import { HiOutlineMail } from "react-icons/hi";
import { cn } from "@/lib/utils";
import { PRIVACY_POLICY_URL, TERMS_URL } from "@/lib/public-paths";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, LoginFormData } from "@/lib/schemas/auth";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getAuthOptions, login } from "@/lib/api/auth";
import { showErrorToast, showSuccessToast } from "@/utils/toast";

const AI_MESSAGES = [
  "> QUANTUM_AUTHENTICATION_INIT... 🧠",
  "> NEURAL_HANDSHAKE_ESTABLISHED... ⚡",
  "> BIOMETRIC_SCAN_COMPLETE... 🔍",
  "> SECURING_QUANTUM_CHANNEL... 🌐",
  "> VALIDATING_CREDENTIALS... 🛡️",
  "> ACCESS_PROTOCOLS_READY... ✨",
] as const;

const AiMessage = memo(
  ({ message, className }: { message: string; className?: string }) => (
    <div
      className={cn(
        "transform transition-all duration-500 ease-out",
        "flex items-center gap-2 rounded-lg border border-blue-500/30 bg-black/80 px-4 py-2",
        "shadow-lg shadow-blue-500/20 backdrop-blur-sm",
        "animate-[pulse_3s_ease-in-out_infinite]",
        className
      )}
    >
      <RiRobot2Line className="text-blue-400" />
      <span className="text-sm font-mono text-blue-400 tracking-wide">
        {message}
      </span>
    </div>
  )
);
AiMessage.displayName = "AiMessage";

const LoginPage = () => {
  const router = useRouter();
  // const [aiMessageIndex, setAiMessageIndex] = useState(0);
  const [rememberMe, setRememberMe] = useState(true);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });


  // "Sign Up" is offered only when the server allows public signup (hidden while loading or on error).
  const { data: authOptions } = useQuery({
    queryKey: ["auth-options"],
    queryFn: getAuthOptions,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  const signupOpen = authOptions?.public_signup === true;

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: async (response) => {
      const token = response.access_token || response.token || response.data?.token || response.data?.access_token;
      showSuccessToast("Login Successful!");
      if (token) {
        localStorage.setItem("access_token", token);
        localStorage.setItem("upgrade-token", token);
      }

      localStorage.removeItem('chat');
      router.push("/chat");
    },
    onError: ()=> {
      showErrorToast("Error Logging in!")
    }
  });

  const onSubmit = (data: LoginFormData) => {
    loginMutation.mutate(data);
  };

  const errorMessage = (loginMutation.error as any)?.response?.data?.message ||
    (loginMutation.error as any)?.response?.data?.error ||
    loginMutation.error?.message;

  return (
    <div className="min-h-screen w-full flex bg-background">
      {/* Left: Spirit Monkey brand panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col items-center justify-center bg-gradient-to-br from-brand-sky via-brand-600 to-brand-900 dark:to-navy-950 text-white">
        <div className="absolute -top-24 -right-24 h-80 w-80 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-brand-sky/30 blur-3xl" />
        <div className="relative z-10 flex flex-col items-center text-center px-12">
          <div className="rounded-full bg-white p-5 shadow-2xl shadow-navy/30">
            <Image src="/spirit-monkey-icon.png" alt="Spirit Monkey" width={132} height={132} priority />
          </div>
          <h2 className="mt-8 text-4xl font-bold tracking-tight">Spirit Monkey</h2>
          <p className="mt-3 text-lg font-medium text-white/90">24/7 AI Sales &amp; Support Agents</p>
        </div>
        <div className="absolute bottom-8 left-0 right-0 z-10 flex justify-center gap-8 text-sm">
          <a href={PRIVACY_POLICY_URL} className="text-white underline-offset-4 hover:underline">
            Privacy Policy
          </a>
          <a href={TERMS_URL} className="text-white underline-offset-4 hover:underline">
            Terms of Service
          </a>
        </div>
      </div>

      {/* Right: sign-in form */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md mx-auto space-y-8">
          <div className="text-center space-y-2">
            <div className="flex flex-col items-center gap-2 mb-6">
              <Image src="/spirit-monkey-icon.png" alt="Spirit Monkey" width={64} height={64} priority />
              <span className="lg:hidden text-lg font-semibold text-foreground">Spirit Monkey</span>
            </div>
            <h1 className="text-3xl font-bold text-foreground">Welcome Back</h1>
            <p className="text-muted-foreground">Sign in to manage your AI assistants</p>
          </div>

          {errorMessage && (
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4">
              <Input
                {...register("email")}
                type="email"
                placeholder="Email address"
                error={errors.email?.message}
                leftIcon={<HiOutlineMail className="text-muted-foreground" />}
                className="pl-10 pr-4 py-3 h-12 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring transition-all"
              />

              <Input
                {...register("password")}
                type="password"
                placeholder="Password"
                error={errors.password?.message}
                leftIcon={<RiLockPasswordLine className="text-muted-foreground" />}
                className="pl-10 pr-12 py-3 h-12 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring transition-all"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-input accent-[hsl(var(--primary))]"
                />
                <span className="text-sm text-muted-foreground">Remember me</span>
              </label>

              <button
                type="button"
                onClick={() => router.push("/forgot")}
                className="text-sm font-medium text-primary hover:underline underline-offset-4"
              >
                Forgot password?
              </button>
            </div>

            <Button
              type="submit"
              size="lg"
              disabled={loginMutation.isPending}
              className="w-full h-12 rounded-lg text-base font-semibold"
            >
              {loginMutation.isPending ? "Signing in..." : "Sign In"}
            </Button>

            {signupOpen && (
              <p className="text-center text-sm text-muted-foreground">
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  onClick={() => router.push("/signup")}
                  className="font-medium text-primary hover:underline underline-offset-4"
                >
                  Sign Up
                </button>
              </p>
            )}
          </form>

          {/* Policy links for phones and tablets (the brand panel is hidden there) */}
          <div className="lg:hidden flex justify-center gap-6 text-sm">
            <a href={PRIVACY_POLICY_URL} className="text-foreground/80 underline underline-offset-4 hover:text-primary">
              Privacy Policy
            </a>
            <a href={TERMS_URL} className="text-foreground/80 underline underline-offset-4 hover:text-primary">
              Terms of Service
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
