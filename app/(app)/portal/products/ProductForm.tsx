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

    setSaving(true);
    try {
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
        price: Number(form.price) || 0,
        compareAtPrice:
          form.compareAtPrice === "" ? null : Number(form.compareAtPrice),
        tiers: tierPrices,
        stock: Number(form.stock) || 0,
        images: form.images,
        channels: form.channels,
        tags: form.tags,
        collectionIds: form.collectionIds,
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
              <Field label="Base price" required>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price}
                  onChange={(e) => set({ price: e.target.value })}
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
            <CardHeader title="Images" subtitle="Paste an image URL to add it." />
            <div className="mt-3 flex gap-2">
              <Input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://…"
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
              <Field label="Stock on hand">
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={form.stock}
                  onChange={(e) => set({ stock: e.target.value })}
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
