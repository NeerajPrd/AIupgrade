import { LoginFormData, SignupFormData } from "../../schemas/auth";
import axiosInstance from "../axios";

export const me = async () => {
  const response = await axiosInstance.get(`/api/v1/users/me`);
  return response.data;
};

export const login = async (credentials: LoginFormData) => {
  const response = await axiosInstance.post(`/api/v1/auth/login`, credentials);
  return response.data;
};

export const signup = async (userData: SignupFormData) => {
  const response = await axiosInstance.post(`/api/v1/auth/register`, userData);
  return response.data;
};

export const logout = async () => {
  const response = await axiosInstance.get(`/api/v1/users/logout`);
  return response.data;
};

export const forgotPassword = async (email: string) => {
  const response = await axiosInstance.post(`/api/v1/auth/forgot-password`, { email });
  return response.data;
};

export const verifyEmail = async (verifyEmailId: string) => {
  const response = await axiosInstance.get(`/api/v1/auth/verify-email/${verifyEmailId}`);
  return response.data;
};

export const googleLogin = async () => {
  const response = await axiosInstance.get('/api/v1/google-auth/google/login');
  return response.data;
};

// Public: whether the login page should offer "Sign Up" (ALLOW_PUBLIC_SIGNUP on the server).
export const getAuthOptions = async (): Promise<{ public_signup: boolean }> => {
  const response = await axiosInstance.get(`/api/v1/auth/options`);
  return response.data;
};
