"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { money } from "@/lib/business";
import { PRICE_TIERS, tierDelta, type TierKey, type TierPrices } from "@/lib/pricing";
import { CHANNELS, type ChannelKey } from "@/lib/channels";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  cx,
  Field,
  IconButton,
  Input,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

/**
 * Product types. Edit this list to match the trade — it is intentionally a
 * plain array rather than a database table because it changes about once a
 * year and a dropdown of free text invites typos that fragment the catalog.
 */
export const PRODUCT_TYPE_CHOICES = [
  "Parts",
  "Accessories",
  "Tools",
  "Consumables",
  "Service",
  "Other",
];

/** One variant row in the editor. `id` is kept so a save preserves its history. */
export type VariantFormRow = {
  id?: string;
  title: string;
  sku: string;
  barcode: string;
  price: string;
  compareAtPrice: string;
  tiers: Record<TierKey, string>;
  stock: string;
};

export const EMPTY_VARIANT: VariantFormRow = {
  title: "",
  sku: "",
  barcode: "",
  price: "",
  compareAtPrice: "",
  tiers: { wholesale: "", shop: "", ebay: "", amazon: "" },
  stock: "0",
};

export type ProductFormValues = {
  title: string;
  descriptionHtml: string;
  status: "ACTIVE" | "DRAFT";
  vendor: string;
  brand: string;
  model: string;
  productType: string;
  sku: string;
  barcode: string;
  price: string;
  compareAtPrice: string;
  tiers: Record<TierKey, string>;
  stock: string;
  images: { url: string; alt: string }[];
  channels: ChannelKey[];
  tags: string[];
  collectionIds: string[];
  variants: VariantFormRow[];
};

export const EMPTY_PRODUCT: ProductFormValues = {
  title: "",
  descriptionHtml: "",
  status: "ACTIVE",
  vendor: "",
  brand: "",
  model: "",
  productType: "",
  sku: "",
  barcode: "",
  price: "",
  compareAtPrice: "",
  tiers: { wholesale: "", shop: "", ebay: "", amazon: "" },
  stock: "0",
  images: [],
  channels: [],
  tags: [],
  collectionIds: [],
  variants: [],
};

