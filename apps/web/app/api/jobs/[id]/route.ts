import { NextResponse } from "next/server";
import { jobStore } from "@colormax/agents";
import { GetJobResponseSchema } from "@/lib/api-schemas";
import { logger, NotFoundError } from "@colormax/logger";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = jobStore.get(id);
  if (!job) {
    logger.warn({ jobId: id }, "Job not found");
    const error = new NotFoundError("Job", id);
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  const validated = GetJobResponseSchema.parse(job);
  return NextResponse.json(validated);
}
