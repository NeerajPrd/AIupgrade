import axios from 'axios';
import { shouldRedirectToLogin } from '@/lib/public-paths';

const axiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_BASE_URL || "",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
    "ngrok-skip-browser-warning": "true",
    },
  withCredentials: true,
});

export const axiosServer = axios.create({
  baseURL: process.env.API_BASE_URL || "https://fagoon.tech",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
    "ngrok-skip-browser-warning": "true",
  },
});

export const axiosStream = axios.create({
  baseURL: process.env.NEXT_PUBLIC_BASE_URL || process.env.API_BASE_URL || "https://fagoon.tech",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
    "ngrok-skip-browser-warning": "true",
  },
  withCredentials: true,
});



// Response interceptor for global error handling
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (typeof window !== 'undefined' && error.response?.status === 401) {
      // Clear token and user storage
      localStorage.removeItem("upgrade-token");
      localStorage.removeItem("user-storage");
      
      // Explicitly clear cookies
      document.cookie = "jwt=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      document.cookie = "userData=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";

      // Handle unauthorized access (e.g., redirect to login). Public pages such as the
      // Privacy Policy and Terms must stay readable without an account.
      if (shouldRedirectToLogin(window.location.pathname)) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