export default function ProductForm({
  productId,
  initial,
}: {
  productId?: string;
  initial: ProductFormValues;
}) {
  const toast = useToast();
  const router = useRouter();

  const [form, setForm] = useState<ProductFormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [allCollections, setAllCollections] = useState<
    { id: string; title: string; group: string }[]
  >([]);

  useEffect(() => setForm(initial), [initial]);

  // The collection picker needs the full list to show what's available.
  useEffect(() => {
    fetch("/api/collections", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { collections: [] }))
      .then((d: { collections: { id: string; title: string; group: string }[] }) =>
        setAllCollections(d.collections ?? []),
      )
      .catch(() => {});
  }, []);

  const set = (patch: Partial<ProductFormValues>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  // Upload one or more image files to R2 and append the returned public URLs.
  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const added: { url: string; alt: string }[] = [];
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
        if (!res.ok || !body.url) throw new Error(body.error ?? "Upload failed.");
        added.push({ url: body.url, alt: "" });
      }
      if (added.length) setForm((prev) => ({ ...prev, images: [...prev.images, ...added] }));
      toast.success(`${added.length} image${added.length === 1 ? "" : "s"} uploaded.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const setTier = (key: TierKey, value: string) =>
    setForm((prev) => ({ ...prev, tiers: { ...prev.tiers, [key]: value } }));

  const addTag = (raw: string) => {
    const t = raw.trim().replace(/,+$/, "").trim();
    if (!t) return;
    setForm((prev) =>
      prev.tags.some((x) => x.toLowerCase() === t.toLowerCase())
        ? prev
        : { ...prev, tags: [...prev.tags, t] },
    );
    setTagInput("");
  };

  const removeTag = (t: string) =>
    setForm((prev) => ({ ...prev, tags: prev.tags.filter((x) => x !== t) }));

  const toggleCollection = (id: string) =>
    setForm((prev) => ({
      ...prev,
      collectionIds: prev.collectionIds.includes(id)
        ? prev.collectionIds.filter((x) => x !== id)
        : [...prev.collectionIds, id],
    }));

  // --- Variants ---
  const hasVariants = form.variants.length > 0;

  const addVariant = () =>
    setForm((prev) => ({ ...prev, variants: [...prev.variants, { ...EMPTY_VARIANT }] }));
  const removeVariant = (i: number) =>
    setForm((prev) => ({ ...prev, variants: prev.variants.filter((_, j) => j !== i) }));
  const setVariant = (i: number, patch: Partial<VariantFormRow>) =>
    setForm((prev) => ({
      ...prev,
      variants: prev.variants.map((v, j) => (j === i ? { ...v, ...patch } : v)),
    }));
  const setVariantTier = (i: number, key: TierKey, value: string) =>
    setForm((prev) => ({
      ...prev,
      variants: prev.variants.map((v, j) =>
        j === i ? { ...v, tiers: { ...v.tiers, [key]: value } } : v,
      ),
    }));

  // With variants, the product's own stock/price are derived: stock is the sum
  // and the base price is the lowest ("from"). Shown read-only so there's no
  // double-entry, and computed the same way the server does.
  const variantStockSum = form.variants.reduce((s, v) => s + (Math.round(Number(v.stock)) || 0), 0);
  const variantMinPrice = hasVariants
    ? Math.min(...form.variants.map((v) => Number(v.price) || 0))
    : 0;

  const basePrice = Number(form.price) || 0;

  const tierPrices: TierPrices = {
    wholesale: form.tiers.wholesale === "" ? null : Number(form.tiers.wholesale),
    shop: form.tiers.shop === "" ? null : Number(form.tiers.shop),
    ebay: form.tiers.ebay === "" ? null : Number(form.tiers.ebay),
    amazon: form.tiers.amazon === "" ? null : Number(form.tiers.amazon),
  };

  /** Fill the barcode from the SKU, which is what most shops actually want. */
  const generateBarcode = () => {
    const source = form.sku.trim();
    set({
      barcode:
        source ||
        `INT${Date.now().toString(36).toUpperCase()}`,
    });
  };

  const save = async (addAnother = false) => {
    if (!form.title.trim()) {
      toast.error("Give the product a name before saving.");
      return;
    }

    // Validate variants before saving so a bad row surfaces here, not server-side.
    for (const v of form.variants) {
      if (!v.title.trim()) {
        toast.error("Every variant needs a name (or remove the empty row).");
        return;
      }
      if (v.price === "" || !(Number(v.price) >= 0)) {
        toast.error(`Enter a valid price for the "${v.title || "unnamed"}" variant.`);
        return;
      }
    }

    setSaving(true);
    try {
      const variantsPayload = form.variants.map((v) => ({
        id: v.id,
        title: v.title,
        sku: v.sku,
        barcode: v.barcode,
        price: Number(v.price) || 0,
        compareAtPrice: v.compareAtPrice === "" ? null : Number(v.compareAtPrice),
        tiers: {
          wholesale: v.tiers.wholesale === "" ? null : Number(v.tiers.wholesale),
          shop: v.tiers.shop === "" ? null : Number(v.tiers.shop),
          ebay: v.tiers.ebay === "" ? null : Number(v.tiers.ebay),
          amazon: v.tiers.amazon === "" ? null : Number(v.tiers.amazon),
        },
        stock: Math.round(Number(v.stock)) || 0,
      }));

      const payload = {
        title: form.title,
        descriptionHtml: form.descriptionHtml,
        status: form.status,
        vendor: form.vendor,
        brand: form.brand,
        model: form.model,
        productType: form.productType,
        sku: form.sku,
        barcode: form.barcode,
        // With variants the product's own price/stock are the derived "from"
        // price and the sum; the server recomputes them too, this keeps the
        // first write consistent.
        price: hasVariants ? variantMinPrice : Number(form.price) || 0,
        compareAtPrice:
          form.compareAtPrice === "" ? null : Number(form.compareAtPrice),
        tiers: tierPrices,
        stock: hasVariants ? variantStockSum : Number(form.stock) || 0,
        images: form.images,
        channels: form.channels,
        tags: form.tags,
        collectionIds: form.collectionIds,
        // Always send the full set: upsert-by-id preserves history, [] clears.
        variants: variantsPayload,
      };

      const res = await fetch(
        productId ? `/api/products/${productId}` : "/api/products",
        {
          method: productId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "That product was not saved.");

      toast.success(productId ? "Product saved." : `${form.title} created.`);
      if (!productId) {
        if (addAnother) {
          // Stay on a fresh blank form so staff can enter the next item
          // without navigating back and forth.
          setForm(EMPTY_PRODUCT);
          setImageUrl("");
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          router.push(`/portal/products/${body.id}/edit`);
        }
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/products/${productId}`, { method: "DELETE" });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? "That product was not deleted.");
      }
      toast.success("Product removed.");
      router.push("/portal/inventory");
    } catch (e) {
      toast.error((e as Error).message);
      setConfirmDelete(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={productId ? form.title || "Edit product" : "New product"}
        subtitle={productId ? form.sku || "No SKU" : "Add something to the catalog"}
        actions={
          <>
            <Link href="/portal/inventory">
              <Button>Cancel</Button>
            </Link>
            {!productId && (
              <Button
                loading={saving}
                onClick={() => save(true)}
                title="Save this product and start a new blank one"
              >
                Save &amp; add another
              </Button>
            )}
            <Button variant="primary" loading={saving} onClick={() => save()}>
              {productId ? "Save changes" : "Create product"}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader title="Basics" />
            <div className="mt-3 space-y-3">
              <Field label="Name" required>
                <Input
                  value={form.title}
                  onChange={(e) => set({ title: e.target.value })}
                  placeholder="What staff will search for"
                />
              </Field>
              <Field label="Description">
                <Textarea
                  rows={4}
                  value={form.descriptionHtml}
                  onChange={(e) => set({ descriptionHtml: e.target.value })}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Brand">
                  <Input
                    value={form.brand}
                    onChange={(e) => set({ brand: e.target.value })}
                  />
                </Field>
                <Field label="Model" hint="A part often fits several — list them all.">
                  <Input
                    value={form.model}
                    onChange={(e) => set({ model: e.target.value })}
                  />
                </Field>
                <Field label="Type">
                  <Select
                    value={form.productType}
                    onChange={(e) => set({ productType: e.target.value })}
                  >
                    <option value="">Uncategorised</option>
                    {PRODUCT_TYPE_CHOICES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Supplier">
                  <Input
                    value={form.vendor}
                    onChange={(e) => set({ vendor: e.target.value })}
                  />
                </Field>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Pricing"
              subtitle="Leave a tier blank and it sells at the base price."
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field
                label="Base price"
                required={!hasVariants}
                hint={hasVariants ? "From the lowest variant price." : undefined}
              >
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={hasVariants ? String(variantMinPrice) : form.price}
                  onChange={(e) => set({ price: e.target.value })}
                  disabled={hasVariants}
                  placeholder="0.00"
                />
              </Field>
              <Field label="Compare at" hint="Shows as a was-price.">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.compareAtPrice}
                  onChange={(e) => set({ compareAtPrice: e.target.value })}
                />
              </Field>
            </div>

            <div className="mt-4 space-y-3 border-t border-line pt-4">
              {PRICE_TIERS.map((tier) => {
                const delta = tierDelta(basePrice, tierPrices, tier.key);
                return (
                  <div
                    key={tier.key}
                    className="grid items-center gap-3 sm:grid-cols-[10rem_1fr_auto]"
                  >
                    <div>
                      <p className="text-sm font-medium text-ink">{tier.label}</p>
                      <p className="text-xs text-muted">{tier.description}</p>
                    </div>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.tiers[tier.key]}
                      onChange={(e) => setTier(tier.key, e.target.value)}
                      placeholder={basePrice ? money(basePrice) : "base price"}
                    />
                    <span
                      className={cx(
                        "text-right text-xs",
                        delta === null
                          ? "text-faint"
                          : delta.amount < 0
                            ? "text-success"
                            : "text-warning",
                      )}
                    >
                      {delta === null
                        ? "inherits base"
                        : `${delta.percent > 0 ? "+" : ""}${delta.percent}%`}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Variants"
              subtitle="Optional. Add variants (e.g. grade A/B/C, colour, capacity) — each has its own SKU, price and stock, and the till sells each one separately."
            />
            {!hasVariants ? (
              <div className="mt-3">
                <Button onClick={addVariant}>+ Add variants</Button>
                <p className="mt-2 text-xs text-muted">
                  Leave this empty for a simple product sold on the SKU, price and
                  stock above.
                </p>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {form.variants.map((v, i) => (
                  <div key={i} className="rounded-lg border border-line p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                        Variant {i + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeVariant(i)}
                        className="text-xs font-medium text-danger hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Field label="Name" required>
                        <Input
                          value={v.title}
                          onChange={(e) => setVariant(i, { title: e.target.value })}
                          placeholder="Grade A"
                        />
                      </Field>
                      <Field label="SKU">
                        <Input value={v.sku} onChange={(e) => setVariant(i, { sku: e.target.value })} />
                      </Field>
                      <Field label="Price" required>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={v.price}
                          onChange={(e) => setVariant(i, { price: e.target.value })}
                          placeholder="0.00"
                        />
                      </Field>
                      <Field label="Stock">
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          value={v.stock}
                          onChange={(e) => setVariant(i, { stock: e.target.value })}
                        />
                      </Field>
                      <Field label="Barcode">
                        <Input value={v.barcode} onChange={(e) => setVariant(i, { barcode: e.target.value })} />
                      </Field>
                      <Field label="Compare at">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={v.compareAtPrice}
                          onChange={(e) => setVariant(i, { compareAtPrice: e.target.value })}
                        />
                      </Field>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-4">
                      {PRICE_TIERS.map((tier) => (
                        <Field key={tier.key} label={tier.label}>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={v.tiers[tier.key]}
                            onChange={(e) => setVariantTier(i, tier.key, e.target.value)}
                            placeholder={v.price ? money(Number(v.price)) : "base"}
                          />
                        </Field>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-3">
                  <Button onClick={addVariant}>+ Add another variant</Button>
                  <span className="text-xs text-muted">
                    Total stock {variantStockSum} · from {money(variantMinPrice)}
                  </span>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Images" subtitle="Upload a photo, or paste an image URL." />

            {/* Upload from device — stored in R2, saved as a URL on the product. */}
            <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong bg-subtle px-4 py-4 text-sm font-medium text-ink-2 transition-colors hover:border-accent hover:text-ink">
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  void uploadFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 16V4m0 0 4 4m-4-4L8 8M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
              {uploading ? "Uploading…" : "Upload photo(s)"}
            </label>

            <div className="mt-2 flex gap-2">
              <Input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="or paste an image URL…"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && imageUrl.trim()) {
                    e.preventDefault();
                    set({
                      images: [...form.images, { url: imageUrl.trim(), alt: "" }],
                    });
                    setImageUrl("");
                  }
                }}
              />
              <Button
                onClick={() => {
                  if (!imageUrl.trim()) return;
                  set({ images: [...form.images, { url: imageUrl.trim(), alt: "" }] });
                  setImageUrl("");
                }}
              >
                Add
              </Button>
            </div>

            {form.images.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {form.images.map((img, i) => (
                  <li key={`${img.url}-${i}`} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt=""
                      className="h-20 w-20 rounded-lg border border-line object-cover"
                    />
                    <button
                      type="button"
                      aria-label="Remove image"
                      onClick={() =>
                        set({ images: form.images.filter((_, j) => j !== i) })
                      }
                      className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-xs text-white shadow-sm"
                    >
                      ×
                    </button>
                    {i === 0 && (
                      <span className="absolute bottom-0 left-0 rounded-tr-lg rounded-bl-lg bg-accent px-1.5 py-0.5 text-[0.6rem] font-medium text-accentfg">
                        Main
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Right rail */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Availability" />
            <div className="mt-3 space-y-3">
              <Field label="Status">
                <Select
                  value={form.status}
                  onChange={(e) =>
                    set({ status: e.target.value as "ACTIVE" | "DRAFT" })
                  }
                >
                  <option value="ACTIVE">Active — sellable</option>
                  <option value="DRAFT">Draft — hidden from the till</option>
                </Select>
              </Field>
              <Field
                label="Stock on hand"
                hint={hasVariants ? "Total across variants — edit per variant." : undefined}
              >
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={hasVariants ? String(variantStockSum) : form.stock}
                  onChange={(e) => set({ stock: e.target.value })}
                  disabled={hasVariants}
                />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Identifiers" />
            <div className="mt-3 space-y-3">
              <Field label="SKU">
                <Input
                  value={form.sku}
                  onChange={(e) => set({ sku: e.target.value })}
                />
              </Field>
              <Field label="Barcode">
                <div className="flex gap-2">
                  <Input
                    value={form.barcode}
                    onChange={(e) => set({ barcode: e.target.value })}
                  />
                  <Button onClick={generateBarcode}>Generate</Button>
                </div>
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Channels"
              subtitle="Where this should be listed. Tags only — nothing is published automatically."
            />
            <div className="mt-3 space-y-1.5">
              {CHANNELS.map((c) => {
                const on = form.channels.includes(c.key);
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() =>
                      set({
                        channels: on
                          ? form.channels.filter((x) => x !== c.key)
                          : [...form.channels, c.key],
                      })
                    }
                    className={cx(
                      "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      on
                        ? "border-accent bg-accent-subtle text-accent"
                        : "border-line text-ink-2 hover:bg-subtle",
                    )}
                  >
                    {c.label}
                    <span className="text-xs">{on ? "On" : "Off"}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Collections"
              subtitle="Add this product to one or more collections. Rule-based collections also apply automatically."
            />
            {allCollections.length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                No collections yet.{" "}
                <Link href="/portal/collections" className="text-accent hover:underline">
                  Create one
                </Link>
                .
              </p>
            ) : (
              <div className="mt-3 max-h-64 space-y-1.5 overflow-y-auto pr-1">
                {allCollections.map((c) => {
                  const on = form.collectionIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleCollection(c.id)}
                      className={cx(
                        "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                        on
                          ? "border-accent bg-accent-subtle text-accent"
                          : "border-line text-ink-2 hover:bg-subtle",
                      )}
                    >
                      <span className="min-w-0 truncate">
                        {c.title}
                        {c.group && (
                          <span className="ml-1.5 text-xs text-muted">· {c.group}</span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs">{on ? "Added" : "Add"}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Tags"
              subtitle="Free-text labels for search and rule-based collections."
            />
            <div className="mt-3">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Type a tag, press Enter"
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addTag(tagInput);
                  } else if (e.key === "Backspace" && !tagInput && form.tags.length) {
                    removeTag(form.tags[form.tags.length - 1]);
                  }
                }}
                onBlur={() => addTag(tagInput)}
              />
              {form.tags.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {form.tags.map((t) => (
                    <li
                      key={t}
                      className="inline-flex items-center gap-1 rounded-md bg-subtle px-2 py-1 text-xs text-ink-2"
                    >
                      {t}
                      <button
                        type="button"
                        aria-label={`Remove ${t}`}
                        onClick={() => removeTag(t)}
                        className="text-muted hover:text-danger"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          {productId && (
            <Card>
              <CardHeader title="Danger zone" />
              <Button
                variant="danger"
                full
                className="mt-3"
                disabled={saving}
                onClick={() => setConfirmDelete(true)}
              >
                Delete product
              </Button>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        busy={saving}
        title="Delete this product?"
        confirmLabel="Delete"
        message="If it appears on any past invoice it will be archived instead, so those invoices keep working."
      />
    </div>
  );
}
