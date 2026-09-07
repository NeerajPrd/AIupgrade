"use client";

import axios from '@/lib/api/axios';
import { useParams, useRouter, useSearchParams } from "next/navigation";
import React, { useEffect, useState } from "react";
import { CheckCircle, AlertTriangle } from "lucide-react";

const VerifyEmail = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { verifyEmailId } = useParams();
  const [status, setStatus] = useState({
    loading: true,
    verified: false,
    error: null as string | null,
  });

  useEffect(() => {
    const verifyEmail = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004';
        const response = await axios.get(
          `${apiUrl}/api/v1/auth/verify?token=${verifyEmailId}`
        );

        if (response.status === 200) {
          setStatus({
            loading: false,
            verified: true,
            error: null,
          });

          // Redirect to login page after successful verification
          setTimeout(() => {
            router.push("/login");
          }, 3000);
        }
      } catch (error) {
        console.error("Email verification failed:", error);
        setStatus({
          loading: false,
          verified: false,
          error: "Verification failed. Please try again or contact support.",
        });
      }
    };

    // Preserve URL query parameters during verification
    const handleQueryParams = () => {
      const queryString = searchParams.toString();
      if (queryString && verifyEmailId) {
        router.replace(`/verify-email/${verifyEmailId}?${queryString}`, {
          scroll: false,
        });
      }
    };

    if (verifyEmailId) {
      verifyEmail();
      handleQueryParams();
    } else {
      setStatus({
        loading: false,
        verified: false,
        error: "Invalid verification link.",
      });
    }
  }, [verifyEmailId, router, searchParams]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8 bg-gray-50 dark:bg-gray-900">
      <div className="p-6 md:p-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg text-center max-w-md w-full">
        <h1 className="text-xl md:text-2xl font-semibold text-gray-800 dark:text-white mb-6">
          Email Verification
        </h1>

        {status.loading && (
          <div className="flex flex-col items-center space-y-4 py-6">
            <div className="w-8 h-8 border-4 border-gray-200 dark:border-gray-700 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin"></div>
            <p className="text-gray-600 dark:text-gray-300">
              Verifying your email address...
            </p>
          </div>
        )}

        {status.verified && (
          <div className="flex flex-col items-center space-y-4 py-6">
            <CheckCircle className="h-10 w-10 md:h-12 md:w-12 text-green-500" />
            <p className="text-gray-700 dark:text-gray-200">
              Your email has been successfully verified!
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Redirecting to login page...
            </p>
          </div>
        )}

        {status.error && (
          <div className="flex flex-col items-center space-y-4 py-6">
            <div className="flex items-center justify-center h-10 w-10 md:h-12 md:w-12 rounded-full bg-red-100 dark:bg-red-900">
              <AlertTriangle className="h-6 w-6 text-red-500 dark:text-red-400" />
            </div>
            <p className="text-red-600 dark:text-red-400">{status.error}</p>
            <button
              onClick={() => router.push("/login")}
              className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
            >
              Go to Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default VerifyEmail;
