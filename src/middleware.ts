import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // Kiosk画面へのアクセスを保護
  if (request.nextUrl.pathname.startsWith("/kiosk")) {
    const { searchParams } = request.nextUrl;
    const token = searchParams.get("token");
    const kioskToken = process.env.KIOSK_ACCESS_TOKEN;

    if (!kioskToken) {
        console.error("KIOSK_ACCESS_TOKEN is not set on the server.");
        // 本番環境ではエラーページにリダイレクトすることを推奨
        return new NextResponse("Kiosk is not configured.", { status: 500 });
    }

    if (token !== kioskToken) {
      // トークンが不正な場合は、ページの存在を悟られないようにダッシュボードへリダイレクト
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      url.search = ''; // クエリパラメータをクリア
      return NextResponse.redirect(url);
    }
    
    // トークンが有効な場合は、そのままKioskページを表示
    return NextResponse.next();
  }

  // 他のすべてのルートでSupabaseのセッションを更新
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
