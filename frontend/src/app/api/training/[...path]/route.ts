import type { NextRequest } from "next/server";

export const maxDuration = 600;

const BACKEND_BASE_URL =
  process.env.DEER_FLOW_INTERNAL_GATEWAY_BASE_URL?.replace(/\/+$/, "") ??
  "http://127.0.0.1:8001";

function buildBackendUrl(path: string[], search: string) {
  return new URL(`/api/training/${path.join("/")}${search}`, BACKEND_BASE_URL);
}

async function proxyTrainingRequest(
  request: NextRequest,
  path: string[],
): Promise<Response> {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");

  const hasBody = !["GET", "HEAD"].includes(request.method);
  const response = await fetch(buildBackendUrl(path, request.nextUrl.search), {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
  });

  return new Response(await response.arrayBuffer(), {
    status: response.status,
    headers: response.headers,
  });
}

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyTrainingRequest(request, (await context.params).path);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyTrainingRequest(request, (await context.params).path);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return proxyTrainingRequest(request, (await context.params).path);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxyTrainingRequest(request, (await context.params).path);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return proxyTrainingRequest(request, (await context.params).path);
}
