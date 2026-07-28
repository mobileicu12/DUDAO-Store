"use client";

import { useRef, useState } from "react";
import type { ImportSummary } from "@/lib/excel";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  cx,
  PageHeader,
  StatCard,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

export default function ImportExportClient() {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [fileName, setFileName] = useState("");

  const upload = async (file: File) => {
    setUploading(true);
    setSummary(null);
    setFileName(file.name);

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/import", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "That import did not run.");

      setSummary(body as ImportSummary);
      const s = body as ImportSummary;
      if (s.failed > 0) {
        toast.info(
          `${s.created + s.updated} rows applied, ${s.failed} failed.`,
          "The failures are listed below with the reason.",
        );
      } else {
        toast.success(
          `${s.created} created, ${s.updated} updated.`,
          "Your catalog is up to date.",
        );
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      <PageHeader
        title="Import & export"
        subtitle="Move your catalog in and out as a spreadsheet."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader
            title="Export the catalog"
            subtitle="Every product with all four tier prices."
          />
          <p className="mt-2 text-sm text-muted">
            Exporting and re-importing the same file unchanged does nothing —
            safe to use as a backup or a working copy.
          </p>
          <a href="/api/export" className="mt-4 block">
            <Button variant="primary" full>
              Download catalog
            </Button>
          </a>
        </Card>

        <Card>
          <CardHeader
            title="Blank template"
            subtitle="The same columns with one worked example."
          />
          <p className="mt-2 text-sm text-muted">
            Start here if you are adding products in bulk for the first time.
            Leave the Handle column blank on every new row.
          </p>
          <a href="/api/export?template=1" className="mt-4 block">
            <Button full>Download template</Button>
          </a>
        </Card>

        <Card>
          <CardHeader
            title="Upload a filled sheet"
            subtitle="Rows with a handle update; rows without create."
          />
          <p className="mt-2 text-sm text-muted">
            A bad row fails on its own and tells you why — the rest of the sheet
            still goes in.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xlsm"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <Button
            variant="primary"
            full
            className="mt-4"
            loading={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? "Importing…" : "Choose a file"}
          </Button>
        </Card>
      </div>

      {summary && (
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-semibold text-ink">
            Import result{fileName && ` — ${fileName}`}
          </h2>

          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Created" value={summary.created} tone="success" />
            <StatCard label="Updated" value={summary.updated} tone="info" />
            <StatCard
              label="Failed"
              value={summary.failed}
              tone={summary.failed > 0 ? "danger" : "neutral"}
            />
            <StatCard
              label="Rows read"
              value={summary.results.length}
              tone="neutral"
            />
          </div>

          {summary.failed > 0 && (
            <div className="mb-4">
              <Alert tone="warning" title="Some rows did not go in">
                Fix the rows listed below and upload the sheet again — rows that
                already applied will simply update to the same values.
              </Alert>
            </div>
          )}

          <Card padded={false} className="overflow-hidden">
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 border-b border-line bg-subtle">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-ink-2">
                      Row
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-ink-2">
                      Product
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-ink-2">
                      Result
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-ink-2">
                      Detail
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {summary.results.map((r) => (
                    <tr
                      key={r.row}
                      className={cx(
                        "border-b border-line last:border-0",
                        !r.ok && "bg-danger-subtle/40",
                      )}
                    >
                      <td className="tnum px-3 py-2 text-muted">{r.row}</td>
                      <td className="px-3 py-2">
                        <span className="block max-w-xs truncate text-ink">
                          {r.title}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          tone={
                            r.action === "created"
                              ? "success"
                              : r.action === "updated"
                                ? "info"
                                : r.action === "failed"
                                  ? "danger"
                                  : "neutral"
                          }
                        >
                          {r.action}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-muted">{r.error ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
