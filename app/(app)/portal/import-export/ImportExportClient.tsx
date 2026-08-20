"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ImportSummary, ImportBatchInfo } from "@/lib/excel";
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
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [batches, setBatches] = useState<ImportBatchInfo[]>([]);
  const [undoing, setUndoing] = useState("");

  const loadBatches = useCallback(() => {
    fetch("/api/import", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { batches: [] }))
      .then((d: { batches: ImportBatchInfo[] }) => setBatches(d.batches ?? []))
      .catch(() => {});
  }, []);
  useEffect(() => loadBatches(), [loadBatches]);

  // A pick previews first (dryRun) — nothing is written until "Apply" is pressed.
  const upload = async (file: File, dryRun: boolean) => {
    setUploading(true);
    setSummary(null);
    setFileName(file.name);

    try {
      const form = new FormData();
      form.append("file", file);
      if (dryRun) form.append("dryRun", "1");

      const res = await fetch("/api/import", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "That import did not run.");

      const s = body as ImportSummary;
      setSummary(s);
      if (dryRun) {
        setPendingFile(file);
      } else {
        setPendingFile(null);
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
        loadBatches();
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const cancelPreview = () => {
    setPendingFile(null);
    setSummary(null);
    setFileName("");
  };

  const undo = async (batchId: string, label: string) => {
    if (
      !window.confirm(
        `Undo "${label}"? This deletes the products it created and restores the ones it changed to how they were before. This cannot itself be undone.`,
      )
    )
      return;
    setUndoing(batchId);
    try {
      const res = await fetch("/api/import/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "That import was not undone.");
      toast.success(
        `Import undone.`,
        `${d.deleted} created products removed, ${d.restored} restored.`,
      );
      if (summary?.batchId === batchId) setSummary(null);
      loadBatches();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUndoing("");
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
            You&apos;ll see a preview of exactly what would change first — nothing
            is written until you press Apply.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xlsm"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file, true);
            }}
          />
          <Button
            variant="primary"
            full
            className="mt-4"
            loading={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? "Working…" : "Choose a file"}
          </Button>
        </Card>
      </div>

      {summary && (
        <div className="mt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink">
              {summary.dryRun ? "Preview" : "Import result"}
              {fileName && ` — ${fileName}`}
            </h2>
            {summary.dryRun ? (
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={cancelPreview} disabled={uploading}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  loading={uploading}
                  disabled={!pendingFile || (summary.created === 0 && summary.updated === 0)}
                  onClick={() => pendingFile && upload(pendingFile, false)}
                >
                  Apply import
                </Button>
              </div>
            ) : (
              summary.batchId &&
              (summary.created > 0 || summary.updated > 0) && (
                <Button
                  variant="danger"
                  size="sm"
                  loading={undoing === summary.batchId}
                  onClick={() => undo(summary.batchId!, fileName || "this import")}
                >
                  Undo this import
                </Button>
              )
            )}
          </div>

          {summary.dryRun && (
            <div className="mb-4">
              <Alert tone="info" title="Nothing has been written yet">
                This is a preview of what the sheet would do. Check the rows below,
                then press <strong>Apply import</strong> to commit — or Cancel to
                pick a different sheet.
              </Alert>
            </div>
          )}

          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label={summary.dryRun ? "Will create" : "Created"} value={summary.created} tone="success" />
            <StatCard label={summary.dryRun ? "Will change" : "Updated"} value={summary.updated} tone="info" />
            <StatCard
              label={summary.dryRun ? "Will fail" : "Failed"}
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
                      <td className="px-3 py-2 text-muted">
                        {r.changes && r.changes.length ? (
                          <span className="flex flex-wrap gap-1">
                            {r.changes.map((ch, i) => (
                              <span
                                key={i}
                                className="tnum rounded bg-info-subtle px-1.5 py-0.5 text-[0.7rem] text-info"
                              >
                                {ch}
                              </span>
                            ))}
                          </span>
                        ) : (
                          r.error ?? "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {batches.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-1 text-sm font-semibold text-ink">Recent imports</h2>
          <p className="mb-3 text-sm text-muted">
            Undo a whole import if a sheet turns out wrong — it deletes the products
            that import created and restores the ones it changed to how they were.
          </p>
          <Card padded={false} className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] border-collapse text-sm">
                <thead className="border-b border-line bg-subtle">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-ink-2">When</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-ink-2">File</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-ink-2">Result</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-ink-2">By</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-ink-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.id} className="border-b border-line last:border-0">
                      <td className="whitespace-nowrap px-3 py-2 text-muted">
                        {new Date(b.createdAt).toLocaleString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-3 py-2">
                        <span className="block max-w-[14rem] truncate text-ink">
                          {b.fileName || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted">
                        <span className="text-success">{b.created} created</span> ·{" "}
                        <span className="text-info">{b.updated} updated</span>
                        {b.failed > 0 && <> · <span className="text-danger">{b.failed} failed</span></>}
                      </td>
                      <td className="px-3 py-2 text-muted">{b.who || "—"}</td>
                      <td className="px-3 py-2 text-right">
                        {b.undone ? (
                          <Badge tone="neutral">Undone</Badge>
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={undoing === b.id}
                            onClick={() => undo(b.id, b.fileName || "this import")}
                          >
                            Undo
                          </Button>
                        )}
                      </td>
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
