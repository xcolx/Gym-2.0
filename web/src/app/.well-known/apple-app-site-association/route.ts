// iOS loads it through Apple's CDN, which needs it as JSON at exactly this path, without a redirect

export const dynamic = "force-static";

export function GET() {
  return Response.json({
    webcredentials: {
      apps: ["H487445JPW.com.colinrueegg.Gym2.0"],
    },
  });
}
