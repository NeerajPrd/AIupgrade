import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { axiosServer } from '@/lib/api/axios';
import { isPublicPage } from '@/lib/public-paths';

export async function proxy(request: NextRequest) {
  console.log("[Proxy] Match Path:", request.nextUrl.pathname);
  const token = request.cookies.get("jwt");
  console.log("[Proxy] Incoming jwt cookie:", token?.value ? "Present" : "Missing");

  // The Privacy Policy and Terms are public; nothing else is.
  if (isPublicPage(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  if (!token && !request.nextUrl.pathname.startsWith("/login")) {
    console.log("[Proxy] No token found, redirecting to /login");
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (token) {
    try {
      console.log("[Proxy] Validating token via axiosServer...");
      const response = await axiosServer.get("/api/v1/users/me", {
        headers: {
          Cookie: request.headers.get("cookie") || "",
        },
      });
      console.log("[Proxy] Validation successful. Status:", response.status);

      const userData = response.data?.data?.user || response.data?.user || response.data;

      const res = NextResponse.next();
      res.cookies.set("userData", JSON.stringify(userData), {
        httpOnly: true,
        path: "/",
      });
      return res;
    } catch (error: unknown) {
      console.error("[Proxy] Validation failed!");
      if (error instanceof Error) {
        console.error("[Proxy] Error message:", error.message);
      }
      if (error && typeof error === "object" && "response" in error) {
        const axiosError = error as { response: { status: number; data: unknown } };
        console.error("[Proxy] Response status:", axiosError.response.status);
        console.error("[Proxy] Response data:", JSON.stringify(axiosError.response.data));
      }
      // Clear cookie explicitly in middleware instead of relying on client-side code
      const response = NextResponse.redirect(new URL("/login", request.url));
      response.cookies.delete("jwt");
      response.cookies.delete("userData");
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [],
  // matcher: ["/agents/chat", "/workflow/new", "/chat", "/knowledge-base"],
};
