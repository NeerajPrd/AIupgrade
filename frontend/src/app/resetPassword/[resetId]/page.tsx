"use client";

import { useEffect, useState } from "react";
import axios from '@/lib/api/axios';
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import Image from "next/image";
import { FaLock, FaEye, FaEyeSlash, FaCheckCircle } from "react-icons/fa";
import { IoShieldCheckmark } from "react-icons/io5";
import GradientBackground from "@/components/GradientBackground";

// Use environment variables for API URLs
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://fagoon.tech";

const Spinner = () => (
  <div className="flex justify-center items-center">
    <div className="loader ease-linear rounded-full border-4 border-t-4 border-purple-200 border-t-purple-600 h-5 w-5 animate-spin"></div>
  </div>
);

export default function ForgotPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { resetId } = useParams();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmPasswordTouched, setConfirmPasswordTouched] = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);

  const [passwordValidation, setPasswordValidation] = useState({
    length: false,
    uppercase: false,
    lowercase: false,
    number: false,
    special: false,
  });

  // Check for existing user session
  useEffect(() => {
    if (typeof window !== "undefined") {
      const hasSession = [
        "jwtExpiresIn",
        // "theme",
        "upgrade-token",
        "user"
      ].some(key => localStorage.getItem(key) !== null);

      if (hasSession) {
        setShowSessionModal(true);
      }
    }
  }, [router, pathname, searchParams, resetId]);

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("jwtExpiresIn");
      localStorage.removeItem("theme");
      localStorage.removeItem("upgrade-token");
      localStorage.removeItem("user");
      setShowSessionModal(false);
    }
  };

  // Validate password on change
  useEffect(() => {
    setPasswordValidation({
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    });
  }, [password]);

  // Calculate password strength
  const passwordStrength = Object.values(passwordValidation).filter(Boolean).length;

  const getStrengthText = () => {
    if (passwordStrength <= 2) return "Weak";
    if (passwordStrength <= 4) return "Moderate";
    return "Strong";
  };

  const getStrengthColor = () => {
    if (passwordStrength <= 2) return "bg-red-500";
    if (passwordStrength <= 4) return "bg-yellow-500";
    return "bg-green-500";
  };

  const validateForm = () => {
    // Reset previous errors
    setError("");

    // Check if passwords match
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return false;
    }

    // Check password strength
    if (passwordStrength < 5) {
      setError("Password is too weak. Please follow the guidelines below.");
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);

    try {
      await axios.patch(
        `${BASE_URL}/api/v1/users/resetPassword/${resetId}`,
        {
          password,
          passwordConfirm: confirmPassword
        },
        { withCredentials: true }
      );
      setShowModal(true);
    } catch (err: any) {
      console.error("Password reset error:", err);
      setError(
        err.response?.data?.message ||
        "An error occurred while resetting your password. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleModalConfirm = () => {
    setShowModal(false);
    router.push("/login");
  };

  useEffect(() => {
    if (!resetId) {
      router.push("/forgot-password");
      return;
    }

    const queryString = searchParams.toString();
    const url = queryString ? `${pathname}?${queryString}` : pathname;
    router.push(url);
  }, [router, pathname, searchParams, resetId]);



  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <GradientBackground />
      {showSessionModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-md text-center border border-purple-300 dark:border-green-400 max-w-md mx-4">
            <div className="mb-2 flex justify-center">
              <div className="rounded-full bg-green-100 p-2">
                <IoShieldCheckmark className="h-8 w-8 text-green-500" />
              </div>
            </div>
            <h3 className="text-2xl font-medium mb-4">Session Detected</h3>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              You have an active session. Do you want to continue with the current session?
            </p>
            <div className="flex gap-4">
              <button
                onClick={handleLogout}
                className="w-full px-5 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
              >
                Logout
              </button>
              <button
                onClick={() => setShowSessionModal(false)}
                className="w-full px-5 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )
      }

      {/* Card Container */}
      <div className="relative w-full max-w-md mx-auto">
        {/* Logo Section */}
        <div className="absolute -top-16 left-1/2 transform -translate-x-1/2 bg-white dark:bg-gray-800 rounded-full p-4 shadow-lg">
          <div className="flex items-center justify-center h-16 w-16">
            <Image
              src="/spirit-monkey-icon.png"
              alt="logo"
              height={32}
              width={32}
              className="animate-spin-slow"
            />
          </div>
        </div>

        {/* Form Content */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl overflow-hidden">
          <div className="px-8 pt-12 pb-8">
            <h2 className="text-2xl font-bold text-center text-gray-800 dark:text-white mb-2">
              Reset Your Password
            </h2>
            <p className="text-center text-gray-600 dark:text-gray-300 mb-6">
              Create a strong password to secure your account
            </p>

            {error && (
              <div className="mb-6 bg-red-50 dark:bg-red-900/30 border-l-4 border-red-500 p-4 rounded-md" role="alert">
                <div className="flex items-center">
                  <svg className="h-5 w-5 text-red-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className="text-red-700 dark:text-red-300">{error}</span>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Password Field */}
              <div className="space-y-2">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  New Password
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <FaLock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter new password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setPasswordTouched(true)}
                    className="block w-full pl-10 pr-10 py-3 border border-gray-300 dark:border-gray-600 rounded-lg 
                              focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-gray-700 
                              text-gray-900 dark:text-white placeholder-gray-400 transition-colors"
                    aria-describedby="password-requirements"
                    required
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <FaEyeSlash className="h-5 w-5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300" />
                    ) : (
                      <FaEye className="h-5 w-5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300" />
                    )}
                  </button>
                </div>

                {/* Password strength meter */}
                {passwordTouched && (
                  <div className="space-y-3 mt-2 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-md">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-600 dark:text-gray-300">Password strength:</span>
                        <span className={`text-sm font-medium ${passwordStrength <= 2 ? 'text-red-500' :
                            passwordStrength <= 4 ? 'text-yellow-500' :
                              'text-green-500'
                          }`}>
                          {getStrengthText()}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${getStrengthColor()} transition-all duration-300`}
                          style={{ width: `${(passwordStrength / 5) * 100}%` }}
                        ></div>
                      </div>
                    </div>

                    <div id="password-requirements" className="text-xs grid grid-cols-1 gap-2 md:grid-cols-2">
                      <div className={`flex items-center ${passwordValidation.length ? "text-green-600 dark:text-green-400" : "text-gray-500 dark:text-gray-400"}`}>
                        <FaCheckCircle className={`mr-1.5 ${passwordValidation.length ? "opacity-100" : "opacity-50"}`} />
                        <span>At least 8 characters</span>
                      </div>
                      <div className={`flex items-center ${passwordValidation.uppercase ? "text-green-600 dark:text-green-400" : "text-gray-500 dark:text-gray-400"}`}>
                        <FaCheckCircle className={`mr-1.5 ${passwordValidation.uppercase ? "opacity-100" : "opacity-50"}`} />
                        <span>One uppercase letter</span>
                      </div>
                      <div className={`flex items-center ${passwordValidation.lowercase ? "text-green-600 dark:text-green-400" : "text-gray-500 dark:text-gray-400"}`}>
                        <FaCheckCircle className={`mr-1.5 ${passwordValidation.lowercase ? "opacity-100" : "opacity-50"}`} />
                        <span>One lowercase letter</span>
                      </div>
                      <div className={`flex items-center ${passwordValidation.number ? "text-green-600 dark:text-green-400" : "text-gray-500 dark:text-gray-400"}`}>
                        <FaCheckCircle className={`mr-1.5 ${passwordValidation.number ? "opacity-100" : "opacity-50"}`} />
                        <span>One number</span>
                      </div>
                      <div className={`flex items-center ${passwordValidation.special ? "text-green-600 dark:text-green-400" : "text-gray-500 dark:text-gray-400"}`}>
                        <FaCheckCircle className={`mr-1.5 ${passwordValidation.special ? "opacity-100" : "opacity-50"}`} />
                        <span>One special character</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password Field */}
              <div className="space-y-2">
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Confirm Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <FaLock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Retype your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onFocus={() => setConfirmPasswordTouched(true)}
                    className={`block w-full pl-10 pr-10 py-3 border rounded-lg 
                              focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-gray-700 
                              text-gray-900 dark:text-white placeholder-gray-400 transition-colors
                              ${confirmPasswordTouched && password !== confirmPassword ?
                        "border-red-500 dark:border-red-400" :
                        "border-gray-300 dark:border-gray-600"}`}
                    required
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? (
                      <FaEyeSlash className="h-5 w-5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300" />
                    ) : (
                      <FaEye className="h-5 w-5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300" />
                    )}
                  </button>
                </div>
                {confirmPasswordTouched && password !== confirmPassword && (
                  <p className="text-xs text-red-500 mt-1 flex items-center">
                    <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Passwords do not match
                  </p>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700
                      transition-colors dark:bg-purple-500 dark:hover:bg-purple-400 disabled:bg-gray-400
                      disabled:cursor-not-allowed flex items-center justify-center"
              >
                {loading ? <Spinner /> : "Set New Password"}
              </button>
            </form>
          </div>

          {/* Success Modal */}
          {showModal && (
            <div
              className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50"
              aria-labelledby="modal-title"
              role="dialog"
              aria-modal="true"
            >
              <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-md text-center border border-purple-300 dark:border-green-400 max-w-md mx-4">
                <div className="mb-2 flex justify-center">
                  <div className="rounded-full bg-green-100 p-2">
                    <svg className="h-8 w-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                  </div>
                </div>
                <h3 id="modal-title" className="text-2xl font-medium mb-4">Password Reset Successful!</h3>
                <p className="text-gray-600 dark:text-gray-300 mb-6">
                  Your password has been updated successfully. You can now log in with your new password.
                </p>
                <button
                  onClick={handleModalConfirm}
                  className="w-full px-5 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
                >
                  Continue to Login
                </button>
              </div>
            </div>
          )}

          {/* Footer Links */}
          {/* <div className="absolute left-0 right-0 bottom-6 flex justify-center gap-10 text-purple-600 dark:text-purple-400">
        <a href="/privacy" className="cursor-pointer hover:underline">Privacy Policy</a>
        <a href="/terms" className="cursor-pointer hover:underline">Terms & Conditions</a>
      </div> */}
        </div>
      </div>
    </div>
  );
}