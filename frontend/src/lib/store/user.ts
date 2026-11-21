/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { produce } from 'immer';
import { API_ENDPOINTS } from '@/utils/api/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { me } from '../api/auth';
import { logout } from '@/utils/api/user';
import axiosInstance from '@/lib/api/axios';

interface UserState {
    userId: string | undefined;
    user: any | null;
    token: string | null;
    tokens: number;
    agentCreateLeft: number;

    // Actions
    setUserId: (id: string) => void;
    setUser: (user: any) => void;
    setToken: (token: string | null) => void;
    setTokens: (token: number) => void;
    setAgentCreateLeft: (left: number) => void;

    verifySession: () => Promise<boolean>;
    checkCanCreateAgent: () => Promise<boolean>;
    logout: () => void;
}

export const useMe = (options: { enabled?: boolean } = {}) => {
    return useQuery({
        queryKey: ["me"],
        queryFn: me,
        enabled: options.enabled ?? true,
        retry: false,
        staleTime: 1000 * 60 * 5, // 5 min cache
    });
};

export const useLogout = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async () => {
            // Log out from backend session
            await logout();
            // Log out from server-side secure cookies
            try {
                await fetch("/api/logout", { method: "POST" });
            } catch (err) {
                console.error("Failed to clear local cookies", err);
            }
        },
        onSuccess: () => {
            queryClient.removeQueries({ queryKey: ["me"] });
            queryClient.clear();

            if (typeof window !== "undefined") {
                localStorage.removeItem("upgrade-token");
                localStorage.removeItem("access_token");
            }

            window.location.href = "/login";
        },
    });
};

export const useUserStore = create<UserState>()(
    persist(
        (set, get) => ({
            userId: undefined,
            user: null,
            token: null,
            agentCreateLeft: 0,
            tokens: 0,

            setUser: (user: any) => {
                set({
                    user,
                    userId: user?._id || user?.id || user?.uuid,
                    tokens: user?.tokens || 0
                });
            },

            setToken: (token: string | null) => set({ token }),

            logout: () => {
                set({
                    user: null,
                    userId: undefined,
                    token: null,
                    tokens: 0,
                    agentCreateLeft: 0
                });
                if (typeof window !== 'undefined') {
                    localStorage.removeItem('access_token');
                    localStorage.removeItem('upgrade-token');
                    localStorage.removeItem('user');
                }
            },

            verifySession: async () => {
                const token = get().token;
                if (!token) return false;

                try {
                    const response = await axiosInstance.get(`/api/v1/users/me`);
                    const userData = response.data?.data?.user || response.data?.user || response.data;

                    set(
                        produce((state: UserState) => {
                            state.user = userData;
                            state.userId = userData?._id || userData?.id || userData?.uuid;
                        })
                    );

                    if (typeof window !== 'undefined') {
                        localStorage.setItem("user", JSON.stringify(userData));
                    }
                    return true;
                } catch (error) {
                    console.error('Error verifying session:', error);
                    get().logout();
                    return false;
                }
            },

            checkCanCreateAgent: async () => {
                const userId = get().userId;
                if (!userId) {
                    return false;
                }
                try {
                    const response = await axiosInstance.get(`${API_ENDPOINTS.AGENT}/user/checkCanCreateAgent`);
                    if (response.data.wohoooo === 1) {
                        return true;
                    }
                    return false;
                } catch (error) {
                    console.error('Error checking agent creation:', error);
                    return false;
                }
            },

            setAgentCreateLeft: (left: number) => {
                set(
                    produce((state: UserState) => {
                        state.agentCreateLeft = left;
                    })
                );
            },

            setUserId: (id: string) => {
                set(
                    produce((state: UserState) => {
                        state.userId = id;
                    })
                );
            },

            setTokens: (token: number) => {
                set(
                    produce((state: UserState) => {
                        state.tokens = token;
                    })
                );
            },
        }),
        {
            name: 'user-storage', // Key for localStorage sync
        }
    )
);
