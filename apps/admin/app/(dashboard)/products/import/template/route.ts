import { ApiError, apiFetch } from "@/lib/api";

/** The CSV template, with the columns and example rows the API accepts. */
export async function GET() {
  try {
    const csv = await apiFetch<string>("/catalog-imports/template", { as: "text" });
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="catalog-import-template.csv"',
      },
    });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return new Response(error.message, { status: error.status });
  }
}
